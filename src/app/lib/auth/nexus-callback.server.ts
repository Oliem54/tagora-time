/**
 * Phase A Nexus callback orchestration. Session mint stays fail-closed.
 * GET inspects without consuming. POST consumes the one-time jti+nonce then mints.
 */

import { NextResponse } from "next/server";
import {
  extractNexusHandoffToken,
  verifyTagoraHandoffV1,
  type NexusHandoffClaims,
  type NexusHandoffVerifyOptions,
} from "@/app/lib/auth/nexus-handoff";
import {
  resolveNexusHororaBinding,
  type NexusMappingLookups,
  type NexusResolvedBinding,
} from "@/app/lib/auth/nexus-identity-mapping.server";
import {
  assertHandoffBindingConsistency,
  consumeNexusHandoffJti,
  type NexusReplayStore,
} from "@/app/lib/auth/nexus-handoff-replay.server";
import {
  mintNexusHororaSession,
  type NexusSessionMintOptions,
} from "@/app/lib/auth/nexus-session-mint.server";
import { verifyConfiguredNexusPublicJwks, type NexusJwksFetch } from "@/app/lib/auth/nexus-jwks.server";
import {
  NEXUS_CALLBACK_FAIL_CLOSED_PATH,
  NEXUS_TECHNICAL_MODULE_KEY,
  readNexusHandoffConfig,
} from "@/app/lib/auth/nexus-handoff-config";

export { NEXUS_CALLBACK_FAIL_CLOSED_PATH };

export function logNexusCallbackDecision(
  reason: string,
  logger: (message: string, fields: Record<string, string>) => void = (message, fields) => {
    console.info(message, fields);
  }
): void {
  logger("[horora.nexus.callback]", { decision: "closed", reason });
}

export type NexusCallbackDependencies = {
  verifyOptions?: NexusHandoffVerifyOptions;
  lookups?: NexusMappingLookups;
  replayStore?: NexusReplayStore;
  mintOptions?: NexusSessionMintOptions;
  logger?: (message: string, fields: Record<string, string>) => void;
  fetchJwks?: NexusJwksFetch;
};

export type NexusHandoffInspectResult =
  | {
      readonly ok: true;
      readonly token: string;
      readonly claims: NexusHandoffClaims;
      readonly binding: NexusResolvedBinding;
    }
  | { readonly ok: false; readonly reason: string };

export function reverifyNexusCallbackAllow(
  claims: NexusHandoffClaims,
  binding: NexusResolvedBinding
): { ok: true } | { ok: false; reason: string } {
  if (claims.module_key !== NEXUS_TECHNICAL_MODULE_KEY) {
    return { ok: false, reason: "invalid_module_key" };
  }
  if (!claims.grant_id.trim() || !claims.grant_version.trim()) {
    return { ok: false, reason: "missing_entitlement" };
  }
  if (!claims.nonce.trim() || !claims.jti.trim()) {
    return { ok: false, reason: "missing_claim" };
  }
  if (claims.user_id !== binding.nexusActorId) {
    return { ok: false, reason: "actor_mismatch" };
  }
  if (claims.organization_id !== binding.nexusOrganizationId) {
    return { ok: false, reason: "organization_mismatch" };
  }
  if (!binding.role) {
    return { ok: false, reason: "membership_role_invalid" };
  }
  return { ok: true };
}

function failClosedRedirect(): NextResponse {
  return NextResponse.redirect(
    new URL(NEXUS_CALLBACK_FAIL_CLOSED_PATH, "http://localhost"),
    303
  );
}

export function redirectFailClosed(requestUrl: string): NextResponse {
  return NextResponse.redirect(new URL(NEXUS_CALLBACK_FAIL_CLOSED_PATH, requestUrl), 303);
}

export async function inspectNexusHandoff(
  input: {
    searchParams: URLSearchParams;
    body: unknown;
  },
  deps: NexusCallbackDependencies = {}
): Promise<NexusHandoffInspectResult> {
  const token = extractNexusHandoffToken({
    searchParams: input.searchParams,
    body: input.body,
  });

  let verifyOptions = deps.verifyOptions;
  if (!verifyOptions?.jwks) {
    const config = readNexusHandoffConfig(verifyOptions?.env ?? process.env);
    if (!config.ok) {
      logNexusCallbackDecision(config.reason, deps.logger);
      return { ok: false, reason: config.reason };
    }
    const jwks = await verifyConfiguredNexusPublicJwks(verifyOptions?.env ?? process.env, {
      fetch: deps.fetchJwks,
    });
    if (!jwks.ok) {
      logNexusCallbackDecision(jwks.reason, deps.logger);
      return { ok: false, reason: jwks.reason };
    }
    verifyOptions = {
      ...verifyOptions,
      knownKids: jwks.kids,
    };
  }

  const verified = await verifyTagoraHandoffV1(token, verifyOptions);
  if (!verified.ok) {
    logNexusCallbackDecision(verified.reason, deps.logger);
    return { ok: false, reason: verified.reason };
  }

  const mapped = await resolveNexusHororaBinding(
    verified.claims,
    deps.lookups,
    verifyOptions?.env ?? process.env
  );
  if (!mapped.ok) {
    logNexusCallbackDecision(mapped.reason, deps.logger);
    return { ok: false, reason: mapped.reason };
  }

  const consistent = assertHandoffBindingConsistency(verified.claims, mapped.binding);
  if (!consistent.ok) {
    logNexusCallbackDecision(consistent.reason, deps.logger);
    return { ok: false, reason: consistent.reason };
  }

  const reverified = reverifyNexusCallbackAllow(verified.claims, mapped.binding);
  if (!reverified.ok) {
    logNexusCallbackDecision(reverified.reason, deps.logger);
    return { ok: false, reason: reverified.reason };
  }

  if (typeof token !== "string" || !token.trim()) {
    logNexusCallbackDecision("missing_token", deps.logger);
    return { ok: false, reason: "missing_token" };
  }

  return {
    ok: true,
    token: token.trim(),
    claims: verified.claims,
    binding: mapped.binding,
  };
}

export async function completeNexusCallbackPhaseA(
  input: {
    searchParams: URLSearchParams;
    body: unknown;
  },
  deps: NexusCallbackDependencies = {}
): Promise<
  | { ok: true; cookieHeader: string; redirectPath: string }
  | { ok: false; reason: string }
> {
  const inspected = await inspectNexusHandoff(input, deps);
  if (!inspected.ok) return inspected;

  const consumed = await consumeNexusHandoffJti(inspected.claims, {
    store: deps.replayStore,
    nowSeconds: deps.verifyOptions?.nowSeconds,
  });
  if (!consumed.ok) {
    logNexusCallbackDecision(consumed.reason, deps.logger);
    return { ok: false, reason: consumed.reason };
  }

  const minted = await mintNexusHororaSession(inspected.binding, deps.mintOptions);
  logNexusCallbackDecision(minted.ok ? "session_ready" : minted.reason, deps.logger);
  if (!minted.ok) {
    return { ok: false, reason: minted.reason };
  }
  if (
    !minted.cookieHeader ||
    !minted.redirectPath.startsWith("/") ||
    minted.redirectPath.startsWith("//")
  ) {
    logNexusCallbackDecision("session_mint_unavailable", deps.logger);
    return { ok: false, reason: "session_mint_unavailable" };
  }

  return {
    ok: true,
    cookieHeader: minted.cookieHeader,
    redirectPath: minted.redirectPath,
  };
}

export { failClosedRedirect };

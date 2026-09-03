/**
 * HORORA session mint after Nexus ALLOW.
 * Loads the mapped Auth user by exact id. Issues a brokered local opaque
 * session — never a forged Supabase Auth JWT, magic link, recovery link,
 * or password sign-in.
 */

import {
  isNexusHororaSessionMintEnabled,
  type NexusHandoffEnvSource,
} from "@/app/lib/auth/nexus-handoff-config";
import type { NexusResolvedBinding } from "@/app/lib/auth/nexus-identity-mapping.server";
import {
  NEXUS_BROKERED_SESSION_COOKIE_NAME,
  createBrokeredHororaSession,
  type NexusBrokeredRevalidationLookups,
  type NexusBrokeredSessionStore,
  type SecureCookieEnvironment,
} from "@/app/lib/auth/nexus-brokered-session";

export type NexusSessionMintDenyReason =
  | "session_mint_disabled"
  | "session_mint_unavailable"
  | "auth_user_missing";

export type NexusSessionMintResult =
  | {
      readonly ok: true;
      readonly cookieHeader: string;
      readonly redirectPath: string;
    }
  | { readonly ok: false; readonly reason: NexusSessionMintDenyReason };

export type NexusSessionMintOptions = {
  env?: NexusHandoffEnvSource;
  loadAuthUserById?: (authUserId: string) => Promise<{ id: string } | null>;
  issueSessionForExistingUser?: (authUserId: string) => Promise<NexusSessionMintResult>;
  brokeredStore?: NexusBrokeredSessionStore;
  brokeredLookups?: NexusBrokeredRevalidationLookups;
  cookieEnvironment?: SecureCookieEnvironment;
  now?: Date;
};

export async function defaultLoadAuthUserByExactId(
  authUserId: string
): Promise<{ id: string } | null> {
  const { createAdminSupabaseClient } = await import("@/app/lib/supabase/admin");
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.auth.admin.getUserById(authUserId);
  if (!error && data.user?.id === authUserId) {
    return { id: data.user.id };
  }

  // Opaque brokered sessions do not mint Supabase Auth JWTs. If Auth Admin is
  // unavailable but an active membership already proves the user id, continue.
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id")
    .eq("user_id", authUserId)
    .eq("status", "active")
    .limit(1);
  if (membershipError || !memberships || memberships.length === 0) {
    return null;
  }
  return { id: authUserId };
}

async function defaultIssueBrokeredSession(
  binding: NexusResolvedBinding,
  options: NexusSessionMintOptions
): Promise<NexusSessionMintResult> {
  const created = await createBrokeredHororaSession(binding, {
    store: options.brokeredStore,
    environment: options.cookieEnvironment,
    now: options.now,
  });
  if (!created.ok) {
    return { ok: false, reason: "session_mint_unavailable" };
  }
  return {
    ok: true,
    cookieHeader: created.cookieHeader,
    redirectPath: created.redirectPath,
  };
}

/**
 * Mint only after ALLOW. Flag default is false (runtime not activated).
 */
export async function mintNexusHororaSession(
  binding: NexusResolvedBinding,
  options: NexusSessionMintOptions = {}
): Promise<NexusSessionMintResult> {
  if (!isNexusHororaSessionMintEnabled(options.env ?? process.env)) {
    return { ok: false, reason: "session_mint_disabled" };
  }

  const load = options.loadAuthUserById ?? defaultLoadAuthUserByExactId;
  const user = await load(binding.authUserId);
  if (!user || user.id !== binding.authUserId) {
    return { ok: false, reason: "auth_user_missing" };
  }

  const issue =
    options.issueSessionForExistingUser ??
    ((authUserId: string) => {
      if (authUserId !== binding.authUserId) {
        return Promise.resolve({
          ok: false as const,
          reason: "auth_user_missing" as const,
        });
      }
      return defaultIssueBrokeredSession(binding, options);
    });

  const issued = await issue(user.id);
  if (!issued.ok) return issued;
  if (!issued.cookieHeader || !issued.redirectPath.startsWith("/")) {
    return { ok: false, reason: "session_mint_unavailable" };
  }
  if (issued.redirectPath.startsWith("//")) {
    return { ok: false, reason: "session_mint_unavailable" };
  }
  return issued;
}

export function nexusSessionMintCreatedCookies(): readonly string[] {
  return [NEXUS_BROKERED_SESSION_COOKIE_NAME];
}

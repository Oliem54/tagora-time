/**
 * Public HORORA Staging MODULE→NEXUS client identity.
 * ES256 P-256, use sig. The private key is not in this module.
 */

import {
  HORORA_STAGING_VERCEL_PROJECT_ID,
  NEXUS_PUBLIC_HOSTNAME,
  isCanonicalProductionHostname,
  isCanonicalStagingHostname,
  normalizeHostname,
} from "@/app/lib/canonical-domains";
import { HORORA_PRODUCTION_SUPABASE_HOST } from "@/app/lib/supabase/supabase-host.shared";

export const HORORA_STAGING_NEXUS_MODULE_CLIENT_ID = "horora_staging_nexus_client" as const;
export const HORORA_STAGING_NEXUS_EXCHANGE_URL =
  "https://app.staging.tagora.ca/api/nexus/handoff/exchange" as const;
export const HORORA_STAGING_NEXUS_MODULE_CLIENT_KID =
  "7e517fc74e013ebb7ba0c3f82a6c13a3" as const;
export const HORORA_STAGING_NEXUS_CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer" as const;
export const HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_KEY_OWNER =
  "HORORA_STAGING_SERVER" as const;
export const HORORA_STAGING_NEXUS_MODULE_CLIENT_PUBLIC_KEY_CONSUMER =
  "TAGORA_NEXUS_STAGING" as const;
export const HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK_ENV =
  "HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK" as const;
export const HORORA_STAGING_NEXUS_CLIENT_ASSERTION_TTL_SECONDS = 60 as const;
export const HORORA_STAGING_NEXUS_CALLBACK_VERCEL_HOST =
  "tagora-time-staging.vercel.app" as const;
export const FORBIDDEN_NEXUS_HANDOFF_SIGNING_KIDS = [
  "nexus_handoff_active_es256",
  "nexus-staging-handoff-es256-2026-08-29",
] as const;

export const HORORA_STAGING_NEXUS_MODULE_CLIENT_PUBLIC_JWK = {
  kty: "EC",
  crv: "P-256",
  alg: "ES256",
  kid: HORORA_STAGING_NEXUS_MODULE_CLIENT_KID,
  use: "sig",
  x: "WaMMR1tWu-oILmmLx1BWEZynrdhOmO7YtXjss5mgKXo",
  y: "d4APFvVuzPRXwqaA90Hded-94lSJrvuFG28pYqy70cQ",
} as const;

export type HororaStagingModuleClientPublicJwk = {
  readonly kty: "EC";
  readonly crv: "P-256";
  readonly alg: "ES256";
  readonly kid: typeof HORORA_STAGING_NEXUS_MODULE_CLIENT_KID;
  readonly use: "sig";
  readonly x: string;
  readonly y: string;
};

export const HORORA_STAGING_MODULE_CLIENT_PUBLIC_JWK_FIELDS = [
  "kty",
  "crv",
  "alg",
  "kid",
  "use",
  "x",
  "y",
] as const;

const OPAQUE_CODE_PATTERN = /^[A-Za-z0-9._~-]{8,1024}$/;

export type OpaqueHandoffCodeResult =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly reason: "absent" | "invalid_code" | "code_mismatch" };

export type NexusOpaqueExchangeBody = {
  readonly code: string;
  readonly client_assertion: string;
  readonly client_assertion_type: typeof HORORA_STAGING_NEXUS_CLIENT_ASSERTION_TYPE;
};

export function exportHororaStagingModuleClientPublicJwk(): HororaStagingModuleClientPublicJwk {
  const source = HORORA_STAGING_NEXUS_MODULE_CLIENT_PUBLIC_JWK;
  return Object.freeze({
    kty: source.kty,
    crv: source.crv,
    alg: source.alg,
    kid: source.kid,
    use: source.use,
    x: source.x,
    y: source.y,
  });
}

export function toHororaStagingModuleClientPublicJwk(
  value: unknown
): HororaStagingModuleClientPublicJwk | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kty !== "EC" || record.crv !== "P-256" || record.alg !== "ES256") return null;
  if (record.use !== "sig" || record.kid !== HORORA_STAGING_NEXUS_MODULE_CLIENT_KID) return null;
  if (typeof record.x !== "string" || typeof record.y !== "string" || !record.x || !record.y) {
    return null;
  }
  return Object.freeze({
    kty: "EC",
    crv: "P-256",
    alg: "ES256",
    kid: HORORA_STAGING_NEXUS_MODULE_CLIENT_KID,
    use: "sig",
    x: record.x,
    y: record.y,
  });
}

export function isForbiddenNexusHandoffSigningKid(kid: string | null | undefined): boolean {
  const value = kid?.trim() ?? "";
  return (FORBIDDEN_NEXUS_HANDOFF_SIGNING_KIDS as readonly string[]).includes(value);
}

export function looksLikeCompactJwt(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  if (trimmed.includes("eyJ")) return true;
  const parts = trimmed.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export type HororaStagingCallbackRuntime = {
  readonly VERCEL_ENV?: string | null;
  readonly VERCEL_PROJECT_ID?: string | null;
  readonly VERCEL_URL?: string | null;
};

const DENIED_PRODUCTION_CALLBACK_HOSTS = new Set<string>([
  NEXUS_PUBLIC_HOSTNAME,
  HORORA_PRODUCTION_SUPABASE_HOST,
]);

function callbackRuntime(
  runtime?: HororaStagingCallbackRuntime
): HororaStagingCallbackRuntime {
  if (runtime) return runtime;
  return {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
    VERCEL_URL: process.env.VERCEL_URL,
  };
}

function isDeniedProductionCallbackHost(hostname: string | null | undefined): boolean {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  return isCanonicalProductionHostname(host) || DENIED_PRODUCTION_CALLBACK_HOSTS.has(host);
}

/** VERCEL_URL is one deployment hostname. A pattern is never a hostname. */
function exactVercelDeploymentHostname(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!raw || raw.includes("*") || /\s/.test(raw)) return null;
  let candidate = raw;
  if (raw.includes("://")) {
    try {
      candidate = new URL(raw).hostname;
    } catch {
      return null;
    }
  } else {
    candidate = raw.split("/")[0] ?? "";
  }
  const host = normalizeHostname(candidate);
  if (!host || host.includes("*")) return null;
  return host;
}

function currentPreviewDeploymentHostname(
  runtime: HororaStagingCallbackRuntime
): string | null {
  if (runtime.VERCEL_ENV?.trim() !== "preview") return null;
  const projectId = runtime.VERCEL_PROJECT_ID?.trim() ?? "";
  if (!projectId || projectId !== HORORA_STAGING_VERCEL_PROJECT_ID) return null;
  const host = exactVercelDeploymentHostname(runtime.VERCEL_URL);
  if (!host || isDeniedProductionCallbackHost(host)) return null;
  return host;
}

export function isHororaStagingCallbackHostname(
  hostname: string | null | undefined,
  runtime?: HororaStagingCallbackRuntime
): boolean {
  const host = normalizeHostname(hostname);
  if (!host || host.includes("*") || isDeniedProductionCallbackHost(host)) return false;
  if (isCanonicalStagingHostname(host)) return true;
  if (host === HORORA_STAGING_NEXUS_CALLBACK_VERCEL_HOST) return true;
  const current = currentPreviewDeploymentHostname(callbackRuntime(runtime));
  return current !== null && host === current;
}

function firstHost(value: string | null): string | null {
  const host = value?.split(",")[0]?.trim().toLowerCase().split(":")[0]?.trim() ?? "";
  return host || null;
}

export function isHororaStagingOpaqueCallbackRequest(
  request: Request,
  runtime?: HororaStagingCallbackRuntime
): boolean {
  let urlHost: string | null = null;
  try {
    urlHost = new URL(request.url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const forwarded = firstHost(request.headers.get("x-forwarded-host"));
  const hostHeader = firstHost(request.headers.get("host"));
  const hosts = [urlHost, forwarded, hostHeader].filter((host): host is string => Boolean(host));
  if (hosts.some((host) => isDeniedProductionCallbackHost(host))) return false;
  return hosts.some((host) => isHororaStagingCallbackHostname(host, runtime));
}

export function selectOpaqueHandoffCode(
  queryCode: string | null,
  bodyCode: string | null
): OpaqueHandoffCodeResult {
  const query = queryCode === null ? null : queryCode.trim();
  const body = bodyCode === null ? null : bodyCode.trim();
  if (query === null && body === null) return { ok: false, reason: "absent" };
  if (query === "" || body === "") return { ok: false, reason: "invalid_code" };
  if (query !== null && body !== null && query !== body) {
    return { ok: false, reason: "code_mismatch" };
  }
  const code = body ?? query ?? "";
  if (!OPAQUE_CODE_PATTERN.test(code) || looksLikeCompactJwt(code)) {
    return { ok: false, reason: "invalid_code" };
  }
  return { ok: true, code };
}

export function buildNexusOpaqueExchangeBody(input: {
  readonly code: string;
  readonly clientAssertion: string;
}): NexusOpaqueExchangeBody {
  return {
    code: input.code,
    client_assertion: input.clientAssertion,
    client_assertion_type: HORORA_STAGING_NEXUS_CLIENT_ASSERTION_TYPE,
  };
}

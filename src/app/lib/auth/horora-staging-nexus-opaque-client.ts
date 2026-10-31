/**
 * Public HORORA Staging Nexus opaque-client identity.
 * ES256 P-256, use sig. The private key is not in this module.
 */

import {
  isCanonicalProductionHostname,
  isCanonicalStagingHostname,
} from "@/app/lib/canonical-domains";

export const HORORA_STAGING_NEXUS_CLIENT_ID = "horora_staging_nexus_client" as const;
export const HORORA_STAGING_NEXUS_EXCHANGE_URL =
  "https://app.staging.tagora.ca/api/nexus/handoff/exchange" as const;
export const HORORA_STAGING_NEXUS_CLIENT_KID =
  "horora-staging-nexus-client-es256-v1" as const;
export const HORORA_STAGING_NEXUS_CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer" as const;
export const HORORA_STAGING_NEXUS_CLIENT_PRIVATE_KEY_OWNER =
  "HORORA_STAGING_SERVER" as const;
export const HORORA_STAGING_NEXUS_CLIENT_PUBLIC_KEY_CONSUMER =
  "TAGORA_NEXUS_STAGING" as const;
export const HORORA_STAGING_NEXUS_CLIENT_PRIVATE_JWK_ENV =
  "HORORA_STAGING_NEXUS_CLIENT_PRIVATE_JWK" as const;
export const HORORA_STAGING_NEXUS_CLIENT_ASSERTION_TTL_SECONDS = 60 as const;
export const HORORA_STAGING_NEXUS_CALLBACK_VERCEL_HOST =
  "tagora-time-staging.vercel.app" as const;
export const FORBIDDEN_NEXUS_HANDOFF_SIGNING_KID = "nexus_handoff_active_es256" as const;

export const HORORA_STAGING_NEXUS_CLIENT_PUBLIC_JWK = {
  kty: "EC",
  crv: "P-256",
  alg: "ES256",
  kid: HORORA_STAGING_NEXUS_CLIENT_KID,
  use: "sig",
  x: "jqotuQebS8XjS5gLF5EwCWFiGpvwJJv8d7aQ1V_9uYk",
  y: "opPXraLyT73P76k9DBhk-_KZ73-CZJONVjjrsDhJNd4",
} as const;

export type HororaStagingNexusClientPublicJwk = {
  readonly kty: "EC";
  readonly crv: "P-256";
  readonly alg: "ES256";
  readonly kid: typeof HORORA_STAGING_NEXUS_CLIENT_KID;
  readonly use: "sig";
  readonly x: string;
  readonly y: string;
};

export const HORORA_STAGING_NEXUS_CLIENT_PUBLIC_JWK_FIELDS = [
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

export function exportHororaStagingNexusClientPublicJwk(): HororaStagingNexusClientPublicJwk {
  const source = HORORA_STAGING_NEXUS_CLIENT_PUBLIC_JWK;
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

export function toHororaStagingNexusClientPublicJwk(
  value: unknown
): HororaStagingNexusClientPublicJwk | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kty !== "EC" || record.crv !== "P-256" || record.alg !== "ES256") return null;
  if (record.use !== "sig" || record.kid !== HORORA_STAGING_NEXUS_CLIENT_KID) return null;
  if (typeof record.x !== "string" || typeof record.y !== "string" || !record.x || !record.y) {
    return null;
  }
  return Object.freeze({
    kty: "EC",
    crv: "P-256",
    alg: "ES256",
    kid: HORORA_STAGING_NEXUS_CLIENT_KID,
    use: "sig",
    x: record.x,
    y: record.y,
  });
}

export function isHororaStagingCallbackHostname(hostname: string | null | undefined): boolean {
  const host = hostname?.trim().toLowerCase() ?? "";
  if (!host || isCanonicalProductionHostname(host)) return false;
  if (isCanonicalStagingHostname(host)) return true;
  return host === HORORA_STAGING_NEXUS_CALLBACK_VERCEL_HOST;
}

function firstHost(value: string | null): string | null {
  const host = value?.split(",")[0]?.trim().toLowerCase().split(":")[0]?.trim() ?? "";
  return host || null;
}

export function isHororaStagingOpaqueCallbackRequest(request: Request): boolean {
  let urlHost: string | null = null;
  try {
    urlHost = new URL(request.url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const forwarded = firstHost(request.headers.get("x-forwarded-host"));
  const hostHeader = firstHost(request.headers.get("host"));
  const hosts = [urlHost, forwarded, hostHeader].filter((host): host is string => Boolean(host));
  if (hosts.some((host) => isCanonicalProductionHostname(host))) return false;
  return hosts.some((host) => isHororaStagingCallbackHostname(host));
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
  if (!OPAQUE_CODE_PATTERN.test(code)) return { ok: false, reason: "invalid_code" };
  return { ok: true, code };
}

export function buildNexusOpaqueExchangeBody(input: {
  readonly code: string;
  readonly clientAssertion: string;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set("code", input.code);
  body.set("client_assertion", input.clientAssertion);
  body.set("client_assertion_type", HORORA_STAGING_NEXUS_CLIENT_ASSERTION_TYPE);
  return body;
}

/**
 * Public Nexus JWKS shape check. HTTPS only. No private key material.
 */

import { readNexusHandoffConfig, type NexusHandoffEnvSource } from "@/app/lib/auth/nexus-handoff-config";

export type NexusJwksDenyReason = "jwks_unavailable" | "invalid_jwks";

export type NexusPublicJwk = {
  readonly kid: string;
  readonly kty: "EC";
  readonly crv: "P-256";
  readonly alg: "ES256";
  readonly use: "sig";
  readonly x: string;
  readonly y: string;
};

export type NexusJwksVerifyResult =
  | { readonly ok: true; readonly kids: readonly string[]; readonly keyCount: number }
  | { readonly ok: false; readonly reason: NexusJwksDenyReason };

export type NexusJwksFetch = (url: string) => Promise<Response>;

const JWKS_CACHE_TTL_MS = 60_000;

type CachedJwks = {
  readonly url: string;
  readonly expiresAt: number;
  readonly result: Extract<NexusJwksVerifyResult, { ok: true }>;
};

let cached: CachedJwks | null = null;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPublicEs256Jwk(value: unknown): value is NexusPublicJwk {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.kty !== "EC") return false;
  if (row.crv !== "P-256") return false;
  if (row.alg !== "ES256") return false;
  if (row.use !== "sig") return false;
  if (!isNonEmptyString(row.kid)) return false;
  if (!isNonEmptyString(row.x) || !isNonEmptyString(row.y)) return false;
  if (Object.prototype.hasOwnProperty.call(row, "d")) return false;
  return true;
}

export function inspectNexusPublicJwksDocument(body: unknown): NexusJwksVerifyResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "invalid_jwks" };
  }
  const keys = (body as { keys?: unknown }).keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    return { ok: false, reason: "invalid_jwks" };
  }
  const kids: string[] = [];
  for (const key of keys) {
    if (!isPublicEs256Jwk(key)) {
      return { ok: false, reason: "invalid_jwks" };
    }
    kids.push(key.kid);
  }
  return { ok: true, kids, keyCount: kids.length };
}

export async function verifyNexusPublicJwks(
  jwksUrl: string,
  options: { fetch?: NexusJwksFetch; nowMs?: number; bypassCache?: boolean } = {}
): Promise<NexusJwksVerifyResult> {
  const now = options.nowMs ?? Date.now();
  if (
    !options.bypassCache &&
    cached &&
    cached.url === jwksUrl &&
    cached.expiresAt > now
  ) {
    return cached.result;
  }

  let parsed: URL;
  try {
    parsed = new URL(jwksUrl);
  } catch {
    return { ok: false, reason: "invalid_jwks" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "invalid_jwks" };
  }

  const fetchImpl = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(jwksUrl);
  } catch {
    return { ok: false, reason: "jwks_unavailable" };
  }
  if (response.status !== 200) {
    return { ok: false, reason: "jwks_unavailable" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "invalid_jwks" };
  }

  const inspected = inspectNexusPublicJwksDocument(body);
  if (!inspected.ok) return inspected;
  cached = {
    url: jwksUrl,
    expiresAt: now + JWKS_CACHE_TTL_MS,
    result: inspected,
  };
  return inspected;
}

export async function verifyConfiguredNexusPublicJwks(
  env: NexusHandoffEnvSource = process.env,
  options: { fetch?: NexusJwksFetch; nowMs?: number; bypassCache?: boolean } = {}
): Promise<NexusJwksVerifyResult> {
  const config = readNexusHandoffConfig(env);
  if (!config.ok) {
    return { ok: false, reason: "jwks_unavailable" };
  }
  return verifyNexusPublicJwks(config.config.jwksUrl, options);
}

export function resetNexusPublicJwksCache(): void {
  cached = null;
}

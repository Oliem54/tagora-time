/**
 * TAGORA_HANDOFF_V1 verifier. ES256 only via jose.
 * Extra Nexus claims, kid, typ, TTL, nonce, and module key are fail-closed here.
 * No business permissions, no email fallback, no HS256.
 */

import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  errors as joseErrors,
  jwtVerify,
  type CryptoKey,
  type JWK,
  type JWTVerifyGetKey,
  type KeyObject,
} from "jose";
import {
  FORBIDDEN_NEXUS_AUTHORITY_CLAIMS,
  NEXUS_ALLOWED_ENTRY_ROLES,
  NEXUS_HANDOFF_ALGORITHM,
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_CLOCK_SKEW_SECONDS,
  NEXUS_HANDOFF_MAX_TTL_SECONDS,
  NEXUS_HANDOFF_VERSION,
  NEXUS_TECHNICAL_MODULE_KEY,
  readNexusHandoffConfig,
  type NexusHandoffConfig,
  type NexusHandoffEnvSource,
} from "@/app/lib/auth/nexus-handoff-config";

export type JwtVerificationKeySource =
  | JWTVerifyGetKey
  | CryptoKey
  | KeyObject
  | JWK
  | Uint8Array;

export type CreateRemoteJwkSetFn = (url: URL) => JWTVerifyGetKey;

export type NexusHandoffClaims = {
  readonly sub: string;
  readonly jti: string;
  readonly nonce: string;
  readonly iat: number;
  readonly nbf: number;
  readonly exp: number;
  readonly user_id: string;
  readonly organization_id: string;
  readonly membership_id: string;
  readonly tenant_id: string;
  readonly module_key: typeof NEXUS_TECHNICAL_MODULE_KEY;
  readonly handoff_id: string;
  readonly grant_id: string;
  readonly grant_version: string;
};

export type NexusHandoffDenyReason =
  | "missing_token"
  | "malformed_token"
  | "missing_kid"
  | "disallowed_algorithm"
  | "invalid_typ"
  | "invalid_version"
  | "invalid_signature"
  | "invalid_issuer"
  | "invalid_audience"
  | "invalid_module_key"
  | "missing_claim"
  | "expired_token"
  | "future_token"
  | "ttl_exceeded"
  | "jwks_unavailable"
  | "missing_configuration"
  | "invalid_configuration"
  | "invalid_token"
  | "forbidden_authority_claim"
  | "invalid_entry_role"
  | "email_identity_forbidden"
  | "missing_entitlement"
  | "revoked_membership"
  | "unknown_kid";

export type NexusHandoffVerifyResult =
  | { readonly ok: true; readonly claims: NexusHandoffClaims }
  | { readonly ok: false; readonly reason: NexusHandoffDenyReason };

export type NexusHandoffVerifyOptions = {
  readonly env?: NexusHandoffEnvSource;
  readonly config?: NexusHandoffConfig;
  readonly jwks?: JwtVerificationKeySource;
  readonly createRemoteJWKSet?: CreateRemoteJwkSetFn;
  readonly nowSeconds?: number;
  readonly knownKids?: readonly string[];
};

const REQUIRED_STRING_CLAIMS = [
  "jti",
  "nonce",
  "user_id",
  "organization_id",
  "membership_id",
  "tenant_id",
  "handoff_id",
] as const;

const ACTIVE_MEMBERSHIP_STATUSES = ["active"] as const;
const ACTIVE_ENTITLEMENT_STATUSES = ["active", "granted"] as const;

type CachedRemoteJwks = {
  readonly url: string;
  readonly resolver: JWTVerifyGetKey;
};

let cachedRemoteJwks: CachedRemoteJwks | null = null;

function fail(reason: NexusHandoffDenyReason): NexusHandoffVerifyResult {
  return { ok: false, reason };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readRequiredString(
  payload: Record<string, unknown>,
  key: (typeof REQUIRED_STRING_CLAIMS)[number]
): string | null {
  const value = payload[key];
  if (!isNonEmptyString(value)) return null;
  return value.trim();
}

function isFiniteEpoch(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasThreeJwtSegments(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function mapJoseFailure(error: unknown): NexusHandoffDenyReason {
  if (error instanceof joseErrors.JWTExpired) {
    return "expired_token";
  }
  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    const claim = error.claim;
    if (claim === "iss") return "invalid_issuer";
    if (claim === "aud") return "invalid_audience";
    if (claim === "nbf") return "future_token";
    if (claim === "exp") return error.reason === "missing" ? "missing_claim" : "expired_token";
    if (claim === "sub" || claim === "iat") return "missing_claim";
    return "invalid_token";
  }
  if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
    return "invalid_signature";
  }
  if (error instanceof joseErrors.JWKSNoMatchingKey) {
    return "invalid_signature";
  }
  if (error instanceof joseErrors.JWKSTimeout || error instanceof joseErrors.JWKSInvalid) {
    return "jwks_unavailable";
  }
  if (error instanceof joseErrors.JWTInvalid || error instanceof joseErrors.JWSInvalid) {
    return "malformed_token";
  }
  if (error instanceof joseErrors.JOSEError) {
    const code = error.code ?? "";
    if (
      code.includes("JWKS") ||
      /jwks|timeout|network|fetch|ECONN|ENOTFOUND/i.test(error.message)
    ) {
      return "jwks_unavailable";
    }
    if (code.includes("ALG") || /algorithm/i.test(error.message)) {
      return "disallowed_algorithm";
    }
    if (/signature/i.test(error.message)) {
      return "invalid_signature";
    }
    return "invalid_token";
  }
  if (error instanceof Error) {
    if (/jwks|timeout|network|fetch|ECONN|ENOTFOUND/i.test(error.message)) {
      return "jwks_unavailable";
    }
  }
  return "invalid_token";
}

function resolveRemoteJwks(
  jwksUrl: string,
  createRemoteJWKSetFn?: CreateRemoteJwkSetFn
): JWTVerifyGetKey {
  const factory = createRemoteJWKSetFn ?? createRemoteJWKSet;
  if (!createRemoteJWKSetFn && cachedRemoteJwks && cachedRemoteJwks.url === jwksUrl) {
    return cachedRemoteJwks.resolver;
  }
  const resolver = factory(new URL(jwksUrl));
  if (!createRemoteJWKSetFn) {
    cachedRemoteJwks = { url: jwksUrl, resolver };
  }
  return resolver;
}

export function extractNexusHandoffToken(input: {
  searchParams?: URLSearchParams | null;
  body?: unknown;
}): string | null {
  const fromQuery = input.searchParams?.get("handoff")?.trim() ?? "";
  if (fromQuery) return fromQuery;
  if (input.body && typeof input.body === "object" && !Array.isArray(input.body)) {
    const handoff = (input.body as Record<string, unknown>).handoff;
    if (typeof handoff === "string" && handoff.trim()) return handoff.trim();
  }
  return null;
}

export async function verifyTagoraHandoffV1(
  token: string | null | undefined,
  options: NexusHandoffVerifyOptions = {}
): Promise<NexusHandoffVerifyResult> {
  if (typeof token !== "string" || token.trim().length === 0) {
    return fail("missing_token");
  }
  const trimmed = token.trim();
  if (!hasThreeJwtSegments(trimmed)) {
    return fail("malformed_token");
  }

  const configResult = options.config
    ? { ok: true as const, config: options.config }
    : readNexusHandoffConfig(options.env ?? process.env);
  if (!configResult.ok) {
    return fail(configResult.reason);
  }
  const config = configResult.config;

  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(trimmed);
  } catch {
    return fail("malformed_token");
  }

  if (header.alg === "HS256" || header.alg === "none") {
    return fail("disallowed_algorithm");
  }
  if (header.alg !== NEXUS_HANDOFF_ALGORITHM) {
    return fail("disallowed_algorithm");
  }
  if (!isNonEmptyString(header.kid)) {
    return fail("missing_kid");
  }
  if (options.knownKids && !options.knownKids.includes(header.kid.trim())) {
    return fail("unknown_kid");
  }
  const headerTyp = typeof header.typ === "string" ? header.typ.trim() : "";
  if (headerTyp !== NEXUS_HANDOFF_VERSION) {
    return fail("invalid_typ");
  }

  let jwks: JwtVerificationKeySource;
  if (options.jwks) {
    jwks = options.jwks;
  } else {
    try {
      jwks = resolveRemoteJwks(config.jwksUrl, options.createRemoteJWKSet);
    } catch {
      return fail("jwks_unavailable");
    }
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const verifyOptions = {
    issuer: config.issuer,
    audience: NEXUS_HANDOFF_AUDIENCE,
    algorithms: [NEXUS_HANDOFF_ALGORITHM],
    clockTolerance: NEXUS_HANDOFF_CLOCK_SKEW_SECONDS,
    requiredClaims: ["sub", "iss", "aud", "exp", "iat", "nbf"],
    currentDate: new Date(nowSeconds * 1000),
  };

  let payload: Record<string, unknown>;
  let subject: string;
  try {
    const verified =
      typeof jwks === "function"
        ? await jwtVerify(trimmed, jwks, verifyOptions)
        : await jwtVerify(trimmed, jwks, verifyOptions);
    payload = verified.payload as Record<string, unknown>;
    subject = typeof verified.payload.sub === "string" ? verified.payload.sub.trim() : "";
  } catch (error) {
    return fail(mapJoseFailure(error));
  }

  if (!subject) return fail("missing_claim");

  const payloadTyp = isNonEmptyString(payload.typ) ? payload.typ.trim() : headerTyp;
  const versionRaw =
    (isNonEmptyString(payload.handoff_version) ? payload.handoff_version.trim() : "") ||
    (isNonEmptyString(payload.version) ? payload.version.trim() : "");
  if (payloadTyp !== NEXUS_HANDOFF_VERSION || versionRaw !== NEXUS_HANDOFF_VERSION) {
    return fail("invalid_version");
  }

  const moduleKey = isNonEmptyString(payload.module_key) ? payload.module_key.trim() : "";
  if (moduleKey !== NEXUS_TECHNICAL_MODULE_KEY) {
    return fail("invalid_module_key");
  }

  for (const claim of FORBIDDEN_NEXUS_AUTHORITY_CLAIMS) {
    if (Object.prototype.hasOwnProperty.call(payload, claim)) {
      return fail("forbidden_authority_claim");
    }
  }
  if (payload.business_permissions_authority === true) {
    return fail("forbidden_authority_claim");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "entry_role")) {
    const entryRole = isNonEmptyString(payload.entry_role) ? payload.entry_role.trim() : "";
    if (!(NEXUS_ALLOWED_ENTRY_ROLES as readonly string[]).includes(entryRole)) {
      return fail("invalid_entry_role");
    }
  }

  const strings: Record<(typeof REQUIRED_STRING_CLAIMS)[number], string> = {
    jti: "",
    nonce: "",
    user_id: "",
    organization_id: "",
    membership_id: "",
    tenant_id: "",
    handoff_id: "",
  };
  for (const key of REQUIRED_STRING_CLAIMS) {
    const value = readRequiredString(payload, key);
    if (!value) return fail("missing_claim");
    strings[key] = value;
  }

  const grantId = isNonEmptyString(payload.grant_id)
    ? payload.grant_id.trim()
    : typeof payload.grant_id === "number" && Number.isFinite(payload.grant_id)
      ? String(payload.grant_id)
      : "";
  const grantVersion = isNonEmptyString(payload.grant_version)
    ? payload.grant_version.trim()
    : typeof payload.grant_version === "number" && Number.isFinite(payload.grant_version)
      ? String(payload.grant_version)
      : "";
  if (!grantId || !grantVersion) {
    return fail("missing_entitlement");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "entitlement_status")) {
    const entitlementStatus = isNonEmptyString(payload.entitlement_status)
      ? payload.entitlement_status.trim()
      : "";
    if (!(ACTIVE_ENTITLEMENT_STATUSES as readonly string[]).includes(entitlementStatus)) {
      return fail("missing_entitlement");
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "membership_status")) {
    const membershipStatus = isNonEmptyString(payload.membership_status)
      ? payload.membership_status.trim()
      : "";
    if (!(ACTIVE_MEMBERSHIP_STATUSES as readonly string[]).includes(membershipStatus)) {
      return fail("revoked_membership");
    }
  }
  if (payload.membership_revoked === true) {
    return fail("revoked_membership");
  }

  if (strings.user_id !== subject) {
    return fail("missing_claim");
  }
  if (strings.user_id.includes("@")) {
    return fail("email_identity_forbidden");
  }

  const iat = isFiniteEpoch(payload.iat) ? payload.iat : null;
  const nbf = isFiniteEpoch(payload.nbf) ? payload.nbf : null;
  const exp = isFiniteEpoch(payload.exp) ? payload.exp : null;
  if (iat === null || nbf === null || exp === null) {
    return fail("missing_claim");
  }

  if (iat > nowSeconds + NEXUS_HANDOFF_CLOCK_SKEW_SECONDS) {
    return fail("future_token");
  }
  if (nbf > nowSeconds + NEXUS_HANDOFF_CLOCK_SKEW_SECONDS) {
    return fail("future_token");
  }
  if (exp + NEXUS_HANDOFF_CLOCK_SKEW_SECONDS < nowSeconds) {
    return fail("expired_token");
  }
  if (exp - iat > NEXUS_HANDOFF_MAX_TTL_SECONDS) {
    return fail("ttl_exceeded");
  }

  return {
    ok: true,
    claims: Object.freeze({
      sub: subject,
      jti: strings.jti,
      nonce: strings.nonce,
      iat,
      nbf,
      exp,
      user_id: strings.user_id,
      organization_id: strings.organization_id,
      membership_id: strings.membership_id,
      tenant_id: strings.tenant_id,
      module_key: NEXUS_TECHNICAL_MODULE_KEY,
      handoff_id: strings.handoff_id,
      grant_id: grantId,
      grant_version: grantVersion,
    }),
  };
}

export function nexusHandoffAuditFields(claims: NexusHandoffClaims): Record<string, string> {
  return {
    jti_present: "yes",
    nonce_present: "yes",
    module_key: claims.module_key,
    handoff_id: claims.handoff_id,
  };
}

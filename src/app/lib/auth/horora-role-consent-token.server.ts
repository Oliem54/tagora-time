/**
 * Verifies a proposed TAGORA_ROLE_CONSENT_V1 server token.
 * Issuer and ES256 keys come from the existing handoff configuration.
 * Launch audience tagora:time and typ TAGORA_HANDOFF_V1 are refused.
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
const ROLE_CATALOG_VERSION = "horora-role-catalog-v1" as const;

export type HororaRoleConsentAssignment = {
  readonly moduleKey: "tagora_time";
  readonly userModuleAccessId: string;
  readonly moduleRoleAssignmentId: string;
  readonly roleKey: string;
  readonly assignmentVersion: number;
  readonly catalogVersion: typeof ROLE_CATALOG_VERSION;
  readonly operation: "ASSIGN" | "CHANGE";
  readonly previousRoleKey: string | null;
};

export const HORORA_ROLE_CONSENT_TYP = "TAGORA_ROLE_CONSENT_V1" as const;
export const HORORA_ROLE_CATALOG_AUDIENCE = "tagora:time:role-catalog" as const;
export const HORORA_ROLE_ASSIGNMENT_AUDIENCE = "tagora:time:role-assignment" as const;
export const HORORA_ROLE_CONSENT_ENVIRONMENTS = ["local", "test", "staging"] as const;

export type HororaRoleConsentEnvironment =
  (typeof HORORA_ROLE_CONSENT_ENVIRONMENTS)[number];

export type HororaRoleConsentAudience =
  | typeof HORORA_ROLE_CATALOG_AUDIENCE
  | typeof HORORA_ROLE_ASSIGNMENT_AUDIENCE;

export type HororaRoleConsentClaims = {
  readonly typ: typeof HORORA_ROLE_CONSENT_TYP;
  readonly issuer: string;
  readonly audience: HororaRoleConsentAudience;
  readonly adminUserId: string;
  readonly targetUserId: string;
  readonly moduleKey: typeof NEXUS_TECHNICAL_MODULE_KEY;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly environment: HororaRoleConsentEnvironment;
  readonly operationId: string;
  readonly iat: number;
  readonly nbf: number;
  readonly exp: number;
  readonly assignment: HororaRoleConsentAssignment | null;
};

export type HororaRoleConsentDenyReason =
  | "missing_token"
  | "malformed_token"
  | "missing_configuration"
  | "invalid_configuration"
  | "jwks_unavailable"
  | "invalid_signature"
  | "invalid_issuer"
  | "invalid_audience"
  | "invalid_typ"
  | "handoff_refused"
  | "invalid_module_key"
  | "invalid_environment"
  | "forbidden_authority_claim"
  | "missing_claim"
  | "expired_token"
  | "future_token"
  | "ttl_exceeded"
  | "disallowed_algorithm"
  | "invalid_token";

export type HororaRoleConsentVerifyResult =
  | { readonly ok: true; readonly claims: HororaRoleConsentClaims }
  | { readonly ok: false; readonly reason: HororaRoleConsentDenyReason };

export type HororaRoleConsentKeySource =
  | JWTVerifyGetKey
  | CryptoKey
  | KeyObject
  | JWK
  | Uint8Array;

export type HororaRoleConsentVerifyOptions = {
  readonly audience: HororaRoleConsentAudience;
  readonly env?: NexusHandoffEnvSource;
  readonly config?: NexusHandoffConfig;
  readonly jwks?: HororaRoleConsentKeySource;
  readonly nowSeconds?: number;
};

export async function verifyTagoraRoleConsentV1(
  token: string | null | undefined,
  options: HororaRoleConsentVerifyOptions
): Promise<HororaRoleConsentVerifyResult> {
  if (typeof token !== "string" || token.trim().length === 0) {
    return fail("missing_token");
  }
  const trimmed = token.trim();
  if (!hasThreeJwtSegments(trimmed)) return fail("malformed_token");

  const configResult = options.config
    ? { ok: true as const, config: options.config }
    : readNexusHandoffConfig(options.env ?? process.env);
  if (!configResult.ok) return fail(configResult.reason);
  const config = configResult.config;

  let headerTyp = "";
  try {
    const header = decodeProtectedHeader(trimmed);
    if (header.alg !== NEXUS_HANDOFF_ALGORITHM) return fail("disallowed_algorithm");
    headerTyp = typeof header.typ === "string" ? header.typ.trim() : "";
  } catch {
    return fail("malformed_token");
  }
  if (headerTyp === NEXUS_HANDOFF_VERSION) return fail("handoff_refused");
  if (headerTyp && headerTyp !== HORORA_ROLE_CONSENT_TYP) return fail("invalid_typ");

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  let payload: Record<string, unknown>;
  let subject = "";
  try {
    const verified = await jwtVerify(trimmed, options.jwks ?? remoteJwks(config), {
      issuer: config.issuer,
      audience: options.audience,
      algorithms: [NEXUS_HANDOFF_ALGORITHM],
      clockTolerance: NEXUS_HANDOFF_CLOCK_SKEW_SECONDS,
      requiredClaims: ["sub", "iss", "aud", "exp", "iat", "nbf"],
      currentDate: new Date(nowSeconds * 1000),
    });
    payload = verified.payload as Record<string, unknown>;
    subject = typeof verified.payload.sub === "string" ? verified.payload.sub.trim() : "";
  } catch (error) {
    return fail(mapJoseFailure(error));
  }
  if (!subject) return fail("missing_claim");

  const typ = readString(payload.typ);
  if (payload.aud !== options.audience) return fail("invalid_audience");
  if (typ === NEXUS_HANDOFF_VERSION || payload.handoff_version === NEXUS_HANDOFF_VERSION) {
    return fail("handoff_refused");
  }
  if (typ !== HORORA_ROLE_CONSENT_TYP) return fail("invalid_typ");
  if (payload.aud === NEXUS_HANDOFF_AUDIENCE) return fail("handoff_refused");

  for (const claim of FORBIDDEN_NEXUS_AUTHORITY_CLAIMS) {
    if (Object.prototype.hasOwnProperty.call(payload, claim)) {
      return fail("forbidden_authority_claim");
    }
  }

  const moduleKey = readString(payload.module_key);
  if (moduleKey !== NEXUS_TECHNICAL_MODULE_KEY) return fail("invalid_module_key");

  const environment = readString(payload.environment);
  if (
    !environment ||
    !(HORORA_ROLE_CONSENT_ENVIRONMENTS as readonly string[]).includes(environment)
  ) {
    return fail("invalid_environment");
  }

  const organizationId = readString(payload.organization_id);
  const tenantId = readString(payload.tenant_id);
  const adminUserId = readString(payload.admin_user_id);
  const targetUserId = readString(payload.target_user_id);
  const operationId = readString(payload.jti);
  if (!organizationId || !tenantId || !adminUserId || !targetUserId || !operationId) {
    return fail("missing_claim");
  }
  if (adminUserId !== subject) return fail("missing_claim");
  if (adminUserId.includes("@") || targetUserId.includes("@")) return fail("missing_claim");

  const iat = epoch(payload.iat);
  const nbf = epoch(payload.nbf);
  const exp = epoch(payload.exp);
  if (iat === null || nbf === null || exp === null) return fail("missing_claim");
  if (iat > nowSeconds + NEXUS_HANDOFF_CLOCK_SKEW_SECONDS) return fail("future_token");
  if (nbf > nowSeconds + NEXUS_HANDOFF_CLOCK_SKEW_SECONDS) return fail("future_token");
  if (exp + NEXUS_HANDOFF_CLOCK_SKEW_SECONDS < nowSeconds) return fail("expired_token");
  if (exp - iat > NEXUS_HANDOFF_MAX_TTL_SECONDS) return fail("ttl_exceeded");

  const assignment =
    options.audience === HORORA_ROLE_ASSIGNMENT_AUDIENCE
      ? readAssignmentClaims(payload)
      : null;
  if (options.audience === HORORA_ROLE_ASSIGNMENT_AUDIENCE && !assignment) {
    return fail("missing_claim");
  }
  if (options.audience === HORORA_ROLE_CATALOG_AUDIENCE && hasAssignmentClaim(payload)) {
    return fail("forbidden_authority_claim");
  }

  return {
    ok: true,
    claims: Object.freeze({
      typ: HORORA_ROLE_CONSENT_TYP,
      issuer: config.issuer,
      audience: options.audience,
      adminUserId,
      targetUserId,
      moduleKey: NEXUS_TECHNICAL_MODULE_KEY,
      organizationId,
      tenantId,
      environment: environment as HororaRoleConsentEnvironment,
      operationId,
      iat,
      nbf,
      exp,
      assignment,
    }),
  };
}

function readAssignmentClaims(
  payload: Record<string, unknown>
): HororaRoleConsentAssignment | null {
  const userModuleAccessId = readString(payload.user_module_access_id);
  const moduleRoleAssignmentId = readString(payload.module_role_assignment_id);
  const roleKey = readString(payload.role_key);
  const catalogVersion = readString(payload.catalog_version);
  const operation = readString(payload.operation);
  const assignmentVersion = payload.assignment_version;
  if (
    !userModuleAccessId ||
    !moduleRoleAssignmentId ||
    !roleKey ||
    catalogVersion !== ROLE_CATALOG_VERSION ||
    (operation !== "ASSIGN" && operation !== "CHANGE") ||
    typeof assignmentVersion !== "number" ||
    !Number.isInteger(assignmentVersion) ||
    assignmentVersion <= 0 ||
    !Object.prototype.hasOwnProperty.call(payload, "previous_role_key")
  ) {
    return null;
  }
  const previousRoleKey =
    payload.previous_role_key == null ? null : readString(payload.previous_role_key);
  if (payload.previous_role_key != null && !previousRoleKey) return null;
  return {
    moduleKey: NEXUS_TECHNICAL_MODULE_KEY,
    userModuleAccessId,
    moduleRoleAssignmentId,
    roleKey,
    assignmentVersion,
    catalogVersion,
    operation,
    previousRoleKey,
  };
}

function hasAssignmentClaim(payload: Record<string, unknown>): boolean {
  return (
    payload.role_key != null ||
    payload.module_role_assignment_id != null ||
    payload.user_module_access_id != null ||
    payload.operation != null
  );
}

function remoteJwks(config: NexusHandoffConfig): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(config.jwksUrl));
}

function fail(reason: HororaRoleConsentDenyReason): HororaRoleConsentVerifyResult {
  return { ok: false, reason };
}

function hasThreeJwtSegments(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function epoch(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapJoseFailure(error: unknown): HororaRoleConsentDenyReason {
  if (error instanceof joseErrors.JWTExpired) return "expired_token";
  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    if (error.claim === "iss") return "invalid_issuer";
    if (error.claim === "aud") return "invalid_audience";
    if (error.claim === "nbf") return "future_token";
    if (error.claim === "exp") return "expired_token";
    return "invalid_token";
  }
  if (error instanceof joseErrors.JWSSignatureVerificationFailed) return "invalid_signature";
  if (error instanceof joseErrors.JWKSNoMatchingKey) return "invalid_signature";
  if (
    error instanceof joseErrors.JWKSTimeout ||
    error instanceof joseErrors.JWKSInvalid
  ) {
    return "jwks_unavailable";
  }
  return "invalid_token";
}

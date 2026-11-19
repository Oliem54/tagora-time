/**
 * TAGORA HORORA local consumer of the approved TAGORA ZERO ACCESS
 * IDENTITY PROVISIONING CONTRACT V1.1.
 * Audience tagora:time. Technical key tagora_time.
 * A technical nuser_ shell is not a business profile, grant, role,
 * membership, or session. This module does not import HORORA Premium
 * User Central and does not grant RBAC. It is not mounted on a route.
 * The prepared migration is not applied. No JWKS fetch.
 */

import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";

export const USER_PROVISIONING_CONTRACT_VERSION = "V1.1" as const;
export const USER_PROVISIONING_CONTRACT_APPROVAL = "APPROVED" as const;
export const CONTRACT_RUNTIME_WIRED = false as const;
export const MIGRATION_APPLIED = false as const;
export const JWKS_FETCH_AUTHORIZED = false as const;
export const NEXUS_V11_UNPUBLISHED = "UNPUBLISHED" as const;
export const HORORA_AUDIENCE = "tagora:time" as const;
export const HORORA_TECHNICAL_KEY = "tagora_time" as const;
export const NEXUS_V11_CONTRACT_DEPENDENCY = {
  canonicalIssuer: NEXUS_V11_UNPUBLISHED,
  pinnedKid: NEXUS_V11_UNPUBLISHED,
  publicJwk: NEXUS_V11_UNPUBLISHED,
  audience: HORORA_AUDIENCE,
  technicalKey: HORORA_TECHNICAL_KEY,
  signature: "caller_pinned_es256",
  versioning: "monotonic_identity_version",
  revocation: "terminal_no_restore",
  replay: "jti_idempotent_duplicate",
  durableReceiver: CONTRACT_RUNTIME_WIRED,
  jwksFetch: JWKS_FETCH_AUTHORIZED,
} as const;
export const HORORA_PRODUCT_NAME = "TAGORA HORORA" as const;
export const HORORA_PIN_ENVIRONMENT = "local" as const;
export const EVENT_TTL_SECONDS = 900 as const;
export const CLOCK_SKEW_SECONDS = 30 as const;
export const JTI_RETENTION_SECONDS = 604_800 as const;
export const PROVISIONING_KEY_OVERLAP_SECONDS = EVENT_TTL_SECONDS + CLOCK_SKEW_SECONDS;
export const PREPARED_MIGRATION_FILE =
  "supabase/migrations/20261118190000_horora_zero_access_provisioning_prepared.sql" as const;

const CANONICAL_NUSER_ID = /^nuser_[a-f0-9]{32}$/;
const EVENT_ID_PATTERN = /^evt_[a-z0-9_]{8,64}$/;
const JTI_PATTERN = /^jti_[a-z0-9_]{8,64}$/;
const CORRELATION_PATTERN = /^corr_[a-z0-9_]{8,64}$/;
const LOCAL_SUBJECT_PATTERN = /^local_[a-z0-9_]{1,64}$/;
const SCOPE_ID_PATTERN = /^[a-z0-9_]{1,64}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const HEADER_KEYS = new Set(["alg", "kid", "typ"]);
const EVENT_TYPES = [
  "identity.created",
  "identity.updated",
  "identity.suspended",
  "identity.revoked",
  "identity.reactivated",
  "identity.link.requested",
] as const;
const REQUIRED_FIELDS = [
  "contract_version",
  "event_id",
  "jti",
  "event_type",
  "issuer",
  "audience",
  "nuser_id",
  "identity_version",
  "occurred_at",
  "expires_at",
  "correlation_id",
] as const;
const ALLOWED_EVENT_KEYS = new Set<string>([...REQUIRED_FIELDS, "tenant_context", "verified_local_subject_id"]);
const FORBIDDEN_CLAIM_KEYS = [
  "email",
  "email_address",
  "mail",
  "phone",
  "telephone",
  "mobile",
  "given_name",
  "family_name",
  "first_name",
  "last_name",
  "display_name",
  "name",
  "password",
  "secret",
  "token",
  "address",
  "birthdate",
  "birth_date",
] as const;
const TENANT_CONTEXT_REQUIRED: Record<EventType, boolean> = {
  "identity.created": true,
  "identity.updated": true,
  "identity.link.requested": true,
  "identity.reactivated": true,
  "identity.suspended": false,
  "identity.revoked": false,
};
const SUCCESS_RESULTS = new Set<ResponseCode>(["PROVISIONED_ZERO_ACCESS", "APPLIED", "ALREADY_LINKED"]);

type EventType = (typeof EVENT_TYPES)[number];
type ResponseCode =
  | "PROVISIONED_ZERO_ACCESS"
  | "ALREADY_LINKED"
  | "LINK_REVIEW_REQUIRED"
  | "APPLIED"
  | "ALREADY_APPLIED"
  | "STALE_EVENT_DENIED"
  | "SIGNATURE_DENIED"
  | "PAYLOAD_NONCONFORMANT"
  | "TENANT_DENIED"
  | "MODULE_DENIED"
  | "RETRYABLE_FAILURE";
type SecurityBlock = "NONE" | "SUSPENDED" | "REVOKED";
type PermissionLatch = "OPEN" | "RESTORE_REQUIRED" | "REVOKED_TERMINAL";

export type PublicEs256Jwk = {
  kty: "EC";
  crv: "P-256";
  alg: "ES256";
  use: "sig";
  kid: string;
  x: string;
  y: string;
};

export type PinnedProvisioningKey = PublicEs256Jwk & {
  environment: "local" | "staging" | "production";
  status: "active" | "retired" | "compromised";
  retiredAtMs?: number;
  notBeforeMs?: number;
  notAfterMs?: number;
};

type TenantContext = { tenant_id: string; organization_id: string };

type ProvisioningEvent = {
  contract_version: typeof USER_PROVISIONING_CONTRACT_VERSION;
  event_id: string;
  jti: string;
  event_type: EventType;
  issuer: string;
  audience: string;
  nuser_id: string;
  identity_version: number;
  occurred_at: string;
  expires_at: string;
  correlation_id: string;
  tenant_context?: TenantContext;
  verified_local_subject_id?: string;
};

export type ContractEffects = {
  identity_created: boolean;
  module_local_identity: boolean;
  nuser_linked: boolean;
  module_access: false;
  business_role: "NONE" | "UNCHANGED";
  module_admin: false;
  business_org_auto_assignment: "NONE";
  session_created: false;
  invitation_sent: false;
  sessions_closed: boolean;
  permissions_restored: false;
  security_block: SecurityBlock;
  effective_access_under_module_authority: boolean;
};

export type ContractResponse = {
  contract_version: typeof USER_PROVISIONING_CONTRACT_VERSION;
  result: ResponseCode;
  reason: string;
  event_id: string;
  jti: string;
  nuser_id: string;
  identity_version: number | null;
  correlation_id: string;
  prior_result: ResponseCode | null;
  effects: ContractEffects;
};

export type LocalPrincipal = {
  localSubjectId: string;
  linkedNuserId: string | null;
  storedBusinessRole: string;
  storedModuleAccess: boolean;
  storedModuleAdmin: boolean;
  preexistingOrganizationId: string | null;
  businessFilesPresent: boolean;
};

export type IdentitySnapshot = {
  nuserId: string;
  linked: boolean;
  localSubjectId: string | null;
  identityVersion: number;
  securityBlock: SecurityBlock;
  latch: PermissionLatch;
  sessionActive: boolean;
  sessionCloseCount: number;
  invitationSent: false;
  storedBusinessRole: string | null;
  storedModuleAccess: boolean;
  storedModuleAdmin: boolean;
  preexistingOrganizationId: string | null;
  businessFilesPresent: boolean;
  effectiveAccess: boolean;
  contractGrantedAccess: false;
  businessOrgAutoAssignment: "NONE";
};

type NuserState = {
  nuserId: string;
  localSubjectId: string | null;
  identityVersion: number;
  securityBlock: SecurityBlock;
  latch: PermissionLatch;
  sessionActive: boolean;
  sessionCloseCount: number;
  invitationSent: false;
  createdByContract: boolean;
  businessFilesPresent: boolean;
  contractGrantedAccess: false;
};

type StoredDecision = {
  eventId: string;
  jti: string;
  hash: string;
  response: ContractResponse;
  expiresAtMs: number | null;
};

const UNREADABLE = {
  event_id: "evt_unreadable",
  jti: "jti_unreadable",
  nuser_id: "nuser_00000000000000000000000000000000",
  correlation_id: "corr_unreadable",
} as const;

/** Recognizing a canonical nuser_ id grants no privilege. */
export function accessFromNuserRecognition(nuserId: string): false {
  return nuserId.length >= 0 ? false : false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyEffects(patch: Partial<ContractEffects> = {}): ContractEffects {
  return {
    identity_created: false,
    module_local_identity: false,
    nuser_linked: false,
    business_role: "NONE",
    sessions_closed: false,
    security_block: "NONE",
    effective_access_under_module_authority: false,
    ...patch,
    module_access: false,
    module_admin: false,
    business_org_auto_assignment: "NONE",
    session_created: false,
    invitation_sent: false,
    permissions_restored: false,
  };
}

function buildResponse(input: {
  result: ResponseCode;
  reason: string;
  event?: Pick<ProvisioningEvent, "event_id" | "jti" | "nuser_id" | "identity_version" | "correlation_id"> | null;
  prior_result?: ResponseCode | null;
  effects?: Partial<ContractEffects>;
}): ContractResponse {
  const event = input.event;
  return {
    contract_version: USER_PROVISIONING_CONTRACT_VERSION,
    result: input.result,
    reason: input.reason,
    event_id: event?.event_id ?? UNREADABLE.event_id,
    jti: event?.jti ?? UNREADABLE.jti,
    nuser_id: event?.nuser_id ?? UNREADABLE.nuser_id,
    identity_version: event?.identity_version ?? null,
    correlation_id: event?.correlation_id ?? UNREADABLE.correlation_id,
    prior_result: input.prior_result ?? null,
    effects: emptyEffects(input.effects),
  };
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (!isRecord(value)) return false;
  for (const key of Object.keys(value)) {
    if (
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype" ||
      FORBIDDEN_CLAIM_KEYS.includes(key as (typeof FORBIDDEN_CLAIM_KEYS)[number])
    ) {
      return true;
    }
    if (hasForbiddenKey(value[key])) return true;
  }
  return false;
}

function hasEmailShapedString(value: unknown): boolean {
  if (typeof value === "string") return value.includes("@");
  if (Array.isArray(value)) return true;
  if (!isRecord(value)) return false;
  return Object.values(value).some((entry) => hasEmailShapedString(entry));
}

function parseUtc(value: unknown): number | null {
  if (typeof value !== "string" || !UTC_PATTERN.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEvent(
  payload: unknown,
): { ok: true; event: ProvisioningEvent } | { ok: false; result: "PAYLOAD_NONCONFORMANT" | "MODULE_DENIED"; reason: string } {
  if (!isRecord(payload) || hasForbiddenKey(payload) || hasEmailShapedString(payload)) {
    return { ok: false, result: "PAYLOAD_NONCONFORMANT", reason: "PAYLOAD_NONCONFORMANT" };
  }
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_EVENT_KEYS.has(key)) return { ok: false, result: "PAYLOAD_NONCONFORMANT", reason: "PAYLOAD_NONCONFORMANT" };
  }
  if (payload.contract_version !== USER_PROVISIONING_CONTRACT_VERSION) {
    return { ok: false, result: "MODULE_DENIED", reason: "CONTRACT_VERSION_UNSUPPORTED" };
  }
  const eventType = payload.event_type;
  if (typeof eventType !== "string" || !EVENT_TYPES.includes(eventType as EventType)) {
    return { ok: false, result: "PAYLOAD_NONCONFORMANT", reason: "PAYLOAD_NONCONFORMANT" };
  }
  const identityVersion = payload.identity_version;
  const occurredAt = parseUtc(payload.occurred_at);
  const expiresAt = parseUtc(payload.expires_at);
  if (
    typeof payload.event_id !== "string" ||
    !EVENT_ID_PATTERN.test(payload.event_id) ||
    typeof payload.jti !== "string" ||
    !JTI_PATTERN.test(payload.jti) ||
    typeof payload.issuer !== "string" ||
    payload.issuer.trim() !== payload.issuer ||
    payload.issuer.length < 8 ||
    typeof payload.audience !== "string" ||
    payload.audience.trim() !== payload.audience ||
    payload.audience.length < 3 ||
    typeof payload.nuser_id !== "string" ||
    !CANONICAL_NUSER_ID.test(payload.nuser_id) ||
    typeof payload.correlation_id !== "string" ||
    !CORRELATION_PATTERN.test(payload.correlation_id) ||
    typeof identityVersion !== "number" ||
    !Number.isInteger(identityVersion) ||
    identityVersion < 1 ||
    identityVersion > 1_000_000_000 ||
    occurredAt == null ||
    expiresAt == null ||
    expiresAt <= occurredAt ||
    expiresAt - occurredAt > EVENT_TTL_SECONDS * 1000
  ) {
    return { ok: false, result: "PAYLOAD_NONCONFORMANT", reason: "PAYLOAD_NONCONFORMANT" };
  }
  let tenantContext: TenantContext | undefined;
  if (payload.tenant_context !== undefined) {
    if (!isRecord(payload.tenant_context)) return { ok: false, result: "PAYLOAD_NONCONFORMANT", reason: "PAYLOAD_NONCONFORMANT" };
    const tenantId = payload.tenant_context.tenant_id;
    const organizationId = payload.tenant_context.organization_id;
    if (
      Object.keys(payload.tenant_context).length !== 2 ||
      typeof tenantId !== "string" ||
      typeof organizationId !== "string" ||
      !SCOPE_ID_PATTERN.test(tenantId) ||
      !SCOPE_ID_PATTERN.test(organizationId)
    ) {
      return { ok: false, result: "PAYLOAD_NONCONFORMANT", reason: "PAYLOAD_NONCONFORMANT" };
    }
    tenantContext = { tenant_id: tenantId, organization_id: organizationId };
  }
  if (
    payload.verified_local_subject_id !== undefined &&
    (eventType !== "identity.link.requested" ||
      typeof payload.verified_local_subject_id !== "string" ||
      !LOCAL_SUBJECT_PATTERN.test(payload.verified_local_subject_id))
  ) {
    return { ok: false, result: "PAYLOAD_NONCONFORMANT", reason: "PAYLOAD_NONCONFORMANT" };
  }
  const event: ProvisioningEvent = {
    contract_version: USER_PROVISIONING_CONTRACT_VERSION,
    event_id: payload.event_id,
    jti: payload.jti,
    event_type: eventType as EventType,
    issuer: payload.issuer,
    audience: payload.audience,
    nuser_id: payload.nuser_id,
    identity_version: identityVersion,
    occurred_at: payload.occurred_at as string,
    expires_at: payload.expires_at as string,
    correlation_id: payload.correlation_id,
  };
  if (tenantContext) event.tenant_context = tenantContext;
  if (typeof payload.verified_local_subject_id === "string") event.verified_local_subject_id = payload.verified_local_subject_id;
  return { ok: true, event };
}

function publicKeyIsAuthorized(jwk: PublicEs256Jwk): boolean {
  return (
    jwk.kty === "EC" &&
    jwk.crv === "P-256" &&
    jwk.alg === "ES256" &&
    jwk.use === "sig" &&
    typeof jwk.kid === "string" &&
    jwk.kid.trim() === jwk.kid &&
    jwk.kid.length > 0 &&
    typeof jwk.x === "string" &&
    typeof jwk.y === "string" &&
    !("d" in jwk)
  );
}

function assessPinnedKey(key: PinnedProvisioningKey | undefined, nowMs: number): string {
  if (!key || !publicKeyIsAuthorized(key)) return "UNKNOWN_KID";
  if (key.environment !== HORORA_PIN_ENVIRONMENT) return "KEY_ENVIRONMENT_MISMATCH";
  if (key.status === "compromised") return "KEY_COMPROMISED";
  const skewMs = CLOCK_SKEW_SECONDS * 1000;
  if (key.notBeforeMs != null && nowMs < key.notBeforeMs - skewMs) return "KEY_NOT_YET_VALID";
  if (key.notAfterMs != null && nowMs > key.notAfterMs + skewMs) return "KEY_EXPIRED";
  if (key.status === "active") return "OK";
  if (key.retiredAtMs == null) return "KEY_RETIRED";
  if (nowMs <= key.retiredAtMs + PROVISIONING_KEY_OVERLAP_SECONDS * 1000) return "OK";
  return "KEY_RETIRED";
}

function decodeSegment(segment: string): Buffer | null {
  if (!segment || !/^[-A-Za-z0-9_]+$/.test(segment)) return null;
  return Buffer.from(segment, "base64url");
}

function verifyEs256(signingInput: string, signature: Buffer, jwk: PublicEs256Jwk): boolean {
  if (!publicKeyIsAuthorized(jwk) || signature.length !== 64) return false;
  try {
    const key = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: "jwk" });
    return cryptoVerify("SHA256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" }, signature);
  } catch {
    return false;
  }
}

function authenticate(token: string, keys: readonly PinnedProvisioningKey[], issuer: string, nowMs: number) {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return { ok: false as const, result: "SIGNATURE_DENIED" as const, reason: "ALGORITHM_REJECTED", event: null, payloadHash: null };
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
  const headerBytes = decodeSegment(encodedHeader);
  const signature = decodeSegment(encodedSignature);
  if (!headerBytes || !signature) {
    return { ok: false as const, result: "SIGNATURE_DENIED" as const, reason: "ALGORITHM_REJECTED", event: null, payloadHash: null };
  }
  let header: unknown;
  try {
    header = JSON.parse(headerBytes.toString("utf8")) as unknown;
  } catch {
    return { ok: false as const, result: "SIGNATURE_DENIED" as const, reason: "ALGORITHM_REJECTED", event: null, payloadHash: null };
  }
  if (!isRecord(header)) {
    return { ok: false as const, result: "SIGNATURE_DENIED" as const, reason: "ALGORITHM_REJECTED", event: null, payloadHash: null };
  }
  for (const key of Object.keys(header)) {
    if (!HEADER_KEYS.has(key)) {
      return { ok: false as const, result: "SIGNATURE_DENIED" as const, reason: "ALGORITHM_REJECTED", event: null, payloadHash: null };
    }
  }
  if (header.alg !== "ES256" || header.typ === "none") {
    return { ok: false as const, result: "SIGNATURE_DENIED" as const, reason: "ALGORITHM_REJECTED", event: null, payloadHash: null };
  }
  if (typeof header.kid !== "string" || header.kid.trim() === "") {
    return { ok: false as const, result: "SIGNATURE_DENIED" as const, reason: "UNKNOWN_KID", event: null, payloadHash: null };
  }
  const key = keys.find((candidate) => candidate.kid === header.kid);
  const pin = assessPinnedKey(key, nowMs);
  if (pin !== "OK") {
    return { ok: false as const, result: "SIGNATURE_DENIED" as const, reason: pin, event: null, payloadHash: null };
  }
  if (!key || !verifyEs256(`${encodedHeader}.${encodedPayload}`, signature, key)) {
    return { ok: false as const, result: "SIGNATURE_DENIED" as const, reason: "SIGNATURE_INVALID", event: null, payloadHash: null };
  }
  const payloadBytes = decodeSegment(encodedPayload);
  if (!payloadBytes) {
    return { ok: false as const, result: "PAYLOAD_NONCONFORMANT" as const, reason: "PAYLOAD_NONCONFORMANT", event: null, payloadHash: null };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadBytes.toString("utf8")) as unknown;
  } catch {
    return { ok: false as const, result: "PAYLOAD_NONCONFORMANT" as const, reason: "PAYLOAD_NONCONFORMANT", event: null, payloadHash: null };
  }
  const payloadHash = createHash("sha256").update(encodedPayload).digest("hex");
  const parsed = parseEvent(payload);
  if (!parsed.ok) {
    return { ok: false as const, result: parsed.result, reason: parsed.reason, event: null, payloadHash };
  }
  if (parsed.event.issuer !== issuer) {
    return { ok: false as const, result: "SIGNATURE_DENIED" as const, reason: "ISSUER_UNAUTHORIZED", event: parsed.event, payloadHash };
  }
  return { ok: true as const, event: parsed.event, payloadHash };
}

function classifyLink(input: { nuserId: string; verifiedLocalSubjectId: string | null; principals: readonly LocalPrincipal[] }) {
  const linkedToSame = input.principals.filter((principal) => principal.linkedNuserId === input.nuserId);
  if (linkedToSame.length > 1) return "LINK_REVIEW_REQUIRED" as const;
  if (linkedToSame.length === 1) {
    const linked = linkedToSame[0];
    if (!linked) return "LINK_REVIEW_REQUIRED" as const;
    if (input.verifiedLocalSubjectId && input.verifiedLocalSubjectId !== linked.localSubjectId) return "LINK_REVIEW_REQUIRED" as const;
    return "ALREADY_LINKED" as const;
  }
  if (!input.verifiedLocalSubjectId) return "LINK_REVIEW_REQUIRED" as const;
  const matches = input.principals.filter((principal) => principal.localSubjectId === input.verifiedLocalSubjectId);
  if (matches.length !== 1) return "LINK_REVIEW_REQUIRED" as const;
  const match = matches[0];
  if (!match || (match.linkedNuserId && match.linkedNuserId !== input.nuserId)) return "LINK_REVIEW_REQUIRED" as const;
  return "APPLY_LINK" as const;
}

function shellSubjectId(nuserId: string): string {
  return `local_shell_${nuserId.slice(6, 22)}`;
}

export type HororaZeroAccessCentral = {
  ingest(token: string, nowMs: number): ContractResponse;
  snapshot(nuserId: string): IdentitySnapshot | null;
  seedLocalPrincipal(input: {
    localSubjectId: string;
    linkedNuserId?: string | null;
    storedBusinessRole: string;
    storedModuleAccess: boolean;
    storedModuleAdmin: boolean;
    preexistingOrganizationId: string | null;
    businessFilesPresent?: boolean;
    sessionActive?: boolean;
  }): void;
  setAvailable(available: boolean): void;
  decisionCount(): number;
  identityCount(): number;
  readLocalPrincipal(localSubjectId: string): LocalPrincipal | null;
};

export function createHororaZeroAccessCentral(input: {
  issuer: string;
  keys: readonly PinnedProvisioningKey[];
  allowedScopes: readonly { tenantId: string; organizationId: string }[];
}): HororaZeroAccessCentral {
  const principals = new Map<string, LocalPrincipal>();
  const identities = new Map<string, NuserState>();
  const byEventId = new Map<string, StoredDecision>();
  const byJti = new Map<string, StoredDecision>();
  let decisions = 0;
  let available = true;

  function snapshotOf(nuserId: string): IdentitySnapshot | null {
    const state = identities.get(nuserId);
    if (!state) return null;
    const principal = state.localSubjectId ? principals.get(state.localSubjectId) ?? null : null;
    const linked = principal?.linkedNuserId === nuserId;
    const effectiveAccess =
      state.securityBlock === "NONE" &&
      state.latch === "OPEN" &&
      linked &&
      principal?.storedModuleAccess === true &&
      state.contractGrantedAccess === false;
    return {
      nuserId,
      linked: linked || state.localSubjectId != null,
      localSubjectId: state.localSubjectId,
      identityVersion: state.identityVersion,
      securityBlock: state.securityBlock,
      latch: state.latch,
      sessionActive: state.sessionActive,
      sessionCloseCount: state.sessionCloseCount,
      invitationSent: false,
      storedBusinessRole: principal?.storedBusinessRole ?? null,
      storedModuleAccess: principal?.storedModuleAccess ?? false,
      storedModuleAdmin: principal?.storedModuleAdmin ?? false,
      preexistingOrganizationId: principal?.preexistingOrganizationId ?? null,
      businessFilesPresent: state.businessFilesPresent,
      effectiveAccess,
      contractGrantedAccess: false,
      businessOrgAutoAssignment: "NONE",
    };
  }

  function effectsFrom(nuserId: string, patch: Partial<ContractEffects> = {}) {
    const snap = snapshotOf(nuserId);
    return {
      identity_created: false,
      module_local_identity: snap?.localSubjectId != null,
      nuser_linked: snap?.linked === true,
      business_role: snap?.storedBusinessRole && snap.storedBusinessRole !== "NONE" ? ("UNCHANGED" as const) : ("NONE" as const),
      sessions_closed: false,
      security_block: snap?.securityBlock ?? "NONE",
      effective_access_under_module_authority: snap?.effectiveAccess ?? false,
      ...patch,
    };
  }

  function remember(event: ProvisioningEvent, hash: string, response: ContractResponse): ContractResponse {
    const stored = { eventId: event.event_id, jti: event.jti, hash, response, expiresAtMs: Date.parse(event.expires_at) };
    byEventId.set(event.event_id, stored);
    byJti.set(event.jti, stored);
    decisions += 1;
    return response;
  }

  function logOnly(response: ContractResponse): ContractResponse {
    decisions += 1;
    return response;
  }

  function retained(stored: StoredDecision, nowMs: number): boolean {
    return stored.expiresAtMs == null || nowMs <= stored.expiresAtMs + JTI_RETENTION_SECONDS * 1000;
  }

  function tenantOf(event: ProvisioningEvent): "OK" | "MISSING" | "MISMATCH" {
    if (!event.tenant_context) return TENANT_CONTEXT_REQUIRED[event.event_type] ? "MISSING" : "OK";
    const allowed = input.allowedScopes.some(
      (scope) => scope.tenantId === event.tenant_context?.tenant_id && scope.organizationId === event.tenant_context.organization_id,
    );
    return allowed ? "OK" : "MISMATCH";
  }

  function ensureState(nuserId: string): NuserState {
    const existing = identities.get(nuserId);
    if (existing) return existing;
    const created: NuserState = {
      nuserId,
      localSubjectId: null,
      identityVersion: 0,
      securityBlock: "NONE",
      latch: "OPEN",
      sessionActive: false,
      sessionCloseCount: 0,
      invitationSent: false,
      createdByContract: false,
      businessFilesPresent: false,
      contractGrantedAccess: false,
    };
    identities.set(nuserId, created);
    return created;
  }

  function apply(event: ProvisioningEvent, versionGap: boolean): ContractResponse {
    const state = identities.get(event.nuser_id) ?? null;
    if (state?.securityBlock === "REVOKED" && event.event_type !== "identity.revoked") {
      return buildResponse({ result: "STALE_EVENT_DENIED", reason: "REVOCATION_IS_TERMINAL", event, effects: effectsFrom(event.nuser_id) });
    }
    if (
      state?.securityBlock === "SUSPENDED" &&
      (event.event_type === "identity.created" || event.event_type === "identity.updated" || event.event_type === "identity.link.requested")
    ) {
      return buildResponse({ result: "STALE_EVENT_DENIED", reason: "SECURITY_BLOCK_HOLDS", event, effects: effectsFrom(event.nuser_id) });
    }
    if (event.event_type === "identity.created") {
      if (state) {
        state.identityVersion = event.identity_version;
        return buildResponse({ result: "ALREADY_LINKED", reason: "IDENTITY_ALREADY_PRESENT", event, effects: effectsFrom(event.nuser_id) });
      }
      const created = ensureState(event.nuser_id);
      const localSubjectId = shellSubjectId(event.nuser_id);
      created.localSubjectId = localSubjectId;
      created.identityVersion = event.identity_version;
      created.createdByContract = true;
      principals.set(localSubjectId, {
        localSubjectId,
        linkedNuserId: event.nuser_id,
        storedBusinessRole: "NONE",
        storedModuleAccess: false,
        storedModuleAdmin: false,
        preexistingOrganizationId: null,
        businessFilesPresent: false,
      });
      return buildResponse({
        result: "PROVISIONED_ZERO_ACCESS",
        reason: "OK_ZERO_ACCESS",
        event,
        effects: effectsFrom(event.nuser_id, { identity_created: true, business_role: "NONE" }),
      });
    }
    if (event.event_type === "identity.updated") {
      if (!state) return buildResponse({ result: "STALE_EVENT_DENIED", reason: "IDENTITY_UNKNOWN", event });
      state.identityVersion = event.identity_version;
      return buildResponse({
        result: "APPLIED",
        reason: versionGap ? "UPDATE_APPLIED_GAP" : "UPDATE_APPLIED",
        event,
        effects: effectsFrom(event.nuser_id),
      });
    }
    if (event.event_type === "identity.link.requested") {
      const classification = classifyLink({
        nuserId: event.nuser_id,
        verifiedLocalSubjectId: event.verified_local_subject_id ?? null,
        principals: [...principals.values()],
      });
      if (classification === "LINK_REVIEW_REQUIRED") {
        return buildResponse({ result: "LINK_REVIEW_REQUIRED", reason: "LINK_AMBIGUOUS", event, effects: effectsFrom(event.nuser_id) });
      }
      if (classification === "ALREADY_LINKED") {
        if (state) state.identityVersion = event.identity_version;
        return buildResponse({ result: "ALREADY_LINKED", reason: "ALREADY_LINKED", event, effects: effectsFrom(event.nuser_id) });
      }
      const principal = principals.get(event.verified_local_subject_id ?? "");
      if (!principal) return buildResponse({ result: "LINK_REVIEW_REQUIRED", reason: "LINK_AMBIGUOUS", event });
      const preservedRole = principal.storedBusinessRole;
      const preservedAccess = principal.storedModuleAccess;
      const preservedAdmin = principal.storedModuleAdmin;
      const preservedOrg = principal.preexistingOrganizationId;
      const preservedFiles = principal.businessFilesPresent;
      principal.linkedNuserId = event.nuser_id;
      const linked = ensureState(event.nuser_id);
      linked.localSubjectId = principal.localSubjectId;
      linked.identityVersion = event.identity_version;
      linked.businessFilesPresent = preservedFiles;
      principal.storedBusinessRole = preservedRole;
      principal.storedModuleAccess = preservedAccess;
      principal.storedModuleAdmin = preservedAdmin;
      principal.preexistingOrganizationId = preservedOrg;
      return buildResponse({
        result: "APPLIED",
        reason: "LINK_APPLIED",
        event,
        effects: effectsFrom(event.nuser_id, { business_role: "UNCHANGED" }),
      });
    }
    if (event.event_type === "identity.suspended" || event.event_type === "identity.revoked") {
      const next = ensureState(event.nuser_id);
      const closed = next.sessionActive;
      if (closed) {
        next.sessionActive = false;
        next.sessionCloseCount += 1;
      }
      next.securityBlock = event.event_type === "identity.revoked" ? "REVOKED" : "SUSPENDED";
      next.latch = event.event_type === "identity.revoked" ? "REVOKED_TERMINAL" : "RESTORE_REQUIRED";
      next.identityVersion = event.identity_version;
      const reason =
        event.event_type === "identity.revoked"
          ? "REVOCATION_APPLIED"
          : tenantOf(event) === "MISMATCH"
            ? "TENANT_UNVERIFIED_RESTRICTION_APPLIED"
            : "SUSPENSION_APPLIED";
      return buildResponse({ result: "APPLIED", reason, event, effects: effectsFrom(event.nuser_id, { sessions_closed: closed }) });
    }
    if (!state || state.securityBlock !== "SUSPENDED") {
      return buildResponse({
        result: "STALE_EVENT_DENIED",
        reason: state ? "SECURITY_BLOCK_HOLDS" : "IDENTITY_UNKNOWN",
        event,
        effects: state ? effectsFrom(event.nuser_id) : undefined,
      });
    }
    state.securityBlock = "NONE";
    state.latch = "RESTORE_REQUIRED";
    state.identityVersion = event.identity_version;
    state.sessionActive = false;
    return buildResponse({
      result: "APPLIED",
      reason: "REACTIVATION_BLOCK_LIFTED",
      event,
      effects: effectsFrom(event.nuser_id, { sessions_closed: false, security_block: "NONE" }),
    });
  }

  return {
    decisionCount: () => decisions,
    identityCount: () => identities.size,
    setAvailable(next) {
      available = next;
    },
    snapshot: snapshotOf,
    readLocalPrincipal(localSubjectId) {
      const principal = principals.get(localSubjectId);
      return principal ? { ...principal } : null;
    },
    seedLocalPrincipal(seed) {
      if (seed.localSubjectId.includes("@") || seed.storedBusinessRole.includes("@")) throw new Error("SYNTHETIC_SEED_REJECTED");
      const principal: LocalPrincipal = {
        localSubjectId: seed.localSubjectId,
        linkedNuserId: seed.linkedNuserId ?? null,
        storedBusinessRole: seed.storedBusinessRole,
        storedModuleAccess: seed.storedModuleAccess,
        storedModuleAdmin: seed.storedModuleAdmin,
        preexistingOrganizationId: seed.preexistingOrganizationId,
        businessFilesPresent: seed.businessFilesPresent ?? false,
      };
      principals.set(principal.localSubjectId, principal);
      if (!principal.linkedNuserId) return;
      identities.set(principal.linkedNuserId, {
        nuserId: principal.linkedNuserId,
        localSubjectId: principal.localSubjectId,
        identityVersion: 1,
        securityBlock: "NONE",
        latch: "OPEN",
        sessionActive: seed.sessionActive ?? false,
        sessionCloseCount: 0,
        invitationSent: false,
        createdByContract: false,
        businessFilesPresent: principal.businessFilesPresent,
        contractGrantedAccess: false,
      });
    },
    ingest(token, nowMs) {
      const auth = authenticate(token, input.keys, input.issuer, nowMs);
      if (!auth.ok) {
        const response = buildResponse({ result: auth.result, reason: auth.reason, event: auth.event });
        if (auth.event && auth.payloadHash) {
          const stored = byEventId.get(auth.event.event_id);
          if (stored && stored.hash === auth.payloadHash && stored.jti === auth.event.jti) return stored.response;
          return remember(auth.event, auth.payloadHash, response);
        }
        return logOnly(response);
      }
      const event = auth.event;
      const existing = byEventId.get(event.event_id);
      if (existing) {
        if (existing.hash === auth.payloadHash && existing.jti === event.jti) {
          if (!retained(existing, nowMs)) {
            return logOnly(buildResponse({ result: "STALE_EVENT_DENIED", reason: "EVENT_EXPIRED", event }));
          }
          if (SUCCESS_RESULTS.has(existing.response.result)) {
            return logOnly(
              buildResponse({
                result: "ALREADY_APPLIED",
                reason: "DUPLICATE_DELIVERY",
                event,
                prior_result: existing.response.result,
                effects: existing.response.effects,
              }),
            );
          }
          return existing.response;
        }
        return logOnly(buildResponse({ result: "STALE_EVENT_DENIED", reason: "EVENT_ID_CONFLICT", event, effects: effectsFrom(event.nuser_id) }));
      }
      const seenJti = byJti.get(event.jti);
      if (seenJti) {
        return remember(
          event,
          auth.payloadHash,
          buildResponse({ result: "STALE_EVENT_DENIED", reason: "JTI_REPLAYED", event, effects: effectsFrom(event.nuser_id) }),
        );
      }
      if (event.audience !== HORORA_AUDIENCE) {
        return remember(event, auth.payloadHash, buildResponse({ result: "MODULE_DENIED", reason: "AUDIENCE_MISMATCH", event }));
      }
      if (Date.parse(event.expires_at) + CLOCK_SKEW_SECONDS * 1000 < nowMs) {
        return remember(event, auth.payloadHash, buildResponse({ result: "STALE_EVENT_DENIED", reason: "EVENT_EXPIRED", event }));
      }
      if (!available) return logOnly(buildResponse({ result: "RETRYABLE_FAILURE", reason: "MODULE_UNAVAILABLE", event }));
      const tenant = tenantOf(event);
      const restrictive = event.event_type === "identity.suspended" || event.event_type === "identity.revoked";
      if (!restrictive && tenant !== "OK") {
        return remember(
          event,
          auth.payloadHash,
          buildResponse({
            result: "TENANT_DENIED",
            reason: tenant === "MISSING" ? "TENANT_CONTEXT_REQUIRED" : "TENANT_MISMATCH",
            event,
          }),
        );
      }
      const state = identities.get(event.nuser_id) ?? null;
      const previousVersion = state?.identityVersion ?? null;
      const last = state?.identityVersion ?? 0;
      if (state && event.identity_version < last) {
        return remember(event, auth.payloadHash, buildResponse({ result: "STALE_EVENT_DENIED", reason: "VERSION_STALE", event, effects: effectsFrom(event.nuser_id) }));
      }
      if (state && event.identity_version === last) {
        return remember(event, auth.payloadHash, buildResponse({ result: "STALE_EVENT_DENIED", reason: "VERSION_CONFLICT", event, effects: effectsFrom(event.nuser_id) }));
      }
      const versionGap = state != null && event.identity_version !== last + 1;
      const response = apply(event, versionGap);
      const advances = response.result === "PROVISIONED_ZERO_ACCESS" || response.result === "APPLIED" || response.result === "ALREADY_LINKED";
      if (!advances && previousVersion != null) {
        const unchanged = identities.get(event.nuser_id);
        if (unchanged) unchanged.identityVersion = previousVersion;
      }
      return remember(event, auth.payloadHash, response);
    },
  };
}

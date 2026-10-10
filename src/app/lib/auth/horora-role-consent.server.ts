/**
 * HORORA-owned role catalog and assignment consent.
 * Administrative calls require a verified TAGORA_ROLE_CONSENT_V1 token.
 * A user handoff is refused. Actor, target, and organization come only
 * from that token. Browser substitutes are refused.
 * The session role stays on organization_memberships and is not decided here.
 */

import { selectActiveMembershipRow } from "@/app/lib/saas/organization-membership.shared";
import type { MembershipRow } from "@/app/lib/saas/organization-membership.shared";
import type { NexusMappingLookups } from "@/app/lib/auth/nexus-identity-mapping.server";
import type { HororaRoleConsentClaims } from "@/app/lib/auth/horora-role-consent-token.server";
import {
  HORORA_ROLE_ASSIGNMENT_AUDIENCE,
  HORORA_ROLE_CATALOG_AUDIENCE,
} from "@/app/lib/auth/horora-role-consent-token.server";
import { NEXUS_TECHNICAL_MODULE_KEY } from "@/app/lib/auth/nexus-handoff-config";

export const HORORA_ROLE_CONTRACT_VERSION = "1" as const;
export const HORORA_ROLE_CATALOG_VERSION = "horora-role-catalog-v1" as const;
export const HORORA_ROLE_MODEL = "REQUIRED_SINGLE" as const;
export const HORORA_ASSIGNABLE_ROLE_KEYS = ["employe", "direction"] as const;
export type HororaAssignableRoleKey = (typeof HORORA_ASSIGNABLE_ROLE_KEYS)[number];

export const HORORA_ROLE_ACKNOWLEDGEMENT_TABLE =
  "horora_nexus_role_acknowledgements" as const;

export type HororaRoleCatalog = {
  moduleKey: typeof NEXUS_TECHNICAL_MODULE_KEY;
  contractVersion: typeof HORORA_ROLE_CONTRACT_VERSION;
  catalogVersion: typeof HORORA_ROLE_CATALOG_VERSION;
  roleModel: typeof HORORA_ROLE_MODEL;
  roles: ReadonlyArray<{
    roleKey: HororaAssignableRoleKey;
    displayLabel: string;
    active: true;
    assignable: true;
  }>;
};

export type HororaRoleAssignmentOperation = "ASSIGN" | "CHANGE" | "REVOKE";

export type HororaRoleAssignmentRequest = {
  moduleKey: string;
  userModuleAccessId: string;
  moduleRoleAssignmentId: string;
  roleKey: string;
  assignmentVersion: number;
  catalogVersion: string;
  operation: HororaRoleAssignmentOperation;
  previousRoleKey: string | null;
};

export type HororaRoleAcknowledgement = {
  id: string;
  operationId: string;
  moduleRoleAssignmentId: string;
  userModuleAccessId: string;
  roleKey: HororaAssignableRoleKey;
  membershipId: string;
  adminUserId: string;
  nexusActorId: string;
  nexusOrganizationId: string;
  nexusTenantId: string;
  organizationId: string;
  environment: "local" | "test" | "staging";
  operation: "ASSIGN" | "CHANGE";
  catalogVersion: typeof HORORA_ROLE_CATALOG_VERSION;
  assignmentVersion: number;
  acknowledgedAt: string;
};

export type HororaRoleAcknowledgementStore = {
  findByOperationId(operationId: string): Promise<HororaRoleAcknowledgement | null>;
  findByAssignmentId(
    moduleRoleAssignmentId: string
  ): Promise<HororaRoleAcknowledgement | null>;
  insert(
    row: HororaRoleAcknowledgement
  ): Promise<{ duplicate: boolean }>;
};

export type HororaRoleConsentDenyReason =
  | "missing_token"
  | "handoff_refused"
  | "forbidden_client_identity"
  | "invalid_request"
  | "unknown_role"
  | "stale_catalog"
  | "operation_refused"
  | "mapping_absent"
  | "mapping_ambiguous"
  | "auth_user_missing"
  | "organization_mapping_absent"
  | "organization_mapping_ambiguous"
  | "organization_missing"
  | "organization_inactive"
  | "tenant_mapping_absent"
  | "membership_missing"
  | "membership_inactive"
  | "membership_ambiguous"
  | "cross_tenant"
  | "role_mismatch"
  | "ack_conflict"
  | "acknowledgement_unavailable"
  | "mapping_unavailable";

export type HororaRoleConsentVerifier = (
  token: string | null | undefined
) => Promise<
  | { readonly ok: true; readonly claims: HororaRoleConsentClaims }
  | { readonly ok: false; readonly reason: string }
>;

export type HororaRoleConsentHttpResult = {
  status: number;
  body:
    | HororaRoleCatalog
    | { ok: false; reason: string }
    | {
        ok: true;
        status: "ACCEPTED";
        moduleAcknowledgementId: string;
        timestamp: string;
      }
    | { ok: false; reasonCode: "MODULE_REFUSED" };
};

export function hororaRoleCatalog(): HororaRoleCatalog {
  return {
    moduleKey: NEXUS_TECHNICAL_MODULE_KEY,
    contractVersion: HORORA_ROLE_CONTRACT_VERSION,
    catalogVersion: HORORA_ROLE_CATALOG_VERSION,
    roleModel: HORORA_ROLE_MODEL,
    roles: [
      {
        roleKey: "employe",
        displayLabel: "Employé",
        active: true,
        assignable: true,
      },
      {
        roleKey: "direction",
        displayLabel: "Direction",
        active: true,
        assignable: true,
      },
    ],
  };
}

export function isHororaAssignableRoleKey(
  roleKey: string
): roleKey is HororaAssignableRoleKey {
  return (HORORA_ASSIGNABLE_ROLE_KEYS as readonly string[]).includes(roleKey);
}

export function createMemoryHororaRoleAcknowledgementStore(): HororaRoleAcknowledgementStore & {
  rows(): readonly HororaRoleAcknowledgement[];
} {
  const rows: HororaRoleAcknowledgement[] = [];
  return {
    rows() {
      return rows;
    },
    async findByOperationId(operationId) {
      return rows.find((row) => row.operationId === operationId) ?? null;
    },
    async findByAssignmentId(moduleRoleAssignmentId) {
      return (
        rows.find((row) => row.moduleRoleAssignmentId === moduleRoleAssignmentId) ??
        null
      );
    },
    async insert(row) {
      if (
        rows.some(
          (existing) =>
            existing.moduleRoleAssignmentId === row.moduleRoleAssignmentId ||
            existing.operationId === row.operationId
        )
      ) {
        return { duplicate: true };
      }
      if (rows.some((existing) => existing.id === row.id)) {
        return { duplicate: true };
      }
      rows.push(row);
      return { duplicate: false };
    },
  };
}

export async function handleHororaRoleCatalogGet(input: {
  token: string | null;
  verify: HororaRoleConsentVerifier;
}): Promise<HororaRoleConsentHttpResult> {
  const verified = await input.verify(input.token);
  if (!verified.ok) {
    return { status: 401, body: { ok: false, reason: verified.reason } };
  }
  if (
    verified.claims.audience !== HORORA_ROLE_CATALOG_AUDIENCE ||
    verified.claims.moduleKey !== NEXUS_TECHNICAL_MODULE_KEY ||
    verified.claims.assignment
  ) {
    return { status: 401, body: { ok: false, reason: "invalid_audience" } };
  }
  return { status: 200, body: hororaRoleCatalog() };
}

export async function handleHororaRoleAssignmentPost(input: {
  token: string | null;
  body: unknown;
  verify: HororaRoleConsentVerifier;
  lookups: NexusMappingLookups;
  store: HororaRoleAcknowledgementStore;
  now?: () => Date;
  createId?: () => string;
}): Promise<HororaRoleConsentHttpResult & { reason?: HororaRoleConsentDenyReason }> {
  const verified = await input.verify(input.token);
  if (!verified.ok) {
    return {
      status: 401,
      reason: verified.reason === "missing_token" ? "missing_token" : "handoff_refused",
      body: { ok: false, reason: verified.reason },
    };
  }
  if (
    verified.claims.audience !== HORORA_ROLE_ASSIGNMENT_AUDIENCE ||
    !verified.claims.assignment
  ) {
    return { status: 401, body: { ok: false, reason: "invalid_audience" } };
  }

  if (input.body != null && !isPlainObject(input.body)) {
    return refused("invalid_request");
  }
  if (isPlainObject(input.body) && browserSuppliedFields(input.body)) {
    return refused("forbidden_client_identity");
  }

  let decision: Awaited<ReturnType<typeof decideHororaRoleAssignment>>;
  try {
    decision = await decideHororaRoleAssignment({
      claims: verified.claims,
      lookups: input.lookups,
      store: input.store,
      now: input.now,
      createId: input.createId,
    });
  } catch {
    return refused("mapping_unavailable");
  }

  if (!decision.ok) return refused(decision.reason);
  return {
    status: 200,
    body: {
      ok: true,
      status: "ACCEPTED",
      moduleAcknowledgementId: decision.acknowledgement.id,
      timestamp: decision.acknowledgement.acknowledgedAt,
    },
  };
}

export async function decideHororaRoleAssignment(input: {
  claims: HororaRoleConsentClaims;
  lookups: NexusMappingLookups;
  store: HororaRoleAcknowledgementStore;
  now?: () => Date;
  createId?: () => string;
}): Promise<
  | { ok: true; acknowledgement: HororaRoleAcknowledgement }
  | { ok: false; reason: HororaRoleConsentDenyReason }
> {
  const request = input.claims.assignment;
  if (
    input.claims.audience !== HORORA_ROLE_ASSIGNMENT_AUDIENCE ||
    input.claims.moduleKey !== NEXUS_TECHNICAL_MODULE_KEY ||
    !request ||
    request.moduleKey !== NEXUS_TECHNICAL_MODULE_KEY
  ) {
    return { ok: false, reason: "handoff_refused" };
  }
  if (!isHororaAssignableRoleKey(request.roleKey)) {
    return { ok: false, reason: "unknown_role" };
  }
  if (request.catalogVersion !== HORORA_ROLE_CATALOG_VERSION) {
    return { ok: false, reason: "stale_catalog" };
  }
  if (!assignmentOperationAgrees(request)) {
    return { ok: false, reason: "operation_refused" };
  }

  const membership = await readActiveMappedMembership({
    nexusActorId: input.claims.targetUserId,
    nexusOrganizationId: input.claims.organizationId,
    nexusTenantId: input.claims.tenantId,
    lookups: input.lookups,
  });
  if (!membership.ok) return membership;
  if (membership.row.role !== request.roleKey) {
    return { ok: false, reason: "role_mismatch" };
  }

  return rememberAcknowledgement({
    claims: input.claims,
    request,
    roleKey: request.roleKey,
    membershipId: membership.row.id,
    organizationId: membership.row.organization_id,
    nexusTenantId: membership.nexusTenantId,
    store: input.store,
    now: input.now ?? (() => new Date()),
    createId: input.createId ?? (() => `ack_${crypto.randomUUID()}`),
  });
}

function assignmentOperationAgrees(request: HororaRoleAssignmentRequest): boolean {
  if (request.operation === "REVOKE") return false;
  if (request.operation === "ASSIGN") return request.previousRoleKey == null;
  return (
    request.previousRoleKey != null &&
    request.previousRoleKey.length > 0 &&
    request.previousRoleKey !== request.roleKey
  );
}

function matchedOpaqueTenant(
  tokenTenantId: string,
  mappedTenantId: string | null
):
  | { ok: true; tenantId: string }
  | { ok: false; reason: "tenant_mapping_absent" | "cross_tenant" } {
  if (typeof tokenTenantId !== "string" || tokenTenantId.trim().length === 0) {
    return { ok: false, reason: "tenant_mapping_absent" };
  }
  if (typeof mappedTenantId !== "string" || mappedTenantId.trim().length === 0) {
    return { ok: false, reason: "tenant_mapping_absent" };
  }
  if (mappedTenantId !== tokenTenantId) {
    return { ok: false, reason: "cross_tenant" };
  }
  return { ok: true, tenantId: tokenTenantId };
}

async function readActiveMappedMembership(input: {
  nexusActorId: string;
  nexusOrganizationId: string;
  nexusTenantId: string;
  lookups: NexusMappingLookups;
}): Promise<
  | { ok: true; row: MembershipRow; nexusTenantId: string }
  | { ok: false; reason: HororaRoleConsentDenyReason }
> {
  const actorId = input.nexusActorId.trim();
  const nexusOrganizationId = input.nexusOrganizationId.trim();
  if (!actorId || !nexusOrganizationId) {
    return { ok: false, reason: "mapping_absent" };
  }

  const identityRows = await input.lookups.findIdentityMaps(actorId);
  if (identityRows.length === 0) return { ok: false, reason: "mapping_absent" };
  if (identityRows.length > 1) return { ok: false, reason: "mapping_ambiguous" };
  const identity = identityRows[0];
  if (!identity || identity.nexus_actor_id !== actorId || !identity.auth_user_id.trim()) {
    return { ok: false, reason: "mapping_absent" };
  }

  const authExists = await input.lookups.authUserExists(identity.auth_user_id);
  if (!authExists) return { ok: false, reason: "auth_user_missing" };

  const organizationMaps = await input.lookups.findOrganizationMaps(nexusOrganizationId);
  if (organizationMaps.length === 0) {
    return { ok: false, reason: "organization_mapping_absent" };
  }
  if (organizationMaps.length > 1) {
    return { ok: false, reason: "organization_mapping_ambiguous" };
  }
  const organizationMap = organizationMaps[0];
  if (!organizationMap || organizationMap.nexus_organization_id !== nexusOrganizationId) {
    return { ok: false, reason: "organization_mapping_absent" };
  }
  if (organizationMap.status !== "active") {
    return { ok: false, reason: "organization_inactive" };
  }
  const tenant = matchedOpaqueTenant(input.nexusTenantId, organizationMap.nexus_tenant_id);
  if (!tenant.ok) return tenant;

  const organization = await input.lookups.findOrganization(organizationMap.organization_id);
  if (!organization) return { ok: false, reason: "organization_missing" };
  if (organization.deleted_at || organization.status !== "active") {
    return { ok: false, reason: "organization_inactive" };
  }

  const memberships = await input.lookups.findMembershipsForUser(identity.auth_user_id);
  const inOrg = memberships.filter((row) => row.organization_id === organization.id);
  const elsewhereActive = memberships.filter(
    (row) => row.organization_id !== organization.id && row.status === "active"
  );
  const selected = selectActiveMembershipRow(inOrg, "strict");
  if (selected.kind === "ambiguous") return { ok: false, reason: "membership_ambiguous" };
  if (selected.kind === "inactive") return { ok: false, reason: "membership_inactive" };
  if (selected.kind === "absent") {
    return {
      ok: false,
      reason: elsewhereActive.length > 0 ? "cross_tenant" : "membership_missing",
    };
  }
  if (selected.row.organization_id !== organization.id || selected.row.status !== "active") {
    return { ok: false, reason: "membership_inactive" };
  }
  return { ok: true, row: selected.row, nexusTenantId: tenant.tenantId };
}

async function rememberAcknowledgement(input: {
  claims: HororaRoleConsentClaims;
  request: HororaRoleAssignmentRequest;
  roleKey: HororaAssignableRoleKey;
  membershipId: string;
  organizationId: string;
  nexusTenantId: string;
  store: HororaRoleAcknowledgementStore;
  now: () => Date;
  createId: () => string;
}): Promise<
  | { ok: true; acknowledgement: HororaRoleAcknowledgement }
  | { ok: false; reason: HororaRoleConsentDenyReason }
> {
  const byOperation = await input.store.findByOperationId(input.claims.operationId);
  if (byOperation) {
    return sameAcknowledgement(byOperation, input)
      ? { ok: true, acknowledgement: byOperation }
      : { ok: false, reason: "ack_conflict" };
  }
  const byAssignment = await input.store.findByAssignmentId(
    input.request.moduleRoleAssignmentId
  );
  if (byAssignment) {
    return sameAcknowledgement(byAssignment, input)
      ? { ok: true, acknowledgement: byAssignment }
      : { ok: false, reason: "ack_conflict" };
  }

  const acknowledgedAt = input.now().toISOString();
  if (!Number.isFinite(Date.parse(acknowledgedAt))) {
    return { ok: false, reason: "acknowledgement_unavailable" };
  }
  const operation = input.request.operation;
  if (operation !== "ASSIGN" && operation !== "CHANGE") {
    return { ok: false, reason: "operation_refused" };
  }
  const created: HororaRoleAcknowledgement = {
    id: input.createId(),
    operationId: input.claims.operationId,
    moduleRoleAssignmentId: input.request.moduleRoleAssignmentId,
    userModuleAccessId: input.request.userModuleAccessId,
    roleKey: input.roleKey,
    membershipId: input.membershipId,
    adminUserId: input.claims.adminUserId,
    nexusActorId: input.claims.targetUserId,
    nexusOrganizationId: input.claims.organizationId,
    nexusTenantId: input.nexusTenantId,
    organizationId: input.organizationId,
    environment: input.claims.environment,
    operation,
    catalogVersion: HORORA_ROLE_CATALOG_VERSION,
    assignmentVersion: input.request.assignmentVersion,
    acknowledgedAt,
  };
  if (!created.id.trim() || !created.operationId.trim()) {
    return { ok: false, reason: "acknowledgement_unavailable" };
  }

  let inserted: { duplicate: boolean };
  try {
    inserted = await input.store.insert(created);
  } catch {
    return { ok: false, reason: "acknowledgement_unavailable" };
  }
  if (!inserted.duplicate) return { ok: true, acknowledgement: created };

  const raced =
    (await input.store.findByOperationId(input.claims.operationId)) ??
    (await input.store.findByAssignmentId(input.request.moduleRoleAssignmentId));
  if (raced && sameAcknowledgement(raced, input)) {
    return { ok: true, acknowledgement: raced };
  }
  return { ok: false, reason: "ack_conflict" };
}

function sameAcknowledgement(
  existing: HororaRoleAcknowledgement,
  input: {
    claims: HororaRoleConsentClaims;
    request: HororaRoleAssignmentRequest;
    roleKey: HororaAssignableRoleKey;
    membershipId: string;
    organizationId: string;
    nexusTenantId: string;
  }
): boolean {
  return (
    existing.operationId === input.claims.operationId &&
    existing.moduleRoleAssignmentId === input.request.moduleRoleAssignmentId &&
    existing.userModuleAccessId === input.request.userModuleAccessId &&
    existing.roleKey === input.roleKey &&
    existing.membershipId === input.membershipId &&
    existing.adminUserId === input.claims.adminUserId &&
    existing.nexusActorId === input.claims.targetUserId &&
    existing.nexusOrganizationId === input.claims.organizationId &&
    existing.nexusTenantId === input.nexusTenantId &&
    existing.organizationId === input.organizationId &&
    existing.environment === input.claims.environment &&
    existing.operation === input.request.operation &&
    existing.catalogVersion === HORORA_ROLE_CATALOG_VERSION &&
    existing.assignmentVersion === input.request.assignmentVersion
  );
}

function refused(
  reason: HororaRoleConsentDenyReason
): HororaRoleConsentHttpResult & { reason: HororaRoleConsentDenyReason } {
  return {
    status: 403,
    reason,
    body: { ok: false, reasonCode: "MODULE_REFUSED" },
  };
}

function browserSuppliedFields(body: Record<string, unknown>): boolean {
  return Object.keys(body).some((key) => key !== "handoff");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

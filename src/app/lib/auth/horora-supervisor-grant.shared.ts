/**
 * Local HORORA supervisor grant. It is not a portal role and not a membership.
 * An employe carries it explicitly. It applies only inside one organization,
 * one company and one effectifs department. A job site is not a scope.
 */

import {
  hororaPortalRoleAllows,
  type HororaAccessCapability,
  type HororaDirectionTimeCapability,
} from "@/app/lib/auth/horora-role-model.shared";
import type { AppRole } from "@/app/lib/auth/roles";

export const HORORA_SUPERVISOR_GRANT_KIND = "horora_supervisor_grant" as const;

export const HORORA_SUPERVISOR_GRANT_CAPABILITIES = [
  "view_team",
  "approve_anomalies",
  "correct_time",
] as const satisfies readonly HororaDirectionTimeCapability[];

export type HororaSupervisorGrantCapability =
  (typeof HORORA_SUPERVISOR_GRANT_CAPABILITIES)[number];

/** Closed even when the department scope matches. */
export const HORORA_SUPERVISOR_GRANT_CLOSED_CAPABILITIES = [
  "export_payroll",
  "read_payroll",
  "manage_payroll",
  "manage_employees",
  "manage_configuration",
  "admin_finance",
] as const satisfies readonly HororaAccessCapability[];

export type HororaSupervisorGrant = {
  readonly kind: typeof HORORA_SUPERVISOR_GRANT_KIND;
  readonly portalRole: "employe";
  readonly organizationId: string;
  readonly organizationCompanyId: string;
  readonly effectifsDepartmentKey: string;
};

export type HororaSupervisorGrantInput = {
  portalRole?: string | null;
  organizationId?: string | null;
  organizationCompanyId?: string | null;
  effectifsDepartmentKey?: string | null;
  businessFunctions?: readonly string[] | null;
};

export type HororaSupervisorTargetScope = {
  organizationId?: string | null;
  organizationCompanyId?: string | null;
  effectifsDepartmentKey?: string | null;
};

export type HororaSupervisorGrantDecision = {
  allowed: boolean;
  reason:
    | "scope_match"
    | "grant_absent"
    | "grant_inactive"
    | "grant_department_absent"
    | "grant_organization_absent"
    | "grant_company_absent"
    | "target_organization_absent"
    | "target_company_absent"
    | "target_department_absent"
    | "target_organization_mismatch"
    | "target_company_mismatch"
    | "target_department_mismatch"
    | "capability_denied"
    | "table_absent"
    | "membership_absent"
    | "membership_inactive"
    | "auth_user_mismatch"
    | "lookup_failed";
};

export type HororaSupervisorGrantRow = {
  authUserId?: string | null;
  membershipId?: string | null;
  organizationId?: string | null;
  organizationCompanyId?: string | null;
  effectifsDepartmentKey?: string | null;
  capabilities?: readonly string[] | null;
  status?: string | null;
};

export type HororaSupervisorGrantLookup =
  | { ok: false; reason: "table_absent" | "lookup_failed" }
  | { ok: true; rows: readonly HororaSupervisorGrantRow[] };

export type HororaSupervisorMembershipContext = {
  authUserId: string;
  membershipId?: string | null;
  role?: string | null;
  status?: string | null;
} | null;

export type HororaScopedTimeAccess = {
  allowed: boolean;
  source: "portal_role" | "supervisor_grant" | "denied";
  reason: string;
};

function requiredText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isHororaSupervisorGrantCapability(
  capability: HororaAccessCapability
): capability is HororaSupervisorGrantCapability {
  return (HORORA_SUPERVISOR_GRANT_CAPABILITIES as readonly string[]).includes(
    capability
  );
}

/** A business function never creates this grant. */
export function businessFunctionActivatesSupervisorGrant(
  _fonction: string | null | undefined
): false {
  return false;
}

export function createHororaSupervisorGrant(
  input: HororaSupervisorGrantInput | null | undefined
): HororaSupervisorGrant | null {
  if (!input || input.portalRole !== "employe") return null;
  void input.businessFunctions;
  const organizationId = requiredText(input.organizationId);
  const organizationCompanyId = requiredText(input.organizationCompanyId);
  const effectifsDepartmentKey = requiredText(input.effectifsDepartmentKey);
  if (!organizationId || !organizationCompanyId || !effectifsDepartmentKey) {
    return null;
  }
  return {
    kind: HORORA_SUPERVISOR_GRANT_KIND,
    portalRole: "employe",
    organizationId,
    organizationCompanyId,
    effectifsDepartmentKey,
  };
}

function deny(
  reason: HororaSupervisorGrantDecision["reason"]
): HororaSupervisorGrantDecision {
  return { allowed: false, reason };
}

export function evaluateHororaSupervisorGrant(input: {
  grant: HororaSupervisorGrantInput | HororaSupervisorGrant | null | undefined;
  capability: HororaAccessCapability;
  target?: HororaSupervisorTargetScope | null;
}): HororaSupervisorGrantDecision {
  if (!isHororaSupervisorGrantCapability(input.capability)) {
    return deny("capability_denied");
  }

  const organizationId = requiredText(input.grant?.organizationId);
  const organizationCompanyId = requiredText(input.grant?.organizationCompanyId);
  const effectifsDepartmentKey = requiredText(input.grant?.effectifsDepartmentKey);
  if (!input.grant || input.grant.portalRole !== "employe") {
    return deny("grant_absent");
  }
  if (!organizationId) return deny("grant_organization_absent");
  if (!organizationCompanyId) return deny("grant_company_absent");
  if (!effectifsDepartmentKey) return deny("grant_department_absent");

  const targetOrganizationId = requiredText(input.target?.organizationId);
  const targetCompanyId = requiredText(input.target?.organizationCompanyId);
  const targetDepartmentKey = requiredText(input.target?.effectifsDepartmentKey);
  if (!targetOrganizationId) return deny("target_organization_absent");
  if (!targetCompanyId) return deny("target_company_absent");
  if (!targetDepartmentKey) return deny("target_department_absent");
  if (targetOrganizationId !== organizationId) return deny("target_organization_mismatch");
  if (targetCompanyId !== organizationCompanyId) return deny("target_company_mismatch");
  if (targetDepartmentKey !== effectifsDepartmentKey) {
    return deny("target_department_mismatch");
  }

  return { allowed: true, reason: "scope_match" };
}

export function isHororaSupervisorGrantTableAbsent(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code =
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  const message =
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  const details =
    typeof (error as { details?: unknown }).details === "string"
      ? (error as { details: string }).details
      : "";
  const text = `${message} ${details}`.toLowerCase();
  if (code === "42P01" || code === "PGRST205") return true;
  return (
    text.includes("horora_supervisor_grants") &&
    (text.includes("does not exist") ||
      text.includes("schema cache") ||
      text.includes("could not find"))
  );
}

function capabilityListed(
  capabilities: readonly string[] | null | undefined,
  capability: string
): boolean {
  return (capabilities ?? []).some(
    (item) => item.trim().toLowerCase() === capability
  );
}

/**
 * Stored grant read. Missing table, missing row, inactive grant, inactive
 * employe membership, another auth user, and a different scope all deny.
 * Direction and admin do not use this function.
 */
export function decideStoredHororaSupervisorAccess(input: {
  callerAuthUserId: string;
  membership: HororaSupervisorMembershipContext;
  lookup: HororaSupervisorGrantLookup;
  capability: HororaAccessCapability;
  target?: HororaSupervisorTargetScope | null;
}): HororaScopedTimeAccess {
  const denied = (reason: HororaSupervisorGrantDecision["reason"]): HororaScopedTimeAccess => ({
    allowed: false,
    source: "denied",
    reason,
  });

  if (!isHororaSupervisorGrantCapability(input.capability)) {
    return denied("capability_denied");
  }

  const callerAuthUserId = requiredText(input.callerAuthUserId);
  if (!input.membership || input.membership.role !== "employe") {
    return denied("membership_absent");
  }
  if (input.membership.status !== "active") {
    return denied("membership_inactive");
  }
  if (!callerAuthUserId || requiredText(input.membership.authUserId) !== callerAuthUserId) {
    return denied("auth_user_mismatch");
  }
  if (!input.lookup.ok) {
    return denied(input.lookup.reason);
  }

  const ownRows = input.lookup.rows.filter(
    (row) => requiredText(row.authUserId) === callerAuthUserId
  );
  if (ownRows.length !== input.lookup.rows.length) {
    return denied("auth_user_mismatch");
  }
  if (ownRows.length === 0) return denied("grant_absent");

  const activeRows = ownRows.filter((row) => requiredText(row.status) === "active");
  if (activeRows.length === 0) return denied("grant_inactive");

  const targetOrganizationId = requiredText(input.target?.organizationId);
  const targetCompanyId = requiredText(input.target?.organizationCompanyId);
  const targetDepartmentKey = requiredText(input.target?.effectifsDepartmentKey);
  const scopedRows = activeRows.filter((row) => {
    return (
      requiredText(row.organizationId) === targetOrganizationId &&
      requiredText(row.organizationCompanyId) === targetCompanyId &&
      requiredText(row.effectifsDepartmentKey) === targetDepartmentKey
    );
  });
  const grantRow = scopedRows[0] ?? activeRows[0];
  if (scopedRows.length === 0) {
    const mismatch = evaluateHororaSupervisorGrant({
      grant: {
        portalRole: "employe",
        organizationId: grantRow.organizationId,
        organizationCompanyId: grantRow.organizationCompanyId,
        effectifsDepartmentKey: grantRow.effectifsDepartmentKey,
      },
      capability: input.capability,
      target: input.target,
    });
    return denied(mismatch.reason);
  }
  if (
    input.membership.membershipId &&
    requiredText(grantRow.membershipId) &&
    requiredText(grantRow.membershipId) !== requiredText(input.membership.membershipId)
  ) {
    return denied("membership_absent");
  }
  if (!capabilityListed(grantRow.capabilities, input.capability)) {
    return denied("capability_denied");
  }

  return { allowed: true, source: "supervisor_grant", reason: "scope_match" };
}

/**
 * Direction and admin keep the portal decision and ignore this grant.
 * An employe is allowed only when the grant matches the target scope.
 */
export function resolveHororaScopedTimeAccess(input: {
  portalRole: AppRole | null | undefined;
  capability: HororaDirectionTimeCapability;
  grant?: HororaSupervisorGrantInput | HororaSupervisorGrant | null;
  target?: HororaSupervisorTargetScope | null;
}): HororaScopedTimeAccess {
  if (hororaPortalRoleAllows(input.portalRole, input.capability)) {
    return { allowed: true, source: "portal_role", reason: "portal_role" };
  }

  const grantDecision = evaluateHororaSupervisorGrant({
    grant: input.grant,
    capability: input.capability,
    target: input.target,
  });
  if (grantDecision.allowed && input.portalRole === "employe") {
    return {
      allowed: true,
      source: "supervisor_grant",
      reason: grantDecision.reason,
    };
  }
  return { allowed: false, source: "denied", reason: grantDecision.reason };
}

/**
 * HTTP scope built on the server. A caller-supplied grant is not an input.
 * Missing organization, company or department stays null and fails closed.
 */
export function hororaSupervisorHttpServerTarget(
  source?: {
    organizationId?: string | null;
    organizationCompanyId?: string | null;
    effectifsDepartmentKey?: string | null;
    grant?: unknown;
  } | null
): HororaSupervisorTargetScope {
  void source?.grant;
  return {
    organizationId: requiredText(source?.organizationId),
    organizationCompanyId: requiredText(source?.organizationCompanyId),
    effectifsDepartmentKey: requiredText(source?.effectifsDepartmentKey),
  };
}

/**
 * Session scope for the HTTP guard. Only organizationId is a server field today.
 * Company, department, and a caller grant are discarded.
 */
export function hororaSupervisorHttpSessionTarget(session?: {
  organizationId?: string | null;
  organizationCompanyId?: string | null;
  effectifsDepartmentKey?: string | null;
  grant?: unknown;
} | null): HororaSupervisorTargetScope {
  void session?.organizationCompanyId;
  void session?.effectifsDepartmentKey;
  void session?.grant;
  return hororaSupervisorHttpServerTarget({
    organizationId: session?.organizationId ?? null,
  });
}

export function isCompleteHororaSupervisorHttpTarget(
  target: HororaSupervisorTargetScope | null | undefined
): boolean {
  const normalized = hororaSupervisorHttpServerTarget(target);
  return Boolean(
    normalized.organizationId &&
      normalized.organizationCompanyId &&
      normalized.effectifsDepartmentKey
  );
}

export function incompleteHororaSupervisorHttpTargetReason(
  target: HororaSupervisorTargetScope | null | undefined
): "target_organization_absent" | "target_company_absent" | "target_department_absent" {
  const normalized = hororaSupervisorHttpServerTarget(target);
  if (!normalized.organizationId) return "target_organization_absent";
  if (!normalized.organizationCompanyId) return "target_company_absent";
  return "target_department_absent";
}

/**
 * Portal roles ignore the grant and the HTTP target.
 * An employe with an incomplete server target is denied before any stored read.
 */
export function decideHororaSupervisorHttpScope(input: {
  portalRole: AppRole | null | undefined;
  capability: HororaAccessCapability;
  target?: HororaSupervisorTargetScope | null;
  grant?: unknown;
  callerAuthUserId?: string | null;
  membership?: HororaSupervisorMembershipContext;
  lookup?: HororaSupervisorGrantLookup | null;
}): HororaScopedTimeAccess {
  void input.grant;
  if (
    (input.portalRole === "direction" || input.portalRole === "admin") &&
    hororaPortalRoleAllows(input.portalRole, input.capability)
  ) {
    return resolveHororaScopedTimeAccess({
      portalRole: input.portalRole,
      capability: input.capability,
      grant: null,
      target: null,
    });
  }
  if (input.portalRole !== "employe") {
    return { allowed: false, source: "denied", reason: "grant_absent" };
  }
  const target = hororaSupervisorHttpServerTarget(input.target);
  if (!isCompleteHororaSupervisorHttpTarget(target)) {
    return {
      allowed: false,
      source: "denied",
      reason: incompleteHororaSupervisorHttpTargetReason(target),
    };
  }
  return decideStoredHororaSupervisorAccess({
    callerAuthUserId: input.callerAuthUserId ?? "",
    membership: input.membership ?? null,
    lookup: input.lookup ?? { ok: true, rows: [] },
    capability: input.capability,
    target,
  });
}

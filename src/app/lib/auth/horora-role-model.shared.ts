/**
 * HORORA access model. Portal roles stay employe | direction | admin.
 * Business functions never grant a portal right. Payroll stays an explicit
 * permission for direction and an implicit grant for admin.
 * Nexus does not carry these decisions.
 */

import type { AppRole } from "@/app/lib/auth/roles";

export const HORORA_PORTAL_ROLES = ["employe", "direction", "admin"] as const;

export type HororaPortalRole = (typeof HORORA_PORTAL_ROLES)[number];

/** Operational labels on chauffeurs.fonctions. They are not portal roles. */
export const HORORA_BUSINESS_FUNCTIONS_WITHOUT_PORTAL_RIGHTS = [
  "technicien",
  "livreur",
] as const;

export type HororaBusinessFunctionWithoutPortalRight =
  (typeof HORORA_BUSINESS_FUNCTIONS_WITHOUT_PORTAL_RIGHTS)[number];

export const HORORA_PUNCH_PERMISSION = "terrain" as const;

export const HORORA_PAYROLL_READ_PERMISSION = "horodateur_payroll_read" as const;
export const HORORA_PAYROLL_MANAGE_PERMISSION = "horodateur_payroll_manage" as const;

export const HORORA_ACCESS_SCOPE_FIELDS = [
  "organization_id",
  "organization_company_id",
  "effectifs_department_key",
] as const;

/** A job site is operational data. It is not an access scope. */
export const HORORA_CHANTIER_IS_ACCESS_SCOPE = false as const;

export const HORORA_ACCESS_CAPABILITIES = [
  "punch_in_out",
  "punch_break_meal",
  "view_own_hours",
  "request_own_correction",
  "view_team",
  "approve_anomalies",
  "correct_time",
  "view_reports",
  "read_payroll",
  "manage_payroll",
  "export_payroll",
  "manage_employees",
  "manage_configuration",
  "admin_finance",
] as const;

export type HororaAccessCapability = (typeof HORORA_ACCESS_CAPABILITIES)[number];

export type HororaEmployeeTimeCapability = Extract<
  HororaAccessCapability,
  "punch_in_out" | "punch_break_meal" | "view_own_hours" | "request_own_correction"
>;

export type HororaDirectionTimeCapability = Extract<
  HororaAccessCapability,
  "view_team" | "approve_anomalies" | "correct_time"
>;

export type HororaPayrollAction = "read" | "manage" | "export";

type CapabilityGrant = "role" | "explicit" | "deny";

const MATRIX: Record<HororaPortalRole, Record<HororaAccessCapability, CapabilityGrant>> = {
  employe: {
    punch_in_out: "role",
    punch_break_meal: "role",
    view_own_hours: "role",
    request_own_correction: "role",
    view_team: "deny",
    approve_anomalies: "deny",
    correct_time: "deny",
    view_reports: "deny",
    read_payroll: "deny",
    manage_payroll: "deny",
    export_payroll: "deny",
    manage_employees: "deny",
    manage_configuration: "deny",
    admin_finance: "deny",
  },
  direction: {
    punch_in_out: "deny",
    punch_break_meal: "deny",
    view_own_hours: "deny",
    request_own_correction: "deny",
    view_team: "role",
    approve_anomalies: "role",
    correct_time: "role",
    view_reports: "role",
    read_payroll: "explicit",
    manage_payroll: "explicit",
    export_payroll: "explicit",
    manage_employees: "explicit",
    manage_configuration: "deny",
    admin_finance: "deny",
  },
  admin: {
    punch_in_out: "deny",
    punch_break_meal: "deny",
    view_own_hours: "deny",
    request_own_correction: "deny",
    view_team: "role",
    approve_anomalies: "role",
    correct_time: "role",
    view_reports: "role",
    read_payroll: "role",
    manage_payroll: "role",
    export_payroll: "role",
    manage_employees: "role",
    manage_configuration: "role",
    admin_finance: "role",
  },
};

export type HororaPayrollMatrixDecision = {
  canRead: boolean;
  canManage: boolean;
  allowed: boolean;
  source: "membership_admin" | "app_metadata" | "denied";
  reason: string;
};

export function isHororaPortalRole(
  value: string | null | undefined
): value is HororaPortalRole {
  return (
    value === "employe" || value === "direction" || value === "admin"
  );
}

export function hororaCapabilityGrant(
  role: AppRole | null | undefined,
  capability: HororaAccessCapability
): CapabilityGrant {
  if (!role || !isHororaPortalRole(role)) return "deny";
  return MATRIX[role][capability];
}

/** Role baseline only. Explicit payroll and module permissions are separate. */
export function hororaPortalRoleAllows(
  role: AppRole | null | undefined,
  capability: HororaAccessCapability
): boolean {
  return hororaCapabilityGrant(role, capability) === "role";
}

/**
 * A business function never changes a portal decision.
 * `businessFunctions` is accepted so callers can show it was ignored.
 */
export function resolveHororaPortalDecision(input: {
  portalRole: AppRole | null | undefined;
  capability: HororaAccessCapability;
  businessFunctions?: readonly string[] | null;
}): boolean {
  void input.businessFunctions;
  return hororaPortalRoleAllows(input.portalRole, input.capability);
}

export function businessFunctionGrantsPortalAccess(
  _fonction: string | null | undefined
): false {
  return false;
}

function permissionListed(
  permissions: readonly string[],
  value: string
): boolean {
  return permissions.some(
    (item) => typeof item === "string" && item.trim().toLowerCase() === value
  );
}

/**
 * Payroll decision for an already resolved portal role.
 * Admin reads and manages without a JWT permission list.
 * Direction needs horodateur_payroll_read or horodateur_payroll_manage.
 * Manage implies read. Export follows read. Employe is always denied.
 */
export function evaluateHororaPayrollCapability(input: {
  portalRole: AppRole;
  explicitPermissions: readonly string[];
  required: HororaPayrollAction;
}): HororaPayrollMatrixDecision {
  if (input.portalRole === "admin") {
    return {
      canRead: true,
      canManage: true,
      allowed: true,
      source: "membership_admin",
      reason: "organization_admin_implicit",
    };
  }

  if (input.portalRole !== "direction") {
    return {
      canRead: false,
      canManage: false,
      allowed: false,
      source: "denied",
      reason: "employee_denied",
    };
  }

  const canManage = permissionListed(
    input.explicitPermissions,
    HORORA_PAYROLL_MANAGE_PERMISSION
  );
  const canRead =
    canManage ||
    permissionListed(input.explicitPermissions, HORORA_PAYROLL_READ_PERMISSION);

  if (!canRead) {
    return {
      canRead: false,
      canManage: false,
      allowed: false,
      source: "denied",
      reason: "payroll_permission_missing",
    };
  }

  const allowed = input.required === "manage" ? canManage : canRead;
  return {
    canRead,
    canManage,
    allowed,
    source: allowed ? "app_metadata" : "denied",
    reason: allowed ? "direction_app_metadata" : "payroll_manage_permission_missing",
  };
}

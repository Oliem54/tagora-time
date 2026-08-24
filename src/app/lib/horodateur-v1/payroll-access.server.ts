import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  HORODATEUR_PAYROLL_MANAGE_PERMISSION,
  HORODATEUR_PAYROLL_READ_PERMISSION,
  getAppMetadataPermissionsOnly,
  normalizePermissionList,
} from "@/app/lib/auth/permissions";
import type { OrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";
import { isOrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";

export type HorodateurPayrollAccessAction = "read" | "manage";

export type HorodateurPayrollAccessDecision = {
  canRead: boolean;
  canManage: boolean;
  allowed: boolean;
  source: "membership_admin" | "app_metadata" | "denied";
  reason: string;
};

const OWNER_ADMIN_ROLES = new Set<OrganizationMembershipRole>([
  "organization_owner",
  "organization_admin",
]);

function readAppMetadataPermissionList(value: unknown) {
  return normalizePermissionList(value);
}

/**
 * Authoritative payroll gate for HORORA V1.
 * Membership H4 is required. Permissions come from app_metadata only.
 * user_metadata is accepted as a parameter solely so callers/tests can prove it is ignored.
 */
export function evaluateHorodateurPayrollAccess(input: {
  membershipRole: string | null | undefined;
  membershipStatus?: string | null;
  appMetadataPermissions: unknown;
  userMetadataPermissions?: unknown;
  required?: HorodateurPayrollAccessAction;
}): HorodateurPayrollAccessDecision {
  void input.userMetadataPermissions;

  const required = input.required ?? "read";
  const status = (input.membershipStatus ?? "active").trim().toLowerCase();

  if (status !== "active") {
    return {
      canRead: false,
      canManage: false,
      allowed: false,
      source: "denied",
      reason: "membership_inactive",
    };
  }

  if (!input.membershipRole || !isOrganizationMembershipRole(input.membershipRole)) {
    return {
      canRead: false,
      canManage: false,
      allowed: false,
      source: "denied",
      reason: "membership_absent",
    };
  }

  if (OWNER_ADMIN_ROLES.has(input.membershipRole)) {
    return {
      canRead: true,
      canManage: true,
      allowed: true,
      source: "membership_admin",
      reason: "organization_admin_implicit",
    };
  }

  if (input.membershipRole === "employe") {
    return {
      canRead: false,
      canManage: false,
      allowed: false,
      source: "denied",
      reason: "employee_denied",
    };
  }

  const appMetadataPermissions = readAppMetadataPermissionList(
    input.appMetadataPermissions
  );
  const canManage = appMetadataPermissions.includes(HORODATEUR_PAYROLL_MANAGE_PERMISSION);
  const canRead =
    canManage || appMetadataPermissions.includes(HORODATEUR_PAYROLL_READ_PERMISSION);

  if (!canRead) {
    return {
      canRead: false,
      canManage: false,
      allowed: false,
      source: "denied",
      reason: "payroll_permission_missing",
    };
  }

  const allowed = required === "manage" ? canManage : canRead;
  return {
    canRead,
    canManage,
    allowed,
    source: allowed ? "app_metadata" : "denied",
    reason: allowed ? "direction_app_metadata" : "payroll_manage_permission_missing",
  };
}

export function evaluateHorodateurPayrollAccessForUser(
  user: User | null | undefined,
  membership: { role: string; status?: string } | null,
  required: HorodateurPayrollAccessAction = "read"
): HorodateurPayrollAccessDecision {
  if (!user || !membership) {
    return evaluateHorodateurPayrollAccess({
      membershipRole: null,
      appMetadataPermissions: [],
      userMetadataPermissions: user?.user_metadata?.permissions,
      required,
    });
  }

  return evaluateHorodateurPayrollAccess({
    membershipRole: membership.role,
    membershipStatus: membership.status ?? "active",
    appMetadataPermissions: getAppMetadataPermissionsOnly(user),
    userMetadataPermissions: user.user_metadata?.permissions,
    required,
  });
}

export function canReadHorodateurPayroll(
  user: User | null | undefined,
  membership: { role: string; status?: string } | null
): boolean {
  return evaluateHorodateurPayrollAccessForUser(user, membership, "read").allowed;
}

export function canManageHorodateurPayroll(
  user: User | null | undefined,
  membership: { role: string; status?: string } | null
): boolean {
  return evaluateHorodateurPayrollAccessForUser(user, membership, "manage").allowed;
}

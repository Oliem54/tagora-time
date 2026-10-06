import "server-only";

import type { User } from "@supabase/supabase-js";
import { evaluateHororaPayrollCapability } from "@/app/lib/auth/horora-role-model.shared";
import { mapOrganizationMembershipRoleToAppRole } from "@/app/lib/auth/organization-role-mapping.shared";
import {
  getAppMetadataPermissionsOnly,
  normalizePermissionList,
} from "@/app/lib/auth/permissions";
import { isOrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";

export type HorodateurPayrollAccessAction = "read" | "manage";

export type HorodateurPayrollAccessDecision = {
  canRead: boolean;
  canManage: boolean;
  allowed: boolean;
  source: "membership_admin" | "app_metadata" | "denied";
  reason: string;
};

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

  const portalRole = mapOrganizationMembershipRoleToAppRole(input.membershipRole);
  if (!portalRole) {
    return {
      canRead: false,
      canManage: false,
      allowed: false,
      source: "denied",
      reason: "membership_absent",
    };
  }

  return evaluateHororaPayrollCapability({
    portalRole,
    explicitPermissions: readAppMetadataPermissionList(input.appMetadataPermissions),
    required,
  });
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

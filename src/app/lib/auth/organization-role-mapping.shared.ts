import type { AppRole } from "@/app/lib/auth/roles";
import type { OrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";
import { isOrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";

/**
 * Maps H4 organization_memberships.role → legacy AppRole used by AuthGate / APIs.
 * organization_owner and organization_admin both map to shell `admin`.
 * Finance remains gated separately via JWT admin (hasAdminFinanceAccess).
 */
export function mapOrganizationMembershipRoleToAppRole(
  role: string | null | undefined
): AppRole | null {
  if (!role || !isOrganizationMembershipRole(role)) {
    return null;
  }

  const membershipRole = role as OrganizationMembershipRole;

  if (
    membershipRole === "organization_owner" ||
    membershipRole === "organization_admin"
  ) {
    return "admin";
  }

  if (membershipRole === "direction") {
    return "direction";
  }

  if (membershipRole === "employe") {
    return "employe";
  }

  return null;
}

/** Area access using H4 hierarchy: owner/admin ≥ direction ≥ employe. */
export function appRoleMatchesArea(areaRole: AppRole, role: AppRole): boolean {
  if (areaRole === "admin") {
    return role === "admin";
  }

  if (areaRole === "direction") {
    return role === "direction" || role === "admin";
  }

  // employe area: employe + direction + admin (owner/admin mapped)
  return role === "employe" || role === "direction" || role === "admin";
}

/**
 * Dual-read display helper retained for diagnostics.
 * Authorization must use membership via resolveOrganizationAuthContextForUser.
 */
export function resolveEffectiveAppRole(input: {
  membershipAppRole: AppRole | null;
  jwtAppRole: AppRole | null;
}): {
  appRole: AppRole | null;
  source: "membership" | "jwt_fallback" | "none";
} {
  if (input.membershipAppRole) {
    return { appRole: input.membershipAppRole, source: "membership" };
  }
  if (input.jwtAppRole) {
    return { appRole: input.jwtAppRole, source: "jwt_fallback" };
  }
  return { appRole: null, source: "none" };
}

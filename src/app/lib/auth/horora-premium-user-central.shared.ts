/**
 * HORORA Premium 2027 User Central reads the RBAC that already exists.
 * It does not define a second role or permission system.
 */

import { mapOrganizationMembershipRoleToAppRole } from "@/app/lib/auth/organization-role-mapping.shared";
import type { AppRole } from "@/app/lib/auth/roles";
import {
  ORGANIZATION_MEMBERSHIP_ROLES,
  type OrganizationMembershipRole,
} from "@/app/lib/saas/tenant-foundation.shared";

/** Canonical domains stored in public.app_permissions. */
export const HORORA_CANONICAL_PERMISSION_DOMAINS = [
  "commissions",
  "documents",
  "dossiers",
  "livraisons",
  "ressources",
  "terrain",
] as const;

export type HororaCanonicalPermissionDomain =
  (typeof HORORA_CANONICAL_PERMISSION_DOMAINS)[number];

export const HORORA_ROLE_AUTHORITY = {
  organization_owner: {
    shellRole: "admin",
    system: true,
    source: "organization_memberships.role",
  },
  organization_admin: {
    shellRole: "admin",
    system: true,
    source: "organization_memberships.role",
  },
  direction: {
    shellRole: "direction",
    system: false,
    source: "organization_memberships.role",
  },
  employe: {
    shellRole: "employe",
    system: false,
    source: "organization_memberships.role",
  },
} as const satisfies Record<
  OrganizationMembershipRole,
  { shellRole: AppRole; system: boolean; source: "organization_memberships.role" }
>;

export type HororaMembershipSnapshot = {
  id: string;
  role: OrganizationMembershipRole;
  status: "active" | "suspended" | "invited";
};

export type HororaPremiumDashboard = {
  activeMemberships: number;
  suspendedMemberships: number;
  invitedMemberships: number;
  pendingInvitations: number | null;
  roleCounts: Record<OrganizationMembershipRole, number>;
  organizationsInScope: 1;
  permissionDomains: readonly HororaCanonicalPermissionDomain[];
  teamStructure: "absent";
  nexusConnection: "read_only";
  writesEnabled: false;
};

export function summarizeHororaMemberships(
  memberships: readonly HororaMembershipSnapshot[],
  pendingInvitations: number | null = null
): HororaPremiumDashboard {
  const roleCounts = {
    organization_owner: 0,
    organization_admin: 0,
    direction: 0,
    employe: 0,
  };
  let activeMemberships = 0;
  let suspendedMemberships = 0;
  let invitedMemberships = 0;
  for (const membership of memberships) {
    if (membership.status === "active") {
      activeMemberships += 1;
      roleCounts[membership.role] += 1;
    } else if (membership.status === "suspended") {
      suspendedMemberships += 1;
    } else {
      invitedMemberships += 1;
    }
  }
  return {
    activeMemberships,
    suspendedMemberships,
    invitedMemberships,
    pendingInvitations,
    roleCounts,
    organizationsInScope: 1,
    permissionDomains: HORORA_CANONICAL_PERMISSION_DOMAINS,
    teamStructure: "absent",
    nexusConnection: "read_only",
    writesEnabled: false,
  };
}

export function shellRoleFromMembership(
  role: OrganizationMembershipRole | null
): AppRole | null {
  return mapOrganizationMembershipRoleToAppRole(role);
}

/** The screen label admin is only the shell of owner or organization_admin. */
export function adminShellIsNotAPermissionGrant(shellRole: AppRole | null): boolean {
  return shellRole === "admin";
}

export function effectivePermissionsFollowJwtMetadata(input: {
  shellRole: AppRole | null;
  jwtPermissions: readonly string[];
}): { recognized: string[]; ignored: string[] } {
  const allowed = new Set<string>(HORORA_CANONICAL_PERMISSION_DOMAINS);
  const recognized: string[] = [];
  const ignored: string[] = [];
  for (const permission of input.jwtPermissions) {
    if (allowed.has(permission)) recognized.push(permission);
    else ignored.push(permission);
  }
  if (input.shellRole === "admin") {
    return { recognized, ignored };
  }
  return { recognized, ignored };
}

export function lastActiveOwnerWouldBeRemoved(
  memberships: readonly HororaMembershipSnapshot[],
  targetId: string,
  nextRole: OrganizationMembershipRole,
  nextStatus: HororaMembershipSnapshot["status"]
): boolean {
  const target = memberships.find((membership) => membership.id === targetId);
  if (!target) return false;
  if (target.role !== "organization_owner" || target.status !== "active") return false;
  if (nextRole === "organization_owner" && nextStatus === "active") return false;
  const otherOwners = memberships.filter(
    (membership) =>
      membership.id !== targetId &&
      membership.role === "organization_owner" &&
      membership.status === "active"
  );
  return otherOwners.length === 0;
}

export type HororaRoleAuditEntry = {
  id: string;
  oldRole: string;
  newRole: string;
  reason: string | null;
  createdAt: string;
};

export type HororaMembershipChangeDenial =
  | "writer_not_connected"
  | "system_role_protected"
  | "self_change_forbidden"
  | "last_owner_protected"
  | "cross_organization_forbidden"
  | "nexus_role_cannot_grant_admin"
  | "actor_forbidden"
  | "direction_assignment_unauthorized";

const AUDITED_ASSIGNABLE_ROLES = ["employe", "direction"] as const;

export function decideHororaMembershipChange(input: {
  actorMembershipId: string;
  actorRole: OrganizationMembershipRole;
  actorOrganizationId: string;
  targetMembershipId: string;
  targetOrganizationId: string;
  targetRole: OrganizationMembershipRole;
  targetStatus: HororaMembershipSnapshot["status"];
  nextRole: OrganizationMembershipRole;
  nextStatus: HororaMembershipSnapshot["status"];
  membershipsInOrganization: readonly HororaMembershipSnapshot[];
  requestedByNexusRole: boolean;
}):
  | { ok: true; writer: "commit_horora_membership_role_with_audit" }
  | { ok: false; reason: HororaMembershipChangeDenial } {
  if (input.requestedByNexusRole) {
    return { ok: false, reason: "nexus_role_cannot_grant_admin" };
  }
  if (input.actorOrganizationId !== input.targetOrganizationId) {
    return { ok: false, reason: "cross_organization_forbidden" };
  }
  if (input.actorMembershipId === input.targetMembershipId) {
    return { ok: false, reason: "self_change_forbidden" };
  }
  if (
    HORORA_ROLE_AUTHORITY[input.nextRole].system ||
    HORORA_ROLE_AUTHORITY[input.targetRole].system
  ) {
    return { ok: false, reason: "system_role_protected" };
  }
  if (
    lastActiveOwnerWouldBeRemoved(
      input.membershipsInOrganization,
      input.targetMembershipId,
      input.nextRole,
      input.nextStatus
    )
  ) {
    return { ok: false, reason: "last_owner_protected" };
  }
  if (input.nextStatus !== "active") {
    return { ok: false, reason: "writer_not_connected" };
  }
  if (
    input.actorRole !== "organization_owner" &&
    input.actorRole !== "organization_admin" &&
    input.actorRole !== "direction"
  ) {
    return { ok: false, reason: "actor_forbidden" };
  }
  if (
    input.actorRole === "direction" &&
    (input.nextRole !== "employe" || input.targetRole === "direction")
  ) {
    return { ok: false, reason: "direction_assignment_unauthorized" };
  }
  if (
    !AUDITED_ASSIGNABLE_ROLES.includes(
      input.nextRole as (typeof AUDITED_ASSIGNABLE_ROLES)[number]
    )
  ) {
    return { ok: false, reason: "writer_not_connected" };
  }
  return { ok: true, writer: "commit_horora_membership_role_with_audit" };
}

export function knownMembershipRoles(): readonly OrganizationMembershipRole[] {
  return ORGANIZATION_MEMBERSHIP_ROLES;
}

/** A refused or unchanged role commit must not revoke sessions. */
export function shouldRevokeTargetHororaSessions(input: {
  roleCommitted: boolean;
  unchanged: boolean;
}): boolean {
  return input.roleCommitted && input.unchanged === false;
}

/** Existing JWT claims stay until that token is renewed. Membership is re-read sooner. */
export function describeAuthorityAfterMembershipRoleChange() {
  return {
    membershipReread: "next_brokered_request",
    jwtPermissions: "unchanged_until_refresh",
    permissionEdits: "not_connected",
    suspension: "not_connected",
    teams: "absent",
  } as const;
}

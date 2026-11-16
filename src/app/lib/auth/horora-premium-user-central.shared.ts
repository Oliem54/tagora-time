/**
 * HORORA Premium 2027 User Central reads the RBAC that already exists.
 * It does not define a second role or permission system.
 */

import {
  HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
  isCanonicalNexusUserId,
  type HororaDirectoryAccessStatus,
} from "@/app/lib/auth/horora-authorized-module-directory.shared";
import {
  hororaCapabilityGrant,
  type HororaAccessCapability,
} from "@/app/lib/auth/horora-role-model.shared";
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

/**
 * Business domains already decided by the portal matrix.
 * User Central displays them. It does not store a second grant.
 */
export const HORORA_BUSINESS_PERMISSION_DOMAINS = [
  "pointage",
  "horaires",
  "rapports",
  "administration",
] as const;

export type HororaBusinessPermissionDomain =
  (typeof HORORA_BUSINESS_PERMISSION_DOMAINS)[number];

export const HORORA_BUSINESS_PERMISSION_LABELS: Record<
  HororaBusinessPermissionDomain,
  string
> = {
  pointage: "Pointage",
  horaires: "Horaires",
  rapports: "Rapports",
  administration: "Administration",
};

const BUSINESS_DOMAIN_CAPABILITIES = {
  pointage: ["punch_in_out", "punch_break_meal"],
  horaires: ["view_own_hours", "view_team", "correct_time"],
  rapports: ["view_reports"],
  administration: ["manage_employees", "manage_configuration"],
} as const satisfies Record<
  HororaBusinessPermissionDomain,
  readonly HororaAccessCapability[]
>;

export type HororaBusinessPermissionGrant = "role" | "explicit" | "deny";

const PRESET_LABELS: Record<OrganizationMembershipRole, string> = {
  organization_owner: "Propriétaire",
  organization_admin: "Administration d'organisation",
  direction: "Direction",
  employe: "Employé",
};

export type HororaRolePreset = {
  role: OrganizationMembershipRole;
  label: string;
  shellRole: AppRole;
  assignableHere: boolean;
  domains: Record<HororaBusinessPermissionDomain, HororaBusinessPermissionGrant>;
};

function businessDomainGrant(
  shellRole: AppRole,
  domain: HororaBusinessPermissionDomain
): HororaBusinessPermissionGrant {
  const grants = BUSINESS_DOMAIN_CAPABILITIES[domain].map((capability) =>
    hororaCapabilityGrant(shellRole, capability)
  );
  if (grants.some((grant) => grant === "role")) return "role";
  if (grants.some((grant) => grant === "explicit")) return "explicit";
  return "deny";
}

/** Reads organization_owner, direction and employe from the membership roles that already exist. */
export function listHororaRolePresets(): HororaRolePreset[] {
  return (Object.keys(HORORA_ROLE_AUTHORITY) as OrganizationMembershipRole[]).map(
    (role) => {
      const shellRole = HORORA_ROLE_AUTHORITY[role].shellRole;
      return {
        role,
        label: PRESET_LABELS[role],
        shellRole,
        assignableHere: role === "employe" || role === "direction",
        domains: {
          pointage: businessDomainGrant(shellRole, "pointage"),
          horaires: businessDomainGrant(shellRole, "horaires"),
          rapports: businessDomainGrant(shellRole, "rapports"),
          administration: businessDomainGrant(shellRole, "administration"),
        },
      };
    }
  );
}

export function businessPermissionGrantLabel(
  grant: HororaBusinessPermissionGrant
): string {
  if (grant === "role") return "Inclus dans le rôle";
  if (grant === "explicit") return "Permission explicite séparée";
  return "Non inclus";
}

/** A Nexus role never becomes a HORORA owner. */
export function nexusRoleBecomesHororaOwner(
  nexusRoleKey: string | null | undefined
): false {
  void nexusRoleKey;
  return false;
}

export function actorCanEditLocalPresetRoles(
  role: OrganizationMembershipRole | null
): boolean {
  return role === "organization_owner" || role === "organization_admin";
}

export function describeLocalRoleChange(input: {
  currentRole: "employe" | "direction";
  nextRole: "employe" | "direction";
}): "unchanged" | "assign_direction" | "remove_direction" {
  if (input.currentRole === input.nextRole) return "unchanged";
  if (input.currentRole === "direction" && input.nextRole === "employe") {
    return "remove_direction";
  }
  return "assign_direction";
}

export type NexusLocalBindingDenial =
  | "nexus_authorization_unconfirmed"
  | "nexus_identity_absent"
  | "nexus_identity_ambiguous"
  | "nexus_not_active"
  | "cross_organization_forbidden"
  | "module_not_horora"
  | "membership_absent"
  | "membership_ambiguous"
  | "system_role_protected"
  | "membership_not_active";

export function nexusLocalBindingDenialMessage(reason: NexusLocalBindingDenial): string {
  switch (reason) {
    case "nexus_authorization_unconfirmed":
      return "L'annuaire NEXUS de cette organisation n'a pas confirmé l'autorisation. Aucun rôle n'a été modifié.";
    case "nexus_identity_absent":
      return "Cet employé n'a pas d'identité NEXUS active pour HORORA dans cette organisation. Aucun rôle n'a été modifié.";
    case "nexus_identity_ambiguous":
      return "Plusieurs liaisons NEXUS actives correspondent à ce compte. Aucun rôle n'a été modifié.";
    case "nexus_not_active":
      return "Cette identité NEXUS n'est pas active pour HORORA. Aucun rôle n'a été modifié.";
    case "cross_organization_forbidden":
      return "Le compte appartient à une autre organisation. Aucun rôle n'a été modifié.";
    case "module_not_horora":
      return "Cette autorisation ne concerne pas HORORA. Aucun rôle n'a été modifié.";
    case "membership_absent":
      return "Aucun rôle local existant. HORORA ne crée pas l'utilisateur. Rien n'a été modifié.";
    case "membership_ambiguous":
      return "Plusieurs appartenances locales correspondent. Aucun rôle n'a été modifié.";
    case "system_role_protected":
      return "Ce rôle système reste protégé. Rien n'a été modifié.";
    case "membership_not_active":
      return "Ce rôle local n'est pas actif. Rien n'a été modifié.";
  }
}

const ASSIGNABLE_LOCAL_ROLES = ["employe", "direction"] as const;

export function decideNexusAuthorizedLocalBinding(input: {
  directoryReadable: boolean;
  identityLinkCount: number;
  nexusUserId: string | null;
  directoryStatus: HororaDirectoryAccessStatus | null;
  entryOrganizationId: string | null;
  scopeOrganizationId: string | null;
  moduleKey: string | null;
  membershipRole: OrganizationMembershipRole | null;
  membershipStatus: HororaMembershipSnapshot["status"] | null;
  membershipAmbiguous: boolean;
}):
  | { ok: true; assignableRoles: readonly ["employe", "direction"] }
  | { ok: false; reason: NexusLocalBindingDenial } {
  if (
    input.directoryReadable &&
    input.entryOrganizationId &&
    input.scopeOrganizationId &&
    input.entryOrganizationId !== input.scopeOrganizationId
  ) {
    return { ok: false, reason: "cross_organization_forbidden" };
  }
  if (!input.directoryReadable || !input.scopeOrganizationId) {
    return { ok: false, reason: "nexus_authorization_unconfirmed" };
  }
  if (input.membershipAmbiguous) {
    return { ok: false, reason: "membership_ambiguous" };
  }
  if (input.identityLinkCount > 1) {
    return { ok: false, reason: "nexus_identity_ambiguous" };
  }
  if (
    input.moduleKey &&
    input.moduleKey !== HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY
  ) {
    return { ok: false, reason: "module_not_horora" };
  }
  if (
    input.identityLinkCount !== 1 ||
    !isCanonicalNexusUserId(input.nexusUserId) ||
    input.directoryStatus === null ||
    input.directoryStatus === "ABSENT"
  ) {
    return { ok: false, reason: "nexus_identity_absent" };
  }
  if (input.directoryStatus !== "ACTIVE") {
    return { ok: false, reason: "nexus_not_active" };
  }
  if (input.entryOrganizationId !== input.scopeOrganizationId) {
    return { ok: false, reason: "nexus_authorization_unconfirmed" };
  }
  if (input.moduleKey !== HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY) {
    return { ok: false, reason: "module_not_horora" };
  }
  if (!input.membershipRole || !input.membershipStatus) {
    return { ok: false, reason: "membership_absent" };
  }
  if (HORORA_ROLE_AUTHORITY[input.membershipRole].system) {
    return { ok: false, reason: "system_role_protected" };
  }
  if (input.membershipStatus !== "active") {
    return { ok: false, reason: "membership_not_active" };
  }
  return { ok: true, assignableRoles: ASSIGNABLE_LOCAL_ROLES };
}

type NexusRosterEntry = {
  userId: string;
  organizationId: string | null;
  technicalKey: string;
  status: Exclude<HororaDirectoryAccessStatus, "ABSENT">;
};

/** Normalizes a roster read into the local binding decision. It does not create a user. */
export function assessNexusLocalBinding(input: {
  directoryReadable: boolean;
  scopeOrganizationId: string | null;
  authUserId: string;
  links: readonly { nexusUserId: string; authUserId: string }[];
  entries: readonly NexusRosterEntry[];
  membershipRole: OrganizationMembershipRole | null;
  membershipStatus: HororaMembershipSnapshot["status"] | null;
  membershipAmbiguous: boolean;
}): ReturnType<typeof decideNexusAuthorizedLocalBinding> {
  const links = input.links.filter((link) => link.authUserId === input.authUserId);
  const nexusUserId = links.length === 1 ? links[0].nexusUserId : null;
  const related = nexusUserId
    ? input.entries.filter((entry) => entry.userId === nexusUserId)
    : [];
  const foreign = related.filter(
    (entry) =>
      input.scopeOrganizationId &&
      entry.organizationId &&
      entry.organizationId !== input.scopeOrganizationId
  );
  const inScope = related.filter(
    (entry) =>
      entry.organizationId === input.scopeOrganizationId &&
      entry.technicalKey === HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY
  );
  const wrongModule = related.filter(
    (entry) =>
      entry.organizationId === input.scopeOrganizationId &&
      entry.technicalKey !== HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY
  );
  if (input.directoryReadable && inScope.length > 1) {
    return { ok: false, reason: "nexus_identity_ambiguous" };
  }
  const chosen = inScope.length === 1 ? inScope[0] : null;
  const entry = chosen ?? (inScope.length === 0 && foreign.length > 0 ? foreign[0] : null);
  return decideNexusAuthorizedLocalBinding({
    directoryReadable: input.directoryReadable,
    identityLinkCount: links.length,
    nexusUserId,
    directoryStatus: entry?.status ?? (input.directoryReadable ? "ABSENT" : null),
    entryOrganizationId: entry?.organizationId ?? null,
    scopeOrganizationId: input.scopeOrganizationId,
    moduleKey:
      chosen?.technicalKey ??
      (wrongModule[0]?.technicalKey ?? entry?.technicalKey ?? null),
    membershipRole: input.membershipRole,
    membershipStatus: input.membershipStatus,
    membershipAmbiguous: input.membershipAmbiguous,
  });
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

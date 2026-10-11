import {
  appRoleMatchesArea,
  mapOrganizationMembershipRoleToAppRole,
} from "@/app/lib/auth/organization-role-mapping.shared";
import type { AppRole } from "@/app/lib/auth/roles";
import { selectActiveMembershipRow } from "@/app/lib/saas/organization-membership.shared";

export const EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE = "employe" as const;
export const EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS = "active" as const;

const PROTECTED_MEMBERSHIP_ROLES = new Set([
  "organization_owner",
  "organization_admin",
  "direction",
  "admin",
]);

export const DIRECTION_MEMBERSHIP_ASSIGNMENT_RIGHT =
  "organization_memberships.role=direction" as const;

export const DIRECTION_MEMBERSHIP_ASSIGNMENT_MISSING_RIGHT =
  "Droit manquant: aucun garde serveur n autorise d ecrire organization_memberships.role = direction. planEmployeeMembership n accepte que employe. Une ecriture app_metadata.role = direction n etablit pas ce droit.";

export type AuthoritativePortalRoleSource =
  | "employee_portal"
  | "admin_portal_account"
  | "account_request";

export const PORTAL_ROLE_AUTHORITY_CONFLICT = "PORTAL_ROLE_AUTHORITY_CONFLICT";

export const PORTAL_ROLE_AUTHORITY_CONFLICT_MESSAGE =
  "Ce compte possede actuellement un acces Direction autoritatif. La conversion vers Employe exige une operation controlee distincte. Aucune modification n a ete appliquee.";

export type OnboardingMembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
  is_default: boolean;
};

export type OnboardingCompanyRow = {
  id: string;
  organization_id: string;
  company_code: string;
  status: string;
  is_default: boolean;
};

export type OnboardingChauffeurRow = {
  id: number;
  auth_user_id: string | null;
  organization_id: string | null;
  organization_company_id: string | null;
  primary_company: string | null;
  actif: boolean | null;
};

export const EMPLOYEE_ONBOARDING_AUTHORITY = {
  organization: "server_membership",
  membershipRole: "organization_memberships.role",
  jwtRole: "app_metadata.role",
  permissions: "app_metadata.permissions",
  userMetadataAuthoritative: false as const,
  productionWrites: false as const,
} as const;

export function isUserMetadataAuthoritativeForOnboarding(): false {
  return EMPLOYEE_ONBOARDING_AUTHORITY.userMetadataAuthoritative;
}

export function planChauffeurTenantStamp(input: {
  serverOrganizationId: string | null | undefined;
  clientOrganizationId?: string | null;
  requestedPrimaryCompany: string | null;
  companies: OnboardingCompanyRow[];
  chauffeur?: Pick<
    OnboardingChauffeurRow,
    "organization_id" | "organization_company_id" | "primary_company" | "actif"
  > | null;
}):
  | {
      ok: true;
      organizationId: string;
      organizationCompanyId: string;
      primaryCompany: string;
      ignoredClientOrganizationId: string | null;
    }
  | { ok: false; code: string; error: string } {
  const serverOrganizationId = input.serverOrganizationId?.trim() || "";
  if (!serverOrganizationId) {
    return {
      ok: false,
      code: "organization_membership_required",
      error: "Membership organisation active requise.",
    };
  }

  const clientOrganizationId =
    typeof input.clientOrganizationId === "string" && input.clientOrganizationId.trim()
      ? input.clientOrganizationId.trim()
      : null;

  const existingOrg = input.chauffeur?.organization_id?.trim() || null;
  if (existingOrg && existingOrg !== serverOrganizationId) {
    return {
      ok: false,
      code: "cross_tenant_conflict",
      error: "Cette fiche appartient a une autre organisation.",
    };
  }

  const inOrg = input.companies.filter(
    (company) =>
      company.organization_id === serverOrganizationId && company.status === "active"
  );

  const requested = input.requestedPrimaryCompany?.trim().toLowerCase() || null;
  const matched =
    (requested ? inOrg.find((company) => company.company_code === requested) : null) ??
    inOrg.find((company) => company.is_default) ??
    (inOrg.length === 1 ? inOrg[0] : null);

  if (!matched) {
    return {
      ok: false,
      code: "organization_company_unresolved",
      error: "Aucune compagnie active de cette organisation ne correspond a l entreprise principale.",
    };
  }

  return {
    ok: true,
    organizationId: serverOrganizationId,
    organizationCompanyId: matched.id,
    primaryCompany: matched.company_code,
    ignoredClientOrganizationId:
      clientOrganizationId && clientOrganizationId !== serverOrganizationId
        ? clientOrganizationId
        : null,
  };
}

export function planEmployeeMembership(input: {
  authUserId: string;
  organizationId: string;
  existingMemberships: OnboardingMembershipRow[];
  requestedMembershipRole?: string | null;
}):
  | {
      ok: true;
      action: "insert" | "repair" | "noop";
      role: typeof EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE;
      status: typeof EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS;
      membershipId: string | null;
      isDefault: boolean;
    }
  | { ok: false; code: string; error: string; status: number } {
  const requested = (input.requestedMembershipRole ?? EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE)
    .trim()
    .toLowerCase();
  if (requested !== EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE) {
    return {
      ok: false,
      code: "unauthorized_membership_role",
      error: "Le parcours fiche employe n accepte que le role organisationnel employe.",
      status: 400,
    };
  }

  const others = input.existingMemberships.filter(
    (row) => row.organization_id !== input.organizationId
  );
  if (others.length > 0) {
    return {
      ok: false,
      code: "cross_tenant_conflict",
      error: "Ce compte Auth appartient deja a une autre organisation.",
      status: 409,
    };
  }

  const sameOrg = input.existingMemberships.filter(
    (row) => row.organization_id === input.organizationId
  );

  const protectedRow = sameOrg.find((row) => PROTECTED_MEMBERSHIP_ROLES.has(row.role));
  if (protectedRow) {
    return {
      ok: false,
      code: "direction_conversion_forbidden",
      error: "Ce compte Direction / admin ne peut pas etre transforme silencieusement en employe.",
      status: 409,
    };
  }

  const current = sameOrg[0] ?? null;
  const isDefault =
    current?.is_default === true || input.existingMemberships.length === 0;

  if (!current) {
    return {
      ok: true,
      action: "insert",
      role: EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
      status: EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS,
      membershipId: null,
      isDefault,
    };
  }

  if (
    current.role === EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE &&
    current.status === EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS
  ) {
    return {
      ok: true,
      action: "noop",
      role: EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
      status: EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS,
      membershipId: current.id,
      isDefault: current.is_default,
    };
  }

  return {
    ok: true,
    action: "repair",
    role: EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
    status: EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS,
    membershipId: current.id,
    isDefault,
  };
}

export type CommittedOrganizationRole = "employe" | "direction";

export type AuthoritativePortalRolePlan =
  | {
      ok: true;
      action: "insert" | "repair" | "noop" | "assign";
      role: CommittedOrganizationRole;
      status: typeof EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS;
      membershipId: string | null;
      isDefault: boolean;
    }
  | {
      ok: false;
      code: string;
      error: string;
      status: number;
      requestedRole: string;
      authoritativeRole: string | null;
      missingRight?: string;
    };

function actorMayCommitPortalRole(
  source: AuthoritativePortalRoleSource,
  actorRole: "direction" | "admin" | null
): boolean {
  if (source === "admin_portal_account") {
    return actorRole === "admin";
  }
  return actorRole === "direction" || actorRole === "admin";
}

function normalizeObservedPortalRole(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase();
  if (!role) return null;
  if (role === "employee" || role === "chauffeur") return "employe";
  return role;
}

function isProtectedPortalAccount(
  membershipRole: string | null,
  appRole: string | null
): boolean {
  const protectedMembership = new Set([
    "owner",
    "organization_owner",
    "organization_admin",
    "admin",
    "manager",
  ]);
  const protectedApp = new Set([
    "owner",
    "admin",
    "manager",
    "organization_owner",
    "organization_admin",
  ]);
  return (
    (membershipRole != null && protectedMembership.has(membershipRole)) ||
    (appRole != null && protectedApp.has(appRole))
  );
}

function refuseDirectionAssignment(input: {
  requestedRole: string;
  authoritativeRole: string | null;
  reason: string;
}): AuthoritativePortalRolePlan {
  return {
    ok: false,
    code: "direction_assignment_unauthorized",
    error: input.reason,
    status: 403,
    requestedRole: input.requestedRole,
    authoritativeRole: input.authoritativeRole,
    missingRight: DIRECTION_MEMBERSHIP_ASSIGNMENT_RIGHT,
  };
}

/**
 * Admin session may assign or remove Direction for another employee.
 * The requested role is only a candidate. Current role comes from membership.
 */
function planSessionAdminDirectionChange(input: {
  source: AuthoritativePortalRoleSource;
  actorRole: "direction" | "admin";
  actorUserId: string;
  actorOrganizationId: string;
  targetAuthUserId: string | null;
  requestedRole: CommittedOrganizationRole;
  existingMemberships: OnboardingMembershipRow[];
  existingAppRole: string | null;
  authoritativeRole: string | null;
}): AuthoritativePortalRolePlan {
  if (
    input.actorRole !== "admin" ||
    (input.source !== "employee_portal" && input.source !== "admin_portal_account")
  ) {
    return refuseDirectionAssignment({
      requestedRole: input.requestedRole,
      authoritativeRole: input.authoritativeRole,
      reason:
        "Seul un administrateur HORORA authentifie par la session peut attribuer ou retirer Direction.",
    });
  }

  if (!input.targetAuthUserId || input.targetAuthUserId === input.actorUserId) {
    return {
      ok: false,
      code: "self_role_change_forbidden",
      error: "Un administrateur ne peut pas modifier son propre role.",
      status: 403,
      requestedRole: input.requestedRole,
      authoritativeRole: input.authoritativeRole,
    };
  }

  const others = input.existingMemberships.filter(
    (row) => row.organization_id !== input.actorOrganizationId
  );
  if (others.length > 0) {
    return {
      ok: false,
      code: "cross_tenant_conflict",
      error: "Ce compte Auth appartient deja a une autre organisation.",
      status: 409,
      requestedRole: input.requestedRole,
      authoritativeRole: input.authoritativeRole,
    };
  }

  const sameOrg = input.existingMemberships.filter(
    (row) => row.organization_id === input.actorOrganizationId
  );
  if (
    sameOrg.some((row) => isProtectedPortalAccount(row.role, null)) ||
    isProtectedPortalAccount(input.authoritativeRole, input.existingAppRole)
  ) {
    return {
      ok: false,
      code: "protected_account_forbidden",
      error:
        "Le role d un compte owner, admin ou manager ne peut pas etre modifie par ce parcours.",
      status: 403,
      requestedRole: input.requestedRole,
      authoritativeRole: input.authoritativeRole,
    };
  }

  const current =
    sameOrg.find(
      (row) => row.role === input.authoritativeRole && row.status === "active"
    ) ??
    sameOrg.find((row) => row.status === "active") ??
    sameOrg[0] ??
    null;
  if (
    current &&
    current.role === input.requestedRole &&
    current.status === EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS
  ) {
    return {
      ok: true,
      action: "noop",
      role: input.requestedRole,
      status: EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS,
      membershipId: current.id,
      isDefault: current.is_default,
    };
  }

  if (!current) {
    return {
      ok: true,
      action: "insert",
      role: input.requestedRole,
      status: EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS,
      membershipId: null,
      isDefault: input.existingMemberships.length === 0,
    };
  }

  return {
    ok: true,
    action: "assign",
    role: input.requestedRole,
    status: EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS,
    membershipId: current.id,
    isDefault: current.is_default,
  };
}

/**
 * Single decision for organization_memberships.role.
 * Direction assign or remove requires a server admin session.
 * preserveExistingRole blocks invite, link and resend from replacing a role.
 */
export function planAuthoritativePortalRoleCommit(input: {
  source: AuthoritativePortalRoleSource;
  actorRole: "direction" | "admin" | null;
  actorUserId: string | null;
  actorOrganizationId: string | null;
  targetAuthUserId: string | null;
  requestedRole: string;
  existingMemberships: OnboardingMembershipRow[];
  existingAppRole?: string | null;
  preserveExistingRole: boolean;
  blockSelf: boolean;
}): AuthoritativePortalRolePlan {
  const requested = normalizeObservedPortalRole(input.requestedRole) ?? "";
  const authoritativeRole = input.actorOrganizationId
    ? authoritativeMembershipRole(input.existingMemberships, input.actorOrganizationId)
    : null;
  const existingAppRole = normalizeObservedPortalRole(input.existingAppRole);

  if (!input.actorUserId || !input.actorOrganizationId || !input.actorRole) {
    return {
      ok: false,
      code: "session_unreliable",
      error: "Session organisationnelle absente ou incomplete. Aucun role n a ete ecrit.",
      status: 403,
      requestedRole: requested,
      authoritativeRole,
    };
  }

  if (!actorMayCommitPortalRole(input.source, input.actorRole)) {
    return {
      ok: false,
      code: "actor_forbidden",
      error: "Acces refuse.",
      status: 403,
      requestedRole: requested,
      authoritativeRole,
    };
  }

  if (
    input.blockSelf &&
    input.targetAuthUserId &&
    input.actorUserId === input.targetAuthUserId
  ) {
    return {
      ok: false,
      code: "self_role_change_forbidden",
      error: "Vous ne pouvez pas modifier votre propre role depuis cette fiche.",
      status: 403,
      requestedRole: requested,
      authoritativeRole,
    };
  }

  if (requested === "direction" && input.preserveExistingRole) {
    return refuseDirectionAssignment({
      requestedRole: requested,
      authoritativeRole,
      reason:
        "Inviter, lier ou renvoyer ne peut pas attribuer Direction ni remplacer un role existant.",
    });
  }

  if (
    !input.preserveExistingRole &&
    (requested === "direction" ||
      (requested === "employe" && authoritativeRole === "direction"))
  ) {
    return planSessionAdminDirectionChange({
      source: input.source,
      actorRole: input.actorRole,
      actorUserId: input.actorUserId,
      actorOrganizationId: input.actorOrganizationId,
      targetAuthUserId: input.targetAuthUserId,
      requestedRole: requested,
      existingMemberships: input.existingMemberships,
      existingAppRole,
      authoritativeRole,
    });
  }

  if (requested === "direction") {
    return refuseDirectionAssignment({
      requestedRole: requested,
      authoritativeRole,
      reason: DIRECTION_MEMBERSHIP_ASSIGNMENT_MISSING_RIGHT,
    });
  }

  if (
    requested === "admin" ||
    requested === "manager" ||
    requested === "organization_owner" ||
    requested === "organization_admin"
  ) {
    return {
      ok: false,
      code: "protected_portal_role_forbidden",
      error:
        "Les roles admin, manager, organization_admin et organization_owner ne sont pas un droit d ecriture de organization_memberships.role pour ce parcours.",
      status: 403,
      requestedRole: requested,
      authoritativeRole,
    };
  }

  if (requested !== EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE) {
    return {
      ok: false,
      code: "unauthorized_membership_role",
      error: "Le parcours n accepte que le role organisationnel employe.",
      status: 400,
      requestedRole: requested,
      authoritativeRole,
    };
  }

  if (input.preserveExistingRole) {
    const others = input.existingMemberships.filter(
      (row) => row.organization_id !== input.actorOrganizationId
    );
    if (others.length > 0) {
      return {
        ok: false,
        code: "cross_tenant_conflict",
        error: "Ce compte Auth appartient deja a une autre organisation.",
        status: 409,
        requestedRole: requested,
        authoritativeRole,
      };
    }

    const sameOrg = input.existingMemberships.filter(
      (row) => row.organization_id === input.actorOrganizationId
    );
    const protectedRow = sameOrg.find((row) => PROTECTED_MEMBERSHIP_ROLES.has(row.role));
    if (protectedRow || (existingAppRole && existingAppRole !== EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE)) {
      return {
        ok: false,
        code: "existing_role_preserved",
        error:
          "Un role existant est deja present. Inviter, lier ou renvoyer ne modifie pas ce role.",
        status: 409,
        requestedRole: requested,
        authoritativeRole: protectedRow?.role ?? existingAppRole ?? authoritativeRole,
      };
    }

    const current = sameOrg[0] ?? null;
    if (!current) {
      return {
        ok: true,
        action: "insert",
        role: EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
        status: EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS,
        membershipId: null,
        isDefault: input.existingMemberships.length === 0,
      };
    }

    if (
      current.role === EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE &&
      current.status === EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS
    ) {
      return {
        ok: true,
        action: "noop",
        role: EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
        status: EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS,
        membershipId: current.id,
        isDefault: current.is_default,
      };
    }

    if (current.role === EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE) {
      return {
        ok: true,
        action: "repair",
        role: EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
        status: EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS,
        membershipId: current.id,
        isDefault: current.is_default,
      };
    }

    return {
      ok: false,
      code: "existing_role_preserved",
      error:
        "Un role existant est deja present. Inviter, lier ou renvoyer ne modifie pas ce role.",
      status: 409,
      requestedRole: requested,
      authoritativeRole: current.role,
    };
  }

  const membershipPlan = planEmployeeMembership({
    authUserId: input.targetAuthUserId ?? input.actorUserId,
    organizationId: input.actorOrganizationId,
    existingMemberships: input.existingMemberships,
    requestedMembershipRole: EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
  });
  if (!membershipPlan.ok) {
    const protectedConflict = membershipPlan.code === "direction_conversion_forbidden";
    return {
      ok: false,
      code: protectedConflict ? PORTAL_ROLE_AUTHORITY_CONFLICT : membershipPlan.code,
      error: protectedConflict
        ? PORTAL_ROLE_AUTHORITY_CONFLICT_MESSAGE
        : membershipPlan.error,
      status: membershipPlan.status,
      requestedRole: requested,
      authoritativeRole,
    };
  }

  return {
    ok: true,
    action: membershipPlan.action,
    role: membershipPlan.role,
    status: membershipPlan.status,
    membershipId: membershipPlan.membershipId,
    isDefault: membershipPlan.isDefault,
  };
}

export async function executeAuthoritativePortalRoleCommit(input: {
  plan: AuthoritativePortalRolePlan;
  writeMembership: () => Promise<void>;
  writeAuthRole: () => Promise<void>;
}): Promise<
  | { ok: true; role: CommittedOrganizationRole }
  | {
      ok: false;
      skippedWrites: true;
      code: string;
      error: string;
      status: number;
      requestedRole: string;
      authoritativeRole: string | null;
      missingRight?: string;
    }
> {
  if (!input.plan.ok) {
    return {
      ok: false,
      skippedWrites: true,
      code: input.plan.code,
      error: input.plan.error,
      status: input.plan.status,
      requestedRole: input.plan.requestedRole,
      authoritativeRole: input.plan.authoritativeRole,
      missingRight: input.plan.missingRight,
    };
  }

  if (input.plan.action !== "noop") {
    try {
      await input.writeMembership();
    } catch {
      return {
        ok: false,
        skippedWrites: true,
        code: "membership_write_failed",
        error:
          "L ecriture de organization_memberships.role a echoue. Aucun role n a ete annonce.",
        status: 500,
        requestedRole: input.plan.role,
        authoritativeRole: null,
      };
    }
  }

  try {
    await input.writeAuthRole();
  } catch {
    return {
      ok: false,
      skippedWrites: true,
      code: "announcement_write_failed",
      error:
        "L annonce du role a echoue apres la membership. Le succes n est pas confirme.",
      status: 500,
      requestedRole: input.plan.role,
      authoritativeRole: input.plan.role,
    };
  }

  return { ok: true, role: input.plan.role };
}

export function sessionPortalRoleForOrganization(
  memberships: OnboardingMembershipRow[],
  organizationId: string
): "employe" | "direction" | "manager" | "admin" | null {
  return portalRoleChoiceFromAuthoritativeRole(
    authoritativeMembershipRole(memberships, organizationId)
  );
}

export function planAuthInviteVersusLink(input: {
  action: "invite" | "link";
  authExistsForEmail: boolean;
}): { ok: true } | { ok: false; code: string; error: string; status: number } {
  if (input.action === "invite" && input.authExistsForEmail) {
    return {
      ok: false,
      code: "auth_exists_use_link",
      error: "Un compte existe deja pour ce courriel. Utilisez « Lier a un compte existant ».",
      status: 409,
    };
  }
  if (input.action === "link" && !input.authExistsForEmail) {
    return {
      ok: false,
      code: "auth_missing_use_invite",
      error: "Aucun compte Auth trouve pour ce courriel. Utilisez Inviter.",
      status: 404,
    };
  }
  return { ok: true };
}

export function canAuthGateResolveEmployeeOnboarding(input: {
  memberships: OnboardingMembershipRow[];
  jwtAppRole: AppRole | null;
}): {
  authorized: boolean;
  appRole: AppRole | null;
  source: "membership" | "none";
  employeeAreaAllowed: boolean;
  directionAreaAllowed: boolean;
} {
  const selected = selectActiveMembershipRow(
    input.memberships.map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      role: row.role,
      status: row.status,
      is_default: row.is_default,
    }))
  );

  if (selected.kind !== "ok") {
    return {
      authorized: false,
      appRole: null,
      source: "none",
      employeeAreaAllowed: false,
      directionAreaAllowed: false,
    };
  }

  const appRole = mapOrganizationMembershipRoleToAppRole(selected.row.role);
  if (!appRole) {
    return {
      authorized: false,
      appRole: null,
      source: "none",
      employeeAreaAllowed: false,
      directionAreaAllowed: false,
    };
  }

  return {
    authorized: true,
    appRole,
    source: "membership",
    employeeAreaAllowed: appRoleMatchesArea("employe", appRole),
    directionAreaAllowed: appRoleMatchesArea("direction", appRole),
  };
}

export function mergeAppMetadataOrganization(
  existing: Record<string, unknown>,
  organizationId: string
): Record<string, unknown> {
  return {
    ...existing,
    organization_id: organizationId,
    access_disabled: false,
  };
}

function authoritativeMembershipRole(
  memberships: OnboardingMembershipRow[],
  organizationId: string
): string | null {
  const sameOrg = memberships.filter((row) => row.organization_id === organizationId);
  const activeProtected = sameOrg.find(
    (row) => row.status === "active" && PROTECTED_MEMBERSHIP_ROLES.has(row.role)
  );
  if (activeProtected) return activeProtected.role;
  const anyProtected = sameOrg.find((row) => PROTECTED_MEMBERSHIP_ROLES.has(row.role));
  if (anyProtected) return anyProtected.role;
  const selected = selectActiveMembershipRow(
    sameOrg.map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      role: row.role,
      status: row.status,
      is_default: row.is_default,
    }))
  );
  return selected.kind === "ok" ? selected.row.role : null;
}

export function planEmployeePortalAuthoritySave(input: {
  requestedPortalRole: string;
  actorOrganizationId: string;
  chauffeurAuthUserId: string | null;
  resolvedAuthUserId: string;
  existingMemberships: OnboardingMembershipRow[];
}):
  | {
      ok: true;
      membershipAction: "insert" | "repair" | "noop";
      membershipId: string | null;
      linkChauffeur: boolean;
    }
  | {
      ok: false;
      code: string;
      error: string;
      status: number;
      requestedRole: string;
      authoritativeRole: string | null;
    } {
  const requested = input.requestedPortalRole.trim().toLowerCase();
  const authoritativeRole = authoritativeMembershipRole(
    input.existingMemberships,
    input.actorOrganizationId
  );

  if (
    input.chauffeurAuthUserId &&
    input.chauffeurAuthUserId !== input.resolvedAuthUserId
  ) {
    return {
      ok: false,
      code: "auth_user_link_conflict",
      error: "Cette fiche est deja liee a un autre compte Auth.",
      status: 409,
      requestedRole: requested,
      authoritativeRole,
    };
  }

  const membershipPlan = planEmployeeMembership({
    authUserId: input.resolvedAuthUserId,
    organizationId: input.actorOrganizationId,
    existingMemberships: input.existingMemberships,
    requestedMembershipRole: EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE,
  });

  if (!membershipPlan.ok) {
    const isProtectedConflict =
      membershipPlan.code === "direction_conversion_forbidden" ||
      (requested === EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE &&
        authoritativeRole != null &&
        PROTECTED_MEMBERSHIP_ROLES.has(authoritativeRole));
    return {
      ok: false,
      code: isProtectedConflict
        ? PORTAL_ROLE_AUTHORITY_CONFLICT
        : membershipPlan.code,
      error: isProtectedConflict
        ? PORTAL_ROLE_AUTHORITY_CONFLICT_MESSAGE
        : membershipPlan.error,
      status: membershipPlan.status,
      requestedRole: requested,
      authoritativeRole,
    };
  }

  if (requested !== EMPLOYEE_ONBOARDING_MEMBERSHIP_ROLE) {
    return {
      ok: false,
      code: PORTAL_ROLE_AUTHORITY_CONFLICT,
      error: PORTAL_ROLE_AUTHORITY_CONFLICT_MESSAGE,
      status: 409,
      requestedRole: requested,
      authoritativeRole,
    };
  }

  return {
    ok: true,
    membershipAction: membershipPlan.action,
    membershipId: membershipPlan.membershipId,
    linkChauffeur: !input.chauffeurAuthUserId,
  };
}

export function employeePortalSaveErrorMessage(payload: {
  error?: string;
  code?: string;
  requestedRole?: string;
  authoritativeRole?: string | null;
}): string {
  if (payload.code === PORTAL_ROLE_AUTHORITY_CONFLICT) {
    return PORTAL_ROLE_AUTHORITY_CONFLICT_MESSAGE;
  }
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  return "L operation n a pas pu etre effectuee.";
}

export const EMPLOYEE_PORTAL_AUTHORITY_WRITE_ORDER = [
  "validate_and_detect_conflicts",
  "block_writes_if_protected_membership",
  "membership_then_chauffeur_link_then_app_metadata",
  "reread_authorities",
  "success_only_if_coherent",
] as const;

export function employeePortalAuthorityWriteIntent(
  plan: ReturnType<typeof planEmployeePortalAuthoritySave>
): { auth: boolean; chauffeur: boolean; membership: boolean } {
  if (!plan.ok) {
    return { auth: false, chauffeur: false, membership: false };
  }
  return {
    auth: true,
    chauffeur: plan.linkChauffeur,
    membership: plan.membershipAction !== "noop",
  };
}

export async function executeEmployeePortalAuthorityPlan(input: {
  plan: ReturnType<typeof planEmployeePortalAuthoritySave>;
  writeMembership: () => Promise<void>;
  writeChauffeur: () => Promise<void>;
  writeAuth: () => Promise<void>;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      skippedWrites: true;
      code: string;
      error: string;
      status: number;
      requestedRole: string;
      authoritativeRole: string | null;
    }
> {
  if (!input.plan.ok) {
    return {
      ok: false,
      skippedWrites: true,
      code: input.plan.code,
      error: input.plan.error,
      status: input.plan.status,
      requestedRole: input.plan.requestedRole,
      authoritativeRole: input.plan.authoritativeRole,
    };
  }
  if (input.plan.membershipAction !== "noop") {
    await input.writeMembership();
  }
  if (input.plan.linkChauffeur) {
    await input.writeChauffeur();
  }
  await input.writeAuth();
  return { ok: true };
}

export function verifyEmployeePortalAuthorityAfterWrite(input: {
  requestedPortalRole: string;
  actorOrganizationId: string;
  resolvedAuthUserId: string;
  chauffeurAuthUserId: string | null;
  appMetadataRole: string | null;
  memberships: OnboardingMembershipRow[];
}): { ok: true } | { ok: false; code: string; error: string } {
  const requested = input.requestedPortalRole.trim().toLowerCase();
  if (requested !== "employe" && requested !== "direction") {
    return {
      ok: false,
      code: PORTAL_ROLE_AUTHORITY_CONFLICT,
      error: PORTAL_ROLE_AUTHORITY_CONFLICT_MESSAGE,
    };
  }
  if (input.chauffeurAuthUserId !== input.resolvedAuthUserId) {
    return {
      ok: false,
      code: "auth_user_link_incoherent",
      error: "Le lien chauffeur / Auth n est pas coherent.",
    };
  }
  if ((input.appMetadataRole ?? "").trim().toLowerCase() !== requested) {
    return {
      ok: false,
      code: "app_metadata_role_incoherent",
      error: "app_metadata.role n est pas coherent avec la membership.",
    };
  }
  const activeMatch = input.memberships.some(
    (row) =>
      row.organization_id === input.actorOrganizationId &&
      row.role === requested &&
      row.status === EMPLOYEE_ONBOARDING_MEMBERSHIP_STATUS
  );
  const authoritativeRole = authoritativeMembershipRole(
    input.memberships,
    input.actorOrganizationId
  );
  if (!activeMatch || authoritativeRole !== requested) {
    return {
      ok: false,
      code: "membership_role_incoherent",
      error: "La membership autoritative ne correspond pas au role enregistre.",
    };
  }
  return { ok: true };
}

export function portalRoleChoiceFromAuthoritativeRole(
  role: string | null | undefined
): "employe" | "direction" | "manager" | "admin" | null {
  const normalized = (role ?? "").trim().toLowerCase();
  if (normalized === "employe") return "employe";
  if (normalized === "direction") return "direction";
  if (normalized === "manager") return "manager";
  if (normalized === "organization_admin" || normalized === "organization_owner" || normalized === "admin") {
    return "admin";
  }
  return null;
}

export function applyEmployeePortalSaveFailureToForm(input: {
  currentFormRole: "employe" | "direction" | "manager" | "admin";
  code?: string;
  authoritativeRole?: string | null;
}): "employe" | "direction" | "manager" | "admin" {
  const fromAuthority = portalRoleChoiceFromAuthoritativeRole(input.authoritativeRole);
  if (input.code === "direction_assignment_unauthorized") {
    return fromAuthority === "direction" ? "employe" : (fromAuthority ?? "employe");
  }
  if (fromAuthority) return fromAuthority;
  if (input.code === PORTAL_ROLE_AUTHORITY_CONFLICT && input.currentFormRole === "employe") {
    return "direction";
  }
  return input.currentFormRole;
}

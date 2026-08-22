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
]);

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

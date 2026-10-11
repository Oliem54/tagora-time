export const EMPLOYEE_PORTAL_STATUS_UNVERIFIED = "Statut non vérifié";
export const EMPLOYEE_PORTAL_STATUS_ABSENT = "Aucun compte";
export const EMPLOYEE_PORTAL_STATUS_DISABLED = "Compte desactive";
export const EMPLOYEE_PORTAL_STATUS_ACTIVE = "Compte actif";
export const EMPLOYEE_PORTAL_STATUS_INVITED = "Invitation envoyee";

export const EMPLOYEE_PORTAL_DISABLED_SAVE_MESSAGE =
  "Le compte est desactive : reactivez l acces avant de modifier les permissions.";
export const EMPLOYEE_PORTAL_ROLE_UNCONFIRMED_MESSAGE =
  "Le role de membership n est pas confirme.";

export type EmployeePortalRoleChoice = "employe" | "direction" | "manager" | "admin";

export type EmployeePortalSecurityPortrait = {
  status: "no_account" | "invited" | "active" | "disabled";
  accountExists: boolean;
  accessDisabled: boolean;
  authUserId: string | null;
  portalRole: EmployeePortalRoleChoice | null;
  membershipRoleConfirmed: boolean;
  permissions: string[];
};

export function confirmEmployeeMembershipPortalRole(
  authoritativeRole: EmployeePortalRoleChoice | null
): {
  portalRole: EmployeePortalRoleChoice | null;
  membershipRoleConfirmed: boolean;
} {
  if (
    authoritativeRole === "employe" ||
    authoritativeRole === "direction" ||
    authoritativeRole === "manager" ||
    authoritativeRole === "admin"
  ) {
    return {
      portalRole: authoritativeRole,
      membershipRoleConfirmed: true,
    };
  }

  return {
    portalRole: null,
    membershipRoleConfirmed: false,
  };
}

function isPortalRole(value: unknown): value is EmployeePortalRoleChoice {
  return (
    value === "employe" ||
    value === "direction" ||
    value === "manager" ||
    value === "admin"
  );
}

export function parseEmployeePortalSecurityPortrait(
  value: unknown
): EmployeePortalSecurityPortrait | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const status = row.status;
  if (
    status !== "no_account" &&
    status !== "invited" &&
    status !== "active" &&
    status !== "disabled"
  ) {
    return null;
  }

  if (typeof row.accountExists !== "boolean" || typeof row.accessDisabled !== "boolean") {
    return null;
  }

  return {
    status,
    accountExists: row.accountExists,
    accessDisabled: row.accessDisabled,
    authUserId: typeof row.authUserId === "string" ? row.authUserId : null,
    portalRole: isPortalRole(row.portalRole) ? row.portalRole : null,
    membershipRoleConfirmed: row.membershipRoleConfirmed === true,
    permissions: Array.isArray(row.permissions)
      ? row.permissions.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export type EmployeePortalSecurityView = {
  portraitConfirmed: boolean;
  statusLabel: string;
  recordedRole: EmployeePortalRoleChoice | null;
  membershipRoleConfirmed: boolean;
  permissions: string[];
  canSave: boolean;
  blockMessage: string | null;
};

function unverifiedView(): EmployeePortalSecurityView {
  return {
    portraitConfirmed: false,
    statusLabel: EMPLOYEE_PORTAL_STATUS_UNVERIFIED,
    recordedRole: null,
    membershipRoleConfirmed: false,
    permissions: [],
    canSave: false,
    blockMessage: null,
  };
}

export function viewEmployeePortalSecurity(input: {
  loaded: boolean;
  security: unknown;
  profileAuthUserId?: string | null;
}): EmployeePortalSecurityView {
  const portrait = input.loaded ? parseEmployeePortalSecurityPortrait(input.security) : null;
  if (!portrait) {
    return unverifiedView();
  }

  const membershipRoleConfirmed =
    portrait.membershipRoleConfirmed && portrait.portalRole !== null;
  const recordedRole = membershipRoleConfirmed ? portrait.portalRole : null;
  const linked = Boolean(input.profileAuthUserId ?? portrait.authUserId);
  const accountAbsent = !portrait.accountExists || portrait.status === "no_account";
  const accountDisabled =
    portrait.accountExists && (portrait.accessDisabled || portrait.status === "disabled");

  let statusLabel: string = EMPLOYEE_PORTAL_STATUS_UNVERIFIED;
  if (accountAbsent) {
    statusLabel = EMPLOYEE_PORTAL_STATUS_ABSENT;
  } else if (accountDisabled) {
    statusLabel = EMPLOYEE_PORTAL_STATUS_DISABLED;
  } else if (portrait.status === "active") {
    statusLabel = EMPLOYEE_PORTAL_STATUS_ACTIVE;
  } else if (portrait.status === "invited") {
    statusLabel = EMPLOYEE_PORTAL_STATUS_INVITED;
  }

  const canSave = Boolean(
    linked &&
      portrait.accountExists &&
      !accountDisabled &&
      !accountAbsent &&
      membershipRoleConfirmed &&
      recordedRole
  );

  let blockMessage: string | null = null;
  if (accountDisabled) {
    blockMessage = EMPLOYEE_PORTAL_DISABLED_SAVE_MESSAGE;
  } else if (!accountAbsent && !membershipRoleConfirmed) {
    blockMessage = EMPLOYEE_PORTAL_ROLE_UNCONFIRMED_MESSAGE;
  }

  return {
    portraitConfirmed: true,
    statusLabel,
    recordedRole,
    membershipRoleConfirmed,
    permissions: membershipRoleConfirmed ? portrait.permissions : [],
    canSave,
    blockMessage,
  };
}

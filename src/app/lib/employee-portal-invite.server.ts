import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  buildCompanyAccessFlags,
  normalizeCompany,
  normalizeEmail,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { buildRequiredPasswordMetadata, hasPasswordChangeRequired } from "@/app/lib/auth/passwords";
import {
  getUserPermissions,
  normalizePermissionList,
  type AppPermission,
} from "@/app/lib/auth/permissions";
import { getUserRole, type AppRole } from "@/app/lib/auth/roles";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export type PortalInviteRole = "employe" | "direction" | "manager" | "admin";

export type ChauffeurInviteRow = {
  id: number;
  auth_user_id: string | null;
  nom: string | null;
  courriel: string | null;
  primary_company: AccountRequestCompany | null;
};

export async function findAuthUserByEmailForPortalInvite(email: string) {
  const supabase = createAdminSupabaseClient();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const matchedUser = data.users.find((item) => item.email?.toLowerCase() === email);

    if (matchedUser) {
      return matchedUser;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

export async function syncEmployeeAuthLink(employeeId: number, userId: string) {
  const supabase = createAdminSupabaseClient();

  await supabase.from("chauffeurs").update({ auth_user_id: userId }).eq("id", employeeId);

  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data.user) {
    return;
  }

  await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...data.user.app_metadata,
      chauffeur_id: employeeId,
    },
    user_metadata: {
      ...data.user.user_metadata,
      chauffeur_id: employeeId,
    },
  });
}

function loginSegmentForInvite(portalRole: PortalInviteRole): string {
  if (portalRole === "employe") {
    return "employe";
  }
  if (portalRole === "admin") {
    return "admin";
  }
  return "direction";
}

export function buildEmployeeInviteUserByEmailPayload(
  employee: ChauffeurInviteRow,
  portalRole: PortalInviteRole,
  permissions: AppPermission[]
) {
  const normalizedEmail = normalizeEmail(employee.courriel);
  const primaryCompany: AccountRequestCompany =
    employee.primary_company ?? normalizeCompany("oliem_solutions") ?? "oliem_solutions";

  const companyAccessFlags = buildCompanyAccessFlags(primaryCompany, [primaryCompany]);
  const redirectBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const redirectTo = redirectBase
    ? `${redirectBase}/${loginSegmentForInvite(portalRole)}/login`
    : undefined;

  return {
    email: normalizedEmail,
    options: {
      data: {
        role: portalRole,
        permissions,
        chauffeur_id: employee.id,
        full_name: employee.nom ?? null,
        company: primaryCompany,
        ...companyAccessFlags,
        ...buildRequiredPasswordMetadata(),
        requested_from: "employee_profile_invite",
      },
      redirectTo,
    },
  };
}

export function buildEmployeePortalAuthMetadata(options: {
  employee: ChauffeurInviteRow;
  portalRole: PortalInviteRole;
  permissions: AppPermission[];
  actorUserId: string;
  existingApp?: Record<string, unknown> | null;
  existingUser?: Record<string, unknown> | null;
  requirePasswordChange?: boolean;
}) {
  const primaryCompany: AccountRequestCompany =
    options.employee.primary_company ?? normalizeCompany("oliem_solutions") ?? "oliem_solutions";

  const existingAllowedCompanies = Array.isArray(options.existingApp?.allowed_companies)
    ? (options.existingApp?.allowed_companies as unknown[])
    : [primaryCompany];

  const base: Record<string, unknown> = {
    ...(options.existingApp ?? {}),
    role: options.portalRole,
    permissions: options.permissions,
    chauffeur_id: options.employee.id,
    company: primaryCompany,
    ...buildCompanyAccessFlags(primaryCompany, existingAllowedCompanies),
    access_disabled: false,
    invited_from_employee_profile: true,
    invited_by_user_id: options.actorUserId,
    invited_at: new Date().toISOString(),
  };

  if (options.requirePasswordChange) {
    Object.assign(base, buildRequiredPasswordMetadata());
  }

  const userMeta: Record<string, unknown> = {
    ...(options.existingUser ?? {}),
    role: options.portalRole,
    permissions: options.permissions,
    chauffeur_id: options.employee.id,
    full_name: options.employee.nom ?? null,
    company: primaryCompany,
    ...buildCompanyAccessFlags(primaryCompany, existingAllowedCompanies),
  };

  if (options.requirePasswordChange) {
    Object.assign(userMeta, buildRequiredPasswordMetadata());
  }

  return { appMetadata: base, userMetadata: userMeta };
}

export function hasUserActivatedAccessForPortal(user: User | null | undefined) {
  if (!user) {
    return false;
  }
  return Boolean(
    user.last_sign_in_at ||
      user.email_confirmed_at ||
      user.phone_confirmed_at ||
      user.confirmed_at
  );
}

export function readAccessDisabledForPortal(user: User | null | undefined) {
  if (!user) {
    return false;
  }
  return Boolean(
    user.app_metadata?.access_disabled === true || user.user_metadata?.access_disabled === true
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRoleForDisabled(value: unknown): AppRole | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "employe" || normalized === "employee" || normalized === "chauffeur") {
    return "employe";
  }
  if (normalized === "admin") {
    return "admin";
  }
  if (normalized === "direction" || normalized === "manager") {
    return "direction";
  }
  return null;
}

function readDisabledRoleFromMeta(metadata: unknown) {
  if (!isRecord(metadata)) {
    return null;
  }
  return normalizeRoleForDisabled(metadata.disabled_role);
}

function readDisabledPermissionsFromMeta(metadata: unknown) {
  if (!isRecord(metadata)) {
    return [];
  }
  return normalizePermissionList(metadata.disabled_permissions);
}

export function getRestorableRoleForPortal(user: User | null | undefined) {
  return (
    getUserRole(user) ??
    readDisabledRoleFromMeta(user?.app_metadata) ??
    readDisabledRoleFromMeta(user?.user_metadata) ??
    ("employe" as AppRole)
  );
}

export function getRestorablePermissionsForPortal(user: User | null | undefined): AppPermission[] {
  const currentPermissions = getUserPermissions(user);
  if (currentPermissions.length > 0) {
    return currentPermissions;
  }
  const disabledPermissions = [
    ...readDisabledPermissionsFromMeta(user?.app_metadata),
    ...readDisabledPermissionsFromMeta(user?.user_metadata),
  ];
  return Array.from(new Set(disabledPermissions));
}

export function buildDisabledPortalMetadata(
  metadata: unknown,
  user: User,
  actorUserId: string,
  at: string
) {
  const source = isRecord(metadata) ? metadata : {};
  const role = normalizeRoleForDisabled(source.role) ?? getUserRole(user) ?? "employe";
  const permissions = normalizePermissionList(source.permissions);
  const nextPermissions =
    permissions.length > 0 ? permissions : getRestorablePermissionsForPortal(user);

  return {
    ...source,
    disabled_role: role,
    disabled_permissions: nextPermissions,
    role: null,
    permissions: [],
    access_disabled: true,
    access_disabled_at: at,
    access_disabled_by: actorUserId,
  };
}

export async function applyChauffeurInvitationAudit(
  employeeId: number,
  fields: {
    account_invited_at: string | null;
    account_invited_by_user_id: string | null;
    account_invited_by_name: string | null;
    account_invitation_status: string | null;
    account_invitation_error: string | null;
  }
) {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("chauffeurs").update(fields).eq("id", employeeId);
  if (error) {
    console.error("[employee-portal-invite] audit_update_failed", { employeeId, error });
  }
}

export async function resolveAuthUserForEmployeeRow(employee: ChauffeurInviteRow) {
  const supabase = createAdminSupabaseClient();

  if (employee.auth_user_id) {
    const { data, error } = await supabase.auth.admin.getUserById(employee.auth_user_id);
    if (!error && data.user) {
      return data.user;
    }
  }

  const normalizedEmail = normalizeEmail(employee.courriel);
  if (!normalizedEmail) {
    return null;
  }

  return findAuthUserByEmailForPortalInvite(normalizedEmail);
}

export function deriveInvitationStatusAfterSuccess(
  authUser: User | null,
  hadAuthUserId: boolean
): "invited" | "active" | "linked" {
  if (!authUser) {
    return "invited";
  }
  if (hasUserActivatedAccessForPortal(authUser)) {
    return "active";
  }
  if (hadAuthUserId) {
    return "linked";
  }
  return "invited";
}

export function shouldRequirePasswordChangeForPortal(authUser: User | null) {
  if (!authUser) {
    return true;
  }
  return !hasUserActivatedAccessForPortal(authUser) || hasPasswordChangeRequired(authUser);
}

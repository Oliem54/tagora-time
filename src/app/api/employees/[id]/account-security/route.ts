import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  buildCompanyAccessFlags,
  getCompanyDirectoryContext,
  normalizeCompany,
  normalizeEmail,
} from "@/app/lib/account-requests.shared";
import { getStrictDirectionRequestUser } from "@/app/lib/account-requests.server";
import {
  buildRequiredPasswordMetadata,
  hasPasswordChangeRequired,
} from "@/app/lib/auth/passwords";
import {
  getUserPermissions,
  normalizePermissionList,
  type AppPermission,
} from "@/app/lib/auth/permissions";
import { getUserRole, type AppRole } from "@/app/lib/auth/roles";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { createPublicServerSupabaseClient } from "@/app/lib/supabase/server";

type EmployeeRow = {
  id: number;
  auth_user_id: string | null;
  nom: string | null;
  courriel: string | null;
  primary_company: ReturnType<typeof normalizeCompany>;
};

type AccountSecurityAction =
  | "reset_password"
  | "send_reset_link"
  | "resend_invitation"
  | "disable_account"
  | "reactivate_account";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized === "employe" ||
    normalized === "employee" ||
    normalized === "chauffeur"
  ) {
    return "employe";
  }

  if (
    normalized === "direction" ||
    normalized === "admin" ||
    normalized === "manager"
  ) {
    return "direction";
  }

  return null;
}

function hasUserActivatedAccess(user: User | null | undefined) {
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

function readAccessDisabled(user: User | null | undefined) {
  if (!user) {
    return false;
  }

  return Boolean(
    user.app_metadata?.access_disabled === true ||
      user.user_metadata?.access_disabled === true
  );
}

function readDisabledRole(metadata: unknown) {
  if (!isRecord(metadata)) {
    return null;
  }

  return normalizeRole(metadata.disabled_role);
}

function readDisabledPermissions(metadata: unknown) {
  if (!isRecord(metadata)) {
    return [];
  }

  return normalizePermissionList(metadata.disabled_permissions);
}

function getRestorableRole(user: User | null | undefined) {
  return (
    getUserRole(user) ??
    readDisabledRole(user?.app_metadata) ??
    readDisabledRole(user?.user_metadata) ??
    "employe"
  );
}

function getRestorablePermissions(user: User | null | undefined): AppPermission[] {
  const currentPermissions = getUserPermissions(user);

  if (currentPermissions.length > 0) {
    return currentPermissions;
  }

  const disabledPermissions = [
    ...readDisabledPermissions(user?.app_metadata),
    ...readDisabledPermissions(user?.user_metadata),
  ];

  return Array.from(new Set(disabledPermissions));
}

async function findAuthUserByEmail(email: string) {
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

    const matchedUser = data.users.find(
      (item) => item.email?.toLowerCase() === email
    );

    if (matchedUser) {
      return matchedUser;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function loadEmployee(id: number) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("chauffeurs")
    .select("id, auth_user_id, nom, courriel, primary_company")
    .eq("id", id)
    .maybeSingle<EmployeeRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function resolveAuthUser(employee: EmployeeRow) {
  const supabase = createAdminSupabaseClient();

  if (employee.auth_user_id) {
    const { data, error } = await supabase.auth.admin.getUserById(
      employee.auth_user_id
    );

    if (!error && data.user) {
      return data.user;
    }
  }

  const normalizedEmail = normalizeEmail(employee.courriel);

  if (!normalizedEmail) {
    return null;
  }

  return findAuthUserByEmail(normalizedEmail);
}

async function syncEmployeeAuthLink(employeeId: number, userId: string) {
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

function buildRecoveryRedirect(req: NextRequest, role: AppRole) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;

  return `${base}/auth/nouveau-mot-de-passe?role=${role}&mode=recovery`;
}

function buildInvitationPayload(employee: EmployeeRow, authUser: User | null) {
  const role = getRestorableRole(authUser);
  const permissions = getRestorablePermissions(authUser);
  const primaryCompany =
    employee.primary_company ??
    normalizeCompany(
      authUser?.app_metadata?.primary_company ??
        authUser?.user_metadata?.primary_company ??
        authUser?.app_metadata?.company ??
        authUser?.user_metadata?.company
    ) ??
    "oliem_solutions";
  const existingAllowedCompanies = [
    ...(Array.isArray(authUser?.app_metadata?.allowed_companies)
      ? authUser?.app_metadata?.allowed_companies
      : []),
    ...(Array.isArray(authUser?.user_metadata?.allowed_companies)
      ? authUser?.user_metadata?.allowed_companies
      : []),
  ];
  const companyAccessFlags = buildCompanyAccessFlags(
    primaryCompany,
    existingAllowedCompanies.length > 0 ? existingAllowedCompanies : [primaryCompany]
  );
  const redirectBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const redirectTo = redirectBase ? `${redirectBase}/${role}/login` : undefined;

  return {
    email: normalizeEmail(employee.courriel),
    options: {
      data: {
        role,
        permissions,
        chauffeur_id: employee.id,
        full_name:
          employee.nom ??
          authUser?.user_metadata?.full_name ??
          authUser?.email ??
          null,
        company: primaryCompany,
        ...companyAccessFlags,
        ...buildRequiredPasswordMetadata(),
        requested_from: role,
      },
      redirectTo,
    },
  };
}

function buildDisabledMetadata(
  metadata: unknown,
  user: User,
  actorUserId: string,
  at: string
) {
  const source = isRecord(metadata) ? metadata : {};
  const role = normalizeRole(source.role) ?? getUserRole(user) ?? "employe";
  const permissions = normalizePermissionList(source.permissions);
  const nextPermissions =
    permissions.length > 0 ? permissions : getRestorablePermissions(user);

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

function buildReactivatedMetadata(
  metadata: unknown,
  user: User,
  actorUserId: string,
  at: string
) {
  const source = isRecord(metadata) ? metadata : {};

  return {
    ...source,
    role: getRestorableRole(user),
    permissions: getRestorablePermissions(user),
    access_disabled: false,
    access_disabled_at: null,
    access_disabled_by: null,
    access_reactivated_at: at,
    access_reactivated_by: actorUserId,
  };
}

function buildAccountSecuritySnapshot(employee: EmployeeRow, authUser: User | null) {
  const email = authUser?.email ?? employee.courriel ?? null;
  const accountExists = Boolean(authUser);
  const accessDisabled = readAccessDisabled(authUser);
  const activated = hasUserActivatedAccess(authUser);
  const currentRole = getUserRole(authUser);
  let status: "no_account" | "invited" | "active" | "disabled" = "no_account";

  if (accountExists) {
    if (accessDisabled || !currentRole) {
      status = "disabled";
    } else if (activated) {
      status = "active";
    } else {
      status = "invited";
    }
  }

  return {
    employeeId: employee.id,
    authUserId: authUser?.id ?? employee.auth_user_id ?? null,
    email,
    accountExists,
    accountActivated: activated,
    accessDisabled,
    status,
    statusLabel:
      status === "active"
        ? "Compte actif"
        : status === "invited"
          ? "Invitation en attente"
          : status === "disabled"
            ? "Compte desactive"
            : "Aucun compte lie",
    role: currentRole ?? readDisabledRole(authUser?.app_metadata) ?? null,
    passwordChangeRequired: hasPasswordChangeRequired(authUser),
    activationDate:
      authUser?.email_confirmed_at ?? authUser?.confirmed_at ?? null,
    lastSignInAt: authUser?.last_sign_in_at ?? null,
    availableActions: {
      resetPassword: Boolean(accountExists && email),
      sendResetLink: Boolean(authUser && email),
      resendInvitation: Boolean(email && (!authUser || !activated)),
      disableAccount: Boolean(authUser && !accessDisabled && currentRole),
      reactivateAccount: Boolean(authUser && (accessDisabled || !currentRole)),
    },
    companyDirectoryContext: getCompanyDirectoryContext(employee.primary_company),
  };
}

function parseAction(value: unknown): AccountSecurityAction | null {
  if (
    value === "reset_password" ||
    value === "send_reset_link" ||
    value === "resend_invitation" ||
    value === "disable_account" ||
    value === "reactivate_account"
  ) {
    return value;
  }

  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getStrictDirectionRequestUser(req);

    if (!user || role !== "direction") {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const { id } = await params;
    const employeeId = Number(id);

    if (!Number.isFinite(employeeId)) {
      return NextResponse.json(
        { error: "Identifiant employe invalide." },
        { status: 400 }
      );
    }

    const employee = await loadEmployee(employeeId);

    if (!employee) {
      return NextResponse.json({ error: "Employe introuvable." }, { status: 404 });
    }

    const authUser = await resolveAuthUser(employee);

    return NextResponse.json({
      security: buildAccountSecuritySnapshot(employee, authUser),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur de chargement du compte employe.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getStrictDirectionRequestUser(req);

    if (!user || role !== "direction") {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const { id } = await params;
    const employeeId = Number(id);

    if (!Number.isFinite(employeeId)) {
      return NextResponse.json(
        { error: "Identifiant employe invalide." },
        { status: 400 }
      );
    }

    const body = (await req.json()) as { action?: unknown };
    const action = parseAction(body.action);

    if (!action) {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }

    const employee = await loadEmployee(employeeId);

    if (!employee) {
      return NextResponse.json({ error: "Employe introuvable." }, { status: 404 });
    }

    let authUser = await resolveAuthUser(employee);
    const email = normalizeEmail(authUser?.email ?? employee.courriel);
    const adminSupabase = createAdminSupabaseClient();
    const publicSupabase = createPublicServerSupabaseClient();
    const occurredAt = new Date().toISOString();
    let successMessage = "";
    const hadExistingAuthUser = Boolean(authUser);

    if (action === "reset_password" || action === "send_reset_link") {
      if (!authUser || !email) {
        return NextResponse.json(
          { error: "Aucun compte actif n est lie a cette fiche employe." },
          { status: 409 }
        );
      }

      if (action === "reset_password") {
        const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
          authUser.id,
          {
            app_metadata: {
              ...authUser.app_metadata,
              ...buildRequiredPasswordMetadata(authUser.app_metadata),
            },
            user_metadata: {
              ...authUser.user_metadata,
              ...buildRequiredPasswordMetadata(authUser.user_metadata),
            },
          }
        );

        if (updateError) {
          throw updateError;
        }
      }

      const { error: resetError } = await publicSupabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: buildRecoveryRedirect(req, getRestorableRole(authUser)),
        }
      );

      if (resetError) {
        throw resetError;
      }

      await syncEmployeeAuthLink(employee.id, authUser.id);

      console.info("[employee-account-security] password_email_sent", {
        action,
        actorUserId: user.id,
        employeeId: employee.id,
        targetUserId: authUser.id,
        email,
      });

      successMessage =
        action === "reset_password"
          ? `Reinitialisation declenchee. Le lien a ete envoye a ${email}.`
          : `Lien de reinitialisation envoye a ${email}.`;
    }

    if (action === "resend_invitation") {
      if (!email) {
        return NextResponse.json(
          { error: "Ajoutez un courriel a la fiche employe avant l invitation." },
          { status: 400 }
        );
      }

      const invitation = buildInvitationPayload(employee, authUser);
      const { data, error } = await adminSupabase.auth.admin.inviteUserByEmail(
        invitation.email,
        invitation.options
      );

      if (error) {
        throw error;
      }

      if (data.user?.id) {
        await syncEmployeeAuthLink(employee.id, data.user.id);
      }

      authUser =
        data.user ??
        authUser ??
        (await findAuthUserByEmail(normalizeEmail(invitation.email)));

      console.info("[employee-account-security] invitation_sent", {
        actorUserId: user.id,
        employeeId: employee.id,
        targetUserId: authUser?.id ?? null,
        email: invitation.email,
        existingAccount: hadExistingAuthUser,
      });

      successMessage = hadExistingAuthUser
        ? `Invitation renvoyee a ${invitation.email}.`
        : `Invitation creee et envoyee a ${invitation.email}.`;
    }

    if (action === "disable_account") {
      if (!authUser) {
        return NextResponse.json(
          { error: "Aucun compte associe n a ete trouve." },
          { status: 404 }
        );
      }

      const { error } = await adminSupabase.auth.admin.updateUserById(authUser.id, {
        app_metadata: buildDisabledMetadata(
          authUser.app_metadata,
          authUser,
          user.id,
          occurredAt
        ),
        user_metadata: buildDisabledMetadata(
          authUser.user_metadata,
          authUser,
          user.id,
          occurredAt
        ),
      });

      if (error) {
        throw error;
      }

      console.info("[employee-account-security] access_disabled", {
        actorUserId: user.id,
        employeeId: employee.id,
        targetUserId: authUser.id,
        email,
      });

      successMessage = `Acces desactive pour ${email ?? "ce compte"}.`;
    }

    if (action === "reactivate_account") {
      if (!authUser) {
        return NextResponse.json(
          { error: "Aucun compte associe n a ete trouve." },
          { status: 404 }
        );
      }

      const { error } = await adminSupabase.auth.admin.updateUserById(authUser.id, {
        app_metadata: buildReactivatedMetadata(
          authUser.app_metadata,
          authUser,
          user.id,
          occurredAt
        ),
        user_metadata: buildReactivatedMetadata(
          authUser.user_metadata,
          authUser,
          user.id,
          occurredAt
        ),
      });

      if (error) {
        throw error;
      }

      await syncEmployeeAuthLink(employee.id, authUser.id);

      console.info("[employee-account-security] access_reactivated", {
        actorUserId: user.id,
        employeeId: employee.id,
        targetUserId: authUser.id,
        email,
      });

      successMessage = `Acces reactive pour ${email ?? "ce compte"}.`;
    }

    authUser = await resolveAuthUser(employee);

    return NextResponse.json({
      success: true,
      message: successMessage,
      security: buildAccountSecuritySnapshot(employee, authUser),
    });
  } catch (error) {
    console.error("[employee-account-security] unexpected_error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur de gestion du compte employe.",
      },
      { status: 500 }
    );
  }
}

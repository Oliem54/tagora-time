import { NextRequest, NextResponse } from "next/server";
import {
  getAccountRequestsRequestDebug,
  getStrictDirectionRequestUser,
} from "@/app/lib/account-requests.server";
import {
  buildRequiredPasswordMetadata,
  getPasswordPolicyMessage,
  validatePasswordStrength,
} from "@/app/lib/auth/passwords";
import { getUserRole, type AppRole } from "@/app/lib/auth/roles";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { createPublicServerSupabaseClient } from "@/app/lib/supabase/server";
import { normalizeEmail, type AccountRequestRow } from "@/app/lib/account-requests.shared";

type AccountSecurityAction =
  | "reset_password"
  | "send_reset_link"
  | "set_temporary_password";

function parseAction(value: unknown): AccountSecurityAction | null {
  if (
    value === "reset_password" ||
    value === "send_reset_link" ||
    value === "set_temporary_password"
  ) {
    return value;
  }
  return null;
}

async function findAuthUserByEmail(email: string) {
  const supabase = createAdminSupabaseClient();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const matchedUser = data.users.find(
      (item) => item.email?.toLowerCase() === email.toLowerCase()
    );
    if (matchedUser) return matchedUser;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function loadRequestRow(id: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("account_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<AccountRequestRow>();

  if (error) throw error;
  return data;
}

async function resolveAuthUserForRequest(row: AccountRequestRow) {
  const supabase = createAdminSupabaseClient();

  if (row.invited_user_id) {
    const { data, error } = await supabase.auth.admin.getUserById(row.invited_user_id);
    if (!error && data.user) return data.user;
  }

  const byCurrentEmail = await findAuthUserByEmail(normalizeEmail(row.email));
  if (byCurrentEmail) return byCurrentEmail;

  return null;
}

function buildRecoveryRedirect(req: NextRequest, role: AppRole) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
  return `${base}/auth/nouveau-mot-de-passe?role=${role}&mode=recovery`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requestDebug = getAccountRequestsRequestDebug(req);
    if (!requestDebug.hasClientMarker) {
      return NextResponse.json(
        {
          error:
            "Appel refuse: la route n accepte que les appels marques depuis le navigateur authentifie.",
        },
        { status: 400 }
      );
    }

    const { user, role, mfaError } = await getStrictDirectionRequestUser(req);
    if (mfaError) return mfaError;

    if (!user || role !== "admin") {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json()) as { action?: unknown; password?: unknown };
    const action = parseAction(body.action);

    if (!action) {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }

    const requestRow = await loadRequestRow(id);
    if (!requestRow) {
      return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
    }

    const authUser = await resolveAuthUserForRequest(requestRow);
    const email = normalizeEmail(authUser?.email ?? requestRow.email);

    if (!authUser || !email) {
      return NextResponse.json(
        {
          error:
            "Aucun compte Auth lie a cette demande. Approuvez la demande ou creez le compte avant de gerer le mot de passe.",
        },
        { status: 409 }
      );
    }

    const adminSupabase = createAdminSupabaseClient();
    const publicSupabase = createPublicServerSupabaseClient();
    let successMessage = "";

    if (action === "set_temporary_password") {
      const password =
        typeof body.password === "string" ? body.password : "";
      const validationError = validatePasswordStrength(password);

      if (validationError) {
        return NextResponse.json(
          { error: validationError, policy: getPasswordPolicyMessage() },
          { status: 400 }
        );
      }

      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
        authUser.id,
        {
          password,
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

      console.info("[account-requests][account-security] temporary_password_set", {
        action,
        actorUserId: user.id,
        requestId: requestRow.id,
        targetUserId: authUser.id,
      });

      successMessage =
        "Mot de passe temporaire defini. L utilisateur devra le changer a la prochaine connexion.";
    }

    if (action === "reset_password" || action === "send_reset_link") {
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

        if (updateError) throw updateError;
      }

      const targetRole = getUserRole(authUser) ?? "employe";
      const { error: resetError } = await publicSupabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: buildRecoveryRedirect(req, targetRole) }
      );

      if (resetError) throw resetError;

      console.info("[account-requests][account-security] password_email_sent", {
        action,
        actorUserId: user.id,
        requestId: requestRow.id,
        targetUserId: authUser.id,
        email,
      });

      successMessage =
        action === "reset_password"
          ? `Reinitialisation declenchee. Le lien a ete envoye a ${email}.`
          : `Lien de reinitialisation envoye a ${email}.`;
    }

    return NextResponse.json({ success: true, message: successMessage });
  } catch (error) {
    console.error("[account-requests][account-security] unexpected_error", {
      message: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur de gestion du mot de passe.",
      },
      { status: 500 }
    );
  }
}

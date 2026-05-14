import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { isValidEmail, normalizeEmail, normalizeCompany } from "@/app/lib/account-requests.shared";
import { getStrictDirectionRequestUser } from "@/app/lib/account-requests.server";
import { normalizePermissionList, type AppPermission } from "@/app/lib/auth/permissions";
import { getUserRole } from "@/app/lib/auth/roles";
import {
  applyChauffeurInvitationAudit,
  buildDisabledPortalMetadata,
  buildEmployeeInviteUserByEmailPayload,
  buildEmployeePortalAuthMetadata,
  deriveInvitationStatusAfterSuccess,
  findAuthUserByEmailForPortalInvite,
  type ChauffeurInviteRow,
  type PortalInviteRole,
  hasUserActivatedAccessForPortal,
  readAccessDisabledForPortal,
  resolveAuthUserForEmployeeRow,
  shouldRequirePasswordChangeForPortal,
  syncEmployeeAuthLink,
} from "@/app/lib/employee-portal-invite.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type InviteAction = "invite" | "link" | "resend" | "disable_access";

function jsonErr(status: number, error: string, code?: string) {
  return NextResponse.json({ success: false, error, ...(code ? { code } : {}) }, { status });
}

function parseAction(value: unknown): InviteAction | null {
  if (value === "invite" || value === "link" || value === "resend" || value === "disable_access") {
    return value;
  }
  return null;
}

/** Rôle portail brut (app puis user metadata) — distingue manager de direction, contrairement à getUserRole. */
function authUserHasProtectedPortalRole(user: User): boolean {
  const raw = (slot: unknown) =>
    typeof slot === "string" ? slot.trim().toLowerCase() : "";
  const fromApp = raw(user.app_metadata?.role);
  if (fromApp === "admin" || fromApp === "manager") {
    return true;
  }
  const fromUser = raw(user.user_metadata?.role);
  return fromUser === "admin" || fromUser === "manager";
}

function parsePortalRole(
  value: unknown,
  actorAppRole: "direction" | "admin"
): PortalInviteRole | null {
  if (value !== "employe" && value !== "direction" && value !== "manager" && value !== "admin") {
    return null;
  }
  if (actorAppRole === "direction") {
    if (value === "admin" || value === "manager") {
      return null;
    }
    return value as PortalInviteRole;
  }
  return value as PortalInviteRole;
}

async function loadEmployeeRow(id: number) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.from("chauffeurs").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown> | null;
}

function rowToInviteShape(row: Record<string, unknown>): ChauffeurInviteRow {
  return {
    id: Number(row.id),
    auth_user_id: typeof row.auth_user_id === "string" ? row.auth_user_id : null,
    nom: typeof row.nom === "string" ? row.nom : null,
    courriel: typeof row.courriel === "string" ? row.courriel : null,
    primary_company: normalizeCompany(row.primary_company),
  };
}

async function assertEmailNotUsedByOtherChauffeur(
  employeeId: number,
  normalizedEmail: string
) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("chauffeurs")
    .select("id")
    .eq("courriel", normalizedEmail)
    .neq("id", employeeId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data?.id) {
    return {
      ok: false as const,
      error: "Ce courriel est deja utilise sur une autre fiche employe.",
    };
  }

  return { ok: true as const };
}

async function assertAuthUserNotLinkedToOtherChauffeur(employeeId: number, authUserId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("chauffeurs")
    .select("id")
    .eq("auth_user_id", authUserId)
    .neq("id", employeeId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data?.id) {
    return {
      ok: false as const,
      error: "Ce courriel est deja lie a un autre employe.",
    };
  }

  return { ok: true as const };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const employeeId = Number.parseInt(rawId, 10);
  if (!Number.isFinite(employeeId) || employeeId < 1) {
    return jsonErr(400, "Identifiant employe invalide.");
  }

  const { user: actor, role: actorRole, mfaError } = await getStrictDirectionRequestUser(req);
  if (mfaError) {
    return mfaError;
  }

  if (!actor || (actorRole !== "direction" && actorRole !== "admin")) {
    return jsonErr(403, "Acces refuse.");
  }

  const actorAppRole = actorRole === "admin" ? ("admin" as const) : ("direction" as const);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr(400, "Corps JSON invalide.");
  }

  const action = parseAction(body.action);
  if (!action) {
    return jsonErr(400, "Action invalide.");
  }

  const permissions = normalizePermissionList(body.permissions) as AppPermission[];

  const row = await loadEmployeeRow(employeeId);
  if (!row) {
    return jsonErr(404, "Employe introuvable.");
  }

  const employee = rowToInviteShape(row);
  const normalizedEmail = normalizeEmail(employee.courriel);

  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    return jsonErr(400, "Ajoutez un courriel valide sur la fiche employe avant d inviter.");
  }

  const emailCheck = await assertEmailNotUsedByOtherChauffeur(employeeId, normalizedEmail);
  if (!emailCheck.ok) {
    return jsonErr(409, emailCheck.error, "email_used_other_profile");
  }

  const supabase = createAdminSupabaseClient();
  const occurredAt = new Date().toISOString();
  const actorName = actor.email ?? actor.id;

  const markAudit = async (status: string, err: string | null) => {
    await applyChauffeurInvitationAudit(employeeId, {
      account_invited_at: occurredAt,
      account_invited_by_user_id: actor.id,
      account_invited_by_name: actorName,
      account_invitation_status: status,
      account_invitation_error: err,
    });
  };

  try {
    if (action === "disable_access") {
      const authUser = await resolveAuthUserForEmployeeRow(employee);
      if (!authUser) {
        await markAudit("error", "Aucun compte a desactiver.");
        return jsonErr(404, "Aucun compte associe a desactiver.");
      }

      const targetRole = getUserRole(authUser);
      if (actorAppRole === "direction" && targetRole === "admin") {
        await markAudit("error", "Desactivation reservee aux administrateurs pour ce compte.");
        return jsonErr(403, "Desactivation reservee aux administrateurs pour ce compte.");
      }

      const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
        app_metadata: buildDisabledPortalMetadata(
          authUser.app_metadata,
          authUser,
          actor.id,
          occurredAt
        ),
        user_metadata: buildDisabledPortalMetadata(
          authUser.user_metadata,
          authUser,
          actor.id,
          occurredAt
        ),
      });

      if (error) {
        await markAudit("error", error.message);
        return jsonErr(500, error.message);
      }

      await markAudit("disabled", null);
      return NextResponse.json({
        success: true,
        message: "Acces desactive.",
        status: "disabled",
      });
    }

    let portalRole: PortalInviteRole;
    if (action === "resend") {
      const authPreview = await resolveAuthUserForEmployeeRow(employee);
      const targetRolePreview = getUserRole(authPreview);
      if (actorAppRole === "direction" && targetRolePreview === "admin") {
        return jsonErr(403, "Action reservee aux administrateurs pour ce compte.");
      }

      const explicit = parsePortalRole(body.portalRole, actorAppRole);
      if (explicit) {
        portalRole = explicit;
      } else {
        const raw =
          authPreview?.app_metadata?.role ??
          authPreview?.user_metadata?.role ??
          "employe";
        const parsed = parsePortalRole(raw, actorAppRole);
        portalRole = parsed ?? ("employe" as PortalInviteRole);
      }
    } else {
      const parsed = parsePortalRole(body.portalRole, actorAppRole);
      if (!parsed) {
        return jsonErr(400, "Role portail invalide ou non autorise pour votre compte.");
      }
      portalRole = parsed;
    }

    const hadAuthId = Boolean(employee.auth_user_id);
    const authById =
      employee.auth_user_id != null
        ? (await supabase.auth.admin.getUserById(employee.auth_user_id)).data.user ?? null
        : null;

    if (action === "invite" || action === "link") {
      if (employee.auth_user_id) {
        if (!authById) {
          return jsonErr(
            409,
            "La fiche contient un lien compte invalide ou obsolete. Contactez un administrateur."
          );
        }
        return jsonErr(409, "Cet employe est deja lie a un compte utilisateur.");
      }
    }

    const authByEmail = await findAuthUserByEmailForPortalInvite(normalizedEmail);

    if (action === "invite") {
      if (authByEmail) {
        await markAudit(
          "error",
          "Un compte existe deja pour ce courriel. Utilisez l action Lier a un compte existant."
        );
        return jsonErr(
          409,
          "Un compte existe deja pour ce courriel. Utilisez « Lier a un compte existant ».",
          "auth_exists_use_link"
        );
      }

      const payload = buildEmployeeInviteUserByEmailPayload(employee, portalRole, permissions);
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        payload.email,
        payload.options
      );

      if (error) {
        await markAudit("error", error.message);
        return jsonErr(500, error.message);
      }

      const newUser = data.user;
      if (newUser?.id) {
        const meta = buildEmployeePortalAuthMetadata({
          employee,
          portalRole,
          permissions,
          actorUserId: actor.id,
          existingApp: (newUser.app_metadata ?? {}) as Record<string, unknown>,
          existingUser: (newUser.user_metadata ?? {}) as Record<string, unknown>,
          requirePasswordChange: shouldRequirePasswordChangeForPortal(newUser),
        });
        await supabase.auth.admin.updateUserById(newUser.id, {
          app_metadata: meta.appMetadata as Record<string, unknown>,
          user_metadata: meta.userMetadata as Record<string, unknown>,
        });
        await syncEmployeeAuthLink(employeeId, newUser.id);
      }

      const resolved = newUser ?? (await findAuthUserByEmailForPortalInvite(normalizedEmail));
      const nextStatus = deriveInvitationStatusAfterSuccess(resolved, hadAuthId);
      await markAudit(nextStatus, null);

      return NextResponse.json({
        success: true,
        message: "Invitation envoyee.",
        status: nextStatus,
        authUserId: resolved?.id ?? null,
      });
    }

    if (action === "link") {
      if (!authByEmail) {
        await markAudit("error", "Aucun compte Auth trouve pour ce courriel.");
        return jsonErr(404, "Aucun compte Auth trouve pour ce courriel. Utilisez Inviter.");
      }

      if (actorAppRole === "direction" && authUserHasProtectedPortalRole(authByEmail)) {
        const msg =
          "Ce compte possède un rôle protégé et ne peut pas être lié par un utilisateur direction.";
        await markAudit("error", msg);
        return jsonErr(403, msg, "protected_role_link_forbidden");
      }

      const linkCheck = await assertAuthUserNotLinkedToOtherChauffeur(employeeId, authByEmail.id);
      if (!linkCheck.ok) {
        await markAudit("error", linkCheck.error);
        return jsonErr(409, linkCheck.error, "auth_linked_other_employee");
      }

      const requirePwd = shouldRequirePasswordChangeForPortal(authByEmail);
      const meta = buildEmployeePortalAuthMetadata({
        employee,
        portalRole,
        permissions,
        actorUserId: actor.id,
        existingApp: (authByEmail.app_metadata ?? {}) as Record<string, unknown>,
        existingUser: (authByEmail.user_metadata ?? {}) as Record<string, unknown>,
        requirePasswordChange: requirePwd,
      });

      const { error: updErr } = await supabase.auth.admin.updateUserById(authByEmail.id, {
        app_metadata: meta.appMetadata as Record<string, unknown>,
        user_metadata: meta.userMetadata as Record<string, unknown>,
      });

      if (updErr) {
        await markAudit("error", updErr.message);
        return jsonErr(500, updErr.message);
      }

      await syncEmployeeAuthLink(employeeId, authByEmail.id);

      const refreshed = (await supabase.auth.admin.getUserById(authByEmail.id)).data.user ?? null;
      const nextStatus = deriveInvitationStatusAfterSuccess(refreshed as User | null, hadAuthId);
      await markAudit(nextStatus === "active" ? "active" : "linked", null);

      return NextResponse.json({
        success: true,
        message: "Compte lie a la fiche employe.",
        status: nextStatus,
        authUserId: authByEmail.id,
      });
    }

    if (action === "resend") {
      if (!authByEmail) {
        await markAudit("error", "Aucun compte Auth pour renvoyer l invitation.");
        return jsonErr(404, "Aucun compte Auth trouve pour ce courriel.");
      }

      const activated = hasUserActivatedAccessForPortal(authByEmail);
      if (activated && !readAccessDisabledForPortal(authByEmail)) {
        return jsonErr(409, "Le compte est deja actif. Le renvoi d invitation n est pas necessaire.");
      }

      const payload = buildEmployeeInviteUserByEmailPayload(employee, portalRole, permissions);
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        payload.email,
        payload.options
      );

      if (error) {
        await markAudit("error", error.message);
        return jsonErr(500, error.message);
      }

      const newUser = data.user ?? authByEmail;
      if (newUser?.id) {
        const meta = buildEmployeePortalAuthMetadata({
          employee,
          portalRole,
          permissions,
          actorUserId: actor.id,
          existingApp: (newUser.app_metadata ?? {}) as Record<string, unknown>,
          existingUser: (newUser.user_metadata ?? {}) as Record<string, unknown>,
          requirePasswordChange: shouldRequirePasswordChangeForPortal(newUser as User),
        });
        await supabase.auth.admin.updateUserById(newUser.id, {
          app_metadata: meta.appMetadata as Record<string, unknown>,
          user_metadata: meta.userMetadata as Record<string, unknown>,
        });
        await syncEmployeeAuthLink(employeeId, newUser.id);
      }

      const resolved =
        (data.user as User | undefined) ??
        (await findAuthUserByEmailForPortalInvite(normalizedEmail));
      const nextStatus = deriveInvitationStatusAfterSuccess(resolved, hadAuthId);
      await markAudit(nextStatus, null);

      return NextResponse.json({
        success: true,
        message: "Invitation renvoyee.",
        status: nextStatus,
        authUserId: resolved?.id ?? null,
      });
    }

    return jsonErr(400, "Action non reconnue.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inattendue.";
    await applyChauffeurInvitationAudit(employeeId, {
      account_invited_at: occurredAt,
      account_invited_by_user_id: actor.id,
      account_invited_by_name: actorName,
      account_invitation_status: "error",
      account_invitation_error: msg,
    });
    console.error("[invite-account]", e);
    return jsonErr(500, msg);
  }
}

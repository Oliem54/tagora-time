import "server-only";

import { getUserRole } from "@/app/lib/auth/roles";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  applyChauffeurInvitationAudit,
  buildDisabledPortalMetadata,
  readAccessDisabledForPortal,
} from "@/app/lib/employee-portal-invite.server";

export const DISSOCIATE_PORTAL_SUCCESS_MESSAGE =
  "Le portail a été dissocié. La fiche employé existe toujours. Le compte utilisateur n'a pas été supprimé.";

export type DissociatePortalInput = {
  chauffeurId?: number | null;
  authUserId?: string | null;
  actorUserId: string;
  actorAppRole: "direction" | "admin";
  actorName: string;
};

type DissociatePortalFailure = {
  ok: false;
  status: number;
  error: string;
};

type DissociatePortalSuccess = {
  ok: true;
  message: string;
  employeeName: string;
  email: string | null;
  chauffeurId: number | null;
  authUserId: string | null;
};

function readAdminRoleFromUser(user: {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const raw =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role
      : typeof user.user_metadata?.role === "string"
        ? user.user_metadata.role
        : null;
  return raw;
}

async function assertNotLastActiveAdmin(authUserId: string) {
  const supabase = createAdminSupabaseClient();
  const { data: targetData, error: targetError } = await supabase.auth.admin.getUserById(authUserId);

  if (targetError || !targetData.user) {
    return { ok: true as const };
  }

  const user = targetData.user;
  if (readAccessDisabledForPortal(user)) {
    return { ok: true as const };
  }

  const currentRole = getUserRole(user);
  const currentRoleRaw = readAdminRoleFromUser(user);
  if (currentRole !== "admin" && currentRoleRaw !== "admin") {
    return { ok: true as const };
  }

  const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    return {
      ok: false as const,
      status: 500,
      error: "Impossible de vérifier les administrateurs actifs.",
    };
  }

  const adminCount = (usersPage.users ?? []).filter((item) => {
    const roleValue = readAdminRoleFromUser(item);
    return roleValue === "admin";
  }).length;

  if (adminCount <= 1) {
    return {
      ok: false as const,
      status: 409,
      error: "Impossible de dissocier le portail : dernier administrateur actif.",
    };
  }

  return { ok: true as const };
}

export async function dissociateEmployeePortal(
  input: DissociatePortalInput
): Promise<DissociatePortalSuccess | DissociatePortalFailure> {
  const chauffeurId =
    typeof input.chauffeurId === "number" && Number.isFinite(input.chauffeurId) && input.chauffeurId > 0
      ? input.chauffeurId
      : null;
  const authUserId =
    typeof input.authUserId === "string" && input.authUserId.trim().length > 0
      ? input.authUserId.trim()
      : null;

  if (!chauffeurId && !authUserId) {
    return {
      ok: false,
      status: 400,
      error: "Identifiant employé ou compte portail requis pour dissocier.",
    };
  }

  const supabase = createAdminSupabaseClient();
  const occurredAt = new Date().toISOString();

  let resolvedChauffeurId = chauffeurId;
  let resolvedAuthUserId = authUserId;
  let employeeName = "Employé";
  let email: string | null = null;

  if (resolvedChauffeurId) {
    const { data: chauffeurRow, error: chauffeurError } = await supabase
      .from("chauffeurs")
      .select("id, nom, courriel, auth_user_id")
      .eq("id", resolvedChauffeurId)
      .maybeSingle();

    if (chauffeurError) {
      return { ok: false, status: 500, error: chauffeurError.message };
    }

    if (!chauffeurRow) {
      return { ok: false, status: 404, error: "Fiche employé introuvable." };
    }

    employeeName = typeof chauffeurRow.nom === "string" ? chauffeurRow.nom : employeeName;
    email = typeof chauffeurRow.courriel === "string" ? chauffeurRow.courriel : null;

    const profileAuthUserId =
      typeof chauffeurRow.auth_user_id === "string" ? chauffeurRow.auth_user_id.trim() : null;

    if (!resolvedAuthUserId && profileAuthUserId) {
      resolvedAuthUserId = profileAuthUserId;
    }
  }

  if (!resolvedAuthUserId && resolvedChauffeurId) {
    return {
      ok: false,
      status: 409,
      error: "Aucun compte portail lié à dissocier pour cette fiche employé.",
    };
  }

  if (resolvedAuthUserId && !resolvedChauffeurId) {
    const { data: linkedProfile, error: linkedProfileError } = await supabase
      .from("chauffeurs")
      .select("id, nom, courriel")
      .eq("auth_user_id", resolvedAuthUserId)
      .limit(1)
      .maybeSingle();

    if (linkedProfileError) {
      return { ok: false, status: 500, error: linkedProfileError.message };
    }

    if (linkedProfile?.id) {
      resolvedChauffeurId = Number(linkedProfile.id);
      employeeName = typeof linkedProfile.nom === "string" ? linkedProfile.nom : employeeName;
      email = typeof linkedProfile.courriel === "string" ? linkedProfile.courriel : email;
    }
  }

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(resolvedAuthUserId!);
  if (authError || !authData.user) {
    if (resolvedChauffeurId) {
      const { error: clearError } = await supabase
        .from("chauffeurs")
        .update({ auth_user_id: null })
        .eq("id", resolvedChauffeurId);

      if (clearError) {
        return { ok: false, status: 500, error: clearError.message };
      }

      await applyChauffeurInvitationAudit(resolvedChauffeurId, {
        account_invited_at: occurredAt,
        account_invited_by_user_id: input.actorUserId,
        account_invited_by_name: input.actorName,
        account_invitation_status: "dissociated",
        account_invitation_error: "Compte auth introuvable — lien fiche retiré.",
      });

      return {
        ok: true,
        message: DISSOCIATE_PORTAL_SUCCESS_MESSAGE,
        employeeName,
        email,
        chauffeurId: resolvedChauffeurId,
        authUserId: resolvedAuthUserId,
      };
    }

    return { ok: false, status: 404, error: "Compte portail introuvable." };
  }

  const authUser = authData.user;
  email = email ?? authUser.email ?? null;

  const targetRole = getUserRole(authUser);
  if (input.actorAppRole === "direction" && targetRole === "admin") {
    return {
      ok: false,
      status: 403,
      error: "Dissociation réservée aux administrateurs pour ce compte.",
    };
  }

  const lastAdminCheck = await assertNotLastActiveAdmin(authUser.id);
  if (!lastAdminCheck.ok) {
    return lastAdminCheck;
  }

  const { error: authUpdateError } = await supabase.auth.admin.updateUserById(authUser.id, {
    app_metadata: {
      ...buildDisabledPortalMetadata(
        authUser.app_metadata,
        authUser,
        input.actorUserId,
        occurredAt
      ),
      chauffeur_id: null,
    },
    user_metadata: {
      ...buildDisabledPortalMetadata(
        authUser.user_metadata,
        authUser,
        input.actorUserId,
        occurredAt
      ),
      chauffeur_id: null,
    },
  });

  if (authUpdateError) {
    return { ok: false, status: 500, error: authUpdateError.message };
  }

  if (resolvedChauffeurId) {
    const { error: clearLinkError } = await supabase
      .from("chauffeurs")
      .update({ auth_user_id: null })
      .eq("id", resolvedChauffeurId);

    if (clearLinkError) {
      return { ok: false, status: 500, error: clearLinkError.message };
    }

    await applyChauffeurInvitationAudit(resolvedChauffeurId, {
      account_invited_at: occurredAt,
      account_invited_by_user_id: input.actorUserId,
      account_invited_by_name: input.actorName,
      account_invitation_status: "dissociated",
      account_invitation_error: null,
    });
  }

  return {
    ok: true,
    message: DISSOCIATE_PORTAL_SUCCESS_MESSAGE,
    employeeName,
    email,
    chauffeurId: resolvedChauffeurId,
    authUserId: authUser.id,
  };
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { isProcessLocalNexusFixtureEnabled } from "@/app/lib/auth/horora-local-nexus-fixture";
import {
  decideHororaMembershipChange,
  type HororaMembershipChangeDenial,
  type HororaMembershipSnapshot,
} from "@/app/lib/auth/horora-premium-user-central.shared";
import { recordedRoleSecondarySyncPending } from "@/app/lib/employee-role-audit-commit.shared";
import { commitAuditedOrganizationRole } from "@/app/lib/employee-onboarding-tenant.server";
import { isOrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DENIAL_STATUS: Record<HororaMembershipChangeDenial, number> = {
  writer_not_connected: 409,
  system_role_protected: 403,
  self_change_forbidden: 403,
  last_owner_protected: 409,
  cross_organization_forbidden: 403,
  nexus_role_cannot_grant_admin: 403,
  actor_forbidden: 403,
  direction_assignment_unauthorized: 403,
};

const DENIAL_MESSAGE: Record<HororaMembershipChangeDenial, string> = {
  writer_not_connected:
    "Aucun écrivain audité ne couvre ce changement de statut. Rien n'a été modifié.",
  system_role_protected: "Ce rôle système reste protégé. Rien n'a été modifié.",
  self_change_forbidden: "Vous ne pouvez pas modifier votre propre rôle.",
  last_owner_protected:
    "L'organisation doit conserver au moins un propriétaire actif. Rien n'a été modifié.",
  cross_organization_forbidden: "Le compte appartient à une autre organisation.",
  nexus_role_cannot_grant_admin:
    "Un rôle Nexus ne crée pas un administrateur HORORA. Rien n'a été modifié.",
  actor_forbidden: "Cette appartenance ne peut pas changer un rôle.",
  direction_assignment_unauthorized:
    "L'attribution ou le retrait du rôle Direction exige un propriétaire ou un administrateur d'organisation.",
};

function jsonError(status: number, error: string, code: string) {
  return NextResponse.json(
    { success: false, error, code, rolePersisted: false, audited: false },
    { status }
  );
}

/**
 * Assigns employe or direction through the existing audited membership writer.
 * Does not create a role, does not edit the permission catalogue, and does not
 * treat a Nexus role as a HORORA administrator.
 */
export async function POST(req: NextRequest) {
  try {
    if (isProcessLocalNexusFixtureEnabled(req.nextUrl.hostname)) {
      return jsonError(403, DENIAL_MESSAGE.writer_not_connected, "writer_not_connected");
    }

    const authenticated = await getAuthenticatedRequestUser(req);
    if (!authenticated.user) return jsonError(401, "Non authentifié.", "unauthenticated");
    if (
      !authenticated.organizationId ||
      !authenticated.membershipId ||
      !isOrganizationMembershipRole(authenticated.membershipRole)
    ) {
      return jsonError(403, DENIAL_MESSAGE.actor_forbidden, "actor_forbidden");
    }

    const body = (await req.json().catch(() => null)) as {
      membershipId?: unknown;
      nextRole?: unknown;
    } | null;
    const membershipId = typeof body?.membershipId === "string" ? body.membershipId : "";
    const nextRole = body?.nextRole;
    if (!membershipId || (nextRole !== "employe" && nextRole !== "direction")) {
      return jsonError(400, "Rôle ou appartenance invalide.", "invalid_membership_change");
    }

    const supabase = createAdminSupabaseClient();
    const membershipResult = await supabase
      .from("organization_memberships")
      .select("id, user_id, role, status")
      .eq("organization_id", authenticated.organizationId);
    if (membershipResult.error) {
      return jsonError(500, "Chargement impossible.", "membership_read_failed");
    }

    const memberships: HororaMembershipSnapshot[] = [];
    let target: { id: string; userId: string; role: HororaMembershipSnapshot["role"]; status: HororaMembershipSnapshot["status"] } | null =
      null;
    for (const row of membershipResult.data ?? []) {
      const status = row.status;
      const role = String(row.role ?? "");
      if (
        (status !== "active" && status !== "suspended" && status !== "invited") ||
        !isOrganizationMembershipRole(role) ||
        typeof row.id !== "string" ||
        typeof row.user_id !== "string"
      ) {
        continue;
      }
      memberships.push({ id: row.id, role, status });
      if (row.id === membershipId) {
        target = { id: row.id, userId: row.user_id, role, status };
      }
    }
    if (!target) {
      return jsonError(404, "Appartenance introuvable dans cette organisation.", "target_missing");
    }

    const decision = decideHororaMembershipChange({
      actorMembershipId: authenticated.membershipId,
      actorRole: authenticated.membershipRole,
      actorOrganizationId: authenticated.organizationId,
      targetMembershipId: target.id,
      targetOrganizationId: authenticated.organizationId,
      targetRole: target.role,
      targetStatus: target.status,
      nextRole,
      nextStatus: "active",
      membershipsInOrganization: memberships,
      requestedByNexusRole: false,
    });
    if (!decision.ok) {
      return jsonError(DENIAL_STATUS[decision.reason], DENIAL_MESSAGE[decision.reason], decision.reason);
    }

    const employeeResult = await supabase
      .from("chauffeurs")
      .select("id")
      .eq("organization_id", authenticated.organizationId)
      .eq("auth_user_id", target.userId)
      .limit(1);
    const rawEmployeeId = employeeResult.error ? null : employeeResult.data?.[0]?.id;
    const employeeId =
      typeof rawEmployeeId === "number"
        ? rawEmployeeId
        : typeof rawEmployeeId === "string" && /^\d+$/.test(rawEmployeeId)
          ? Number(rawEmployeeId)
          : null;

    const committed = await commitAuditedOrganizationRole({
      actorUserId: authenticated.user.id,
      actorEmail: null,
      organizationId: authenticated.organizationId,
      targetUserId: target.userId,
      targetEmployeeId: employeeId,
      newRole: nextRole,
      isDefault: false,
      reason: "user_central_membership_role",
    });
    if (!committed.ok) {
      return NextResponse.json(
        {
          success: false,
          error: committed.error,
          code: committed.code,
          rolePersisted: false,
          audited: false,
        },
        { status: committed.status }
      );
    }

    const { data: authData, error: readError } = await supabase.auth.admin.getUserById(target.userId);
    if (readError || !authData.user || authData.user.id !== target.userId) {
      return NextResponse.json(recordedRoleSecondarySyncPending(nextRole), { status: 409 });
    }
    const existing = (authData.user.app_metadata ?? {}) as Record<string, unknown>;
    const { error: updateError } = await supabase.auth.admin.updateUserById(target.userId, {
      app_metadata: { ...existing, role: nextRole },
    });
    if (updateError) {
      if (committed.audited && !committed.unchanged) {
        return NextResponse.json(recordedRoleSecondarySyncPending(nextRole), { status: 409 });
      }
      return NextResponse.json(
        {
          success: false,
          error: "Le rôle d'appartenance est inchangé. L'annonce du rôle de session n'a pas abouti.",
          code: "app_metadata_role_announcement_failed",
          rolePersisted: true,
          audited: committed.audited,
          unchanged: committed.unchanged,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      rolePersisted: true,
      audited: committed.audited,
      unchanged: committed.unchanged,
      role: committed.role,
      writer: decision.writer,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Changement impossible.";
    return jsonError(500, message, "membership_change_failed");
  }
}

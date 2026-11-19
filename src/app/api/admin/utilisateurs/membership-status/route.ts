import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { isProcessLocalNexusFixtureEnabled } from "@/app/lib/auth/horora-local-nexus-fixture";
import { commitAuditedMembershipStatus } from "@/app/lib/auth/horora-membership-status-commit.server";
import {
  decideHororaMembershipChange,
  sessionSurvivesMembershipStatus,
  type HororaMembershipChangeDenial,
  type HororaMembershipSnapshot,
} from "@/app/lib/auth/horora-premium-user-central.shared";
import {
  isOrganizationMembershipRole,
  type OrganizationMembershipRole,
} from "@/app/lib/saas/tenant-foundation.shared";
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
  privilege_escalation_forbidden: 403,
  company_outside_organization: 403,
};

const DENIAL_MESSAGE: Record<HororaMembershipChangeDenial, string> = {
  writer_not_connected: "Ce changement de statut n'est pas couvert. Rien n'a été modifié.",
  system_role_protected: "Ce rôle système reste protégé. Rien n'a été modifié.",
  self_change_forbidden: "Vous ne pouvez pas modifier votre propre accès.",
  last_owner_protected:
    "L'organisation doit conserver au moins un propriétaire actif. Rien n'a été modifié.",
  cross_organization_forbidden: "Le compte appartient à une autre organisation.",
  nexus_role_cannot_grant_admin:
    "Un rôle Nexus ne crée pas un administrateur HORORA. Rien n'a été modifié.",
  actor_forbidden: "Cette appartenance ne peut pas changer un statut.",
  direction_assignment_unauthorized:
    "La Direction ne suspend pas un accès. Rien n'a été modifié.",
  privilege_escalation_forbidden: "Cette permission ne peut pas être accordée.",
  company_outside_organization: "Cette compagnie est hors de votre organisation.",
};

function jsonError(status: number, error: string, code: string) {
  return NextResponse.json(
    { success: false, error, code, statusPersisted: false, audited: false },
    { status }
  );
}

export async function POST(req: NextRequest) {
  try {
    if (isProcessLocalNexusFixtureEnabled(req.nextUrl.hostname)) {
      return jsonError(
        403,
        "La fixture locale n'écrit aucun statut. La fonction Staging n'est pas appelée.",
        "local_fixture_writes_disabled"
      );
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
      nextStatus?: unknown;
      confirmed?: unknown;
    } | null;
    const membershipId = typeof body?.membershipId === "string" ? body.membershipId : "";
    const nextStatus = body?.nextStatus;
    if (
      !membershipId ||
      (nextStatus !== "active" && nextStatus !== "suspended") ||
      body?.confirmed !== true
    ) {
      return jsonError(
        400,
        "Confirmez la suspension ou la réactivation avant d'enregistrer.",
        "confirmation_required"
      );
    }

    const supabase = createAdminSupabaseClient();
    const membershipResult = await supabase
      .from("organization_memberships")
      .select("id, user_id, role, status")
      .eq("organization_id", authenticated.organizationId);
    if (membershipResult.error) {
      return jsonError(500, "Chargement impossible.", "membership_read_failed");
    }

    const memberships: Array<HororaMembershipSnapshot & { userId: string }> = [];
    let target: {
      id: string;
      userId: string;
      role: OrganizationMembershipRole;
      status: HororaMembershipSnapshot["status"];
    } | null = null;
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
      memberships.push({ id: row.id, userId: row.user_id, role, status });
      if (row.id === membershipId) {
        target = { id: row.id, userId: row.user_id, role, status };
      }
    }
    const actorCandidates = memberships.filter(
      (row) => row.userId === authenticated.user.id && row.status === "active"
    );
    const actor = actorCandidates.length === 1 ? actorCandidates[0] : null;
    if (!actor || actor.id !== authenticated.membershipId || actor.role !== authenticated.membershipRole) {
      return jsonError(403, DENIAL_MESSAGE.actor_forbidden, "actor_forbidden");
    }
    if (!target) {
      return jsonError(404, "Appartenance introuvable dans cette organisation.", "target_missing");
    }

    const decision = decideHororaMembershipChange({
      actorMembershipId: actor.id,
      actorRole: actor.role,
      actorOrganizationId: authenticated.organizationId,
      targetMembershipId: target.id,
      targetOrganizationId: authenticated.organizationId,
      targetRole: target.role,
      targetStatus: target.status,
      nextRole: target.role,
      nextStatus,
      membershipsInOrganization: memberships,
      requestedByNexusRole: false,
    });
    if (!decision.ok || decision.writer !== "commit_horora_membership_status_with_audit") {
      const reason = decision.ok ? "writer_not_connected" : decision.reason;
      return jsonError(DENIAL_STATUS[reason], DENIAL_MESSAGE[reason], reason);
    }

    const committed = await commitAuditedMembershipStatus({
      actorUserId: authenticated.user.id,
      organizationId: authenticated.organizationId,
      targetUserId: target.userId,
      nextStatus,
      reason: nextStatus === "suspended" ? "user_central_suspend" : "user_central_reactivate",
    });
    if (!committed.ok) {
      return jsonError(committed.statusCode, committed.error, committed.code);
    }
    if (!committed.unchanged && committed.audited !== true) {
      return jsonError(500, "L'audit du statut n'a pas été écrit.", "audit_write_failed");
    }

    let sessionRevocation: "revoked" | "not_required" | "unavailable" = "not_required";
    if (!sessionSurvivesMembershipStatus(nextStatus) && !committed.unchanged) {
      const revoked = await supabase
        .from("horora_nexus_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("auth_user_id", target.userId)
        .eq("organization_id", authenticated.organizationId)
        .is("revoked_at", null);
      sessionRevocation = revoked.error ? "unavailable" : "revoked";
    }

    return NextResponse.json({
      success: true,
      statusPersisted: true,
      audited: committed.audited,
      unchanged: committed.unchanged,
      status: committed.status,
      writer: decision.writer,
      sessionRevocation,
      access: sessionSurvivesMembershipStatus(committed.status) ? "restored_role" : "denied",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Changement impossible.";
    return jsonError(500, message, "membership_status_failed");
  }
}

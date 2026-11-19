import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { isProcessLocalNexusFixtureEnabled } from "@/app/lib/auth/horora-local-nexus-fixture";
import { commitAuditedPermissionOverride } from "@/app/lib/auth/horora-permission-override.server";
import {
  capabilityForPermissionSection,
  decideHororaPermissionOverride,
  type HororaMembershipChangeDenial,
  type HororaMembershipSnapshot,
} from "@/app/lib/auth/horora-premium-user-central.shared";
import {
  HORORA_ACCESS_CAPABILITIES,
  type HororaAccessCapability,
} from "@/app/lib/auth/horora-role-model.shared";
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

function jsonError(status: number, error: string, code: string) {
  return NextResponse.json(
    { success: false, error, code, permissionPersisted: false, audited: false },
    { status }
  );
}

function isCapability(value: string): value is HororaAccessCapability {
  return (HORORA_ACCESS_CAPABILITIES as readonly string[]).includes(value);
}

export async function POST(req: NextRequest) {
  try {
    if (isProcessLocalNexusFixtureEnabled(req.nextUrl.hostname)) {
      return jsonError(
        403,
        "La fixture locale n'écrit aucune permission. Rien n'a été modifié.",
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
      return jsonError(403, "Cette appartenance ne peut pas changer une permission.", "actor_forbidden");
    }

    const body = (await req.json().catch(() => null)) as {
      membershipId?: unknown;
      capability?: unknown;
      sectionId?: unknown;
      effect?: unknown;
      confirmed?: unknown;
    } | null;
    const membershipId = typeof body?.membershipId === "string" ? body.membershipId : "";
    const rawCapability =
      typeof body?.capability === "string"
        ? body.capability
        : typeof body?.sectionId === "string"
          ? capabilityForPermissionSection(body.sectionId)
          : null;
    const effect = body?.effect;
    if (
      !membershipId ||
      typeof rawCapability !== "string" ||
      !isCapability(rawCapability) ||
      (effect !== "allow" && effect !== "deny") ||
      body?.confirmed !== true
    ) {
      return jsonError(
        400,
        "Confirmez la permission avant d'enregistrer. Rien n'a été modifié.",
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
      if (row.id === membershipId) target = { id: row.id, userId: row.user_id, role, status };
    }
    const actor = memberships.find(
      (row) => row.userId === authenticated.user.id && row.id === authenticated.membershipId
    );
    if (!actor || actor.role !== authenticated.membershipRole || actor.status !== "active") {
      return jsonError(403, "Cette appartenance ne peut pas changer une permission.", "actor_forbidden");
    }
    if (!target) {
      return jsonError(404, "Appartenance introuvable dans cette organisation.", "target_missing");
    }
    if (target.status !== "active") {
      return jsonError(
        409,
        "Une appartenance suspendue ne reçoit pas de permission. Rien n'a été modifié.",
        "membership_not_active"
      );
    }

    const decision = decideHororaPermissionOverride({
      actorRole: actor.role,
      actorOrganizationId: authenticated.organizationId,
      targetOrganizationId: authenticated.organizationId,
      actorMembershipId: actor.id,
      targetMembershipId: target.id,
      targetRole: target.role,
      capability: rawCapability,
      nextEffect: effect,
      requestedByNexusRole: false,
    });
    if (!decision.ok) {
      return jsonError(
        DENIAL_STATUS[decision.reason],
        decision.reason === "privilege_escalation_forbidden"
          ? "Cette case ne peut pas accorder un droit refusé par le rôle. Rien n'a été modifié."
          : "Permission refusée. Rien n'a été modifié.",
        decision.reason
      );
    }

    const committed = await commitAuditedPermissionOverride({
      actorUserId: authenticated.user.id,
      organizationId: authenticated.organizationId,
      targetUserId: target.userId,
      capability: rawCapability,
      effect,
      reason: "user_central_permission_override",
    });
    if (!committed.ok) {
      return jsonError(committed.statusCode, committed.error, committed.code);
    }

    const revoked = await supabase
      .from("horora_nexus_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("auth_user_id", target.userId)
      .eq("organization_id", authenticated.organizationId)
      .is("revoked_at", null);

    return NextResponse.json({
      success: true,
      permissionPersisted: true,
      audited: committed.audited,
      capability: rawCapability,
      effect,
      writer: decision.writer,
      sessionRevocation: revoked.error ? "unavailable" : "revoked",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Permission impossible.";
    return jsonError(500, message, "permission_change_failed");
  }
}

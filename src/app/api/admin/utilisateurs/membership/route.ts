import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import {
  acceptCanonicalIdentityLinks,
  resolveAuthorizedDirectoryQuery,
} from "@/app/lib/auth/horora-authorized-module-directory-client.shared";
import { readLiveAuthorizedModuleDirectory } from "@/app/lib/auth/horora-directory-nexus.server";
import { isProcessLocalNexusFixtureEnabled } from "@/app/lib/auth/horora-local-nexus-fixture";
import {
  actorCanEditLocalPresetRoles,
  assessNexusLocalBinding,
  decideHororaMembershipChange,
  describeAuthorityAfterMembershipRoleChange,
  lastActiveOwnerWouldBeRemoved,
  nexusLocalBindingDenialMessage,
  shouldRevokeTargetHororaSessions,
  type HororaMembershipChangeDenial,
  type HororaMembershipSnapshot,
  type NexusLocalBindingDenial,
} from "@/app/lib/auth/horora-premium-user-central.shared";
import { recordedRoleSecondarySyncPending } from "@/app/lib/employee-role-audit-commit.shared";
import { commitAuditedOrganizationRole } from "@/app/lib/employee-onboarding-tenant.server";
import {
  isOrganizationMembershipRole,
  type OrganizationMembershipRole,
} from "@/app/lib/saas/tenant-foundation.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BINDING_DENIAL_STATUS: Record<NexusLocalBindingDenial, number> = {
  nexus_authorization_unconfirmed: 409,
  nexus_identity_absent: 403,
  nexus_identity_ambiguous: 409,
  nexus_not_active: 403,
  cross_organization_forbidden: 403,
  module_not_horora: 403,
  membership_absent: 409,
  membership_ambiguous: 409,
  system_role_protected: 403,
  membership_not_active: 409,
};

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
 * Confirms the target is an existing NEXUS-active HORORA employee of this
 * organization. A failed or foreign roster read refuses the write.
 */
async function confirmExistingNexusBinding(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  hororaOrganizationId: string;
  authUserId: string;
  membershipRole: OrganizationMembershipRole;
  membershipStatus: HororaMembershipSnapshot["status"];
}) {
  const refused = assessNexusLocalBinding({
    directoryReadable: false,
    scopeOrganizationId: null,
    authUserId: input.authUserId,
    links: [],
    entries: [],
    membershipRole: input.membershipRole,
    membershipStatus: input.membershipStatus,
    membershipAmbiguous: false,
  });
  try {
    const mapResult = await input.supabase
      .from("horora_nexus_organization_map")
      .select("nexus_organization_id, nexus_tenant_id, organization_id, status")
      .eq("organization_id", input.hororaOrganizationId);
    if (mapResult.error) return refused;
    const resolved = resolveAuthorizedDirectoryQuery({
      hororaOrganizationId: input.hororaOrganizationId,
      organizationMaps: (mapResult.data ?? []).map((row) => ({
        nexusOrganizationId: String(row.nexus_organization_id ?? ""),
        nexusTenantId: typeof row.nexus_tenant_id === "string" ? row.nexus_tenant_id : null,
        organizationId: String(row.organization_id ?? ""),
        status: String(row.status ?? ""),
      })),
    });
    if (!resolved.ok) return refused;

    const identityResult = await input.supabase
      .from("horora_nexus_identity_map")
      .select("nexus_actor_id, auth_user_id, disabled_at")
      .eq("auth_user_id", input.authUserId);
    if (identityResult.error) return refused;
    const links = acceptCanonicalIdentityLinks(
      (identityResult.data ?? []).map((row) => ({
        nexusUserId: row.nexus_actor_id,
        authUserId: row.auth_user_id,
        organizationId: resolved.query.organizationId,
        disabledAt: row.disabled_at,
      }))
    );

    const read = await readLiveAuthorizedModuleDirectory({ query: resolved.query });
    return assessNexusLocalBinding({
      directoryReadable: read.ok,
      scopeOrganizationId: resolved.query.organizationId,
      authUserId: input.authUserId,
      links,
      entries: read.ok ? read.directory.entries : [],
      membershipRole: input.membershipRole,
      membershipStatus: input.membershipStatus,
      membershipAmbiguous: false,
    });
  } catch {
    return refused;
  }
}

/**
 * Assigns or removes employe and direction through the existing audited writer.
 * Does not create a NEXUS user, an invitation, or a HORORA owner.
 */
export async function POST(req: NextRequest) {
  try {
    if (isProcessLocalNexusFixtureEnabled(req.nextUrl.hostname)) {
      return jsonError(
        403,
        "La fixture locale n'écrit aucun rôle. La fonction Staging n'est pas appelée.",
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

    const memberships: Array<HororaMembershipSnapshot & { userId: string }> = [];
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
      memberships.push({ id: row.id, userId: row.user_id, role, status });
      if (row.id === membershipId) {
        target = { id: row.id, userId: row.user_id, role, status };
      }
    }
    const actorCandidates = memberships.filter(
      (row) => row.userId === authenticated.user.id && row.status === "active"
    );
    const actor = actorCandidates.length === 1 ? actorCandidates[0] : null;
    if (
      !actor ||
      actor.id !== authenticated.membershipId ||
      actor.role !== authenticated.membershipRole
    ) {
      return jsonError(403, DENIAL_MESSAGE.actor_forbidden, "actor_forbidden");
    }
    if (!target) {
      const foreignResult = await supabase
        .from("organization_memberships")
        .select("id, organization_id")
        .eq("id", membershipId)
        .maybeSingle<{ id: string; organization_id: string | null }>();
      if (foreignResult.error) {
        return jsonError(500, "Chargement impossible.", "membership_read_failed");
      }
      if (
        foreignResult.data &&
        foreignResult.data.organization_id !== authenticated.organizationId
      ) {
        return jsonError(
          403,
          DENIAL_MESSAGE.cross_organization_forbidden,
          "cross_organization_forbidden"
        );
      }
      return jsonError(404, "Appartenance introuvable dans cette organisation.", "target_missing");
    }
    if (actor.id === target.id || actor.userId === target.userId) {
      return jsonError(403, DENIAL_MESSAGE.self_change_forbidden, "self_change_forbidden");
    }
    if (target.status !== "active") {
      return jsonError(
        409,
        nexusLocalBindingDenialMessage("membership_not_active"),
        "membership_not_active"
      );
    }
    if (!actorCanEditLocalPresetRoles(actor.role)) {
      const code =
        actor.role === "direction" ? "direction_assignment_unauthorized" : "actor_forbidden";
      return jsonError(403, DENIAL_MESSAGE[code], code);
    }
    if (lastActiveOwnerWouldBeRemoved(memberships, target.id, nextRole, "active")) {
      return jsonError(
        409,
        DENIAL_MESSAGE.last_owner_protected,
        "last_owner_protected"
      );
    }

    const binding = await confirmExistingNexusBinding({
      supabase,
      hororaOrganizationId: authenticated.organizationId,
      authUserId: target.userId,
      membershipRole: target.role,
      membershipStatus: target.status,
    });
    if (!binding.ok) {
      return jsonError(
        BINDING_DENIAL_STATUS[binding.reason],
        nexusLocalBindingDenialMessage(binding.reason),
        binding.reason
      );
    }
    if (!binding.assignableRoles.includes(nextRole)) {
      return jsonError(400, "Rôle ou appartenance invalide.", "invalid_membership_change");
    }

    const decision = decideHororaMembershipChange({
      actorMembershipId: actor.id,
      actorRole: actor.role,
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
    if (!committed.unchanged && committed.audited !== true) {
      return jsonError(500, "L'audit du rôle n'a pas été écrit.", "audit_write_failed");
    }

    const revokeChangedTargetSessions = async () => {
      if (
        !shouldRevokeTargetHororaSessions({
          roleCommitted: true,
          unchanged: committed.unchanged,
        })
      ) {
        return "not_required" as const;
      }
      const revoked = await supabase
        .from("horora_nexus_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("auth_user_id", target.userId)
        .eq("organization_id", authenticated.organizationId)
        .is("revoked_at", null);
      return revoked.error ? ("unavailable" as const) : ("revoked" as const);
    };

    const { data: authData, error: readError } = await supabase.auth.admin.getUserById(target.userId);
    if (readError || !authData.user || authData.user.id !== target.userId) {
      const sessionRevocation = await revokeChangedTargetSessions();
      return NextResponse.json(
        { ...recordedRoleSecondarySyncPending(nextRole), sessionRevocation },
        { status: 409 }
      );
    }
    const existing = (authData.user.app_metadata ?? {}) as Record<string, unknown>;
    const { error: updateError } = await supabase.auth.admin.updateUserById(target.userId, {
      app_metadata: { ...existing, role: nextRole },
    });
    if (updateError) {
      const sessionRevocation = await revokeChangedTargetSessions();
      if (committed.audited && !committed.unchanged) {
        return NextResponse.json(
          { ...recordedRoleSecondarySyncPending(nextRole), sessionRevocation },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: "Le rôle d'appartenance est inchangé. L'annonce du rôle de session n'a pas abouti.",
          code: "app_metadata_role_announcement_failed",
          rolePersisted: true,
          audited: committed.audited,
          unchanged: committed.unchanged,
          sessionRevocation,
        },
        { status: 409 }
      );
    }

    const authority = describeAuthorityAfterMembershipRoleChange();
    const sessionRevocation = await revokeChangedTargetSessions();

    return NextResponse.json({
      success: true,
      rolePersisted: true,
      audited: committed.audited,
      unchanged: committed.unchanged,
      role: committed.role,
      writer: decision.writer,
      sessionRevocation,
      jwtPermissions: authority.jwtPermissions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Changement impossible.";
    return jsonError(500, message, "membership_change_failed");
  }
}

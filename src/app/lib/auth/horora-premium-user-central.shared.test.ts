import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIsolatedDirectoryPanelFixture } from "@/app/lib/auth/horora-authorized-module-directory.shared";
import {
  HORORA_CANONICAL_PERMISSION_DOMAINS,
  HORORA_ROLE_AUTHORITY,
  actorCanEditLocalPresetRoles,
  assessNexusLocalBinding,
  decideHororaMembershipChange,
  decideNexusAuthorizedLocalBinding,
  describeAuthorityAfterMembershipRoleChange,
  describeLocalRoleChange,
  listHororaRolePresets,
  nexusRoleBecomesHororaOwner,
  shouldRevokeTargetHororaSessions,
  effectivePermissionsFollowJwtMetadata,
  lastActiveOwnerWouldBeRemoved,
  shellRoleFromMembership,
  summarizeHororaMemberships,
} from "@/app/lib/auth/horora-premium-user-central.shared";
import type { HororaMembershipSnapshot } from "@/app/lib/auth/horora-premium-user-central.shared";

const memberships: HororaMembershipSnapshot[] = [
  { id: "owner", role: "organization_owner", status: "active" },
  { id: "lead", role: "direction", status: "active" },
  { id: "driver", role: "employe", status: "active" },
  { id: "paused", role: "employe", status: "suspended" },
];

describe("HORORA existing RBAC reuse", () => {
  it("keeps the four membership roles and the six canonical domains", () => {
    expect(Object.keys(HORORA_ROLE_AUTHORITY)).toEqual([
      "organization_owner",
      "organization_admin",
      "direction",
      "employe",
    ]);
    expect(HORORA_CANONICAL_PERMISSION_DOMAINS).toEqual([
      "commissions",
      "documents",
      "dossiers",
      "livraisons",
      "ressources",
      "terrain",
    ]);
  });

  it("maps owner to the admin shell without treating that label as a permission", () => {
    expect(shellRoleFromMembership("organization_owner")).toBe("admin");
    expect(shellRoleFromMembership("direction")).toBe("direction");
    expect(shellRoleFromMembership("employe")).toBe("employe");
    const effect = effectivePermissionsFollowJwtMetadata({
      shellRole: "admin",
      jwtPermissions: ["documents", "admin_finance"],
    });
    expect(effect.recognized).toEqual(["documents"]);
    expect(effect.ignored).toEqual(["admin_finance"]);
  });

  it("counts existing memberships without inventing people or roles", () => {
    const summary = summarizeHororaMemberships(memberships, 2);
    expect(summary.activeMemberships).toBe(3);
    expect(summary.suspendedMemberships).toBe(1);
    expect(summary.roleCounts.organization_owner).toBe(1);
    expect(summary.roleCounts.direction).toBe(1);
    expect(summary.roleCounts.employe).toBe(1);
    expect(summary.pendingInvitations).toBe(2);
    expect(summary.writesEnabled).toBe(false);
    expect(summary.teamStructure).toBe("absent");
  });

  it("protects the last active owner", () => {
    expect(
      lastActiveOwnerWouldBeRemoved(memberships, "owner", "direction", "active")
    ).toBe(true);
    expect(
      lastActiveOwnerWouldBeRemoved(memberships, "owner", "organization_owner", "suspended")
    ).toBe(true);
    expect(
      lastActiveOwnerWouldBeRemoved(memberships, "lead", "employe", "active")
    ).toBe(false);
  });

  it("refuses a Nexus role, a self change, a system role, and a cross-organization write", () => {
    const base = {
      actorMembershipId: "lead",
      actorRole: "direction" as const,
      actorOrganizationId: "org-a",
      targetMembershipId: "driver",
      targetOrganizationId: "org-a",
      targetRole: "employe" as const,
      targetStatus: "active" as const,
      nextRole: "direction" as const,
      nextStatus: "active" as const,
      membershipsInOrganization: memberships,
      requestedByNexusRole: false,
    };
    expect(decideHororaMembershipChange({ ...base, requestedByNexusRole: true })).toEqual({
      ok: false,
      reason: "nexus_role_cannot_grant_admin",
    });
    expect(decideHororaMembershipChange({ ...base, targetOrganizationId: "org-b" })).toEqual({
      ok: false,
      reason: "cross_organization_forbidden",
    });
    expect(
      decideHororaMembershipChange({
        ...base,
        targetMembershipId: "lead",
        actorMembershipId: "lead",
      })
    ).toEqual({ ok: false, reason: "self_change_forbidden" });
    expect(decideHororaMembershipChange({ ...base, nextRole: "organization_owner" })).toEqual({
      ok: false,
      reason: "system_role_protected",
    });
    expect(decideHororaMembershipChange(base)).toEqual({
      ok: false,
      reason: "direction_assignment_unauthorized",
    });
    expect(decideHororaMembershipChange({ ...base, nextStatus: "suspended" })).toEqual({
      ok: false,
      reason: "writer_not_connected",
    });
  });

  it("accepts an owner assigning direction through the existing audited writer", () => {
    const decision = decideHororaMembershipChange({
      actorMembershipId: "owner",
      actorRole: "organization_owner",
      actorOrganizationId: "org-a",
      targetMembershipId: "driver",
      targetOrganizationId: "org-a",
      targetRole: "employe",
      targetStatus: "active",
      nextRole: "direction",
      nextStatus: "active",
      membershipsInOrganization: memberships,
      requestedByNexusRole: false,
    });
    expect(decision).toEqual({
      ok: true,
      writer: "commit_horora_membership_role_with_audit",
    });
  });

  it("assigns roles only through the existing audited function", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/admin/utilisateurs/membership/route.ts"),
      "utf8"
    );
    expect(route).toContain("decideHororaMembershipChange");
    expect(route).toContain("assessNexusLocalBinding");
    expect(route.indexOf("assessNexusLocalBinding")).toBeLessThan(
      route.indexOf("await commitAuditedOrganizationRole")
    );
    expect(route).toContain("commitAuditedOrganizationRole");
    expect(route).not.toContain("createUser");
    expect(route).not.toContain("inviteUserByEmail");
    expect(route).not.toContain("organization_invitations");
    expect(route).toContain("requestedByNexusRole: false");
    expect(route).toContain("local_fixture_writes_disabled");
    expect(route.indexOf("local_fixture_writes_disabled")).toBeLessThan(
      route.indexOf("await commitAuditedOrganizationRole")
    );
    expect(route).not.toMatch(/from\("organization_memberships"\)[\s\S]{0,120}\.update\(/);
    expect(route).toContain('.from("horora_nexus_sessions")');
    expect(describeAuthorityAfterMembershipRoleChange().jwtPermissions).toBe(
      "unchanged_until_refresh"
    );
    expect(route.indexOf("rolePersisted: false")).toBeLessThan(
      route.indexOf("horora_nexus_sessions")
    );
    expect(route).toContain('.eq("auth_user_id", target.userId)');
    expect(route).toContain('.eq("organization_id", authenticated.organizationId)');
    expect(route).toContain('.is("revoked_at", null)');
    const session = readFileSync(
      join(process.cwd(), "src/app/lib/auth/nexus-brokered-session.ts"),
      "utf8"
    );
    expect(session).toContain('reason: "session_revoked"');
    expect(session).toContain('membership.status !== "active"');
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain("user_metadata");
    expect(route).toContain("app_metadata: { ...existing, role: nextRole }");
  });

  it("shows the existing business permissions of each local role", () => {
    const presets = Object.fromEntries(
      listHororaRolePresets().map((preset) => [preset.role, preset])
    );
    expect(Object.keys(presets)).toEqual([
      "organization_owner",
      "organization_admin",
      "direction",
      "employe",
    ]);
    expect(presets.employe.domains).toEqual({
      pointage: "role",
      horaires: "role",
      rapports: "deny",
      administration: "deny",
    });
    expect(presets.direction.domains).toEqual({
      pointage: "deny",
      horaires: "role",
      rapports: "role",
      administration: "explicit",
    });
    expect(presets.organization_owner.domains).toMatchObject({
      pointage: "deny",
      horaires: "role",
      rapports: "role",
      administration: "role",
    });
    expect(presets.organization_owner.assignableHere).toBe(false);
    expect(presets.employe.assignableHere).toBe(true);
    expect(presets.direction.assignableHere).toBe(true);
    expect(nexusRoleBecomesHororaOwner("organization_owner")).toBe(false);
    expect(nexusRoleBecomesHororaOwner("owner")).toBe(false);
    expect(actorCanEditLocalPresetRoles("organization_admin")).toBe(true);
    expect(actorCanEditLocalPresetRoles("direction")).toBe(false);
  });

  it("removes Direction only through the audited employe assignment", () => {
    expect(
      describeLocalRoleChange({ currentRole: "direction", nextRole: "employe" })
    ).toBe("remove_direction");
    expect(
      decideHororaMembershipChange({
        actorMembershipId: "owner",
        actorRole: "organization_owner",
        actorOrganizationId: "org-a",
        targetMembershipId: "lead",
        targetOrganizationId: "org-a",
        targetRole: "direction",
        targetStatus: "active",
        nextRole: "employe",
        nextStatus: "active",
        membershipsInOrganization: memberships,
        requestedByNexusRole: false,
      })
    ).toEqual({ ok: true, writer: "commit_horora_membership_role_with_audit" });
    expect(
      decideHororaMembershipChange({
        actorMembershipId: "other-direction",
        actorRole: "direction",
        actorOrganizationId: "org-a",
        targetMembershipId: "lead",
        targetOrganizationId: "org-a",
        targetRole: "direction",
        targetStatus: "active",
        nextRole: "employe",
        nextStatus: "active",
        membershipsInOrganization: memberships,
        requestedByNexusRole: false,
      })
    ).toEqual({ ok: false, reason: "direction_assignment_unauthorized" });
  });

  it("accepts only an existing employee who is active in this Nexus organization", () => {
    const eligible = {
      directoryReadable: true,
      identityLinkCount: 1,
      nexusUserId: "nuser_local_panel_active",
      directoryStatus: "ACTIVE" as const,
      entryOrganizationId: "org-a",
      scopeOrganizationId: "org-a",
      moduleKey: "tagora_time",
      membershipRole: "employe" as const,
      membershipStatus: "active" as const,
      membershipAmbiguous: false,
    };
    expect(decideNexusAuthorizedLocalBinding(eligible)).toEqual({
      ok: true,
      assignableRoles: ["employe", "direction"],
    });
    expect(
      decideNexusAuthorizedLocalBinding({ ...eligible, directoryReadable: false })
    ).toMatchObject({ ok: false, reason: "nexus_authorization_unconfirmed" });
    expect(
      decideNexusAuthorizedLocalBinding({
        ...eligible,
        nexusUserId: null,
        identityLinkCount: 0,
        directoryStatus: "ABSENT",
      })
    ).toMatchObject({ ok: false, reason: "nexus_identity_absent" });
    expect(
      decideNexusAuthorizedLocalBinding({ ...eligible, directoryStatus: "REVOKED" })
    ).toMatchObject({ ok: false, reason: "nexus_not_active" });
    expect(
      decideNexusAuthorizedLocalBinding({
        ...eligible,
        entryOrganizationId: "org-b",
      })
    ).toMatchObject({ ok: false, reason: "cross_organization_forbidden" });
    expect(
      decideNexusAuthorizedLocalBinding({ ...eligible, moduleKey: "tagora_stock" })
    ).toMatchObject({ ok: false, reason: "module_not_horora" });
    expect(
      decideNexusAuthorizedLocalBinding({
        ...eligible,
        membershipRole: null,
        membershipStatus: null,
      })
    ).toMatchObject({ ok: false, reason: "membership_absent" });
    expect(
      decideNexusAuthorizedLocalBinding({
        ...eligible,
        membershipRole: "organization_owner",
      })
    ).toMatchObject({ ok: false, reason: "system_role_protected" });
    expect(nexusRoleBecomesHororaOwner("organization_owner")).toBe(false);
  });

  it("keeps the local fixture roster limited to the authorized employee", () => {
    const { scope, view } = buildIsolatedDirectoryPanelFixture();
    const decisions = view.rows.map((row) =>
      decideNexusAuthorizedLocalBinding({
        directoryReadable: true,
        identityLinkCount: row.nexusUserId ? 1 : 0,
        nexusUserId: row.nexusUserId,
        directoryStatus: row.directoryStatus,
        entryOrganizationId: row.nexusUserId ? scope.organizationId : null,
        scopeOrganizationId: scope.organizationId,
        moduleKey: row.nexusUserId ? scope.moduleKey : null,
        membershipRole: row.membershipRole,
        membershipStatus: row.membershipStatus,
        membershipAmbiguous: row.membershipAmbiguous,
      })
    );
    const eligible = decisions.filter((decision) => decision.ok);
    expect(eligible).toHaveLength(1);
    expect(view.rows.find((row) => row.directoryStatus === "ABSENT")?.nexusUserId).toBeNull();
    expect(
      assessNexusLocalBinding({
        directoryReadable: true,
        scopeOrganizationId: scope.organizationId,
        authUserId: "00000000-0000-4000-8000-0000000000b1",
        links: [
          {
            nexusUserId: "nuser_local_panel_active",
            authUserId: "00000000-0000-4000-8000-0000000000b1",
          },
        ],
        entries: [
          {
            userId: "nuser_local_panel_active",
            organizationId: "org_other",
            technicalKey: "tagora_time",
            status: "ACTIVE",
          },
        ],
        membershipRole: "employe",
        membershipStatus: "active",
        membershipAmbiguous: false,
      })
    ).toMatchObject({ ok: false, reason: "cross_organization_forbidden" });
    expect(
      assessNexusLocalBinding({
        directoryReadable: false,
        scopeOrganizationId: scope.organizationId,
        authUserId: "00000000-0000-4000-8000-0000000000b1",
        links: [],
        entries: [],
        membershipRole: "employe",
        membershipStatus: "active",
        membershipAmbiguous: false,
      })
    ).toMatchObject({ ok: false, reason: "nexus_authorization_unconfirmed" });
  });

  it("revokes sessions only after a real role commit", () => {
    expect(shouldRevokeTargetHororaSessions({ roleCommitted: false, unchanged: false })).toBe(
      false
    );
    expect(shouldRevokeTargetHororaSessions({ roleCommitted: true, unchanged: true })).toBe(
      false
    );
    expect(shouldRevokeTargetHororaSessions({ roleCommitted: true, unchanged: false })).toBe(
      true
    );
  });
});

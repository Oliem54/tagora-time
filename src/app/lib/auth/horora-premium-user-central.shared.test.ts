import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HORORA_CANONICAL_PERMISSION_DOMAINS,
  HORORA_ROLE_AUTHORITY,
  decideHororaMembershipChange,
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
    expect(route).toContain("commitAuditedOrganizationRole");
    expect(route).toContain("requestedByNexusRole: false");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain("user_metadata");
    expect(route).toContain("app_metadata: { ...existing, role: nextRole }");
  });
});

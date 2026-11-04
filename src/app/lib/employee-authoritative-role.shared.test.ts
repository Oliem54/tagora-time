import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as onboarding from "@/app/lib/employee-onboarding-tenant.shared";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function membership(
  partial?: Partial<{
    id: string;
    organization_id: string;
    user_id: string;
    role: string;
    status: string;
    is_default: boolean;
  }>
) {
  return {
    id: "m1",
    organization_id: ORG_A,
    user_id: USER,
    role: "employe",
    status: "active",
    is_default: true,
    ...partial,
  };
}

function plan(partial?: Partial<Parameters<typeof onboarding.planAuthoritativePortalRoleCommit>[0]>) {
  return onboarding.planAuthoritativePortalRoleCommit({
    source: "employee_portal",
    actorRole: "direction",
    actorUserId: ACTOR,
    actorOrganizationId: ORG_A,
    targetAuthUserId: USER,
    requestedRole: "employe",
    existingMemberships: [],
    preserveExistingRole: false,
    blockSelf: true,
    ...partial,
  });
}

describe("authoritative organization_memberships.role writer", () => {
  it("announces employe only when the membership write is employe", async () => {
    for (const source of ["employee_portal", "admin_portal_account", "account_request"] as const) {
      const actorRole = source === "admin_portal_account" ? "admin" : "direction";
      const prepared = plan({ source, actorRole });
      expect(prepared).toMatchObject({ ok: true, role: "employe", action: "insert" });
      if (!prepared.ok) return;

      let announced: string | null = null;
      const committed = await onboarding.executeAuthoritativePortalRoleCommit({
        plan: prepared,
        writeMembership: async () => undefined,
        writeAuthRole: async () => {
          announced = prepared.role;
        },
      });
      expect(committed).toEqual({ ok: true, role: "employe" });
      expect(announced).toBe("employe");
      expect(onboarding.sessionPortalRoleForOrganization([membership()], ORG_A)).toBe("employe");
    }
  });

  it("refuses Direction and names the missing membership right", async () => {
    const prepared = plan({ requestedRole: "direction", existingMemberships: [membership()] });
    expect(prepared).toMatchObject({
      ok: false,
      code: "direction_assignment_unauthorized",
      status: 403,
      missingRight: onboarding.DIRECTION_MEMBERSHIP_ASSIGNMENT_RIGHT,
    });
    const writes = { membership: 0, auth: 0 };
    const committed = await onboarding.executeAuthoritativePortalRoleCommit({
      plan: prepared,
      writeMembership: async () => {
        writes.membership += 1;
      },
      writeAuthRole: async () => {
        writes.auth += 1;
      },
    });
    expect(committed).toMatchObject({
      ok: false,
      skippedWrites: true,
      missingRight: "organization_memberships.role=direction",
    });
    expect(writes).toEqual({ membership: 0, auth: 0 });
  });

  it("refuses owner, admin and manager without writing", async () => {
    for (const requestedRole of ["organization_owner", "organization_admin", "admin", "manager"]) {
      const prepared = plan({
        source: "admin_portal_account",
        actorRole: "admin",
        requestedRole,
      });
      expect(prepared).toMatchObject({ ok: false, code: "protected_portal_role_forbidden", status: 403 });
      const committed = await onboarding.executeAuthoritativePortalRoleCommit({
        plan: prepared,
        writeMembership: async () => {
          throw new Error("membership write");
        },
        writeAuthRole: async () => {
          throw new Error("auth write");
        },
      });
      expect(committed).toMatchObject({ ok: false, skippedWrites: true });
    }
  });

  it("keeps a protected membership and another organization refused", () => {
    expect(
      plan({
        requestedRole: "employe",
        existingMemberships: [membership({ role: "direction" })],
      })
    ).toMatchObject({
      ok: false,
      code: "direction_assignment_unauthorized",
      authoritativeRole: "direction",
    });
    expect(
      plan({
        requestedRole: "employe",
        existingMemberships: [membership({ organization_id: ORG_B })],
      })
    ).toMatchObject({ ok: false, code: "cross_tenant_conflict", status: 409 });
  });

  it("refuses self modification and an Auth account already linked to another employee", () => {
    expect(plan({ actorUserId: USER, targetAuthUserId: USER })).toMatchObject({
      ok: false,
      code: "self_role_change_forbidden",
      status: 403,
    });
    expect(
      onboarding.planEmployeePortalAuthoritySave({
        requestedPortalRole: "employe",
        actorOrganizationId: ORG_A,
        chauffeurAuthUserId: ACTOR,
        resolvedAuthUserId: USER,
        existingMemberships: [],
      })
    ).toMatchObject({ ok: false, code: "auth_user_link_conflict", status: 409 });
  });

  it("does not announce a role when the membership write fails", async () => {
    const prepared = plan();
    let announced = false;
    const committed = await onboarding.executeAuthoritativePortalRoleCommit({
      plan: prepared,
      writeMembership: async () => {
        throw new Error("insert failed");
      },
      writeAuthRole: async () => {
        announced = true;
      },
    });
    expect(committed).toMatchObject({
      ok: false,
      code: "membership_write_failed",
      skippedWrites: true,
    });
    expect(announced).toBe(false);
  });

  it("preserves invite, link and resend refusals for an existing non-employe role", () => {
    for (const requestedRole of ["employe", "direction"]) {
      const prepared = plan({
        requestedRole,
        preserveExistingRole: true,
        existingMemberships: [membership({ role: "admin" })],
        existingAppRole: "admin",
      });
      expect(prepared.ok).toBe(false);
    }
    const employeResend = plan({
      requestedRole: "employe",
      preserveExistingRole: true,
      existingMemberships: [membership()],
      existingAppRole: "employe",
    });
    expect(employeResend).toMatchObject({ ok: true, role: "employe", action: "noop" });
  });
});

describe("role announcement source order", () => {
  const root = process.cwd();

  it("writes membership before the employee fiche announces a role", () => {
    const route = readFileSync(
      join(root, "src/app/api/direction/ressources/employes/[id]/invite-account/route.ts"),
      "utf8"
    );
    const inviteAt = route.indexOf('if (action === "invite") {');
    const linkAt = route.indexOf('if (action === "link") {');
    const resendAt = route.lastIndexOf('if (action === "resend") {');
    const blocks = [
      route.slice(inviteAt, linkAt),
      route.slice(linkAt, resendAt),
      route.slice(resendAt, route.indexOf("Action non reconnue.")),
    ];
    for (const block of blocks) {
      expect(block.indexOf("prepareAuthoritativePortalRole")).toBeGreaterThan(-1);
      expect(block.indexOf("completeEmployeeTenantAccess")).toBeGreaterThan(-1);
      expect(block.indexOf("completeEmployeeTenantAccess")).toBeLessThan(block.indexOf("updateUserById"));
    }
    expect(route).toContain("deferRoleAnnouncement: true");
    expect(route).toContain("auth_exists_use_link");
    expect(route).toContain("auth_linked_other_employee");
    expect(route).toContain("Vous ne pouvez pas modifier vos propres permissions");
  });

  it("keeps the admin panel on the membership writer and reads that role back", () => {
    const route = readFileSync(
      join(root, "src/app/api/admin/employes/[employeeId]/portal-account/route.ts"),
      "utf8"
    );
    const patch = route.slice(route.indexOf("export async function PATCH"));
    expect(patch.indexOf("prepareAuthoritativePortalRole")).toBeLessThan(
      patch.indexOf("commitAuditedOrganizationRole")
    );
    expect(patch.indexOf("commitAuditedOrganizationRole")).toBeLessThan(patch.indexOf("updateUserById"));
    expect(patch).not.toContain("user_role_audit_logs");
    expect(patch).toContain("blockSelf: true");
    expect(route).toContain("sessionPortalRoleForOrganization");
    expect(route).not.toContain("role: nextRole");
  });

  it("runs account request invite, link and resend through the same writer", () => {
    const route = readFileSync(join(root, "src/app/api/account-requests/[id]/route.ts"), "utf8");
    const ensure = route.slice(
      route.indexOf("async function ensureManagedAuthUser"),
      route.indexOf("async function finalizeApprovedRequest")
    );
    expect(ensure.indexOf("prepareAccountRequestRole")).toBeLessThan(
      ensure.indexOf("applyAuthoritativePortalRole")
    );
    expect(ensure.indexOf("applyAuthoritativePortalRole")).toBeLessThan(ensure.indexOf("updateUserById"));
    expect(ensure).toContain("metadataWithoutRole");

    const upsert = route.slice(
      route.indexOf("async function upsertAccountAccess"),
      route.indexOf("async function acquirePendingReviewLock")
    );
    expect(upsert.indexOf("applyAuthoritativePortalRole")).toBeLessThan(upsert.indexOf("updateUserById"));
    expect(upsert).toContain("deferRoleAnnouncement: true");

    const resend = route.slice(route.indexOf('action === "resend_invitation"'), route.indexOf('action === "disable_access"'));
    expect(resend.indexOf("prepareAccountRequestRole")).toBeLessThan(resend.indexOf("inviteUserByEmail"));
    expect(resend).toContain("deferRoleAnnouncement: !invitedId");
    expect(route).toContain('source: "account_request"');
    expect(route).not.toContain('actorRole: "admin"');
  });
});

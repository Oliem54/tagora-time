import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIRECTION_MEMBERSHIP_ASSIGNMENT_RIGHT,
  executeAuthoritativePortalRoleCommit,
  planAuthoritativePortalRoleCommit,
  verifyEmployeePortalAuthorityAfterWrite,
  type OnboardingMembershipRow,
} from "@/app/lib/employee-onboarding-tenant.shared";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function membership(
  partial?: Partial<OnboardingMembershipRow>
): OnboardingMembershipRow {
  return {
    id: "m1",
    organization_id: ORG_A,
    user_id: TARGET,
    role: "employe",
    status: "active",
    is_default: true,
    ...partial,
  };
}

function plan(
  partial?: Partial<Parameters<typeof planAuthoritativePortalRoleCommit>[0]>
) {
  return planAuthoritativePortalRoleCommit({
    source: "employee_portal",
    actorRole: "direction",
    actorUserId: ACTOR,
    actorOrganizationId: ORG_A,
    targetAuthUserId: TARGET,
    requestedRole: "employe",
    existingMemberships: [],
    preserveExistingRole: false,
    blockSelf: false,
    ...partial,
  });
}

describe("authoritative membership role commit", () => {
  it("inserts employe when the fiche requests employe and no membership exists", () => {
    expect(plan()).toMatchObject({
      ok: true,
      action: "insert",
      role: "employe",
    });
  });

  it("keeps an active employe membership unchanged", () => {
    expect(plan({ existingMemberships: [membership()] })).toMatchObject({
      ok: true,
      action: "noop",
      role: "employe",
      membershipId: "m1",
    });
  });

  it("lets a session admin assign and remove Direction for another employee", async () => {
    for (const source of ["employee_portal", "admin_portal_account"] as const) {
      const assigned = plan({
        source,
        actorRole: "admin",
        requestedRole: "direction",
        existingMemberships: [membership()],
        blockSelf: true,
      });
      expect(assigned).toMatchObject({
        ok: true,
        action: "assign",
        role: "direction",
        membershipId: "m1",
      });
      const removed = plan({
        source,
        actorRole: "admin",
        requestedRole: "employe",
        existingMemberships: [membership({ role: "direction" })],
        blockSelf: true,
      });
      expect(removed).toMatchObject({
        ok: true,
        action: "assign",
        role: "employe",
        membershipId: "m1",
      });
    }
  });

  it("refuses Direction from a Direction actor and from account requests", () => {
    expect(
      plan({
        source: "employee_portal",
        actorRole: "direction",
        requestedRole: "direction",
        existingMemberships: [membership()],
      })
    ).toMatchObject({
      ok: false,
      code: "direction_assignment_unauthorized",
      status: 403,
      missingRight: DIRECTION_MEMBERSHIP_ASSIGNMENT_RIGHT,
    });
    expect(
      plan({
        source: "account_request",
        actorRole: "admin",
        requestedRole: "direction",
        existingMemberships: [membership()],
      })
    ).toMatchObject({
      ok: false,
      code: "direction_assignment_unauthorized",
      missingRight: DIRECTION_MEMBERSHIP_ASSIGNMENT_RIGHT,
    });
  });

  it("refuses admin, manager, owner and organization admin", () => {
    for (const requestedRole of ["admin", "manager", "organization_owner", "organization_admin"]) {
      expect(
        plan({
          source: "admin_portal_account",
          actorRole: "admin",
          requestedRole,
        })
      ).toMatchObject({
        ok: false,
        code: "protected_portal_role_forbidden",
        status: 403,
      });
    }
  });

  it("refuses a Direction actor removing Direction", () => {
    expect(
      plan({
        actorRole: "direction",
        requestedRole: "employe",
        existingMemberships: [membership({ role: "direction" })],
      })
    ).toMatchObject({
      ok: false,
      code: "direction_assignment_unauthorized",
      status: 403,
      authoritativeRole: "direction",
    });
  });

  it("refuses self, protected accounts, another organization and a missing session", async () => {
    expect(
      plan({
        source: "admin_portal_account",
        actorRole: "admin",
        actorUserId: TARGET,
        targetAuthUserId: TARGET,
        requestedRole: "direction",
        existingMemberships: [membership({ user_id: TARGET })],
        blockSelf: true,
      })
    ).toMatchObject({ ok: false, code: "self_role_change_forbidden", status: 403 });

    for (const role of ["organization_owner", "organization_admin", "admin", "manager"]) {
      expect(
        plan({
          source: "admin_portal_account",
          actorRole: "admin",
          requestedRole: "direction",
          existingMemberships: [membership({ role })],
        })
      ).toMatchObject({ ok: false, code: "protected_account_forbidden", status: 403 });
    }
    expect(
      plan({
        source: "admin_portal_account",
        actorRole: "admin",
        requestedRole: "direction",
        existingAppRole: "manager",
        existingMemberships: [membership()],
      })
    ).toMatchObject({ ok: false, code: "protected_account_forbidden" });

    expect(
      plan({
        source: "admin_portal_account",
        actorRole: "admin",
        requestedRole: "direction",
        existingMemberships: [membership({ organization_id: ORG_B })],
      })
    ).toMatchObject({ ok: false, code: "cross_tenant_conflict", status: 409 });

    const missingSession = plan({
      actorUserId: null,
      actorRole: null,
      actorOrganizationId: null,
      requestedRole: "direction",
    });
    expect(missingSession).toMatchObject({ ok: false, code: "session_unreliable", status: 403 });
    const writes = { membership: 0, auth: 0 };
    const executed = await executeAuthoritativePortalRoleCommit({
      plan: missingSession,
      writeMembership: async () => {
        writes.membership += 1;
      },
      writeAuthRole: async () => {
        writes.auth += 1;
      },
    });
    expect(executed).toMatchObject({ ok: false, skippedWrites: true });
    expect(writes).toEqual({ membership: 0, auth: 0 });
  });

  it("refuses invite, link and resend when a role already exists", () => {
    expect(
      plan({
        requestedRole: "employe",
        preserveExistingRole: true,
        existingMemberships: [membership({ role: "direction" })],
      })
    ).toMatchObject({ ok: false, code: "existing_role_preserved", status: 409 });

    expect(
      plan({
        requestedRole: "direction",
        preserveExistingRole: true,
        existingAppRole: "direction",
        existingMemberships: [membership({ role: "direction" })],
      })
    ).toMatchObject({
      ok: false,
      code: "direction_assignment_unauthorized",
      missingRight: DIRECTION_MEMBERSHIP_ASSIGNMENT_RIGHT,
    });

    expect(
      plan({
        requestedRole: "employe",
        preserveExistingRole: true,
        existingAppRole: "direction",
        existingMemberships: [membership()],
      })
    ).toMatchObject({ ok: false, code: "existing_role_preserved" });
  });

  it("isolates another organization", () => {
    expect(
      plan({
        existingMemberships: [membership({ organization_id: ORG_B })],
      })
    ).toMatchObject({ ok: false, code: "cross_tenant_conflict", status: 409 });
  });

  it("refuses an unreliable session before any write", async () => {
    const decided = plan({
      actorUserId: null,
      actorRole: null,
      actorOrganizationId: null,
    });
    expect(decided).toMatchObject({ ok: false, code: "session_unreliable", status: 403 });
    const writes = { membership: 0, auth: 0 };
    const executed = await executeAuthoritativePortalRoleCommit({
      plan: decided,
      writeMembership: async () => {
        writes.membership += 1;
      },
      writeAuthRole: async () => {
        writes.auth += 1;
      },
    });
    expect(executed).toMatchObject({ ok: false, skippedWrites: true });
    expect(writes).toEqual({ membership: 0, auth: 0 });
  });

  it("keeps the admin panel admin-only and lets Direction approve only employe", () => {
    expect(
      plan({ source: "admin_portal_account", actorRole: "direction", requestedRole: "employe" })
    ).toMatchObject({ ok: false, code: "actor_forbidden" });
    expect(
      plan({ source: "account_request", actorRole: "direction", requestedRole: "direction" })
    ).toMatchObject({
      ok: false,
      code: "direction_assignment_unauthorized",
      missingRight: DIRECTION_MEMBERSHIP_ASSIGNMENT_RIGHT,
    });
    expect(
      plan({ source: "account_request", actorRole: "direction", requestedRole: "employe" })
    ).toMatchObject({ ok: true, role: "employe" });
  });

  it("refuses self modification on the employee fiche", () => {
    expect(
      plan({
        blockSelf: true,
        actorUserId: TARGET,
        targetAuthUserId: TARGET,
        requestedRole: "employe",
      })
    ).toMatchObject({ ok: false, code: "self_role_change_forbidden", status: 403 });
  });

  it("announces the same membership role after an authorized assign or removal", async () => {
    const cases = [
      { requestedRole: "direction" as const, currentRole: "employe" },
      { requestedRole: "employe" as const, currentRole: "direction" },
    ];
    for (const source of ["employee_portal", "admin_portal_account"] as const) {
      for (const item of cases) {
        const prepared = plan({
          source,
          actorRole: "admin",
          requestedRole: item.requestedRole,
          existingMemberships: [membership({ role: item.currentRole })],
          blockSelf: true,
        });
        expect(prepared).toMatchObject({
          ok: true,
          action: "assign",
          role: item.requestedRole,
        });
        let announced: string | null = null;
        const executed = await executeAuthoritativePortalRoleCommit({
          plan: prepared,
          writeMembership: async () => undefined,
          writeAuthRole: async () => {
            if (prepared.ok) announced = prepared.role;
          },
        });
        expect(executed).toEqual({ ok: true, role: item.requestedRole });
        expect(announced).toBe(item.requestedRole);
      }
    }
  });

  it("accepts a reread only when app_metadata matches the Direction membership", () => {
    expect(
      verifyEmployeePortalAuthorityAfterWrite({
        requestedPortalRole: "direction",
        actorOrganizationId: ORG_A,
        resolvedAuthUserId: TARGET,
        chauffeurAuthUserId: TARGET,
        appMetadataRole: "direction",
        memberships: [membership({ role: "direction" })],
      })
    ).toEqual({ ok: true });
    expect(
      verifyEmployeePortalAuthorityAfterWrite({
        requestedPortalRole: "direction",
        actorOrganizationId: ORG_A,
        resolvedAuthUserId: TARGET,
        chauffeurAuthUserId: TARGET,
        appMetadataRole: "employe",
        memberships: [membership({ role: "direction" })],
      }).ok
    ).toBe(false);
  });

  it("does not announce Direction when the membership write fails", async () => {
    const assigned = plan({
      source: "admin_portal_account",
      actorRole: "admin",
      requestedRole: "direction",
      existingMemberships: [membership()],
    });
    expect(assigned).toMatchObject({ ok: true, role: "direction", action: "assign" });
    const writes = { membership: 0, auth: 0 };
    const executed = await executeAuthoritativePortalRoleCommit({
      plan: assigned,
      writeMembership: async () => {
        writes.membership += 1;
        throw new Error("membership_role_write_failed");
      },
      writeAuthRole: async () => {
        writes.auth += 1;
      },
    });
    expect(executed).toMatchObject({
      ok: false,
      code: "membership_write_failed",
      status: 500,
    });
    expect(writes).toEqual({ membership: 1, auth: 0 });

    const removal = plan({
      source: "employee_portal",
      actorRole: "admin",
      requestedRole: "employe",
      existingMemberships: [membership({ role: "direction" })],
      blockSelf: true,
    });
    const removalWrites = { membership: 0, auth: 0 };
    const removalExecuted = await executeAuthoritativePortalRoleCommit({
      plan: removal,
      writeMembership: async () => {
        removalWrites.membership += 1;
        throw new Error("membership_role_write_failed");
      },
      writeAuthRole: async () => {
        removalWrites.auth += 1;
      },
    });
    expect(removalExecuted).toMatchObject({ ok: false, code: "membership_write_failed" });
    expect(removalWrites).toEqual({ membership: 1, auth: 0 });
  });

  it("does not write Auth when the membership write fails", async () => {
    const writes = { membership: 0, auth: 0 };
    const executed = await executeAuthoritativePortalRoleCommit({
      plan: plan(),
      writeMembership: async () => {
        writes.membership += 1;
        throw new Error("membership_insert_failed");
      },
      writeAuthRole: async () => {
        writes.auth += 1;
      },
    });
    expect(executed).toMatchObject({
      ok: false,
      code: "membership_write_failed",
      status: 500,
    });
    expect(writes).toEqual({ membership: 1, auth: 0 });
  });

  it("writes membership before Auth and only for an authorized employe plan", async () => {
    const order: string[] = [];
    const executed = await executeAuthoritativePortalRoleCommit({
      plan: plan(),
      writeMembership: async () => {
        order.push("membership");
      },
      writeAuthRole: async () => {
        order.push("auth");
      },
    });
    expect(executed).toEqual({ ok: true, role: "employe" });
    expect(order).toEqual(["membership", "auth"]);
  });
});

describe("role writers call the membership plan before Auth writes", () => {
  const root = process.cwd();

  it("gates invite, link and resend before their Auth writes", () => {
    const route = readFileSync(
      join(root, "src/app/api/direction/ressources/employes/[id]/invite-account/route.ts"),
      "utf8"
    );
    const inviteAt = route.indexOf('if (action === "invite")');
    const linkAt = route.indexOf('if (action === "link")');
    const resendAt = route.indexOf('if (action === "resend")');
    expect(route.indexOf("prepareAuthoritativePortalRole", inviteAt)).toBeLessThan(
      route.indexOf("inviteUserByEmail", inviteAt)
    );
    expect(route.indexOf("prepareAuthoritativePortalRole", linkAt)).toBeLessThan(
      route.indexOf("updateUserById", linkAt)
    );
    expect(route.indexOf("prepareAuthoritativePortalRole", resendAt)).toBeLessThan(
      route.indexOf("inviteUserByEmail", resendAt)
    );
    expect(route.indexOf("preserveExistingRole: true", inviteAt)).toBeGreaterThan(inviteAt);
    expect(route.indexOf("preserveExistingRole: true", linkAt)).toBeGreaterThan(linkAt);
    expect(route.indexOf("preserveExistingRole: true", resendAt)).toBeGreaterThan(resendAt);
  });

  it("shows the membership role on the existing employee access form", () => {
    const route = readFileSync(
      join(root, "src/app/api/employees/[id]/account-security/route.ts"),
      "utf8"
    );
    const getAt = route.indexOf("export async function GET");
    expect(route.indexOf("sessionPortalRoleForOrganization", getAt)).toBeGreaterThan(getAt);
    expect(route.indexOf("security.portalRole", getAt)).toBeGreaterThan(getAt);
  });

  it("audits an employee selector role change with the existing audit table", () => {
    const route = readFileSync(
      join(root, "src/app/api/direction/ressources/employes/[id]/invite-account/route.ts"),
      "utf8"
    );
    const updateAt = route.indexOf('action === "update_portal_access"');
    const disableAt = route.indexOf('action === "disable_access"');
    const block = route.slice(updateAt, disableAt);
    expect(block.indexOf("applyAuthoritativePortalRole")).toBeLessThan(block.indexOf("updateUserById"));
    expect(block.indexOf("verifyEmployeePortalAccessAfterWrite")).toBeLessThan(
      block.indexOf("user_role_audit_logs")
    );
    expect(block).toContain("new_role: prepared.role");
  });

  it("gates the admin role action before app_metadata is written", () => {
    const route = readFileSync(
      join(root, "src/app/api/admin/employes/[employeeId]/portal-account/route.ts"),
      "utf8"
    );
    const patchAt = route.indexOf("export async function PATCH");
    expect(route.indexOf("prepareAuthoritativePortalRole", patchAt)).toBeLessThan(
      route.indexOf("updateUserById", patchAt)
    );
    expect(route.indexOf("verifyEmployeePortalAccessAfterWrite", patchAt)).toBeGreaterThan(
      route.indexOf("updateUserById", patchAt)
    );
  });

  it("gates account approval, resend and reactivation before Auth role writes", () => {
    const route = readFileSync(
      join(root, "src/app/api/account-requests/[id]/route.ts"),
      "utf8"
    );
    const ensureAt = route.indexOf("async function ensureManagedAuthUser");
    const upsertAt = route.indexOf("async function upsertAccountAccess");
    const resendAt = route.indexOf('action === "resend_invitation"');
    const reactivateAt = route.indexOf('action === "reactivate_access"');
    expect(route.indexOf("prepareAccountRequestRole", ensureAt)).toBeLessThan(
      route.indexOf("auth.admin.createUser", ensureAt)
    );
    expect(route.indexOf("prepareAccountRequestRole", upsertAt)).toBeLessThan(
      route.indexOf("updateUserById", upsertAt)
    );
    expect(route.indexOf("prepareAccountRequestRole", resendAt)).toBeLessThan(
      route.indexOf("inviteUserByEmail", resendAt)
    );
    expect(route.indexOf("prepareAccountRequestRole", reactivateAt)).toBeLessThan(
      route.indexOf("updateUserById", reactivateAt)
    );
    expect(route.indexOf("role_sources_incoherent", reactivateAt)).toBeGreaterThan(reactivateAt);
  });
});

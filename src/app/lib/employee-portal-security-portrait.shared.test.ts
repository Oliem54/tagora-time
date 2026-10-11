import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hororaNexusSessionRequestInit } from "@/app/lib/auth/horora-nexus-session.client";
import { planAuthoritativePortalRoleCommit } from "@/app/lib/employee-onboarding-tenant.shared";
import {
  confirmEmployeeMembershipPortalRole,
  EMPLOYEE_PORTAL_DISABLED_SAVE_MESSAGE,
  EMPLOYEE_PORTAL_ROLE_UNCONFIRMED_MESSAGE,
  EMPLOYEE_PORTAL_STATUS_ABSENT,
  EMPLOYEE_PORTAL_STATUS_ACTIVE,
  EMPLOYEE_PORTAL_STATUS_DISABLED,
  EMPLOYEE_PORTAL_STATUS_UNVERIFIED,
  viewEmployeePortalSecurity,
} from "@/app/lib/employee-portal-security-portrait.shared";

const AUTH_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function portrait(partial?: Record<string, unknown>) {
  return {
    status: "active",
    accountExists: true,
    accessDisabled: false,
    authUserId: AUTH_USER,
    portalRole: "employe",
    membershipRoleConfirmed: true,
    permissions: ["horodateur"],
    ...partial,
  };
}

describe("employee portal security portrait", () => {
  it("loads a confirmed portrait and its verified membership role", () => {
    const view = viewEmployeePortalSecurity({
      loaded: true,
      security: portrait({ portalRole: "direction", permissions: ["direction"] }),
      profileAuthUserId: AUTH_USER,
    });

    expect(view.portraitConfirmed).toBe(true);
    expect(view.statusLabel).toBe(EMPLOYEE_PORTAL_STATUS_ACTIVE);
    expect(view.recordedRole).toBe("direction");
    expect(view.membershipRoleConfirmed).toBe(true);
    expect(view.permissions).toEqual(["direction"]);
    expect(view.canSave).toBe(true);
    expect(view.blockMessage).toBeNull();
  });

  it("keeps a verified employe membership role when the portrait confirms it", () => {
    const confirmed = confirmEmployeeMembershipPortalRole("employe");
    const view = viewEmployeePortalSecurity({
      loaded: true,
      security: portrait(confirmed),
    });

    expect(confirmed).toEqual({
      portalRole: "employe",
      membershipRoleConfirmed: true,
    });
    expect(view.recordedRole).toBe("employe");
    expect(view.canSave).toBe(true);
  });

  it("treats a failed or missing portrait as unverified", () => {
    const failed = viewEmployeePortalSecurity({
      loaded: false,
      security: portrait(),
      profileAuthUserId: AUTH_USER,
    });
    const missing = viewEmployeePortalSecurity({
      loaded: true,
      security: {},
      profileAuthUserId: AUTH_USER,
    });

    for (const view of [failed, missing]) {
      expect(view.portraitConfirmed).toBe(false);
      expect(view.statusLabel).toBe(EMPLOYEE_PORTAL_STATUS_UNVERIFIED);
      expect(view.statusLabel).not.toBe(EMPLOYEE_PORTAL_STATUS_ABSENT);
      expect(view.recordedRole).toBeNull();
      expect(view.canSave).toBe(false);
      expect(view.blockMessage).toBeNull();
      expect(view.blockMessage).not.toBe(EMPLOYEE_PORTAL_DISABLED_SAVE_MESSAGE);
    }
  });

  it("distinguishes a confirmed absent account from a disabled account", () => {
    const absent = viewEmployeePortalSecurity({
      loaded: true,
      security: portrait({
        status: "no_account",
        accountExists: false,
        accessDisabled: false,
        authUserId: null,
        portalRole: "employe",
        membershipRoleConfirmed: false,
      }),
      profileAuthUserId: AUTH_USER,
    });
    const disabled = viewEmployeePortalSecurity({
      loaded: true,
      security: portrait({
        status: "disabled",
        accessDisabled: true,
        portalRole: "direction",
        membershipRoleConfirmed: true,
      }),
      profileAuthUserId: AUTH_USER,
    });

    expect(absent.statusLabel).toBe(EMPLOYEE_PORTAL_STATUS_ABSENT);
    expect(absent.recordedRole).toBeNull();
    expect(absent.canSave).toBe(false);
    expect(absent.blockMessage).toBeNull();

    expect(disabled.statusLabel).toBe(EMPLOYEE_PORTAL_STATUS_DISABLED);
    expect(disabled.statusLabel).not.toBe(EMPLOYEE_PORTAL_STATUS_ABSENT);
    expect(disabled.recordedRole).toBe("direction");
    expect(disabled.canSave).toBe(false);
    expect(disabled.blockMessage).toBe(EMPLOYEE_PORTAL_DISABLED_SAVE_MESSAGE);
  });

  it("does not prefill employe when the membership role is not confirmed", () => {
    const unconfirmed = confirmEmployeeMembershipPortalRole(null);
    const view = viewEmployeePortalSecurity({
      loaded: true,
      security: portrait({
        portalRole: "employe",
        membershipRoleConfirmed: false,
      }),
      profileAuthUserId: AUTH_USER,
    });

    expect(unconfirmed).toEqual({
      portalRole: null,
      membershipRoleConfirmed: false,
    });
    expect(view.statusLabel).toBe(EMPLOYEE_PORTAL_STATUS_ACTIVE);
    expect(view.recordedRole).toBeNull();
    expect(view.membershipRoleConfirmed).toBe(false);
    expect(view.permissions).toEqual([]);
    expect(view.canSave).toBe(false);
    expect(view.blockMessage).toBe(EMPLOYEE_PORTAL_ROLE_UNCONFIRMED_MESSAGE);
  });

  it("sends the portrait request on the existing Nexus session channel", () => {
    const init = hororaNexusSessionRequestInit({
      headers: { Authorization: "Bearer secret-token" },
    });

    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });

  it("keeps the fiche on that channel and does not invent a membership role", () => {
    const section = readFileSync(
      resolve("src/app/direction/ressources/employes/EmployeePortalAccessSection.tsx"),
      "utf8"
    );
    const route = readFileSync(
      resolve("src/app/api/employees/[id]/account-security/route.ts"),
      "utf8"
    );

    expect(section).toContain("hororaNexusSessionRequestInit(");
    expect(section).not.toContain("if (!accessToken || !canManage)");
    expect(section).not.toContain("Authorization: `Bearer ${accessToken}`");
    expect(route).toContain("confirmEmployeeMembershipPortalRole(");
    expect(route).not.toMatch(/authoritativeRole === "admin"[\s\S]{0,120}: "employe"/);
  });

  it("preserves the direction actor guard on role assignment", () => {
    const plan = planAuthoritativePortalRoleCommit({
      source: "employee_portal",
      actorRole: "direction",
      actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      actorOrganizationId: "11111111-1111-4111-8111-111111111111",
      targetAuthUserId: AUTH_USER,
      requestedRole: "direction",
      existingMemberships: [],
      preserveExistingRole: false,
      blockSelf: true,
    });

    expect(plan).toMatchObject({
      ok: false,
      code: "direction_assignment_unauthorized",
    });
  });
});

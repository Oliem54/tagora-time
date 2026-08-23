import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as onboarding from "@/app/lib/employee-onboarding-tenant.shared";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

describe("employee portal authority save", () => {
  it("returns 409 onboarding.PORTAL_ROLE_AUTHORITY_CONFLICT for active direction membership + employe request", () => {
    const plan = onboarding.planEmployeePortalAuthoritySave({
      requestedPortalRole: "employe",
      actorOrganizationId: ORG_A,
      chauffeurAuthUserId: null,
      resolvedAuthUserId: USER,
      existingMemberships: [membership({ role: "direction" })],
    });
    expect(plan).toMatchObject({
      ok: false,
      code: onboarding.PORTAL_ROLE_AUTHORITY_CONFLICT,
      status: 409,
      requestedRole: "employe",
      authoritativeRole: "direction",
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe(onboarding.PORTAL_ROLE_AUTHORITY_CONFLICT_MESSAGE);
  });

  it("blocks Auth, chauffeur and membership writes after a protected role conflict", async () => {
    const plan = onboarding.planEmployeePortalAuthoritySave({
      requestedPortalRole: "employe",
      actorOrganizationId: ORG_A,
      chauffeurAuthUserId: null,
      resolvedAuthUserId: USER,
      existingMemberships: [membership({ role: "direction" })],
    });
    expect(onboarding.employeePortalAuthorityWriteIntent(plan)).toEqual({
      auth: false,
      chauffeur: false,
      membership: false,
    });

    const writes = { auth: 0, chauffeur: 0, membership: 0 };
    const executed = await onboarding.executeEmployeePortalAuthorityPlan({
      plan,
      writeMembership: async () => {
        writes.membership += 1;
      },
      writeChauffeur: async () => {
        writes.chauffeur += 1;
      },
      writeAuth: async () => {
        writes.auth += 1;
      },
    });
    expect(executed).toMatchObject({ ok: false, skippedWrites: true, status: 409 });
    expect(writes).toEqual({ auth: 0, chauffeur: 0, membership: 0 });
  });

  it("refuses organization_admin, organization_owner and admin the same way", () => {
    for (const role of ["organization_admin", "organization_owner", "admin"] as const) {
      const plan = onboarding.planEmployeePortalAuthoritySave({
        requestedPortalRole: "employe",
        actorOrganizationId: ORG_A,
        chauffeurAuthUserId: null,
        resolvedAuthUserId: USER,
        existingMemberships: [membership({ role })],
      });
      expect(plan).toMatchObject({
        ok: false,
        code: onboarding.PORTAL_ROLE_AUTHORITY_CONFLICT,
        status: 409,
        authoritativeRole: role,
      });
    }
  });

  it("saves idempotently when membership is already active employe", () => {
    const plan = onboarding.planEmployeePortalAuthoritySave({
      requestedPortalRole: "employe",
      actorOrganizationId: ORG_A,
      chauffeurAuthUserId: USER,
      resolvedAuthUserId: USER,
      existingMemberships: [membership()],
    });
    expect(plan).toMatchObject({
      ok: true,
      membershipAction: "noop",
      linkChauffeur: false,
    });
  });

  it("creates employe membership and chauffeur link when membership is absent", () => {
    const plan = onboarding.planEmployeePortalAuthoritySave({
      requestedPortalRole: "employe",
      actorOrganizationId: ORG_A,
      chauffeurAuthUserId: null,
      resolvedAuthUserId: USER,
      existingMemberships: [],
    });
    expect(plan).toMatchObject({
      ok: true,
      membershipAction: "insert",
      linkChauffeur: true,
    });
  });

  it("refuses a different organization fail-closed", () => {
    const plan = onboarding.planEmployeePortalAuthoritySave({
      requestedPortalRole: "employe",
      actorOrganizationId: ORG_A,
      chauffeurAuthUserId: null,
      resolvedAuthUserId: USER,
      existingMemberships: [membership({ organization_id: ORG_B, role: "employe" })],
    });
    expect(plan).toMatchObject({
      ok: false,
      code: "cross_tenant_conflict",
      status: 409,
    });
  });

  it("refuses a chauffeur already linked to another Auth user", () => {
    const plan = onboarding.planEmployeePortalAuthoritySave({
      requestedPortalRole: "employe",
      actorOrganizationId: ORG_A,
      chauffeurAuthUserId: OTHER_USER,
      resolvedAuthUserId: USER,
      existingMemberships: [],
    });
    expect(plan).toMatchObject({
      ok: false,
      code: "auth_user_link_conflict",
      status: 409,
    });
  });

  it("returns success only after membership, app_metadata and auth_user_id are coherent", () => {
    expect(onboarding.EMPLOYEE_PORTAL_AUTHORITY_WRITE_ORDER[0]).toBe(
      "validate_and_detect_conflicts"
    );
    expect(
      onboarding.verifyEmployeePortalAuthorityAfterWrite({
        requestedPortalRole: "employe",
        actorOrganizationId: ORG_A,
        resolvedAuthUserId: USER,
        chauffeurAuthUserId: USER,
        appMetadataRole: "employe",
        memberships: [membership()],
      })
    ).toEqual({ ok: true });

    expect(
      onboarding.verifyEmployeePortalAuthorityAfterWrite({
        requestedPortalRole: "employe",
        actorOrganizationId: ORG_A,
        resolvedAuthUserId: USER,
        chauffeurAuthUserId: null,
        appMetadataRole: "employe",
        memberships: [membership()],
      }).ok
    ).toBe(false);

    expect(
      onboarding.verifyEmployeePortalAuthorityAfterWrite({
        requestedPortalRole: "employe",
        actorOrganizationId: ORG_A,
        resolvedAuthUserId: USER,
        chauffeurAuthUserId: USER,
        appMetadataRole: "employe",
        memberships: [membership({ role: "direction" })],
      }).ok
    ).toBe(false);
  });

  it("shows the conflict message and does not keep a fake Employe form state", () => {
    expect(
      onboarding.employeePortalSaveErrorMessage({
        code: onboarding.PORTAL_ROLE_AUTHORITY_CONFLICT,
        requestedRole: "employe",
        authoritativeRole: "direction",
      })
    ).toBe(onboarding.PORTAL_ROLE_AUTHORITY_CONFLICT_MESSAGE);

    expect(
      onboarding.applyEmployeePortalSaveFailureToForm({
        currentFormRole: "employe",
        code: onboarding.PORTAL_ROLE_AUTHORITY_CONFLICT,
        authoritativeRole: "direction",
      })
    ).toBe("direction");
  });
});

describe("AuthGate authority after portal save", () => {
  it("keeps using organization_memberships, not JWT or user_metadata", () => {
    expect(onboarding.isUserMetadataAuthoritativeForOnboarding()).toBe(false);
    expect(onboarding.EMPLOYEE_ONBOARDING_AUTHORITY.userMetadataAuthoritative).toBe(false);
    expect(onboarding.EMPLOYEE_ONBOARDING_AUTHORITY.membershipRole).toContain("organization_memberships");

    const resolved = onboarding.canAuthGateResolveEmployeeOnboarding({
      memberships: [membership({ role: "direction" })],
      jwtAppRole: "employe",
    });
    expect(resolved).toMatchObject({
      authorized: true,
      appRole: "direction",
      source: "membership",
      directionAreaAllowed: true,
    });
  });
});

describe("portal authority source contracts", () => {
  const root = process.cwd();

  it("keeps AuthGate and session-context on membership, never user_metadata", () => {
    const authGate = readFileSync(join(root, "src/app/components/AuthGate.tsx"), "utf8");
    const sessionRoute = readFileSync(
      join(root, "src/app/api/auth/session-context/route.ts"),
      "utf8"
    );
    expect(authGate).toContain("fetchSessionAuthorizationContext");
    expect(authGate).not.toContain("user_metadata");
    expect(sessionRoute).toContain("resolveOrganizationAuthContextForUser");
    expect(sessionRoute).not.toContain("user_metadata");
  });

  it("evaluates portal authority before Auth writes on update_portal_access", () => {
    const route = readFileSync(
      join(root, "src/app/api/direction/ressources/employes/[id]/invite-account/route.ts"),
      "utf8"
    );
    const updateBlock = route.slice(
      route.indexOf('action === "update_portal_access"'),
      route.indexOf('action === "disable_access"')
    );
    expect(updateBlock.indexOf("evaluateEmployeePortalAuthoritySave")).toBeGreaterThan(-1);
    expect(updateBlock.indexOf("evaluateEmployeePortalAuthoritySave")).toBeLessThan(
      updateBlock.indexOf("updateUserById")
    );
    expect(updateBlock).toContain("jsonPortalAuthorityFailure");
    expect(updateBlock).toContain("verifyEmployeePortalAccessAfterWrite");
  });

  it("shows the conflict copy in the employee portal access section", () => {
    const ui = readFileSync(
      join(root, "src/app/direction/ressources/employes/EmployeePortalAccessSection.tsx"),
      "utf8"
    );
    expect(ui).toContain("employeePortalSaveErrorMessage");
    expect(ui).toContain("applyEmployeePortalSaveFailureToForm");
    expect(ui).toContain("authoritativeRole");
  });
});

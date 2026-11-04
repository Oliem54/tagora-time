import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decideHororaSupervisorHttpScope,
  hororaSupervisorHttpServerTarget,
  hororaSupervisorHttpSessionTarget,
} from "@/app/lib/auth/horora-supervisor-grant.shared";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const authUserId = "00000000-0000-4000-8000-000000000001";
const membershipId = "00000000-0000-4000-8000-000000000030";
const organizationId = "00000000-0000-4000-8000-000000000010";
const organizationCompanyId = "00000000-0000-4000-8000-000000000020";
const departmentKey = "local-fixture";

const serverTarget = {
  organizationId,
  organizationCompanyId,
  effectifsDepartmentKey: departmentKey,
};

const simulatedLookup = {
  ok: true as const,
  rows: [
    {
      authUserId,
      membershipId,
      organizationId,
      organizationCompanyId,
      effectifsDepartmentKey: departmentKey,
      capabilities: ["view_team", "approve_anomalies", "correct_time"],
      status: "active",
    },
  ],
};

const membership = {
  authUserId,
  membershipId,
  role: "employe",
  status: "active",
};

const scopedRoutes = [
  "src/app/api/direction/horodateur/live/route.ts",
  "src/app/api/direction/horodateur/registre/route.ts",
  "src/app/api/direction/horodateur/registre/[employeeId]/route.ts",
  "src/app/api/direction/horodateur/exceptions/route.ts",
  "src/app/api/direction/horodateur/exceptions/bulk/route.ts",
  "src/app/api/direction/horodateur/exceptions/[id]/approve/route.ts",
  "src/app/api/direction/horodateur/exceptions/[id]/refuse/route.ts",
  "src/app/api/direction/horodateur/retro-correction/route.ts",
];

const unchangedRoutes = [
  "src/app/api/direction/horodateur/shifts/route.ts",
  "src/app/api/direction/horodateur/punch/route.ts",
  "src/app/api/direction/horodateur/punch-zones/route.ts",
  "src/app/api/direction/horodateur/punch-zones/[id]/route.ts",
  "src/app/api/direction/horodateur/notifications/config/route.ts",
];

describe("supervisor HTTP scope", () => {
  it("passes a server target and ignores a caller grant", () => {
    expect(hororaSupervisorHttpServerTarget()).toEqual({
      organizationId: null,
      organizationCompanyId: null,
      effectifsDepartmentKey: null,
    });
    expect(
      hororaSupervisorHttpServerTarget({
        ...serverTarget,
        grant: { portalRole: "admin", capabilities: ["read_payroll"] },
      })
    ).toEqual(serverTarget);

    for (const capability of ["view_team", "approve_anomalies", "correct_time"] as const) {
      expect(
        decideHororaSupervisorHttpScope({
          portalRole: "employe",
          capability,
          target: serverTarget,
          grant: { portalRole: "admin" },
          callerAuthUserId: authUserId,
          membership,
          lookup: simulatedLookup,
        })
      ).toEqual({ allowed: true, source: "supervisor_grant", reason: "scope_match" });
    }
  });

  it("denies an employe when one server target field is missing without a stored read", () => {
    const cases = [
      { target: { ...serverTarget, organizationId: null }, reason: "target_organization_absent" },
      { target: { ...serverTarget, organizationCompanyId: " " }, reason: "target_company_absent" },
      { target: { ...serverTarget, effectifsDepartmentKey: "" }, reason: "target_department_absent" },
    ] as const;
    for (const item of cases) {
      let storedRead = false;
      const lookup = new Proxy(simulatedLookup, {
        get(target, property, receiver) {
          storedRead = true;
          return Reflect.get(target, property, receiver);
        },
      });
      expect(
        decideHororaSupervisorHttpScope({
          portalRole: "employe",
          capability: "view_team",
          target: item.target,
          grant: { portalRole: "employe", capabilities: ["view_team"], ...serverTarget },
          callerAuthUserId: authUserId,
          membership,
          lookup,
        })
      ).toEqual({ allowed: false, source: "denied", reason: item.reason });
      expect(storedRead).toBe(false);
    }
  });

  it("does not treat a caller grant as authority when no stored row exists", () => {
    expect(
      decideHororaSupervisorHttpScope({
        portalRole: "employe",
        capability: "view_team",
        target: serverTarget,
        grant: {
          portalRole: "employe",
          ...serverTarget,
          capabilities: ["view_team", "approve_anomalies", "correct_time", "read_payroll"],
        },
        callerAuthUserId: authUserId,
        membership,
        lookup: { ok: true, rows: [] },
      })
    ).toEqual({ allowed: false, source: "denied", reason: "grant_absent" });
  });

  it("does not let the grant widen direction or admin", () => {
    for (const portalRole of ["direction", "admin"] as const) {
      let storedRead = false;
      const lookup = new Proxy(simulatedLookup, {
        get(target, property, receiver) {
          storedRead = true;
          return Reflect.get(target, property, receiver);
        },
      });
      expect(
        decideHororaSupervisorHttpScope({
          portalRole,
          capability: "view_team",
          target: serverTarget,
          grant: { portalRole: "employe", ...serverTarget },
          callerAuthUserId: authUserId,
          membership,
          lookup,
        })
      ).toEqual({ allowed: true, source: "portal_role", reason: "portal_role" });
      expect(storedRead).toBe(false);
    }
    expect(
      decideHororaSupervisorHttpScope({
        portalRole: "direction",
        capability: "read_payroll",
        target: serverTarget,
        grant: { portalRole: "employe", ...serverTarget },
        lookup: simulatedLookup,
      })
    ).toMatchObject({ allowed: false, source: "denied" });
    expect(
      decideHororaSupervisorHttpScope({
        portalRole: "admin",
        capability: "read_payroll",
        target: serverTarget,
        grant: { portalRole: "employe", ...serverTarget },
        lookup: simulatedLookup,
      })
    ).toEqual({ allowed: true, source: "portal_role", reason: "portal_role" });
  });

  it("denies another auth user and closed capabilities from the simulated row", () => {
    expect(
      decideHororaSupervisorHttpScope({
        portalRole: "employe",
        capability: "view_team",
        target: { ...serverTarget, effectifsDepartmentKey: "other-department" },
        callerAuthUserId: authUserId,
        membership,
        lookup: simulatedLookup,
      }).allowed
    ).toBe(false);
    expect(
      decideHororaSupervisorHttpScope({
        portalRole: "employe",
        capability: "view_team",
        target: serverTarget,
        callerAuthUserId: "00000000-0000-4000-8000-000000000099",
        membership,
        lookup: simulatedLookup,
      })
    ).toMatchObject({ allowed: false, source: "denied", reason: "auth_user_mismatch" });
    for (const capability of [
      "read_payroll",
      "manage_payroll",
      "export_payroll",
      "admin_finance",
      "manage_employees",
      "manage_configuration",
    ] as const) {
      expect(
        decideHororaSupervisorHttpScope({
          portalRole: "employe",
          capability,
          target: serverTarget,
          callerAuthUserId: authUserId,
          membership,
          lookup: simulatedLookup,
        })
      ).toMatchObject({ allowed: false, source: "denied", reason: "capability_denied" });
    }
  });

  it("keeps company and department empty when only the server session has an organization", () => {
    let storedRead = false;
    const lookup = new Proxy(simulatedLookup, {
      get(target, property, receiver) {
        storedRead = true;
        return Reflect.get(target, property, receiver);
      },
    });
    const sessionTarget = hororaSupervisorHttpSessionTarget({
      organizationId,
      organizationCompanyId,
      effectifsDepartmentKey: departmentKey,
      grant: { portalRole: "employe", capabilities: ["view_team"] },
    });
    expect(sessionTarget).toEqual({
      organizationId,
      organizationCompanyId: null,
      effectifsDepartmentKey: null,
    });
    expect(
      decideHororaSupervisorHttpScope({
        portalRole: "employe",
        capability: "view_team",
        target: sessionTarget,
        grant: { portalRole: "employe", ...serverTarget },
        callerAuthUserId: authUserId,
        membership,
        lookup,
      })
    ).toEqual({ allowed: false, source: "denied", reason: "target_company_absent" });
    expect(storedRead).toBe(false);
  });

  it("wires only the team, approval and correction routes", () => {
    const guard = read("src/app/api/horodateur/_shared.ts");
    const decision = read("src/app/lib/auth/horora-supervisor-grant.shared.ts");
    expect(guard).toContain("void scope?.grant");
    expect(guard).toContain("void scope?.target");
    expect(guard).toContain("organizationId: authenticated.organizationId");
    expect(guard).toContain("hororaSupervisorHttpSessionTarget");
    expect(guard).not.toContain("hororaSupervisorHttpServerTarget(scope?.target)");
    expect(guard).not.toContain("searchParams");
    expect(guard).not.toContain("req.json");
    expect(guard).toContain("grant: null");
    expect(guard).toContain("target: null");
    expect(guard).toContain("isCompleteHororaSupervisorHttpTarget(httpTarget)");
    expect(guard.indexOf("isCompleteHororaSupervisorHttpTarget(httpTarget)")).toBeLessThan(
      guard.indexOf("await readEmployeSupervisorTimeAccess")
    );
    expect(guard).not.toContain("grant: scope");
    expect(guard).not.toContain("createAdminSupabaseClient");
    expect(decision).toContain("grant: null");
    expect(decision).toContain("target: null");
    expect(decision).not.toContain("createAdminSupabaseClient");

    for (const route of scopedRoutes) {
      const source = read(route);
      expect(source).toContain("target: hororaSupervisorHttpServerTarget()");
      expect(source).not.toContain("scope.grant");
      expect(source).not.toContain("searchParams.get(\"organizationId\")");
    }
    for (const route of unchangedRoutes) {
      const source = read(route);
      expect(source).not.toContain("hororaSupervisorHttpServerTarget");
    }
  });
});

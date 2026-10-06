import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HORORA_PORTAL_ROLES, evaluateHororaPayrollCapability, hororaPortalRoleAllows, isHororaPortalRole } from "@/app/lib/auth/horora-role-model.shared";
import {
  businessFunctionActivatesSupervisorGrant,
  createHororaSupervisorGrant,
  evaluateHororaSupervisorGrant,
  resolveHororaScopedTimeAccess,
} from "@/app/lib/auth/horora-supervisor-grant.shared";

const ORG = "org-horora-1";
const OTHER_ORG = "org-horora-2";
const COMPANY = "company-horora-1";
const OTHER_COMPANY = "company-horora-2";
const DEPARTMENT = "livreur";
const OTHER_DEPARTMENT = "operations";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function employeGrant(overrides: Record<string, string | null> = {}) {
  return {
    portalRole: "employe" as const,
    organizationId: ORG,
    organizationCompanyId: COMPANY,
    effectifsDepartmentKey: DEPARTMENT,
    ...overrides,
  };
}

function target(overrides: Record<string, string | null> = {}) {
  return {
    organizationId: ORG,
    organizationCompanyId: COMPANY,
    effectifsDepartmentKey: DEPARTMENT,
    ...overrides,
  };
}

describe("HORORA supervisor grant", () => {
  it("stays outside the portal roles", () => {
    expect(HORORA_PORTAL_ROLES).toEqual(["employe", "direction", "admin"]);
    expect(isHororaPortalRole("superviseur")).toBe(false);
    expect(createHororaSupervisorGrant({ portalRole: "superviseur" })).toBeNull();
  });

  it("keeps an employe without a grant on their own punch", () => {
    for (const capability of ["view_team", "approve_anomalies", "correct_time"] as const) {
      expect(
        resolveHororaScopedTimeAccess({
          portalRole: "employe",
          capability,
          grant: null,
          target: target(),
        })
      ).toMatchObject({ allowed: false, source: "denied", reason: "grant_absent" });
    }
  });

  it("lets an employe grant see and approve only its department", () => {
    const grant = createHororaSupervisorGrant(employeGrant());
    expect(grant?.effectifsDepartmentKey).toBe(DEPARTMENT);
    for (const capability of ["view_team", "approve_anomalies"] as const) {
      expect(
        resolveHororaScopedTimeAccess({
          portalRole: "employe",
          capability,
          grant,
          target: target(),
        })
      ).toMatchObject({ allowed: true, source: "supervisor_grant", reason: "scope_match" });
      expect(
        resolveHororaScopedTimeAccess({
          portalRole: "employe",
          capability,
          grant,
          target: target({ effectifsDepartmentKey: OTHER_DEPARTMENT }),
        })
      ).toMatchObject({ allowed: false, reason: "target_department_mismatch" });
    }
  });

  it("fails closed without a department, organization or company", () => {
    expect(
      evaluateHororaSupervisorGrant({
        grant: employeGrant({ effectifsDepartmentKey: "  " }),
        capability: "view_team",
        target: target(),
      }).reason
    ).toBe("grant_department_absent");
    expect(
      evaluateHororaSupervisorGrant({
        grant: employeGrant({ organizationId: "" }),
        capability: "approve_anomalies",
        target: target(),
      }).reason
    ).toBe("grant_organization_absent");
    expect(
      evaluateHororaSupervisorGrant({
        grant: employeGrant({ organizationCompanyId: null }),
        capability: "correct_time",
        target: target(),
      }).reason
    ).toBe("grant_company_absent");
    expect(createHororaSupervisorGrant(employeGrant({ effectifsDepartmentKey: "" }))).toBeNull();
  });

  it("does not cross organization, company or department", () => {
    const grant = employeGrant();
    expect(
      evaluateHororaSupervisorGrant({
        grant,
        capability: "view_team",
        target: target({ organizationId: OTHER_ORG }),
      }).reason
    ).toBe("target_organization_mismatch");
    expect(
      evaluateHororaSupervisorGrant({
        grant,
        capability: "approve_anomalies",
        target: target({ organizationCompanyId: OTHER_COMPANY }),
      }).reason
    ).toBe("target_company_mismatch");
    expect(
      evaluateHororaSupervisorGrant({
        grant,
        capability: "correct_time",
        target: target({ effectifsDepartmentKey: OTHER_DEPARTMENT }),
      }).reason
    ).toBe("target_department_mismatch");
  });

  it("keeps payroll, admin finance and configuration closed", () => {
    const grant = employeGrant();
    for (const capability of [
      "export_payroll",
      "read_payroll",
      "manage_payroll",
      "manage_configuration",
      "admin_finance",
      "manage_employees",
    ] as const) {
      expect(
        evaluateHororaSupervisorGrant({
          grant,
          capability,
          target: target(),
        })
      ).toMatchObject({ allowed: false, reason: "capability_denied" });
    }
    expect(
      evaluateHororaPayrollCapability({
        portalRole: "employe",
        explicitPermissions: ["horodateur_payroll_manage"],
        required: "read",
      }).reason
    ).toBe("employee_denied");
    expect(hororaPortalRoleAllows("employe", "admin_finance")).toBe(false);
    expect(hororaPortalRoleAllows("employe", "manage_configuration")).toBe(false);
  });

  it("does not activate the grant from technicien or livreur", () => {
    expect(businessFunctionActivatesSupervisorGrant("technicien")).toBe(false);
    expect(businessFunctionActivatesSupervisorGrant("livreur")).toBe(false);
    for (const fonction of ["technicien", "livreur"] as const) {
      expect(
        createHororaSupervisorGrant({
          portalRole: "employe",
          businessFunctions: [fonction],
          organizationId: null,
          organizationCompanyId: null,
          effectifsDepartmentKey: null,
        })
      ).toBeNull();
      expect(
        resolveHororaScopedTimeAccess({
          portalRole: "employe",
          capability: "view_team",
          grant: {
            portalRole: "employe",
            businessFunctions: [fonction],
          },
          target: target(),
        }).allowed
      ).toBe(false);
    }
  });

  it("leaves direction and admin access unchanged", () => {
    for (const portalRole of ["direction", "admin"] as const) {
      for (const capability of ["view_team", "approve_anomalies", "correct_time"] as const) {
        expect(
          resolveHororaScopedTimeAccess({
            portalRole,
            capability,
            grant: null,
            target: null,
          })
        ).toMatchObject({ allowed: true, source: "portal_role" });
        expect(
          resolveHororaScopedTimeAccess({
            portalRole,
            capability,
            grant: employeGrant(),
            target: target({ effectifsDepartmentKey: OTHER_DEPARTMENT }),
          })
        ).toMatchObject({ allowed: true, source: "portal_role" });
      }
    }
    expect(
      evaluateHororaPayrollCapability({
        portalRole: "direction",
        explicitPermissions: [],
        required: "read",
      }).allowed
    ).toBe(false);
    expect(
      evaluateHororaPayrollCapability({
        portalRole: "direction",
        explicitPermissions: ["horodateur_payroll_read"],
        required: "manage",
      }).allowed
    ).toBe(false);
    expect(
      evaluateHororaPayrollCapability({
        portalRole: "admin",
        explicitPermissions: [],
        required: "manage",
      })
    ).toMatchObject({ allowed: true, canRead: true, canManage: true });
    expect(hororaPortalRoleAllows("admin", "admin_finance")).toBe(true);
    expect(hororaPortalRoleAllows("direction", "admin_finance")).toBe(false);
  });

  it("is consulted by the team, approval and time-correction guards", () => {
    const shared = read("src/app/api/horodateur/_shared.ts");
    const team = read("src/app/api/direction/horodateur/registre/route.ts");
    const teamMember = read("src/app/api/direction/horodateur/registre/[employeeId]/route.ts");
    const live = read("src/app/api/direction/horodateur/live/route.ts");
    const approve = read("src/app/api/direction/horodateur/exceptions/[id]/approve/route.ts");
    const queue = read("src/app/api/direction/horodateur/exceptions/route.ts");
    const correction = read("src/app/api/direction/horodateur/retro-correction/route.ts");

    expect(shared).toContain("resolveHororaScopedTimeAccess");
    expect(shared).toContain("readEmployeSupervisorTimeAccess");
    expect(team).toContain('requireDirectionHorodateurAccess(req, "view_team",');
    expect(teamMember).toContain('requireDirectionHorodateurAccess(req, "view_team",');
    expect(live).toContain('requireDirectionHorodateurAccess(req, "view_team",');
    expect(approve).toContain('requireDirectionHorodateurAccess(req, "approve_anomalies",');
    expect(queue).toContain('requireDirectionHorodateurAccess(req, "approve_anomalies",');
    expect(correction).toContain('requireDirectionHorodateurAccess(req, "correct_time",');
    for (const source of [team, teamMember, live, approve, queue, correction]) {
      expect(source).toContain("target: hororaSupervisorHttpServerTarget()");
    }
  });
});

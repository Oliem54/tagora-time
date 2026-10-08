import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FORBIDDEN_NEXUS_AUTHORITY_CLAIMS } from "@/app/lib/auth/nexus-handoff-config";
import {
  HORORA_ACCESS_CAPABILITIES,
  HORORA_ACCESS_SCOPE_FIELDS,
  HORORA_BUSINESS_FUNCTIONS_WITHOUT_PORTAL_RIGHTS,
  HORORA_CHANTIER_IS_ACCESS_SCOPE,
  HORORA_PORTAL_ROLES,
  businessFunctionGrantsPortalAccess,
  evaluateHororaPayrollCapability,
  hororaPortalRoleAllows,
  isHororaPortalRole,
  resolveHororaPortalDecision,
} from "@/app/lib/auth/horora-role-model.shared";
import { EMPLOYEE_FONCTION_OPTIONS } from "@/app/lib/employee-fonctions.shared";
import {
  evaluateResolvedEmployeePunchProfile,
  selectUniqueActiveEmployeeForPunch,
} from "@/app/lib/horodateur-v1/employee-punch-eligibility.shared";

vi.mock("server-only", () => ({}));

import { evaluateHorodateurPayrollAccess } from "@/app/lib/horodateur-v1/payroll-access.server";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("HORORA role model", () => {
  it("keeps the portal shell to employe, direction and admin", () => {
    expect(HORORA_PORTAL_ROLES).toEqual(["employe", "direction", "admin"]);
    for (const rejected of ["technicien", "livreur", "terrain", "superviseur", "paie", "rh"]) {
      expect(isHororaPortalRole(rejected)).toBe(false);
    }
    expect(HORORA_CHANTIER_IS_ACCESS_SCOPE).toBe(false);
    expect(HORORA_ACCESS_SCOPE_FIELDS).toEqual([
      "organization_id",
      "organization_company_id",
      "effectifs_department_key",
    ]);
  });

  it("lets an employe punch, see own hours and request a correction", () => {
    expect(hororaPortalRoleAllows("employe", "punch_in_out")).toBe(true);
    expect(hororaPortalRoleAllows("employe", "punch_break_meal")).toBe(true);
    expect(hororaPortalRoleAllows("employe", "view_own_hours")).toBe(true);
    expect(hororaPortalRoleAllows("employe", "request_own_correction")).toBe(true);
  });

  it("keeps an employe off team, approval, payroll export and configuration", () => {
    expect(hororaPortalRoleAllows("employe", "view_team")).toBe(false);
    expect(hororaPortalRoleAllows("employe", "approve_anomalies")).toBe(false);
    expect(hororaPortalRoleAllows("employe", "correct_time")).toBe(false);
    expect(hororaPortalRoleAllows("employe", "export_payroll")).toBe(false);
    expect(hororaPortalRoleAllows("employe", "read_payroll")).toBe(false);
    expect(hororaPortalRoleAllows("employe", "manage_payroll")).toBe(false);
    expect(hororaPortalRoleAllows("employe", "manage_configuration")).toBe(false);
    expect(hororaPortalRoleAllows("employe", "admin_finance")).toBe(false);
  });

  it("gives technicien and livreur no extra portal right", () => {
    const fonctionSlugs = EMPLOYEE_FONCTION_OPTIONS.map((option) => option.slug);
    expect(fonctionSlugs).toEqual(expect.arrayContaining(["technicien", "livreur"]));
    for (const fonction of HORORA_BUSINESS_FUNCTIONS_WITHOUT_PORTAL_RIGHTS) {
      expect(businessFunctionGrantsPortalAccess(fonction)).toBe(false);
    }
    for (const capability of HORORA_ACCESS_CAPABILITIES) {
      const baseline = hororaPortalRoleAllows("employe", capability);
      expect(
        resolveHororaPortalDecision({
          portalRole: "employe",
          capability,
          businessFunctions: ["technicien"],
        })
      ).toBe(baseline);
      expect(
        resolveHororaPortalDecision({
          portalRole: "employe",
          capability,
          businessFunctions: ["livreur"],
        })
      ).toBe(baseline);
    }
  });

  it("requires an explicit payroll permission before direction can read or issue", () => {
    const missing = evaluateHororaPayrollCapability({
      portalRole: "direction",
      explicitPermissions: ["terrain"],
      required: "read",
    });
    const readOnly = evaluateHororaPayrollCapability({
      portalRole: "direction",
      explicitPermissions: ["horodateur_payroll_read"],
      required: "read",
    });
    const issue = evaluateHororaPayrollCapability({
      portalRole: "direction",
      explicitPermissions: ["horodateur_payroll_read"],
      required: "manage",
    });
    const exported = evaluateHororaPayrollCapability({
      portalRole: "direction",
      explicitPermissions: ["horodateur_payroll_read"],
      required: "export",
    });
    expect(missing.allowed).toBe(false);
    expect(missing.reason).toBe("payroll_permission_missing");
    expect(readOnly.allowed).toBe(true);
    expect(readOnly.canManage).toBe(false);
    expect(issue.allowed).toBe(false);
    expect(issue.reason).toBe("payroll_manage_permission_missing");
    expect(exported.allowed).toBe(true);
    expect(exported.canManage).toBe(false);
  });

  it("lets admin read and manage payroll without a JWT permission list", () => {
    const decision = evaluateHororaPayrollCapability({
      portalRole: "admin",
      explicitPermissions: [],
      required: "manage",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.canRead).toBe(true);
    expect(decision.canManage).toBe(true);
    expect(decision.source).toBe("membership_admin");
    expect(hororaPortalRoleAllows("admin", "admin_finance")).toBe(true);
    expect(hororaPortalRoleAllows("direction", "admin_finance")).toBe(false);
  });

  it("keeps the payroll guard on the same matrix", () => {
    expect(
      evaluateHorodateurPayrollAccess({
        membershipRole: "direction",
        appMetadataPermissions: ["terrain"],
        required: "read",
      }).allowed
    ).toBe(false);
    expect(
      evaluateHorodateurPayrollAccess({
        membershipRole: "direction",
        appMetadataPermissions: ["horodateur_payroll_read"],
        required: "read",
      }).allowed
    ).toBe(true);
    expect(
      evaluateHorodateurPayrollAccess({
        membershipRole: "direction",
        appMetadataPermissions: ["horodateur_payroll_read"],
        required: "manage",
      }).allowed
    ).toBe(false);
    for (const role of ["organization_owner", "organization_admin"] as const) {
      const decision = evaluateHorodateurPayrollAccess({
        membershipRole: role,
        appMetadataPermissions: [],
        required: "manage",
      });
      expect(decision.allowed).toBe(true);
      expect(decision.canManage).toBe(true);
    }
    expect(
      evaluateHorodateurPayrollAccess({
        membershipRole: "employe",
        appMetadataPermissions: ["horodateur_payroll_manage"],
        required: "read",
      }).reason
    ).toBe("employee_denied");
  });

  it("refuses punch when the chauffeur profile is missing, inactive or ambiguous", () => {
    const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(selectUniqueActiveEmployeeForPunch([])).toMatchObject({
      ok: false,
      code: "employee_not_found_for_auth_user",
    });
    expect(
      selectUniqueActiveEmployeeForPunch([{ active: false, organizationId }], {
        organizationId,
      })
    ).toMatchObject({ ok: false, code: "employee_inactive" });
    expect(
      selectUniqueActiveEmployeeForPunch(
        [
          { active: true, organizationId },
          { active: true, organizationId },
        ],
        { organizationId }
      )
    ).toMatchObject({ ok: false, code: "employee_ambiguous_for_auth_user" });
    expect(
      evaluateResolvedEmployeePunchProfile({
        present: false,
        active: false,
        organizationId: null,
        organizationCompanyId: null,
        primaryCompany: null,
      }).ok
    ).toBe(false);
    expect(
      evaluateResolvedEmployeePunchProfile({
        present: true,
        active: false,
        organizationId,
        organizationCompanyId: organizationId,
        primaryCompany: "tagora",
      })
    ).toMatchObject({ ok: false, code: "employee_inactive" });
  });

  it("rejects Nexus business-role claims and keeps three simulated portal roles", () => {
    expect(FORBIDDEN_NEXUS_AUTHORITY_CLAIMS).toEqual(
      expect.arrayContaining(["module_business_role", "time_permission"])
    );
    const simulatedPortalRoles = ["employe", "direction", "admin"] as const;
    const simulatedClosedLabels = ["technicien", "livreur", "superviseur", "paie"] as const;
    expect([...simulatedPortalRoles]).toEqual([...HORORA_PORTAL_ROLES]);
    for (const role of simulatedPortalRoles) {
      expect(isHororaPortalRole(role)).toBe(true);
    }
    for (const label of simulatedClosedLabels) {
      expect(isHororaPortalRole(label)).toBe(false);
      expect(businessFunctionGrantsPortalAccess(label)).toBe(false);
    }
    for (const capability of [
      "punch_in_out",
      "read_payroll",
      "manage_payroll",
      "export_payroll",
      "admin_finance",
      "manage_employees",
      "manage_configuration",
    ] as const) {
      expect(hororaPortalRoleAllows("employe", capability)).toBe(capability === "punch_in_out");
      expect(hororaPortalRoleAllows("direction", capability)).toBe(false);
    }
    expect(hororaPortalRoleAllows("admin", "punch_in_out")).toBe(false);
  });

  it("reads the matrix from the punch, approval and payroll guards", () => {
    const shared = read("src/app/api/horodateur/_shared.ts");
    const punch = read("src/app/api/horodateur/punch/route.ts");
    const ownHours = read("src/app/api/horodateur/me/route.ts");
    const history = read("src/app/api/horodateur/me/history/route.ts");
    const approve = read("src/app/api/direction/horodateur/exceptions/[id]/approve/route.ts");
    const correction = read("src/app/api/direction/horodateur/retro-correction/route.ts");
    const payroll = read("src/app/lib/horodateur-v1/payroll-access.server.ts");
    const issue = read("src/app/lib/horodateur-v1/payroll-accountant-operational.server.ts");

    expect(shared).toContain("hororaPortalRoleAllows");
    expect(shared).toContain("evaluateResolvedEmployeePunchProfile");
    expect(punch).toContain('requireEmployeeHorodateurAccess(req, "punch_in_out")');
    expect(punch).toContain('hororaPortalRoleAllows("employe", "request_own_correction")');
    expect(ownHours).toContain('requireEmployeeHorodateurAccess(req, "view_own_hours")');
    expect(history).toContain('requireEmployeeHorodateurAccess(req, "view_own_hours")');
    expect(approve).toContain('requireDirectionHorodateurAccess(req, "approve_anomalies",');
    expect(correction).toContain('requireDirectionHorodateurAccess(req, "correct_time",');
    expect(approve).toContain("target: hororaSupervisorHttpServerTarget()");
    expect(correction).toContain("target: hororaSupervisorHttpServerTarget()");
    expect(payroll).toContain("evaluateHororaPayrollCapability");
    expect(issue).toContain('input.operation === "issue" ? "manage" : "read"');
  });
});

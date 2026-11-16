import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildVerifiedOrganizationCompanyAccess,
  getCompanyLabel,
  selectVerifiedEmployeeCompany,
} from "@/app/lib/account-requests.shared";
import {
  isOpenShiftState,
  resolveEmployeePunchGuidance,
  resolveOpenShiftSafetyCapForDisplay,
} from "@/app/lib/employee-punch-guidance.shared";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("Yves clock display", () => {
  it("does not ask for a punch-out when the authoritative state is hors_quart", () => {
    const guidance = resolveEmployeePunchGuidance({ currentState: "hors_quart" });
    const showSafetyCap = resolveOpenShiftSafetyCapForDisplay({
      currentState: "hors_quart",
      historicalOpenShiftBeyondSafetyLimit: true,
    });

    expect(guidance.primary).toEqual({
      eventType: "punch_in",
      label: "Pointer mon arrivée",
    });
    expect(showSafetyCap).toBe(false);
    expect(guidance.guidance).not.toContain("sortie");
  });

  it("keeps the safety-cap warning when the shift is still open", () => {
    expect(
      resolveOpenShiftSafetyCapForDisplay({
        currentState: "en_quart",
        historicalOpenShiftBeyondSafetyLimit: true,
      })
    ).toBe(true);
    expect(resolveEmployeePunchGuidance({ currentState: "en_quart" }).primary?.eventType).toBe(
      "punch_out"
    );
    expect(isOpenShiftState("en_pause")).toBe(true);
    expect(isOpenShiftState("en_diner")).toBe(true);
  });

  it("does not invent a safety-cap warning for a recent open shift", () => {
    expect(
      resolveOpenShiftSafetyCapForDisplay({
        currentState: "en_quart",
        historicalOpenShiftBeyondSafetyLimit: false,
      })
    ).toBe(false);
    expect(isOpenShiftState("en_quart")).toBe(true);
  });

  it("wires the live display and the employee screen to the authoritative state", () => {
    const service = read("src/app/lib/horodateur-v1/service.ts");
    const page = read("src/app/employe/horodateur/page.tsx");
    expect(service).toContain("resolveOpenShiftSafetyCapForDisplay");
    expect(service).toContain("currentState: resolvedState");
    expect(page).toContain("isOpenShiftState(currentStateValue)");
    expect(page).toContain("OPEN_SHIFT_SAFETY_CAP_MESSAGE");
  });
});

describe("Yves schedule cookie session", () => {
  it("loads Mon horaire from the Nexus cookie and still refuses other roles", () => {
    const shell = read("src/app/employe/effectifs/EmployeEffectifsShell.tsx");
    const route = read("src/app/api/employe/effectifs/mon-horaire/route.ts");
    const request = read("src/app/lib/auth/horora-nexus-session.client.ts");

    expect(shell).toContain("hororaNexusSessionRequestInit");
    expect(shell).not.toContain("supabase.auth.getSession");
    expect(shell).not.toContain("Authorization");
    expect(shell).toContain("res.status === 401");
    expect(shell).toContain("if (!res.ok)");
    expect(request).toContain('headers.delete("Authorization")');
    expect(request).toContain('credentials: "same-origin"');
    expect(route).toContain("getAuthenticatedRequestUser");
    expect(route).toContain('role !== "employe"');
    expect(route).toContain("{ status: 401 }");
    expect(route).toContain("{ status: 403 }");
  });
});

describe("Yves verified company", () => {
  const oliemOrganizationId = "bb676f93-8915-4426-8c4a-07d40f666215";

  it("shows Oliem Solutions only for the session organization", () => {
    expect(
      selectVerifiedEmployeeCompany({
        sessionOrganizationId: oliemOrganizationId,
        employeeOrganizationId: oliemOrganizationId,
        primaryCompany: "oliem_solutions",
      })
    ).toBe("oliem_solutions");
    expect(getCompanyLabel("oliem_solutions")).toBe("Oliem Solutions");

    const access = buildVerifiedOrganizationCompanyAccess("oliem_solutions");
    expect(access.primaryCompany).toBe("oliem_solutions");
    expect(access.allowedCompanies).toEqual(["oliem_solutions"]);
    expect(access.canWorkForTitanProduitsIndustriels).toBe(false);
  });

  it("does not display a company from another organization", () => {
    expect(
      selectVerifiedEmployeeCompany({
        sessionOrganizationId: oliemOrganizationId,
        employeeOrganizationId: "other-organization",
        primaryCompany: "titan_produits_industriels",
      })
    ).toBeNull();
    expect(getCompanyLabel(null)).toBe("Compagnie non definie");
    expect(buildVerifiedOrganizationCompanyAccess(null).primaryCompany).toBeNull();
  });

  it("reads the company on the server and the profile does not choose an organization", () => {
    const route = read("src/app/api/auth/session-context/route.ts");
    const access = read("src/app/hooks/useCurrentAccess.ts");
    const profile = read("src/app/employe/profil/page.tsx");
    expect(route).toContain("selectVerifiedEmployeeCompany");
    expect(route).toContain("getEmployeeByAuthUserId(authUserId, { organizationId })");
    expect(route).not.toContain("searchParams");
    expect(route).not.toContain("user_metadata");
    expect(access).toContain("buildVerifiedOrganizationCompanyAccess(brokered.company)");
    expect(profile).toContain("getCompanyLabel(companyAccess.primaryCompany ?? companyAccess.company)");
    expect(profile).not.toContain("searchParams");
  });
});

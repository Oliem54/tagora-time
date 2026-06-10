import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEmployeeProfileApiResponse,
  buildEmployeeProfileGetApiPath,
  CHAUFFEUR_CONFIDENTIAL_FINANCE_KEYS,
  stripConfidentialFinanceFields,
} from "./employee-profile-shared";

describe("employee profile API response", () => {
  it("strips confidential finance fields for direction viewers", () => {
    const row = {
      id: 9,
      nom: "Émile Cloutier",
      taux_base_titan: 42,
      social_benefits_percent: 12,
      titan_billable: true,
    };

    const filtered = stripConfidentialFinanceFields(row);

    expect(filtered.id).toBe(9);
    expect(filtered.nom).toBe("Émile Cloutier");
    for (const key of CHAUFFEUR_CONFIDENTIAL_FINANCE_KEYS) {
      expect(filtered).not.toHaveProperty(key);
    }
  });

  it("returns full row for admin finance viewers", () => {
    const row = {
      id: 9,
      nom: "Émile Cloutier",
      taux_base_titan: 42,
    };

    expect(buildEmployeeProfileApiResponse(row, true)).toEqual(row);
  });

  it("builds GET API path without Supabase view dependency", () => {
    expect(buildEmployeeProfileGetApiPath(9)).toBe(
      "/api/direction/ressources/employes/9"
    );
  });
});

describe("EmployeeProfilePageClient load path", () => {
  it("loads via GET API and not direction_employee_operational_profile", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/app/direction/ressources/employes/EmployeeProfilePageClient.tsx"),
      "utf8"
    );

    expect(src).not.toContain("direction_employee_operational_profile");
    expect(src).toContain("buildEmployeeProfileGetApiPath");
    expect(src).toContain("EMPLOYEE_PROFILE_LOAD_ERROR_MESSAGE");
  });
});

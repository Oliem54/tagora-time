import { describe, expect, it } from "vitest";
import {
  ALL_SELLERS_KEY,
  buildCommissionSellerOptions,
  filterCommissionsBySeller,
  formatPlanBeneficiarySellerLabel,
  groupCommissionsBySeller,
  resolveCommissionSellerKey,
  resolveCommissionSellerLabel,
} from "@/app/admin/commissions/commission-seller-filter.shared";

const yves = {
  chauffeur_id: 2,
  assignee_label: "Yves",
  label: "Commission Yves",
};
const marie = {
  chauffeur_id: 7,
  assignee_label: "Marie",
  label: "Commission Marie",
};
const team = {
  chauffeur_id: null,
  team_name: "Équipe Est",
  assignee_label: "Équipe Est",
  label: "Commission équipe",
};

describe("commission seller filter", () => {
  it("resolves seller key and label for an employee", () => {
    expect(resolveCommissionSellerKey(yves)).toBe("employee:2");
    expect(resolveCommissionSellerLabel(yves)).toBe("Yves");
  });

  it("formats plan beneficiary as Yves — Employé #2", () => {
    expect(
      formatPlanBeneficiarySellerLabel("Yves", "Employé #2", 2)
    ).toBe("Yves — Employé #2");
  });

  it("builds sorted seller options", () => {
    const options = buildCommissionSellerOptions([marie, yves, team]);
    expect(options.map((row) => row.label)).toEqual(
      ["Marie", "Yves", "Équipe Est"].sort((a, b) =>
        a.localeCompare(b, "fr-CA")
      )
    );
  });

  it("merges plan beneficiaries into seller options without duplicates", () => {
    const options = buildCommissionSellerOptions(
      [
        {
          chauffeur_id: 9,
          assignee_label: "QA-PR45-Employe Test (qa-pr45-employe@test.local)",
        },
      ],
      [
        {
          employeeId: 2,
          primary: "Yves",
          secondary: "Employé #2",
        },
        {
          employeeId: 2,
          primary: "Yves",
          secondary: "Employé #2",
        },
      ]
    );
    expect(options).toHaveLength(2);
    const yvesOption = options.find((row) => row.key === "employee:2");
    expect(yvesOption?.label).toBe("Yves — Employé #2");
  });

  it("upgrades an objective seller label when plan beneficiary is richer", () => {
    const options = buildCommissionSellerOptions(
      [{ chauffeur_id: 2, assignee_label: "Yves" }],
      [{ employeeId: 2, primary: "Yves", secondary: "Employé #2" }]
    );
    expect(options).toHaveLength(1);
    expect(options[0]?.label).toBe("Yves — Employé #2");
  });

  it("keeps all sellers by default", () => {
    const filtered = filterCommissionsBySeller([yves, marie], ALL_SELLERS_KEY);
    expect(filtered).toHaveLength(2);
  });

  it("filters by selected seller", () => {
    const filtered = filterCommissionsBySeller(
      [yves, marie, team],
      "employee:2"
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.assignee_label).toBe("Yves");
  });

  it("groups commissions by seller for premium browsing", () => {
    const groups = groupCommissionsBySeller([yves, marie, yves]);
    expect(groups).toHaveLength(2);
    const yvesGroup = groups.find((row) => row.key === "employee:2");
    expect(yvesGroup?.label).toBe("Yves");
    expect(yvesGroup?.entries).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import {
  ALL_SELLERS_KEY,
  buildCommissionSellerOptions,
  filterCommissionsBySeller,
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

  it("builds sorted seller options", () => {
    const options = buildCommissionSellerOptions([marie, yves, team]);
    expect(options.map((row) => row.label)).toEqual(
      ["Marie", "Yves", "Équipe Est"].sort((a, b) =>
        a.localeCompare(b, "fr-CA")
      )
    );
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

import { describe, expect, it } from "vitest";
import {
  formatFrDate,
  formatPayPlanRuleKindLabel,
} from "@/app/admin/commissions/plans/pay-plan-readability";

describe("pay plan detail readability", () => {
  it("labels percentage_of_eligible_sales in French", () => {
    expect(formatPayPlanRuleKindLabel("percentage_of_eligible_sales")).toBe(
      "Pourcentage des ventes admissibles"
    );
  });

  it("labels fixed_amount_per_unit in French", () => {
    expect(formatPayPlanRuleKindLabel("fixed_amount_per_unit")).toBe(
      "Montant fixe par unitÃ©"
    );
  });

  it("humanizes unknown technical rule kinds without underscores", () => {
    expect(formatPayPlanRuleKindLabel("custom_bonus_rate")).toBe(
      "Custom bonus rate"
    );
  });

  it("formats ISO date fields as fr-CA long dates", () => {
    expect(formatFrDate("2026-08-05")).toBe("5 aoÃ»t 2026");
  });

  it("keeps calendar day when API returns UTC midnight ISO", () => {
    expect(formatFrDate("2026-08-05T00:00:00.000Z")).toBe("5 aoÃ»t 2026");
    expect(formatFrDate("2026-08-05T00:00:00+00:00")).toBe("5 aoÃ»t 2026");
  });

  it("never shifts 2026-08-05 to the previous calendar day", () => {
    const variants = [
      "2026-08-05",
      "2026-08-05T00:00:00.000Z",
      "2026-08-05T00:00:00Z",
      "2026-08-05T00:00:00+00:00",
      "2026-08-05 00:00:00+00",
    ];
    for (const value of variants) {
      const label = formatFrDate(value);
      expect(label).toBe("5 aoÃ»t 2026");
      expect(label).not.toContain("4 aoÃ»t");
    }
  });

  it("keeps empty date readable", () => {
    expect(formatFrDate("")).toBe("â€”");
  });
});

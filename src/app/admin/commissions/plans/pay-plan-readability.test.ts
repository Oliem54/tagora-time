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
      "Montant fixe par unité"
    );
  });

  it("humanizes unknown technical rule kinds without underscores", () => {
    expect(formatPayPlanRuleKindLabel("custom_bonus_rate")).toBe(
      "Custom bonus rate"
    );
  });

  it("formats ISO date fields as fr-CA long dates", () => {
    expect(formatFrDate("2026-08-05")).toBe("5 août 2026");
  });

  it("keeps empty date readable", () => {
    expect(formatFrDate("")).toBe("—");
  });
});

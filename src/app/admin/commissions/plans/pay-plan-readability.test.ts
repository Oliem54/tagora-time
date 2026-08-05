import { describe, expect, it } from "vitest";
import {
  formatFrDate,
  formatPayPlanRuleKindLabel,
  formatPayPlanVersionSummaryDate,
  resolvePayPlanCalendarDate,
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

describe("pay plan version summary date (right MetaLine path)", () => {
  it("formats 2026-08-05 and UTC-midnight ISO as 5 août 2026", () => {
    expect(formatPayPlanVersionSummaryDate("2026-08-05")).toBe("5 août 2026");
    expect(formatPayPlanVersionSummaryDate("2026-08-05T00:00:00.000Z")).toBe(
      "5 août 2026"
    );
  });

  it("never shifts the summary to the previous calendar day", () => {
    const variants: unknown[] = [
      "2026-08-05",
      "2026-08-05T00:00:00.000Z",
      "2026-08-05T00:00:00Z",
      "2026-08-05T00:00:00+00:00",
      new Date("2026-08-05T00:00:00.000Z"),
      // Ancien piège: String(Date UTC midnight) en fuseau Amérique du Nord
      "Tue Aug 04 2026 20:00:00 GMT-0400 (Eastern Daylight Time)",
    ];
    for (const value of variants) {
      const label = formatPayPlanVersionSummaryDate(value);
      expect(label).toBe("5 août 2026");
      expect(label).not.toContain("4 août");
    }
  });

  it("resolves calendar day without depending on host timezone", () => {
    expect(resolvePayPlanCalendarDate("2026-08-05")).toBe("2026-08-05");
    expect(resolvePayPlanCalendarDate("2026-08-05T00:00:00.000Z")).toBe(
      "2026-08-05"
    );
    expect(
      resolvePayPlanCalendarDate(new Date("2026-08-05T00:00:00.000Z"))
    ).toBe("2026-08-05");
  });
});

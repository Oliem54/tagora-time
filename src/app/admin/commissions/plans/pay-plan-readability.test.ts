import { describe, expect, it } from "vitest";
import {
  formatFrDate,
  formatPayPlanNewDraftDateHint,
  formatPayPlanRuleKindLabel,
  formatPayPlanVersionSummaryDate,
  PAY_PLAN_ACTIVE_VERSION_DATE_LABEL,
  PAY_PLAN_ACTIVE_VERSION_LABEL,
  PAY_PLAN_NEW_DRAFT_BUTTON_LABEL,
  PAY_PLAN_NEW_DRAFT_DATE_LABEL,
  PAY_PLAN_NEW_DRAFT_PANEL_TITLE,
  payPlanStatusLabel,
  resolvePayPlanCalendarDate,
} from "@/app/admin/commissions/plans/pay-plan-readability";

describe("pay plan detail readability", () => {
  it("labels paid status as Payée", () => {
    expect(payPlanStatusLabel("paid")).toBe("Payée");
    expect(payPlanStatusLabel("validated")).toBe("Validée");
  });

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

describe("pay plan version section context clarity", () => {
  it("keeps active version labels distinct from new draft labels", () => {
    expect(PAY_PLAN_ACTIVE_VERSION_LABEL).toBe("Version active");
    expect(PAY_PLAN_ACTIVE_VERSION_DATE_LABEL).toBe(
      "Date d’effet de la version active"
    );
    expect(PAY_PLAN_NEW_DRAFT_PANEL_TITLE).toBe(
      "Créer une nouvelle version brouillon"
    );
    expect(PAY_PLAN_NEW_DRAFT_DATE_LABEL).toBe(
      "Date d’effet de la nouvelle version"
    );
    expect(PAY_PLAN_NEW_DRAFT_BUTTON_LABEL).toBe("Créer la version brouillon");
  });

  it("formats the new draft human reading with explicit context", () => {
    expect(formatPayPlanNewDraftDateHint("2026-08-05")).toBe(
      "Nouvelle version prévue pour le 5 août 2026"
    );
  });

  it("does not rewrite an active version calendar day of 4 août", () => {
    expect(formatPayPlanVersionSummaryDate("2026-08-04")).toBe("4 août 2026");
    expect(formatPayPlanVersionSummaryDate("2026-08-04T00:00:00.000Z")).toBe(
      "4 août 2026"
    );
  });
});

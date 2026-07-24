import { describe, expect, it } from "vitest";
import { formatCad } from "./commissions.shared";
import {
  displayCopyExposesTechnicalIds,
  formatAchievedValue,
  formatAggregateSalesBasisDisplay,
  formatCommissionBasisLabel,
  formatCommissionRuleValue,
  formatRuleTypeLabel,
  formatTargetTypeLabel,
  formatTargetValue,
  formatTierThreshold,
  summarizeObjectiveRulesForDisplay,
} from "./commission-display.shared";
import { resolveAggregateCommissionBasisKind } from "./commissions.shared";

describe("commission display — target / achieved", () => {
  it("1. amount objective formats target and achieved as currency", () => {
    expect(
      formatTargetValue({
        target_type: "amount",
        target_amount: 100000,
        target_sales_count: null,
      })
    ).toBe(formatCad(100000));
    expect(
      formatAchievedValue({
        target_type: "amount",
        achieved_amount: 45000,
        achieved_sales_count: 3,
      })
    ).toBe(formatCad(45000));
  });

  it("2. sales_count objective formats target and achieved as units", () => {
    expect(
      formatTargetValue({
        target_type: "sales_count",
        target_amount: 100000,
        target_sales_count: 10,
      })
    ).toBe("10 unités");
    expect(
      formatAchievedValue({
        target_type: "sales_count",
        achieved_amount: 90000,
        achieved_sales_count: 1,
      })
    ).toBe("1 unité");
  });
});

describe("commission display — rule values", () => {
  it("3. percentage + achieved_amount", () => {
    expect(
      formatCommissionRuleValue({
        rule_type: "percentage",
        commission_basis: "achieved_amount",
        percentage_rate: 5,
      })
    ).toBe("5 % sur Montant réalisé");
  });

  it("4. percentage + achieved_sales_count", () => {
    expect(
      formatCommissionRuleValue({
        rule_type: "percentage",
        commission_basis: "achieved_sales_count",
        percentage_rate: 2,
      })
    ).toBe("2 % sur Unités réalisées");
  });

  it("5. fixed shows currency and ignored basis note", () => {
    const text = formatCommissionRuleValue({
      rule_type: "fixed",
      commission_basis: "achieved_sales_count",
      fixed_amount: 500,
    });
    expect(text).toContain(formatCad(500));
    expect(text).toMatch(/base ignorée/i);
  });

  it("6. tier_bonus thresholds in currency", () => {
    expect(formatTierThreshold(50000, "achieved_amount")).toBe(formatCad(50000));
    expect(
      formatCommissionRuleValue({
        rule_type: "tier_bonus",
        commission_basis: "achieved_amount",
        tier_config: [{ threshold: 50000, bonus_amount: 200 }],
      })
    ).toContain(formatCad(50000));
  });

  it("7. tier_bonus thresholds in units", () => {
    expect(formatTierThreshold(10, "achieved_sales_count")).toBe("10 unités");
    expect(
      formatCommissionRuleValue({
        rule_type: "tier_bonus",
        commission_basis: "achieved_sales_count",
        tier_config: [{ threshold: 10, bonus_amount: 150 }],
      })
    ).toContain("10 unités");
  });

  it("8. per_unit as dollars per unit realized", () => {
    expect(
      formatCommissionRuleValue({
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: 100,
      })
    ).toBe("100 $ par unité réalisée");
  });

  it("9. null commission_basis falls back to Montant réalisé + currency", () => {
    expect(formatCommissionBasisLabel(null)).toBe("Montant réalisé");
    expect(formatTierThreshold(1000, null)).toBe(formatCad(1000));
    expect(
      formatCommissionRuleValue({
        rule_type: "percentage",
        commission_basis: null,
        percentage_rate: 3,
      })
    ).toBe("3 % sur Montant réalisé");
  });

  it("10. units basis never uses currency for basis value formatting via aggregate", () => {
    const text = formatAggregateSalesBasisDisplay(7, {
      kind: "uniform",
      basis: "achieved_sales_count",
    });
    expect(text).toBe("7 unités");
    expect(text).not.toMatch(/\$|CAD/i);
  });
});

describe("commission display — aggregates", () => {
  it("11. identical amount bases stay monetary", () => {
    const kind = resolveAggregateCommissionBasisKind([
      "achieved_amount",
      "achieved_amount",
    ]);
    expect(kind).toEqual({ kind: "uniform", basis: "achieved_amount" });
    expect(formatAggregateSalesBasisDisplay(1200, kind)).toBe(formatCad(1200));
  });

  it("12. identical units bases stay units", () => {
    const kind = resolveAggregateCommissionBasisKind([
      "achieved_sales_count",
      "achieved_sales_count",
    ]);
    expect(kind).toEqual({ kind: "uniform", basis: "achieved_sales_count" });
    expect(formatAggregateSalesBasisDisplay(9, kind)).toBe("9 unités");
  });

  it("13. mixed bases show Bases mixtes without a blended total", () => {
    const kind = resolveAggregateCommissionBasisKind([
      "achieved_amount",
      "achieved_sales_count",
    ]);
    expect(kind).toEqual({ kind: "mixed" });
    expect(formatAggregateSalesBasisDisplay(999, kind)).toBe("Bases mixtes");
  });
});

describe("commission display — labels and separation", () => {
  it("14. employee-facing labels expose no technical ids", () => {
    const samples = [
      formatTargetTypeLabel("amount"),
      formatTargetTypeLabel("sales_count"),
      formatRuleTypeLabel("per_unit"),
      formatCommissionBasisLabel("achieved_sales_count"),
      formatCommissionRuleValue({
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: 100,
      }),
    ];
    for (const sample of samples) {
      expect(displayCopyExposesTechnicalIds(sample)).toBe(false);
    }
  });

  it("15. direction-facing labels stay human and read-only friendly", () => {
    expect(formatTargetTypeLabel("amount")).toBe("Montant de ventes");
    expect(formatTargetTypeLabel("sales_count")).toBe("Nombre d’unités vendues");
    expect(formatRuleTypeLabel("fixed")).toBe("Montant fixe");
  });

  it("16. monetary KPI formatting remains currency (calculated amounts)", () => {
    expect(formatCad(2500)).toMatch(/\$|CAD|CA\$/);
  });

  it("17. progress display is independent of commission_basis (target_type drives values)", () => {
    const amountTarget = formatTargetValue({
      target_type: "amount",
      target_amount: 100,
    });
    const unitsTarget = formatTargetValue({
      target_type: "sales_count",
      target_sales_count: 5,
    });
    expect(amountTarget).toBe(formatCad(100));
    expect(unitsTarget).toBe("5 unités");
    // commission_basis does not alter target formatting
    expect(amountTarget).not.toBe(unitsTarget);
  });

  it("18. never mixes units and amounts in one aggregate total", () => {
    const summary = summarizeObjectiveRulesForDisplay([
      {
        rule_type: "percentage",
        commission_basis: "achieved_amount",
        percentage_rate: 2,
      },
      {
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: 100,
      },
    ]);
    expect(summary.basisLabel).toBe("Bases mixtes");
    expect(summary.basisKind.kind).toBe("mixed");
    expect(formatAggregateSalesBasisDisplay(50, summary.basisKind)).toBe("Bases mixtes");
  });
});

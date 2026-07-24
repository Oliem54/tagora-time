import { describe, expect, it } from "vitest";
import {
  calculateRuleCommission,
  computeProgressPercent,
  resolveCommissionBasis,
  salesBasisForObjective,
} from "./calculate.server";
import type { CommissionRuleRow, SalesObjectiveRow } from "./commissions.shared";

function objective(
  overrides: Partial<SalesObjectiveRow> & Pick<SalesObjectiveRow, "target_type">
): Pick<
  SalesObjectiveRow,
  | "target_type"
  | "target_amount"
  | "target_sales_count"
  | "achieved_amount"
  | "achieved_sales_count"
> {
  return {
    target_type: overrides.target_type,
    target_amount: overrides.target_amount ?? null,
    target_sales_count: overrides.target_sales_count ?? null,
    achieved_amount: overrides.achieved_amount ?? 0,
    achieved_sales_count: overrides.achieved_sales_count ?? 0,
  };
}

function rule(
  overrides: Partial<CommissionRuleRow> &
    Pick<CommissionRuleRow, "rule_type" | "commission_basis">
): Pick<
  CommissionRuleRow,
  | "rule_type"
  | "commission_basis"
  | "fixed_amount"
  | "percentage_rate"
  | "per_unit_amount"
  | "tier_config"
  | "achievement_bonus_amount"
  | "is_active"
> {
  return {
    rule_type: overrides.rule_type,
    commission_basis: overrides.commission_basis,
    fixed_amount: overrides.fixed_amount ?? null,
    percentage_rate: overrides.percentage_rate ?? null,
    per_unit_amount: overrides.per_unit_amount ?? null,
    tier_config: overrides.tier_config ?? [],
    achievement_bonus_amount: overrides.achievement_bonus_amount ?? null,
    is_active: overrides.is_active ?? true,
  };
}

describe("resolveCommissionBasis", () => {
  it("returns achieved_amount", () => {
    expect(
      resolveCommissionBasis(
        { achieved_amount: 70000, achieved_sales_count: 7 },
        "achieved_amount"
      )
    ).toBe(70000);
  });

  it("returns achieved_sales_count", () => {
    expect(
      resolveCommissionBasis(
        { achieved_amount: 70000, achieved_sales_count: 7 },
        "achieved_sales_count"
      )
    ).toBe(7);
  });

  it("rejects unknown basis", () => {
    expect(() =>
      resolveCommissionBasis({ achieved_amount: 1, achieved_sales_count: 1 }, "unknown")
    ).toThrow(/inconnue/i);
  });
});

describe("calculateRuleCommission", () => {
  it("fixed on amount objective ignores basis", () => {
    const amount = calculateRuleCommission(
      rule({
        rule_type: "fixed",
        commission_basis: "achieved_amount",
        fixed_amount: 500,
      }),
      100000,
      false
    );
    expect(amount).toBe(500);
  });

  it("fixed on units objective ignores basis", () => {
    const amount = calculateRuleCommission(
      rule({
        rule_type: "fixed",
        commission_basis: "achieved_sales_count",
        fixed_amount: 500,
      }),
      7,
      false
    );
    expect(amount).toBe(500);
  });

  it("percentage on achieved_amount (historical cas B/C)", () => {
    const amount = calculateRuleCommission(
      rule({
        rule_type: "percentage",
        commission_basis: "achieved_amount",
        percentage_rate: 5,
      }),
      70000,
      false
    );
    expect(amount).toBe(3500);
  });

  it("percentage on achieved_sales_count", () => {
    const amount = calculateRuleCommission(
      rule({
        rule_type: "percentage",
        commission_basis: "achieved_sales_count",
        percentage_rate: 10,
      }),
      7,
      false
    );
    expect(amount).toBe(0.7);
  });

  it("tier_bonus on achieved_amount", () => {
    const amount = calculateRuleCommission(
      rule({
        rule_type: "tier_bonus",
        commission_basis: "achieved_amount",
        tier_config: [
          { threshold: 50000, bonus_amount: 200 },
          { threshold: 100000, bonus_amount: 500 },
        ],
      }),
      70000,
      false
    );
    expect(amount).toBe(200);
  });

  it("tier_bonus on achieved_sales_count", () => {
    const amount = calculateRuleCommission(
      rule({
        rule_type: "tier_bonus",
        commission_basis: "achieved_sales_count",
        tier_config: [
          { threshold: 5, bonus_amount: 50 },
          { threshold: 10, bonus_amount: 150 },
        ],
      }),
      7,
      false
    );
    expect(amount).toBe(50);
  });

  it("per_unit: 7 units × 100$ = 700$", () => {
    const basis = resolveCommissionBasis(
      { achieved_amount: 0, achieved_sales_count: 7 },
      "achieved_sales_count"
    );
    const amount = calculateRuleCommission(
      rule({
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: 100,
      }),
      basis,
      false
    );
    expect(amount).toBe(700);
  });

  it("rejects per_unit + achieved_amount", () => {
    expect(() =>
      calculateRuleCommission(
        rule({
          rule_type: "per_unit",
          commission_basis: "achieved_amount",
          per_unit_amount: 100,
        }),
        70000,
        false
      )
    ).toThrow(/invalide|unité/i);
  });

  it("rejects per_unit_amount = 0", () => {
    expect(() =>
      calculateRuleCommission(
        rule({
          rule_type: "per_unit",
          commission_basis: "achieved_sales_count",
          per_unit_amount: 0,
        }),
        7,
        false
      )
    ).toThrow(/supérieur à 0/i);
  });

  it("rejects negative per_unit_amount", () => {
    expect(() =>
      calculateRuleCommission(
        rule({
          rule_type: "per_unit",
          commission_basis: "achieved_sales_count",
          per_unit_amount: -10,
        }),
        7,
        false
      )
    ).toThrow(/supérieur à 0/i);
  });

  it("rejects unknown rule_type", () => {
    expect(() =>
      calculateRuleCommission(
        {
          ...rule({
            rule_type: "fixed",
            commission_basis: "achieved_amount",
            fixed_amount: 1,
          }),
          rule_type: "unknown" as CommissionRuleRow["rule_type"],
        },
        0,
        false
      )
    ).toThrow(/inconnu/i);
  });

  it("rejects non-finite basis", () => {
    expect(() =>
      calculateRuleCommission(
        rule({
          rule_type: "percentage",
          commission_basis: "achieved_amount",
          percentage_rate: 5,
        }),
        Number.NaN,
        false
      )
    ).toThrow(/fini/i);
  });
});

describe("progress independent of commission_basis", () => {
  it("computeProgressPercent uses target_type only", () => {
    const unitsObjective = objective({
      target_type: "sales_count",
      target_sales_count: 10,
      achieved_sales_count: 7,
      achieved_amount: 999999,
    });
    expect(computeProgressPercent(unitsObjective)).toBe(70);

    const amountObjective = objective({
      target_type: "amount",
      target_amount: 100000,
      achieved_amount: 45000,
      achieved_sales_count: 99,
    });
    expect(computeProgressPercent(amountObjective)).toBe(45);
  });

  it("changing commission_basis fields does not affect progress helpers", () => {
    const obj = objective({
      target_type: "sales_count",
      target_sales_count: 10,
      achieved_sales_count: 5,
      achieved_amount: 0,
    });
    const before = computeProgressPercent(obj);
    const basisAmount = resolveCommissionBasis(obj, "achieved_amount");
    const basisUnits = resolveCommissionBasis(obj, "achieved_sales_count");
    expect(basisAmount).toBe(0);
    expect(basisUnits).toBe(5);
    expect(computeProgressPercent(obj)).toBe(before);
  });
});

describe("deprecated salesBasisForObjective wrapper", () => {
  it("still returns achieved_amount for route compatibility", () => {
    expect(
      salesBasisForObjective({
        target_type: "sales_count",
        achieved_amount: 1234,
      })
    ).toBe(1234);
  });
});

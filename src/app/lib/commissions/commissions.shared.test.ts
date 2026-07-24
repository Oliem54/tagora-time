import { describe, expect, it } from "vitest";
import {
  formatCad,
  formatChauffeurDisplayLabel,
  formatCommissionBasisDisplay,
  isValidCommissionRuleCombination,
  normalizeCommissionBasis,
  normalizeRuleType,
  resolveAggregateCommissionBasisForDisplay,
  validateCommissionRuleCombination,
  type CommissionBasis,
  type RuleType,
} from "./commissions.shared";

describe("formatChauffeurDisplayLabel", () => {
  it("prefers nom with courriel", () => {
    expect(
      formatChauffeurDisplayLabel({
        id: 21,
        nom: "Vincent Blouin",
        courriel: "vincent@example.com",
      })
    ).toBe("Vincent Blouin (vincent@example.com)");
  });

  it("falls back to nom with id when courriel is missing", () => {
    expect(formatChauffeurDisplayLabel({ id: 11, nom: "Dominic Ouellet" })).toBe(
      "Dominic Ouellet (#11)"
    );
  });

  it("falls back to courriel or id-only label", () => {
    expect(formatChauffeurDisplayLabel({ id: 5, courriel: "ops@example.com" })).toBe(
      "ops@example.com"
    );
    expect(formatChauffeurDisplayLabel({ id: 7 })).toBe("Employé #7");
  });
});

describe("normalizeCommissionBasis / normalizeRuleType", () => {
  it("accepts known basis and rule types", () => {
    expect(normalizeCommissionBasis("achieved_amount")).toBe("achieved_amount");
    expect(normalizeCommissionBasis("achieved_sales_count")).toBe("achieved_sales_count");
    expect(normalizeCommissionBasis("other")).toBeNull();
    expect(normalizeRuleType("per_unit")).toBe("per_unit");
    expect(normalizeRuleType("fixed")).toBe("fixed");
    expect(normalizeRuleType("unknown")).toBeNull();
  });
});

describe("isValidCommissionRuleCombination matrix", () => {
  const bases: CommissionBasis[] = ["achieved_amount", "achieved_sales_count"];
  const modes: RuleType[] = ["fixed", "percentage", "tier_bonus", "per_unit"];

  it("allows fixed, percentage and tier_bonus on both bases", () => {
    for (const mode of ["fixed", "percentage", "tier_bonus"] as RuleType[]) {
      for (const basis of bases) {
        expect(isValidCommissionRuleCombination(mode, basis)).toBe(true);
      }
    }
  });

  it("allows per_unit only with achieved_sales_count", () => {
    expect(isValidCommissionRuleCombination("per_unit", "achieved_sales_count")).toBe(true);
    expect(isValidCommissionRuleCombination("per_unit", "achieved_amount")).toBe(false);
  });

  it("covers the full product matrix explicitly", () => {
    const expected: Record<RuleType, Record<CommissionBasis, boolean>> = {
      fixed: { achieved_amount: true, achieved_sales_count: true },
      percentage: { achieved_amount: true, achieved_sales_count: true },
      tier_bonus: { achieved_amount: true, achieved_sales_count: true },
      per_unit: { achieved_amount: false, achieved_sales_count: true },
    };

    for (const mode of modes) {
      for (const basis of bases) {
        expect(isValidCommissionRuleCombination(mode, basis)).toBe(expected[mode][basis]);
      }
    }
  });
});

describe("validateCommissionRuleCombination", () => {
  it("accepts per_unit with units basis and amount", () => {
    expect(
      validateCommissionRuleCombination({
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: 100,
      })
    ).toEqual({ ok: true });
  });

  it("rejects per_unit with monetary basis", () => {
    const result = validateCommissionRuleCombination({
      rule_type: "per_unit",
      commission_basis: "achieved_amount",
      per_unit_amount: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_combination");
  });

  it("rejects per_unit without per_unit_amount", () => {
    const result = validateCommissionRuleCombination({
      rule_type: "per_unit",
      commission_basis: "achieved_sales_count",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("missing_per_unit_amount");
  });

  it("rejects per_unit_amount equal to zero", () => {
    const result = validateCommissionRuleCombination({
      rule_type: "per_unit",
      commission_basis: "achieved_sales_count",
      per_unit_amount: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_per_unit_amount");
  });

  it("rejects negative per_unit_amount", () => {
    const result = validateCommissionRuleCombination({
      rule_type: "per_unit",
      commission_basis: "achieved_sales_count",
      per_unit_amount: -1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_per_unit_amount");
  });

  it("accepts percentage on achieved_amount (cas B/C)", () => {
    expect(
      validateCommissionRuleCombination({
        rule_type: "percentage",
        commission_basis: "achieved_amount",
      })
    ).toEqual({ ok: true });
  });

  it("accepts fixed with either basis", () => {
    expect(
      validateCommissionRuleCombination({
        rule_type: "fixed",
        commission_basis: "achieved_amount",
      })
    ).toEqual({ ok: true });
    expect(
      validateCommissionRuleCombination({
        rule_type: "fixed",
        commission_basis: "achieved_sales_count",
      })
    ).toEqual({ ok: true });
  });
});

describe("formatCommissionBasisDisplay", () => {
  it("formats achieved_amount as currency", () => {
    expect(formatCommissionBasisDisplay(70000, "achieved_amount")).toBe(formatCad(70000));
  });

  it("formats achieved_sales_count as integer units label", () => {
    expect(formatCommissionBasisDisplay(7, "achieved_sales_count")).toBe("7 unités");
    expect(formatCommissionBasisDisplay(1, "achieved_sales_count")).toBe("1 unité");
    expect(formatCommissionBasisDisplay(7.9, "achieved_sales_count")).toBe("7 unités");
  });

  it("falls back to currency when basis is null or undefined", () => {
    expect(formatCommissionBasisDisplay(1250.5, null)).toBe(formatCad(1250.5));
    expect(formatCommissionBasisDisplay(1250.5, undefined)).toBe(formatCad(1250.5));
  });
});

describe("resolveAggregateCommissionBasisForDisplay", () => {
  it("returns units only when every basis is achieved_sales_count", () => {
    expect(
      resolveAggregateCommissionBasisForDisplay([
        "achieved_sales_count",
        "achieved_sales_count",
      ])
    ).toBe("achieved_sales_count");
  });

  it("returns amount for empty, null, amount, or mixed bases", () => {
    expect(resolveAggregateCommissionBasisForDisplay([])).toBe("achieved_amount");
    expect(resolveAggregateCommissionBasisForDisplay([null])).toBe("achieved_amount");
    expect(resolveAggregateCommissionBasisForDisplay(["achieved_amount"])).toBe(
      "achieved_amount"
    );
    expect(
      resolveAggregateCommissionBasisForDisplay([
        "achieved_sales_count",
        "achieved_amount",
      ])
    ).toBe("achieved_amount");
  });
});

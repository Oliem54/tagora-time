import { describe, expect, it } from "vitest";
import {
  computeProgressPercent,
  salesBasisForObjective,
} from "./calculate.server";
import {
  buildEstimatedCommissionEntries,
  parseAndValidateCommissionRuleInput,
  toCommissionRuleInsertPayload,
} from "./commission-rules.server";
import type { CommissionRuleRow, SalesObjectiveRow } from "./commissions.shared";

function baseObjective(
  overrides: Partial<SalesObjectiveRow> = {}
): Pick<
  SalesObjectiveRow,
  | "achieved_amount"
  | "achieved_sales_count"
  | "chauffeur_id"
  | "team_name"
  | "period_start"
  | "period_end"
  | "target_type"
  | "target_amount"
  | "target_sales_count"
> {
  return {
    target_type: overrides.target_type ?? "amount",
    target_amount: overrides.target_amount ?? 100000,
    target_sales_count: overrides.target_sales_count ?? null,
    achieved_amount: overrides.achieved_amount ?? 70000,
    achieved_sales_count: overrides.achieved_sales_count ?? 7,
    chauffeur_id: overrides.chauffeur_id ?? 11,
    team_name: overrides.team_name ?? null,
    period_start: overrides.period_start ?? "2026-07-01",
    period_end: overrides.period_end ?? "2026-07-31",
  };
}

function baseRule(
  overrides: Partial<CommissionRuleRow> &
    Pick<CommissionRuleRow, "rule_type" | "commission_basis">
): CommissionRuleRow {
  return {
    id: overrides.id ?? "rule-1",
    objective_id: overrides.objective_id ?? "obj-1",
    rule_name: overrides.rule_name ?? "Commission",
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

describe("parseAndValidateCommissionRuleInput", () => {
  it("falls back commission_basis to achieved_amount when absent (pre-migration)", () => {
    const parsed = parseAndValidateCommissionRuleInput({
      rule_type: "percentage",
      percentage_rate: 5,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.rule.commission_basis).toBe("achieved_amount");
      expect(parsed.rule.per_unit_amount).toBeNull();
      expect(parsed.rule.rule_type).toBe("percentage");
    }
  });

  it("legacy fixed without commission_basis stays fixed (never per_unit)", () => {
    const parsed = parseAndValidateCommissionRuleInput({
      rule_type: "fixed",
      fixed_amount: 500,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.rule.rule_type).toBe("fixed");
      expect(parsed.rule.commission_basis).toBe("achieved_amount");
      expect(parsed.rule.fixed_amount).toBe(500);
      expect(parsed.rule.per_unit_amount).toBeNull();
    }
  });

  it("legacy tier_bonus without commission_basis falls back to achieved_amount", () => {
    const parsed = parseAndValidateCommissionRuleInput({
      rule_type: "tier_bonus",
      tier_config: [{ threshold: 50000, bonus_amount: 200 }],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.rule.rule_type).toBe("tier_bonus");
      expect(parsed.rule.commission_basis).toBe("achieved_amount");
      expect(parsed.rule.per_unit_amount).toBeNull();
      expect(parsed.rule.tier_config[0]?.threshold).toBe(50000);
    }
  });

  it("never auto-promotes legacy rules to per_unit or units basis", () => {
    for (const rule_type of ["fixed", "percentage", "tier_bonus"] as const) {
      const raw: Record<string, unknown> = { rule_type };
      if (rule_type === "fixed") raw.fixed_amount = 100;
      if (rule_type === "percentage") raw.percentage_rate = 5;
      if (rule_type === "tier_bonus") {
        raw.tier_config = [{ threshold: 1, bonus_amount: 10 }];
      }
      const parsed = parseAndValidateCommissionRuleInput(raw);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.rule.rule_type).not.toBe("per_unit");
        expect(parsed.rule.commission_basis).toBe("achieved_amount");
        expect(parsed.rule.commission_basis).not.toBe("achieved_sales_count");
      }
    }
  });

  it("rejects unknown rule_type", () => {
    const parsed = parseAndValidateCommissionRuleInput({ rule_type: "mystery" });
    expect(parsed.ok).toBe(false);
  });

  it("rejects per_unit + achieved_amount", () => {
    const parsed = parseAndValidateCommissionRuleInput({
      rule_type: "per_unit",
      commission_basis: "achieved_amount",
      per_unit_amount: 100,
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects per_unit_amount null/zero/negative", () => {
    for (const per_unit_amount of [null, 0, -5]) {
      const parsed = parseAndValidateCommissionRuleInput({
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount,
      });
      expect(parsed.ok).toBe(false);
    }
  });

  it("accepts per_unit with units basis", () => {
    const parsed = parseAndValidateCommissionRuleInput({
      rule_type: "per_unit",
      commission_basis: "achieved_sales_count",
      per_unit_amount: 100,
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects fixed with per_unit_amount set", () => {
    const parsed = parseAndValidateCommissionRuleInput({
      rule_type: "fixed",
      fixed_amount: 500,
      per_unit_amount: 10,
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("toCommissionRuleInsertPayload legacy strip", () => {
  it("omits new columns for historical percentage + achieved_amount", () => {
    const parsed = parseAndValidateCommissionRuleInput({
      rule_type: "percentage",
      percentage_rate: 2,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const payload = toCommissionRuleInsertPayload(parsed.rule, "obj-1");
    expect(payload.commission_basis).toBeUndefined();
    expect(payload.per_unit_amount).toBeUndefined();
    expect(payload.rule_type).toBe("percentage");
  });

  it("includes new columns for per_unit", () => {
    const parsed = parseAndValidateCommissionRuleInput({
      rule_type: "per_unit",
      commission_basis: "achieved_sales_count",
      per_unit_amount: 100,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const payload = toCommissionRuleInsertPayload(parsed.rule, "obj-1");
    expect(payload.commission_basis).toBe("achieved_sales_count");
    expect(payload.per_unit_amount).toBe(100);
  });
});

describe("buildEstimatedCommissionEntries", () => {
  it("recalculates percentage + achieved_amount", () => {
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: baseObjective({ achieved_amount: 70000, achieved_sales_count: 7 }),
      rules: [
        baseRule({
          rule_type: "percentage",
          commission_basis: "achieved_amount",
          percentage_rate: 5,
        }),
      ],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].sales_basis_amount).toBe(70000);
    expect(entries[0].calculated_amount).toBe(3500);
  });

  it("recalculates percentage + achieved_sales_count", () => {
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: baseObjective({ achieved_sales_count: 7 }),
      rules: [
        baseRule({
          rule_type: "percentage",
          commission_basis: "achieved_sales_count",
          percentage_rate: 10,
        }),
      ],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(entries[0].sales_basis_amount).toBe(7);
    expect(entries[0].calculated_amount).toBe(0.7);
  });

  it("recalculates per_unit 7 × 100 = 700", () => {
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: baseObjective({
        target_type: "sales_count",
        target_sales_count: 10,
        achieved_sales_count: 7,
        achieved_amount: 0,
      }),
      rules: [
        baseRule({
          rule_type: "per_unit",
          commission_basis: "achieved_sales_count",
          per_unit_amount: 100,
        }),
      ],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(entries[0].sales_basis_amount).toBe(7);
    expect(entries[0].calculated_amount).toBe(700);
  });

  it("fixed ignores basis", () => {
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: baseObjective({ achieved_amount: 99999, achieved_sales_count: 3 }),
      rules: [
        baseRule({
          rule_type: "fixed",
          commission_basis: "achieved_sales_count",
          fixed_amount: 500,
        }),
      ],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(entries[0].calculated_amount).toBe(500);
    expect(entries[0].sales_basis_amount).toBe(3);
  });

  it("tier_bonus with amount basis", () => {
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: baseObjective({ achieved_amount: 70000 }),
      rules: [
        baseRule({
          rule_type: "tier_bonus",
          commission_basis: "achieved_amount",
          tier_config: [
            { threshold: 50000, bonus_amount: 200 },
            { threshold: 100000, bonus_amount: 500 },
          ],
        }),
      ],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(entries[0].calculated_amount).toBe(200);
  });

  it("tier_bonus with units basis", () => {
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: baseObjective({ achieved_sales_count: 7 }),
      rules: [
        baseRule({
          rule_type: "tier_bonus",
          commission_basis: "achieved_sales_count",
          tier_config: [
            { threshold: 5, bonus_amount: 50 },
            { threshold: 10, bonus_amount: 150 },
          ],
        }),
      ],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(entries[0].calculated_amount).toBe(50);
  });

  it("falls back missing commission_basis to achieved_amount", () => {
    const rule = baseRule({
      rule_type: "percentage",
      commission_basis: "achieved_amount",
      percentage_rate: 5,
    });
    // Simulate pre-migration mapped row then wipe basis as empty legacy
    const legacy = { ...rule, commission_basis: undefined as unknown as CommissionRuleRow["commission_basis"] };
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: baseObjective({ achieved_amount: 70000, achieved_sales_count: 99 }),
      rules: [legacy],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(entries[0].sales_basis_amount).toBe(70000);
    expect(entries[0].calculated_amount).toBe(3500);
  });

  it("legacy fixed without commission_basis returns fixed_amount once", () => {
    const legacy = {
      ...baseRule({
        rule_type: "fixed",
        commission_basis: "achieved_amount",
        fixed_amount: 500,
      }),
      commission_basis: undefined as unknown as CommissionRuleRow["commission_basis"],
    };
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: baseObjective({ achieved_amount: 99999, achieved_sales_count: 12 }),
      rules: [legacy],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].calculated_amount).toBe(500);
    expect(entries[0].rule_id).toBe("rule-1");
  });

  it("legacy tier_bonus without commission_basis uses achieved_amount thresholds", () => {
    const legacy = {
      ...baseRule({
        rule_type: "tier_bonus",
        commission_basis: "achieved_amount",
        tier_config: [
          { threshold: 50000, bonus_amount: 200 },
          { threshold: 100000, bonus_amount: 500 },
        ],
      }),
      commission_basis: undefined as unknown as CommissionRuleRow["commission_basis"],
    };
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: baseObjective({ achieved_amount: 70000, achieved_sales_count: 99 }),
      rules: [legacy],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(entries[0].sales_basis_amount).toBe(70000);
    expect(entries[0].calculated_amount).toBe(200);
  });

  it("rejects per_unit + achieved_amount", () => {
    expect(() =>
      buildEstimatedCommissionEntries({
        objectiveId: "obj-1",
        objective: baseObjective(),
        rules: [
          baseRule({
            rule_type: "per_unit",
            commission_basis: "achieved_amount",
            per_unit_amount: 100,
          }),
        ],
        objectiveAchieved: false,
        assigneeLabel: "Alex",
      })
    ).toThrow(/invalide|unité/i);
  });

  it("rejects per_unit_amount zero", () => {
    expect(() =>
      buildEstimatedCommissionEntries({
        objectiveId: "obj-1",
        objective: baseObjective({ achieved_sales_count: 7 }),
        rules: [
          baseRule({
            rule_type: "per_unit",
            commission_basis: "achieved_sales_count",
            per_unit_amount: 0,
          }),
        ],
        objectiveAchieved: false,
        assigneeLabel: "Alex",
      })
    ).toThrow(/supérieur à 0/i);
  });

  it("keeps progress independent from commission basis", () => {
    const objective = {
      ...baseObjective({
        target_type: "sales_count",
        target_sales_count: 10,
        achieved_sales_count: 7,
        achieved_amount: 999999,
      }),
    };
    const progress = computeProgressPercent(objective);
    buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective,
      rules: [
        baseRule({
          rule_type: "percentage",
          commission_basis: "achieved_amount",
          percentage_rate: 5,
        }),
      ],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(computeProgressPercent(objective)).toBe(progress);
    expect(progress).toBe(70);
  });

  it("never persists non-finite calculated amounts", () => {
    expect(() =>
      buildEstimatedCommissionEntries({
        objectiveId: "obj-1",
        objective: baseObjective({
          achieved_amount: Number.NaN,
        }),
        rules: [
          baseRule({
            rule_type: "percentage",
            commission_basis: "achieved_amount",
            percentage_rate: 5,
          }),
        ],
        objectiveAchieved: false,
        assigneeLabel: "Alex",
      })
    ).toThrow(/fini/i);
  });
});

describe("buildEstimatedCommissionEntries vs salesBasisForObjective", () => {
  it("uses CommissionBasis for sales_basis_amount, not salesBasisForObjective", () => {
    const objective = baseObjective({
      target_type: "sales_count",
      achieved_amount: 999999,
      achieved_sales_count: 7,
    });

    // Wrapper legacy: toujours achieved_amount (comportement historique).
    expect(salesBasisForObjective(objective)).toBe(999999);

    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective,
      rules: [
        baseRule({
          rule_type: "per_unit",
          commission_basis: "achieved_sales_count",
          per_unit_amount: 100,
        }),
      ],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].sales_basis_amount).toBe(7);
    expect(entries[0].calculated_amount).toBe(700);
    expect(entries[0].sales_basis_amount).not.toBe(
      salesBasisForObjective(objective)
    );
  });
});

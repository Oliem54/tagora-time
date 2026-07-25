import { describe, expect, it } from "vitest";
import {
  applyCommissionBasisChange,
  applyRuleTypeChange,
  applyTargetTypeChange,
  emptyAdminCreateObjectiveForm,
  formCopyExposesTechnicalIds,
  RULE_TYPE_FORM_OPTIONS,
  TARGET_TYPE_FORM_OPTIONS,
  COMMISSION_BASIS_FORM_OPTIONS,
  validateAndBuildAdminCreateObjectivePayload,
  type AdminCreateObjectiveFormState,
} from "./admin-create-objective-form.shared";

const DATES = { period_start: "2026-07-01", period_end: "2026-07-31" };

function baseForm(
  overrides: Partial<AdminCreateObjectiveFormState> = {}
): AdminCreateObjectiveFormState {
  return {
    ...emptyAdminCreateObjectiveForm(DATES),
    title: "Objectif test",
    chauffeur_id: "21",
    ...overrides,
  };
}

describe("admin create objective form — target_type", () => {
  it("1. accepts target_type amount", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "amount",
        target_amount: "100000",
        rule_type: "fixed",
        fixed_amount: "500",
      }),
      true
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.target_type).toBe("amount");
    expect(result.payload.target_amount).toBe(100000);
    expect(result.payload).not.toHaveProperty("target_sales_count");
  });

  it("2. accepts target_type sales_count", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "10",
        rule_type: "percentage",
        percentage_rate: "5",
        commission_basis: "achieved_amount",
      }),
      true
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.target_type).toBe("sales_count");
    expect(result.payload.target_sales_count).toBe(10);
    expect(result.payload).not.toHaveProperty("target_amount");
  });

  it("3. accepts positive integer sales_count", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "10",
        rule_type: "fixed",
        fixed_amount: "100",
      }),
      false
    );
    expect(result.ok).toBe(true);
  });

  it("4. rejects decimal sales_count", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "10.5",
        rule_type: "fixed",
        fixed_amount: "100",
      }),
      false
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/entier/i);
    expect(formCopyExposesTechnicalIds(result.error)).toBe(false);
  });

  it("5. rejects zero amount", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "amount",
        target_amount: "0",
        rule_type: "fixed",
        fixed_amount: "100",
      }),
      false
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/montant cible/i);
  });

  it("6. changing target_type clears incompatible target value", () => {
    const fromAmount = applyTargetTypeChange(
      baseForm({ target_type: "amount", target_amount: "50000", target_sales_count: "" }),
      "sales_count"
    );
    expect(fromAmount.target_type).toBe("sales_count");
    expect(fromAmount.target_amount).toBe("");
    expect(fromAmount.target_sales_count).toBe("");

    const fromCount = applyTargetTypeChange(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "12",
        target_amount: "",
      }),
      "amount"
    );
    expect(fromCount.target_type).toBe("amount");
    expect(fromCount.target_sales_count).toBe("");
    expect(fromCount.target_amount).toBe("");
  });
});

describe("admin create objective form — commission_basis", () => {
  it("7. commission_basis stays independent from target_type", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "10",
        commission_basis: "achieved_amount",
        rule_type: "percentage",
        percentage_rate: "5",
      }),
      true
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.target_type).toBe("sales_count");
    expect(result.payload.rules[0]?.commission_basis).toBe("achieved_amount");
  });

  it("8. accepts achieved_sales_count selection", () => {
    const next = applyCommissionBasisChange(baseForm(), "achieved_sales_count");
    expect(next.commission_basis).toBe("achieved_sales_count");
  });

  it("9. selecting per_unit forces achieved_sales_count", () => {
    const next = applyRuleTypeChange(
      baseForm({
        commission_basis: "achieved_amount",
        rule_type: "percentage",
        percentage_rate: "5",
      }),
      "per_unit"
    );
    expect(next.rule_type).toBe("per_unit");
    expect(next.commission_basis).toBe("achieved_sales_count");
    expect(next.percentage_rate).toBe("");
    expect(next.per_unit_amount).toBe("");
  });

  it("10. achieved_amount is impossible with per_unit", () => {
    const forced = applyCommissionBasisChange(
      baseForm({
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: "100",
      }),
      "achieved_amount"
    );
    expect(forced.commission_basis).toBe("achieved_sales_count");

    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "10",
        rule_type: "per_unit",
        commission_basis: "achieved_amount",
        per_unit_amount: "100",
      }),
      true
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unités réalisées/i);
    expect(formCopyExposesTechnicalIds(result.error)).toBe(false);
  });
});

describe("admin create objective form — per_unit_amount", () => {
  it("11. accepts positive per_unit_amount", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "10",
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: "100",
      }),
      true
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.rules[0]?.per_unit_amount).toBe(100);
  });

  it("12. rejects empty per_unit_amount", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "10",
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: "",
      }),
      true
    );
    expect(result.ok).toBe(false);
  });

  it("13. rejects zero per_unit_amount", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "10",
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: "0",
      }),
      true
    );
    expect(result.ok).toBe(false);
  });

  it("14. rejects negative per_unit_amount", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "10",
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: "-10",
      }),
      true
    );
    expect(result.ok).toBe(false);
  });
});

describe("admin create objective form — field cleanup", () => {
  it("15. fixed cleans per_unit_amount", () => {
    const next = applyRuleTypeChange(
      baseForm({
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: "100",
      }),
      "fixed"
    );
    expect(next.rule_type).toBe("fixed");
    expect(next.per_unit_amount).toBe("");
    expect(next.commission_basis).toBe("achieved_sales_count");
  });

  it("16. percentage cleans per_unit_amount", () => {
    const next = applyRuleTypeChange(
      baseForm({
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: "100",
      }),
      "percentage"
    );
    expect(next.per_unit_amount).toBe("");
    expect(next.percentage_rate).toBe("5");
  });

  it("17. tier_bonus cleans per_unit_amount", () => {
    const next = applyRuleTypeChange(
      baseForm({
        rule_type: "per_unit",
        commission_basis: "achieved_sales_count",
        per_unit_amount: "100",
      }),
      "tier_bonus"
    );
    expect(next.per_unit_amount).toBe("");
    expect(next.tier_threshold).toBe("");
    expect(next.tier_bonus_amount).toBe("");
  });
});

describe("admin create objective form — business cases payloads", () => {
  it("18. payload Cas A", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "10",
        commission_basis: "achieved_sales_count",
        rule_type: "per_unit",
        per_unit_amount: "100",
      }),
      true
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      target_type: "sales_count",
      target_sales_count: 10,
      publish: true,
      rules: [
        {
          rule_type: "per_unit",
          commission_basis: "achieved_sales_count",
          per_unit_amount: 100,
        },
      ],
    });
    expect(result.payload).not.toHaveProperty("target_amount");
    expect(result.payload.rules[0]).not.toHaveProperty("fixed_amount");
    expect(result.payload.rules[0]).not.toHaveProperty("percentage_rate");
    expect(result.payload.rules[0]).not.toHaveProperty("tier_config");
  });

  it("19. payload Cas B", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "sales_count",
        target_sales_count: "10",
        commission_basis: "achieved_amount",
        rule_type: "percentage",
        percentage_rate: "5",
      }),
      true
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      target_type: "sales_count",
      target_sales_count: 10,
      rules: [
        {
          rule_type: "percentage",
          commission_basis: "achieved_amount",
          percentage_rate: 5,
        },
      ],
    });
    expect(result.payload.rules[0]).not.toHaveProperty("per_unit_amount");
    expect(result.payload.rules[0]).not.toHaveProperty("fixed_amount");
  });

  it("20. payload Cas C", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "amount",
        target_amount: "100000",
        commission_basis: "achieved_amount",
        rule_type: "percentage",
        percentage_rate: "2",
      }),
      true
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      target_type: "amount",
      target_amount: 100000,
      rules: [
        {
          rule_type: "percentage",
          commission_basis: "achieved_amount",
          percentage_rate: 2,
        },
      ],
    });
  });

  it("21. payload Cas D", () => {
    const result = validateAndBuildAdminCreateObjectivePayload(
      baseForm({
        target_type: "amount",
        target_amount: "100000",
        commission_basis: "achieved_amount",
        rule_type: "fixed",
        fixed_amount: "500",
      }),
      true
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      target_type: "amount",
      target_amount: 100000,
      rules: [
        {
          rule_type: "fixed",
          commission_basis: "achieved_amount",
          fixed_amount: 500,
        },
      ],
    });
    expect(result.payload.rules[0]?.commission_basis).toBe("achieved_amount");
    expect(result.payload.rules[0]).not.toHaveProperty("per_unit_amount");
  });

  it("22. no technical identifiers in user-facing form copy", () => {
    for (const option of [
      ...TARGET_TYPE_FORM_OPTIONS,
      ...COMMISSION_BASIS_FORM_OPTIONS,
      ...RULE_TYPE_FORM_OPTIONS,
    ]) {
      expect(formCopyExposesTechnicalIds(option.label)).toBe(false);
      expect(option.label).not.toBe(option.value);
    }

    const initial = emptyAdminCreateObjectiveForm(DATES);
    expect(initial.commission_basis).toBe("achieved_amount");
    expect(initial.rule_type).toBe("percentage");
  });
});

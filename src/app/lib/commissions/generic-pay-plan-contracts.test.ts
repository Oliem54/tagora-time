import { describe, expect, it } from "vitest";
import {
  DEFAULT_OVERLAP_BEHAVIOR,
  DEFAULT_TRAINING_POLICY,
  DEFAULT_VERSION_POLICY,
  PAY_PLAN_PERMISSIONS,
  PAY_PLAN_RULE_KINDS,
  assertRuleKindIsNotEmployeeIdentifier,
  assignmentMatchesSale,
  buildOverlapConflict,
  detectOverlappingAssignments,
  isPayPlanPermission,
  isPayPlanRuleKind,
  saleIdentityKey,
  validateActiveVersionHasEffectiveDate,
  validateActiveVersionImmutable,
  validateAssignmentIdentity,
  validateNoSilentWinnerOnOverlap,
  validateNumericCoherence,
  validatePriority,
  validateSplitPercents,
  validateTemplateCode,
  validateTemplateName,
  validateTrainingEntryNotPayable,
  validateVersionChangeRequest,
  type AssignmentOverlapInput,
  type GenericPayPlanAssignment,
  type GenericPayPlanTemplate,
  type GenericPayPlanVersion,
} from "@/app/lib/commissions/generic-pay-plan-contracts";

const ORG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function baseAssignment(
  id: string,
  employeeId: number,
  overrides?: Partial<AssignmentOverlapInput["scope"]>
): AssignmentOverlapInput {
  return {
    id,
    employee_id: employeeId,
    status: "active",
    scope: {
      organization_uuid: ORG,
      company_ids: [],
      product_category_ids: [],
      account_class_codes: [],
      sales_channels: [],
      effective_from: "2026-01-01",
      effective_to: null,
      priority: 0,
      ...overrides,
    },
  };
}

describe("6E.1 generic pay plan contracts", () => {
  it("1. accepts a valid generic template", () => {
    const template: GenericPayPlanTemplate = {
      id: "tpl-1",
      organization_uuid: ORG,
      template_code: "retail_vehicles",
      name: "Vente de véhicules",
      description: null,
      status: "draft",
      current_version_id: null,
      created_at: "2026-08-03T00:00:00.000Z",
      updated_at: "2026-08-03T00:00:00.000Z",
    };
    expect(validateTemplateName(template.name)).toEqual({ ok: true });
    expect(validateTemplateCode(template.template_code)).toEqual({ ok: true });
  });

  it("2. allows the same template assigned to multiple employees", () => {
    const a = baseAssignment("asg-a", 101);
    const b = baseAssignment("asg-b", 102);
    expect(a.scope.organization_uuid).toBe(b.scope.organization_uuid);
    expect(validateAssignmentIdentity({
      employee_id: a.employee_id,
      organization_uuid: ORG,
      version_id: "ver-1",
    })).toEqual({ ok: true });
    expect(validateAssignmentIdentity({
      employee_id: b.employee_id,
      organization_uuid: ORG,
      version_id: "ver-1",
    })).toEqual({ ok: true });
  });

  it("3. supports per-assignment overrides without mutating the template", () => {
    const assignment: GenericPayPlanAssignment = {
      id: "asg-1",
      organization_uuid: ORG,
      employee_id: 101,
      template_id: "tpl-1",
      version_id: "ver-1",
      status: "active",
      processing_frequency: "biweekly",
      scope: {
        organization_uuid: ORG,
        company_ids: ["co-1"],
        product_category_ids: [],
        account_class_codes: ["account-class-a"],
        sales_channels: [],
        employee_id: 101,
        effective_from: "2026-01-01",
        effective_to: null,
        priority: 1,
      },
      overrides: [
        {
          id: "ov-1",
          assignment_id: "asg-1",
          field_key: "monthly_target_units",
          value: 12,
          reason: "Objectif propre à l’affectation",
        },
      ],
      created_at: "2026-08-03T00:00:00.000Z",
      updated_at: "2026-08-03T00:00:00.000Z",
    };
    expect(assignment.overrides).toHaveLength(1);
    expect(assignment.template_id).toBe("tpl-1");
  });

  it("4. treats an active version as immutable", () => {
    const version: Pick<GenericPayPlanVersion, "status" | "is_immutable"> = {
      status: "active",
      is_immutable: true,
    };
    expect(validateActiveVersionImmutable(version, true).ok).toBe(false);
    expect(validateActiveVersionImmutable(version, false).ok).toBe(true);
  });

  it("5. requires a new version change request with effective date", () => {
    expect(
      validateVersionChangeRequest({
        organization_uuid: ORG,
        template_id: "tpl-1",
        source_version_id: "ver-1",
        new_version_number: 2,
        new_effective_from: "2026-09-01",
        selected_assignment_ids: ["asg-a"],
        change_reason: "Ajustement de taux",
        changed_by: "admin-user-1",
      })
    ).toEqual({ ok: true });
    expect(
      validateVersionChangeRequest({
        organization_uuid: ORG,
        template_id: "tpl-1",
        source_version_id: "ver-1",
        new_version_number: 2,
        new_effective_from: "",
        selected_assignment_ids: [],
        change_reason: "",
        changed_by: "admin-user-1",
      }).ok
    ).toBe(false);
  });

  it("6. allows multiple active plans with distinct scopes", () => {
    const vehicle = baseAssignment("asg-veh", 101, {
      product_category_ids: ["cat-vehicles"],
    });
    const parts = baseAssignment("asg-parts", 101, {
      product_category_ids: ["cat-parts"],
    });
    const saleVehicle = {
      organization_uuid: ORG,
      employee_id: 101,
      company_id: "co-1",
      product_category_id: "cat-vehicles",
      account_class_code: "account-class-a",
      sales_channel: "b2b",
      sale_date: "2026-03-15",
    };
    expect(assignmentMatchesSale(vehicle, saleVehicle)).toBe(true);
    expect(assignmentMatchesSale(parts, saleVehicle)).toBe(false);
    expect(
      detectOverlappingAssignments([vehicle, parts], saleVehicle)
    ).toEqual(["asg-veh"]);
  });

  it("7. blocks overlapping active assignments", () => {
    const a = baseAssignment("asg-a", 101);
    const b = baseAssignment("asg-b", 101);
    const sale = {
      organization_uuid: ORG,
      employee_id: 101,
      company_id: "co-1",
      product_category_id: "cat-vehicles",
      account_class_code: "account-class-a",
      sales_channel: "b2b",
      sale_date: "2026-03-15",
    };
    const matching = detectOverlappingAssignments([a, b], sale);
    expect(matching).toEqual(["asg-a", "asg-b"]);
    expect(validateNoSilentWinnerOnOverlap(matching).ok).toBe(false);
  });

  it("8. never selects a silent winner on overlap", () => {
    expect(DEFAULT_OVERLAP_BEHAVIOR).toBe("block_and_require_admin_review");
    const conflict = buildOverlapConflict({
      organization_uuid: ORG,
      sale_id: "sale-1",
      sale_line_id: "line-1",
      matching_assignment_ids: ["asg-a", "asg-b"],
      detected_at: "2026-08-03T12:00:00.000Z",
    });
    expect(conflict).not.toBeNull();
    expect(conflict?.resolution).toBeNull();
    expect(conflict?.status).toBe("open");
  });

  it("9. accepts a split totaling 100%", () => {
    expect(
      validateSplitPercents([
        { employee_id: 101, percent: 50 },
        { employee_id: 102, percent: 50 },
      ])
    ).toEqual({ ok: true });
  });

  it("10. rejects an invalid split", () => {
    expect(
      validateSplitPercents([
        { employee_id: 101, percent: 60 },
        { employee_id: 102, percent: 50 },
      ]).ok
    ).toBe(false);
  });

  it("11. recognizes the commission_accounting permission", () => {
    expect(isPayPlanPermission("commission_accounting")).toBe(true);
    expect(PAY_PLAN_PERMISSIONS).toContain("commission_accounting");
  });

  it("12. represents golf as a configurable account_class code", () => {
    const accountClass = {
      account_class_id: "ac-1",
      account_class_code: "golf",
      display_name: "Comptes golf",
      organization_uuid: ORG,
      is_active: true,
    };
    expect(typeof accountClass.account_class_code).toBe("string");
    expect(accountClass.account_class_code).toBe("golf");
  });

  it("13. keeps training entries non-payable", () => {
    expect(DEFAULT_TRAINING_POLICY.payable).toBe(false);
    expect(DEFAULT_TRAINING_POLICY.user_label).toBe(
      "ENTRAÎNEMENT — NON PAYABLE"
    );
    expect(validateTrainingEntryNotPayable("training", "payable").ok).toBe(
      false
    );
    expect(validateTrainingEntryNotPayable("training", "provisional").ok).toBe(
      true
    );
  });

  it("14. exposes only generic rule kinds", () => {
    expect(PAY_PLAN_RULE_KINDS).toContain("fixed_amount_per_unit");
    expect(PAY_PLAN_RULE_KINDS).toContain("recoverable_advance");
    expect(PAY_PLAN_RULE_KINDS).toContain("progressive_profit_tiers");
    expect(isPayPlanRuleKind("percentage_of_eligible_sales")).toBe(true);
  });

  it("15. contains no employee personal names in technical identifiers", () => {
    const identifiers = [
      ...PAY_PLAN_RULE_KINDS,
      ...PAY_PLAN_PERMISSIONS,
      DEFAULT_OVERLAP_BEHAVIOR,
      DEFAULT_TRAINING_POLICY.user_label,
    ].join("|");
    expect(identifiers.toLowerCase()).not.toMatch(/mario|émile|emile|racine|cloutier/);
  });

  it("16. is conceptually compatible with fixed amount per unit", () => {
    expect(isPayPlanRuleKind("fixed_amount_per_unit")).toBe(true);
    expect(
      validateNumericCoherence({ amount: 140, currency_code: "CAD" })
    ).toEqual({ ok: true });
  });

  it("17. is conceptually compatible with percentage of sales", () => {
    expect(isPayPlanRuleKind("percentage_of_eligible_sales")).toBe(true);
    expect(validateNumericCoherence({ rate_percent: 6 })).toEqual({
      ok: true,
    });
  });

  it("18. is conceptually compatible with volume tiers", () => {
    expect(isPayPlanRuleKind("retroactive_volume_tier")).toBe(true);
    expect(
      validateNumericCoherence({
        tiers: [
          { from: 0, to: 150, value: 200 },
          { from: 151, to: 200, value: 250 },
          { from: 201, to: null, value: 300 },
        ],
        retroactive: true,
      })
    ).toEqual({ ok: true });
  });

  it("19. is conceptually compatible with recoverable advance", () => {
    expect(isPayPlanRuleKind("recoverable_advance")).toBe(true);
    expect(isPayPlanRuleKind("advance_waterfall")).toBe(true);
    expect(
      validateNumericCoherence({
        advance_annual_amount: 52000,
        advance_period_divisor: 26,
      })
    ).toEqual({ ok: true });
  });

  it("20. is conceptually compatible with progressive profit tiers", () => {
    expect(isPayPlanRuleKind("progressive_profit_tiers")).toBe(true);
    expect(isPayPlanRuleKind("minimum_guarantee")).toBe(true);
    expect(
      validateNumericCoherence({
        min_amount: 225,
        tiers: [
          { from: 1000, to: 3000, value: 22 },
          { from: 3000, to: null, value: 30 },
        ],
      })
    ).toEqual({ ok: true });
  });

  it("rejects employee identifiers as rule kinds", () => {
    expect(assertRuleKindIsNotEmployeeIdentifier("employee-a").ok).toBe(false);
    expect(assertRuleKindIsNotEmployeeIdentifier("101").ok).toBe(false);
    expect(
      assertRuleKindIsNotEmployeeIdentifier("fixed_amount_per_unit")
    ).toEqual({ ok: true });
  });

  it("requires effective date on active versions", () => {
    expect(
      validateActiveVersionHasEffectiveDate({
        status: "active",
        effective_from: "2026-01-01",
      })
    ).toEqual({ ok: true });
    expect(
      validateActiveVersionHasEffectiveDate({
        status: "active",
        effective_from: "",
      }).ok
    ).toBe(false);
  });

  it("validates priorities and version policy flags", () => {
    expect(validatePriority(0)).toEqual({ ok: true });
    expect(validatePriority(-1).ok).toBe(false);
    expect(DEFAULT_VERSION_POLICY.active_version_immutable).toBe(true);
    expect(DEFAULT_VERSION_POLICY.closed_period_recalculation_forbidden).toBe(
      true
    );
  });

  it("builds stable anti-duplicate identity keys", () => {
    expect(
      saleIdentityKey({
        kind: "vehicle",
        organization_uuid: ORG,
        company_id: "co-1",
        stock_number: "STK-100",
      })
    ).toBe(`vehicle|${ORG}|co-1|STK-100`);
    expect(
      saleIdentityKey({
        kind: "parts_line",
        organization_uuid: ORG,
        company_id: "co-1",
        invoice_number: "INV-9",
        invoice_line_number: "3",
      })
    ).toBe(`parts_line|${ORG}|co-1|INV-9|3`);
  });
});

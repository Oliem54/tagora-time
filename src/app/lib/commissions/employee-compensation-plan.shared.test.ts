import { describe, expect, it } from "vitest";
import {
  canEditPlanVersion,
  canTransitionPlanVersionStatus,
  clonePlanVersion,
  detectPlanVersionOverlaps,
  isPlanVersionApplicableOnDate,
  mapCommercialOriginForPlan,
  resolveApplicablePlanVersion,
  validateCompensationPlan,
  validateCompensationPlanRule,
  validateCompensationPlanVersion,
  type CompensationPlan,
  type CompensationPlanRule,
  type CompensationPlanVersion,
} from "./employee-compensation-plan.shared";
import type { CommissionCategoryRow } from "./commission-catalog.shared";

const ORG = "org_a";
const PLAN_ID = "plan-1";

function plan(overrides: Partial<CompensationPlan> = {}): CompensationPlan {
  return {
    id: PLAN_ID,
    organization_id: ORG,
    employee_id: 10,
    plan_code: "plan_marie_2026",
    name: "Plan Marie 2026",
    description: null,
    status: "active",
    current_version_id: null,
    ...overrides,
  };
}

function version(
  overrides: Partial<CompensationPlanVersion> = {}
): CompensationPlanVersion {
  return {
    id: "v1",
    organization_id: ORG,
    plan_id: PLAN_ID,
    version_number: 1,
    status: "active",
    effective_from: "2026-01-01",
    effective_to: null,
    published_at: "2026-01-01T00:00:00.000Z",
    published_by: null,
    notes: null,
    ...overrides,
  };
}

function category(
  overrides: Partial<CommissionCategoryRow> = {}
): CommissionCategoryRow {
  return {
    id: "cat-1",
    organization_id: ORG,
    code: "vehicles",
    label: "Véhicules",
    description: null,
    display_order: 10,
    is_visible: true,
    is_active: true,
    is_system_default: true,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function rule(
  overrides: Partial<CompensationPlanRule> = {}
): CompensationPlanRule {
  return {
    id: "r1",
    organization_id: ORG,
    plan_version_id: "v1",
    category_id: "cat-1",
    commercial_origin: "existing",
    calculation_basis: "net_sales_ex_tax",
    calculation_method: "percentage",
    rate_percent: 5,
    fixed_amount: null,
    per_unit_amount: null,
    currency_code: "CAD",
    min_amount: null,
    max_amount: null,
    display_order: 10,
    is_active: true,
    ...overrides,
  };
}

describe("compensation plan validation", () => {
  it("1. accepts a valid plan", () => {
    expect(
      validateCompensationPlan({
        organization_id: ORG,
        employee_id: 10,
        plan_code: "plan_marie_2026",
        name: "Plan Marie",
        employee_organization_id: ORG,
      })
    ).toEqual({ ok: true });
  });

  it("2. rejects cross-tenant employee", () => {
    expect(
      validateCompensationPlan({
        organization_id: ORG,
        employee_id: 10,
        plan_code: "plan_x",
        name: "X",
        employee_organization_id: "org_b",
      })
    ).toMatchObject({ ok: false });
  });
});

describe("plan versions", () => {
  it("3. accepts first draft version", () => {
    expect(
      validateCompensationPlanVersion({
        organization_id: ORG,
        plan_id: PLAN_ID,
        version_number: 1,
        status: "draft",
        effective_from: "2026-01-01",
      })
    ).toEqual({ ok: true });
  });

  it("4. accepts active version with valid dates", () => {
    expect(
      validateCompensationPlanVersion({
        organization_id: ORG,
        plan_id: PLAN_ID,
        version_number: 1,
        status: "active",
        effective_from: "2026-01-01",
        effective_to: "2026-12-31",
      })
    ).toEqual({ ok: true });
  });

  it("5. rejects effective_to before or equal effective_from (exclusive end)", () => {
    expect(
      validateCompensationPlanVersion({
        organization_id: ORG,
        plan_id: PLAN_ID,
        version_number: 1,
        status: "active",
        effective_from: "2026-06-01",
        effective_to: "2026-01-01",
      })
    ).toMatchObject({ ok: false });
    expect(
      validateCompensationPlanVersion({
        organization_id: ORG,
        plan_id: PLAN_ID,
        version_number: 1,
        status: "active",
        effective_from: "2026-06-01",
        effective_to: "2026-06-01",
      })
    ).toMatchObject({ ok: false });
  });

  it("6. detects overlapping versions", () => {
    const overlaps = detectPlanVersionOverlaps([
      version({ id: "a", effective_from: "2026-01-01", effective_to: "2026-06-30" }),
      version({
        id: "b",
        version_number: 2,
        effective_from: "2026-06-01",
        effective_to: null,
      }),
    ]);
    expect(overlaps).toEqual([["a", "b"]]);
  });

  it("7. resolves a single applicable version", () => {
    const result = resolveApplicablePlanVersion({
      organization_id: ORG,
      employee_id: 10,
      event_date: "2026-03-01",
      plan: plan(),
      versions: [
        version({
          id: "v1",
          effective_from: "2026-01-01",
          effective_to: "2026-06-30",
        }),
        version({
          id: "v2",
          version_number: 2,
          status: "scheduled",
          effective_from: "2026-07-01",
          effective_to: null,
        }),
      ],
    });
    expect(result.resolution_status).toBe("resolved");
    expect(result.plan_version_id).toBe("v1");
  });

  it("8. returns missing_plan when none apply", () => {
    expect(
      resolveApplicablePlanVersion({
        organization_id: ORG,
        employee_id: 10,
        event_date: "2025-01-01",
        plan: plan(),
        versions: [version({ effective_from: "2026-01-01" })],
      }).resolution_status
    ).toBe("missing_plan");
  });

  it("9. returns ambiguous when several versions apply", () => {
    const result = resolveApplicablePlanVersion({
      organization_id: ORG,
      employee_id: 10,
      event_date: "2026-06-15",
      plan: plan(),
      versions: [
        version({
          id: "a",
          effective_from: "2026-01-01",
          effective_to: "2026-12-31",
        }),
        version({
          id: "b",
          version_number: 2,
          effective_from: "2026-06-01",
          effective_to: null,
        }),
      ],
    });
    expect(result.resolution_status).toBe("ambiguous");
    expect(result.requires_review).toBe(true);
  });

  it("10. ignores future version before its date", () => {
    expect(
      resolveApplicablePlanVersion({
        organization_id: ORG,
        employee_id: 10,
        event_date: "2026-01-15",
        plan: plan(),
        versions: [
          version({
            id: "future",
            status: "scheduled",
            effective_from: "2026-07-01",
          }),
        ],
      }).resolution_status
    ).toBe("missing_plan");
  });

  it("11-12. published not editable; draft editable; workflow transitions", () => {
    expect(canEditPlanVersion(version({ status: "active" }))).toBe(false);
    expect(canEditPlanVersion(version({ status: "archived" }))).toBe(false);
    expect(canEditPlanVersion(version({ status: "draft" }))).toBe(true);
    expect(canTransitionPlanVersionStatus("draft", "active")).toBe(true);
    expect(canTransitionPlanVersionStatus("active", "archived")).toBe(true);
    expect(canTransitionPlanVersionStatus("archived", "draft")).toBe(false);
    expect(canTransitionPlanVersionStatus("active", "draft")).toBe(false);
  });

  it("effective_to is exclusive on applicability", () => {
    const v = version({
      effective_from: "2026-01-01",
      effective_to: "2026-07-01",
      status: "active",
    });
    expect(isPlanVersionApplicableOnDate(v, "2026-06-30")).toBe(true);
    expect(isPlanVersionApplicableOnDate(v, "2026-07-01")).toBe(false);
    expect(isPlanVersionApplicableOnDate(v, "2026-01-01")).toBe(true);
  });

  it("13. clone creates independent new draft version", () => {
    const source = version({ id: "old", version_number: 1, status: "active" });
    const sourceRules = [rule({ id: "old-r", plan_version_id: "old" })];
    const cloned = clonePlanVersion({
      source,
      source_rules: sourceRules,
      new_version_id: "new",
      new_version_number: 2,
      effective_from: "2026-07-01",
    });
    expect(cloned.version.id).toBe("new");
    expect(cloned.version.status).toBe("draft");
    expect(cloned.version.version_number).toBe(2);
    expect(cloned.rules[0]?.plan_version_id).toBe("new");
    expect(cloned.rules[0]?.id).not.toBe("old-r");
    expect(source.id).toBe("old");
    expect(sourceRules[0]?.plan_version_id).toBe("old");
  });
});

describe("plan rules", () => {
  it("14. rejects cross-tenant category", () => {
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-x",
        category: category({ organization_id: "org_b" }),
        calculation_basis: "net_sales_ex_tax",
        calculation_method: "percentage",
        rate_percent: 5,
      })
    ).toMatchObject({ ok: false });
  });

  it("15. rejects inactive category for new rule", () => {
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category({ is_active: false }),
        calculation_basis: "achieved_amount",
        calculation_method: "percentage",
        rate_percent: 2,
      })
    ).toMatchObject({ ok: false });
  });

  it("16. allows masked but active category in advanced mode", () => {
    const masked = category({ is_visible: false, is_active: true });
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: masked.id,
        category: masked,
        calculation_basis: "net_sales_ex_tax",
        calculation_method: "percentage",
        rate_percent: 1,
        advanced_mode: false,
      })
    ).toMatchObject({ ok: false });
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: masked.id,
        category: masked,
        calculation_basis: "net_sales_ex_tax",
        calculation_method: "percentage",
        rate_percent: 1,
        advanced_mode: true,
      })
    ).toEqual({ ok: true });
  });

  it("17-18. percentage valid / missing rate refused", () => {
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        calculation_basis: "net_sales_ex_tax",
        calculation_method: "percentage",
        rate_percent: 5,
      })
    ).toEqual({ ok: true });
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        calculation_basis: "net_sales_ex_tax",
        calculation_method: "percentage",
      })
    ).toMatchObject({ ok: false });
  });

  it("19-20. fixed_amount valid / missing refused", () => {
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        calculation_basis: "achieved_amount",
        calculation_method: "fixed_amount",
        fixed_amount: 100,
        currency_code: "CAD",
      })
    ).toEqual({ ok: true });
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        calculation_basis: "achieved_amount",
        calculation_method: "fixed_amount",
      })
    ).toMatchObject({ ok: false });
  });

  it("21-22. per_unit valid / missing refused; currency required", () => {
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        calculation_basis: "achieved_sales_count",
        calculation_method: "per_unit",
        per_unit_amount: 50,
        currency_code: "CAD",
      })
    ).toEqual({ ok: true });
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        calculation_basis: "achieved_sales_count",
        calculation_method: "per_unit",
        per_unit_amount: 50,
      })
    ).toMatchObject({ ok: false });
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        calculation_basis: "achieved_sales_count",
        calculation_method: "per_unit",
      })
    ).toMatchObject({ ok: false });
  });

  it("23-24. rejects negatives and invalid currency", () => {
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        calculation_basis: "net_sales_ex_tax",
        calculation_method: "percentage",
        rate_percent: -1,
      })
    ).toMatchObject({ ok: false });
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        calculation_basis: "achieved_amount",
        calculation_method: "fixed_amount",
        fixed_amount: 10,
        currency_code: "CA",
      })
    ).toMatchObject({ ok: false });
  });

  it("25-28. origins existing/employee_developed/company_developed/all", () => {
    expect(mapCommercialOriginForPlan("existing")).toBe("existing");
    expect(mapCommercialOriginForPlan("employee_developed")).toBe(
      "employee_developed"
    );
    expect(mapCommercialOriginForPlan("company_developed")).toBe("existing");
    expect(mapCommercialOriginForPlan(null)).toBe("all");

    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        commercial_origin: "existing",
        calculation_basis: "net_sales_ex_tax",
        calculation_method: "percentage",
        rate_percent: 1,
      })
    ).toEqual({ ok: true });
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        commercial_origin: "employee_developed",
        calculation_basis: "net_sales_ex_tax",
        calculation_method: "percentage",
        rate_percent: 2,
      })
    ).toEqual({ ok: true });
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        commercial_origin: "company_developed",
        calculation_basis: "net_sales_ex_tax",
        calculation_method: "percentage",
        rate_percent: 1,
      })
    ).toEqual({ ok: true });
    expect(
      validateCompensationPlanRule({
        organization_id: ORG,
        plan_version_id: "v1",
        category_id: "cat-1",
        category: category(),
        commercial_origin: null,
        calculation_basis: "net_sales_ex_tax",
        calculation_method: "percentage",
        rate_percent: 1,
      })
    ).toEqual({ ok: true });
  });

  it("29. clone keeps previous version intact", () => {
    const old = version({ id: "kept", version_number: 1 });
    const cloned = clonePlanVersion({
      source: old,
      source_rules: [rule()],
      new_version_id: "copy",
      new_version_number: 2,
      effective_from: "2026-08-01",
    });
    expect(old.id).toBe("kept");
    expect(old.version_number).toBe(1);
    expect(cloned.version.id).toBe("copy");
  });

  it("rejects foreign org plan resolution", () => {
    expect(
      resolveApplicablePlanVersion({
        organization_id: ORG,
        employee_id: 10,
        event_date: "2026-03-01",
        plan: plan(),
        versions: [version()],
        actor_organization_ids: ["org_b"],
      }).resolution_status
    ).toBe("rejected");
  });
});

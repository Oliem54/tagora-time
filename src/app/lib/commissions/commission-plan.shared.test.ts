import { describe, expect, it } from "vitest";
import {
  COMMISSION_CATEGORY_V1_KEYS,
  COMMISSION_PAY_MODE_V1_VALUES,
  CLIENT_COMMERCIAL_ORIGIN_V1_VISIBLE,
  deriveEligibilityFromPayMode,
  doPlanLinesConflict,
  doPrincipalPlanPeriodsOverlap,
  findConflictingPlanLinePairs,
  mapPayModeToEngineRule,
  resolveClientOriginForV1Plan,
  validateCommissionPlanLineInput,
  type CommissionPlanLine,
  type CommissionPlanVersion,
} from "./commission-plan.shared";

describe("commission plan model — principal plan can hold many lines", () => {
  it("represents one principal plan version with multiple categories, origins and modes", () => {
    const lines: CommissionPlanLine[] = [
      {
        id: "l1",
        plan_version_id: "v1",
        category_key: "vehicles",
        client_origin: "existing",
        eligibility: "eligible",
        pay_mode: "per_unit",
        per_unit_amount: 50,
        percentage_rate: null,
        fixed_amount: null,
      },
      {
        id: "l2",
        plan_version_id: "v1",
        category_key: "vehicles",
        client_origin: "employee_developed",
        eligibility: "eligible",
        pay_mode: "per_unit",
        per_unit_amount: 100,
        percentage_rate: null,
        fixed_amount: null,
      },
      {
        id: "l3",
        plan_version_id: "v1",
        category_key: "batteries",
        client_origin: "existing",
        eligibility: "eligible",
        pay_mode: "percentage",
        per_unit_amount: null,
        percentage_rate: 2,
        fixed_amount: null,
      },
      {
        id: "l4",
        plan_version_id: "v1",
        category_key: "batteries",
        client_origin: "employee_developed",
        eligibility: "eligible",
        pay_mode: "percentage",
        per_unit_amount: null,
        percentage_rate: 4,
        fixed_amount: null,
      },
      {
        id: "l5",
        plan_version_id: "v1",
        category_key: "service_parts",
        client_origin: "existing",
        eligibility: "not_eligible",
        pay_mode: "none",
        per_unit_amount: null,
        percentage_rate: null,
        fixed_amount: null,
      },
      {
        id: "l6",
        plan_version_id: "v1",
        category_key: "service_parts",
        client_origin: "employee_developed",
        eligibility: "eligible",
        pay_mode: "percentage",
        per_unit_amount: null,
        percentage_rate: 3,
        fixed_amount: null,
      },
    ];

    const version: CommissionPlanVersion = {
      id: "v1",
      plan_id: "p1",
      version_number: 1,
      effective_from: "2026-07-01",
      effective_to: null,
      created_at: "2026-07-01T00:00:00.000Z",
      created_by: null,
      change_reason: null,
      lines,
    };

    expect(version.lines).toHaveLength(6);
    expect(new Set(version.lines.map((l) => l.category_key)).size).toBe(3);
    expect(new Set(version.lines.map((l) => l.pay_mode)).size).toBeGreaterThan(1);
    expect(version.lines.some((l) => l.eligibility === "not_eligible")).toBe(true);
  });
});

describe("mapPayModeToEngineRule", () => {
  it("maps none to explicit not_eligible without zero rate", () => {
    const result = mapPayModeToEngineRule({ pay_mode: "none" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapping.kind).toBe("not_eligible");
    expect(result.mapping.eligibility).toBe("not_eligible");
    expect(result.mapping.rule_type).toBeNull();
    expect(result.mapping.percentage_rate).toBeNull();
  });

  it("maps per_unit to per_unit + achieved_sales_count", () => {
    const result = mapPayModeToEngineRule({
      pay_mode: "per_unit",
      per_unit_amount: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapping).toMatchObject({
      kind: "engine_rule",
      rule_type: "per_unit",
      commission_basis: "achieved_sales_count",
      per_unit_amount: 50,
    });
  });

  it("maps percentage to percentage + achieved_amount (independent of target_type)", () => {
    const result = mapPayModeToEngineRule({
      pay_mode: "percentage",
      percentage_rate: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapping).toMatchObject({
      kind: "engine_rule",
      rule_type: "percentage",
      commission_basis: "achieved_amount",
      percentage_rate: 2,
    });
  });

  it("maps fixed to fixed with default monetary basis (not from target_type)", () => {
    const result = mapPayModeToEngineRule({
      pay_mode: "fixed",
      fixed_amount: 500,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapping).toMatchObject({
      kind: "engine_rule",
      rule_type: "fixed",
      commission_basis: "achieved_amount",
      fixed_amount: 500,
      per_unit_amount: null,
      percentage_rate: null,
    });
  });

  it("rejects invalid amounts with plain-language errors", () => {
    expect(mapPayModeToEngineRule({ pay_mode: "per_unit", per_unit_amount: 0 }).ok).toBe(
      false
    );
    expect(
      mapPayModeToEngineRule({ pay_mode: "percentage", percentage_rate: -1 }).ok
    ).toBe(false);
    expect(mapPayModeToEngineRule({ pay_mode: "fixed", fixed_amount: null }).ok).toBe(
      false
    );
  });

  it("explicit not_eligible wins even if a pay mode is provided", () => {
    const result = mapPayModeToEngineRule({
      pay_mode: "percentage",
      eligibility: "not_eligible",
      percentage_rate: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapping.kind).toBe("not_eligible");
  });
});

describe("origins and eligibility helpers", () => {
  it("exposes two V1-visible origins and treats company_developed as existing", () => {
    expect(CLIENT_COMMERCIAL_ORIGIN_V1_VISIBLE).toEqual([
      "existing",
      "employee_developed",
    ]);
    expect(resolveClientOriginForV1Plan("company_developed")).toBe("existing");
    expect(resolveClientOriginForV1Plan("employee_developed")).toBe(
      "employee_developed"
    );
  });

  it("derives eligibility from pay mode", () => {
    expect(deriveEligibilityFromPayMode("none")).toBe("not_eligible");
    expect(deriveEligibilityFromPayMode("per_unit")).toBe("eligible");
  });

  it("lists all V1 categories and pay modes", () => {
    expect(COMMISSION_CATEGORY_V1_KEYS).toHaveLength(7);
    expect(COMMISSION_PAY_MODE_V1_VALUES).toEqual([
      "none",
      "per_unit",
      "percentage",
      "fixed",
    ]);
  });
});

describe("overlap and line conflicts", () => {
  it("detects overlapping principal plan periods", () => {
    expect(
      doPrincipalPlanPeriodsOverlap(
        { effective_from: "2026-01-01", effective_to: "2026-06-30" },
        { effective_from: "2026-06-01", effective_to: null }
      )
    ).toBe(true);
    expect(
      doPrincipalPlanPeriodsOverlap(
        { effective_from: "2026-01-01", effective_to: "2026-05-31" },
        { effective_from: "2026-06-01", effective_to: null }
      )
    ).toBe(false);
  });

  it("detects duplicate category+origin lines inside one plan", () => {
    expect(
      doPlanLinesConflict(
        { category_key: "vehicles", client_origin: "existing" },
        { category_key: "vehicles", client_origin: "existing" }
      )
    ).toBe(true);
    expect(
      doPlanLinesConflict(
        { category_key: "vehicles", client_origin: "existing" },
        { category_key: "vehicles", client_origin: "employee_developed" }
      )
    ).toBe(false);

    const pairs = findConflictingPlanLinePairs([
      { id: "a", category_key: "batteries", client_origin: "existing" },
      { id: "b", category_key: "batteries", client_origin: "existing" },
      { id: "c", category_key: "vehicles", client_origin: "existing" },
    ]);
    expect(pairs).toEqual([["a", "b"]]);
  });
});

describe("validateCommissionPlanLineInput", () => {
  it("accepts a valid per-unit line", () => {
    expect(
      validateCommissionPlanLineInput({
        category_key: "vehicles",
        client_origin: "existing",
        pay_mode: "per_unit",
        per_unit_amount: 50,
      })
    ).toEqual({ ok: true });
  });

  it("rejects company_developed in simple wizard lines", () => {
    const result = validateCommissionPlanLineInput({
      category_key: "vehicles",
      client_origin: "company_developed",
      pay_mode: "none",
    });
    expect(result.ok).toBe(false);
  });
});

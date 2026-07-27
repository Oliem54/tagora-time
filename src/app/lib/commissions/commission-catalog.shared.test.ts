import { describe, expect, it } from "vitest";
import {
  COMMISSION_CATEGORY_V1_DEFAULTS,
  assertNoCrossTenantMutation,
  buildDefaultOrganizationSettings,
  filterRowsForOrganization,
  isCategoryHistoricallyReadable,
  isCategorySelectableForNewPlan,
  isCategoryVisibleInWizard,
  mergeCategorySeedIdempotent,
  normalizeCurrencyCode,
  normalizeOrganizationId,
  userCanAccessOrganization,
  validateCategoryLabel,
  validateCompletionTrigger,
  validateCurrencyCode,
  validateRoundingMode,
  validateRoundingPrecision,
  wouldDuplicateCategoryCode,
  type CommissionCategoryRow,
} from "./commission-catalog.shared";

function cat(
  overrides: Partial<CommissionCategoryRow> &
    Pick<CommissionCategoryRow, "organization_id" | "code">
): CommissionCategoryRow {
  return {
    id: overrides.id ?? `id-${overrides.code}`,
    organization_id: overrides.organization_id,
    code: overrides.code,
    label: overrides.label ?? overrides.code,
    description: overrides.description ?? null,
    display_order: overrides.display_order ?? 10,
    is_visible: overrides.is_visible ?? true,
    is_active: overrides.is_active ?? true,
    is_system_default: overrides.is_system_default ?? true,
    created_by: overrides.created_by ?? null,
    created_at: overrides.created_at ?? "2026-07-23T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-07-23T00:00:00.000Z",
  };
}

describe("commission catalog V1 defaults", () => {
  it("exposes exactly seven default categories with expected codes and labels", () => {
    expect(COMMISSION_CATEGORY_V1_DEFAULTS).toHaveLength(7);
    expect(COMMISSION_CATEGORY_V1_DEFAULTS.map((c) => c.code)).toEqual([
      "vehicles",
      "batteries",
      "parts",
      "service_parts",
      "accessories",
      "service",
      "other",
    ]);
    expect(COMMISSION_CATEGORY_V1_DEFAULTS.map((c) => c.label)).toEqual([
      "Véhicules",
      "Batteries",
      "Pièces",
      "Pièces de service",
      "Accessoires",
      "Service",
      "Autre produit ou service",
    ]);
  });
});

describe("category codes across organizations", () => {
  it("allows the same category code for two different organizations", () => {
    const existing = [
      cat({ organization_id: "org_a", code: "vehicles", label: "Véhicules A" }),
      cat({ organization_id: "org_b", code: "vehicles", label: "Véhicules B" }),
    ];
    expect(
      wouldDuplicateCategoryCode({
        existing,
        organizationId: "org_a",
        code: "batteries",
      })
    ).toBe(false);
    expect(existing.filter((r) => r.code === "vehicles")).toHaveLength(2);
  });

  it("rejects a duplicate code inside the same organization", () => {
    const existing = [
      cat({ organization_id: "org_a", code: "vehicles" }),
      cat({ organization_id: "org_b", code: "vehicles" }),
    ];
    expect(
      wouldDuplicateCategoryCode({
        existing,
        organizationId: "org_a",
        code: "vehicles",
      })
    ).toBe(true);
    expect(
      wouldDuplicateCategoryCode({
        existing,
        organizationId: "org_b",
        code: "vehicles",
      })
    ).toBe(true);
  });
});

describe("masked vs disabled categories", () => {
  it("keeps a masked category historically readable but out of the wizard", () => {
    const masked = cat({
      organization_id: "org_a",
      code: "parts",
      is_visible: false,
      is_active: true,
    });
    expect(isCategoryVisibleInWizard(masked)).toBe(false);
    expect(isCategorySelectableForNewPlan(masked)).toBe(true);
    expect(isCategoryHistoricallyReadable(masked)).toBe(true);
  });

  it("blocks a disabled category from new plans while keeping history readable", () => {
    const disabled = cat({
      organization_id: "org_a",
      code: "parts",
      is_visible: true,
      is_active: false,
    });
    expect(isCategorySelectableForNewPlan(disabled)).toBe(false);
    expect(isCategoryVisibleInWizard(disabled)).toBe(false);
    expect(isCategoryHistoricallyReadable(disabled)).toBe(true);
  });
});

describe("organization settings", () => {
  it("normalizes organization_id per official convention (trim+lower, a-z0-9_)", () => {
    expect(normalizeOrganizationId("  Acme_Mobility ")).toBe("acme_mobility");
    expect(normalizeOrganizationId("oliem_solutions")).toBe("oliem_solutions");
    expect(normalizeOrganizationId("acme mobility")).toBeNull();
    expect(normalizeOrganizationId("acme-mobility")).toBeNull();
    expect(normalizeOrganizationId("Oliem Solutions")).toBeNull();
    expect(normalizeOrganizationId("")).toBeNull();
  });

  it("binds default settings to a single organization_id", () => {
    const settings = buildDefaultOrganizationSettings("Acme_Mobility");
    expect(settings).not.toBeNull();
    expect(settings?.organization_id).toBe("acme_mobility");
    expect(settings?.default_percentage_basis).toBe("net_sales_ex_tax");
    expect(settings?.default_warranty_eligible).toBe(false);
    expect(settings?.simple_commission_plans_enabled).toBe(false);
  });

  it("accepts valid ISO currency codes including non-CAD", () => {
    expect(validateCurrencyCode("CAD")).toEqual({
      ok: true,
      currency_code: "CAD",
    });
    expect(validateCurrencyCode("usd")).toEqual({
      ok: true,
      currency_code: "USD",
    });
    expect(normalizeCurrencyCode("eur")).toBe("EUR");
  });

  it("rejects invalid currency, rounding and trigger values", () => {
    expect(validateCurrencyCode("CA")).toMatchObject({ ok: false });
    expect(validateCurrencyCode("CADE")).toMatchObject({ ok: false });
    expect(validateCurrencyCode("123")).toMatchObject({ ok: false });
    expect(validateRoundingPrecision(2)).toEqual({
      ok: true,
      rounding_precision: 2,
    });
    expect(validateRoundingPrecision(7)).toMatchObject({ ok: false });
    expect(validateRoundingMode("half_up")).toEqual({
      ok: true,
      rounding_mode: "half_up",
    });
    expect(validateRoundingMode("bankers")).toMatchObject({ ok: false });
    expect(
      validateCompletionTrigger("sale_completed_delivered_or_invoiced")
    ).toMatchObject({ ok: true });
    expect(validateCompletionTrigger("random")).toMatchObject({ ok: false });
    expect(validateCategoryLabel("")).toMatchObject({ ok: false });
    expect(validateCategoryLabel("  Custom  ")).toEqual({
      ok: true,
      label: "Custom",
    });
  });
});

describe("idempotent category seed", () => {
  it("inserts missing V1 defaults without overwriting customized categories", () => {
    const existing = [
      cat({
        organization_id: "org_a",
        code: "vehicles",
        label: "Autos personnalisées",
      }),
    ];

    const first = mergeCategorySeedIdempotent(existing, "org_a");
    expect(first).toHaveLength(6);
    expect(first.some((row) => row.code === "vehicles")).toBe(false);

    const afterFirst = [
      ...existing,
      ...first.map((row) =>
        cat({
          organization_id: row.organization_id,
          code: row.code,
          label: row.label,
        })
      ),
    ];
    const second = mergeCategorySeedIdempotent(afterFirst, "org_a");
    expect(second).toHaveLength(0);

    const vehicles = afterFirst.find((row) => row.code === "vehicles");
    expect(vehicles?.label).toBe("Autos personnalisées");
  });

  it("never seeds categories into another organization", () => {
    const existing = [
      cat({ organization_id: "org_a", code: "vehicles", label: "Véhicules" }),
    ];
    const forB = mergeCategorySeedIdempotent(existing, "org_b");
    expect(forB).toHaveLength(7);
    expect(forB.every((row) => row.organization_id === "org_b")).toBe(true);
  });
});

describe("multi-tenant access helpers", () => {
  const rows = [
    cat({ organization_id: "org_a", code: "vehicles" }),
    cat({ organization_id: "org_b", code: "vehicles" }),
    cat({ organization_id: "org_a", code: "batteries" }),
  ];

  it("prevents cross-tenant reads", () => {
    const visible = filterRowsForOrganization(rows, "org_a");
    expect(visible).toHaveLength(2);
    expect(visible.every((row) => row.organization_id === "org_a")).toBe(true);
    expect(userCanAccessOrganization(["org_a"], "org_b")).toBe(false);
  });

  it("prevents cross-tenant mutations", () => {
    expect(
      assertNoCrossTenantMutation({
        actorOrganizationIds: ["org_a"],
        targetOrganizationId: "org_b",
      })
    ).toMatchObject({ ok: false });
    expect(
      assertNoCrossTenantMutation({
        actorOrganizationIds: ["org_a", "org_b"],
        targetOrganizationId: "org_b",
      })
    ).toEqual({ ok: true });
  });
});

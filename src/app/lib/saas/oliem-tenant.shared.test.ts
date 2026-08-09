import { describe, expect, it } from "vitest";
import {
  OLIEM_COMPANY_CODES,
  OLIEM_DEFAULT_COMPANY_CODE,
  OLIEM_TENANT_KEY,
  OLIEM_TENANT_SLUG,
  assertCompanyCodeNotTenantKey,
  isOliemCompanyCode,
  oliemCompanyCodesShareTenant,
  resolveOliemCompanyCode,
} from "./oliem-tenant.shared";
import { isValidCompanyCode } from "./tenant-foundation.shared";

describe("V1 Oliem tenant / company scoping", () => {
  it("freezes tenantKey and organizationSlug", () => {
    expect(OLIEM_TENANT_KEY).toBe("oliem_solution");
    expect(OLIEM_TENANT_SLUG).toBe("oliem-solution");
    expect(OLIEM_TENANT_KEY).not.toBe("oliem_solutions");
    expect(OLIEM_TENANT_KEY).not.toBe(OLIEM_TENANT_SLUG);
  });

  it("recognizes both operating company codes", () => {
    expect(isOliemCompanyCode("oliem_solutions")).toBe(true);
    expect(isOliemCompanyCode("titan_produits_industriels")).toBe(true);
    expect([...OLIEM_COMPANY_CODES]).toEqual([
      "oliem_solutions",
      "titan_produits_industriels",
    ]);
  });

  it("keeps both companies under the same Oliem tenant conceptually", () => {
    expect(oliemCompanyCodesShareTenant()).toBe(true);
  });

  it("defaults to oliem_solutions and not Titan", () => {
    expect(OLIEM_DEFAULT_COMPANY_CODE).toBe("oliem_solutions");
    expect(OLIEM_DEFAULT_COMPANY_CODE).not.toBe(
      "titan_produits_industriels"
    );
  });

  it("resolves primary_company / company_context company codes", () => {
    expect(resolveOliemCompanyCode("oliem_solutions")).toBe("oliem_solutions");
    expect(resolveOliemCompanyCode("titan_produits_industriels")).toBe(
      "titan_produits_industriels"
    );
    expect(resolveOliemCompanyCode("  OLIEM_SOLUTIONS  ")).toBe(
      "oliem_solutions"
    );
    expect(isValidCompanyCode("oliem_solutions")).toBe(true);
    expect(isValidCompanyCode("titan_produits_industriels")).toBe(true);
  });

  it("never treats tenantKey as a companyCode", () => {
    expect(isOliemCompanyCode(OLIEM_TENANT_KEY)).toBe(false);
    expect(resolveOliemCompanyCode(OLIEM_TENANT_KEY)).toBeNull();
    expect(() => assertCompanyCodeNotTenantKey("oliem_solution")).toThrow(
      /tenantKey/
    );
  });

  it("does not depend on any user UUID", () => {
    expect(OLIEM_TENANT_KEY).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
    expect(OLIEM_COMPANY_CODES.join(",")).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
  });
});

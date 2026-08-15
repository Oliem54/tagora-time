import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fromMock = vi.fn();
const createAdminSupabaseClient = vi.fn(() => ({ from: fromMock }));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

describe("evaluateEmployeeWebPunchGps tenant filters", () => {
  beforeEach(() => {
    vi.resetModules();
    fromMock.mockReset();
    createAdminSupabaseClient.mockClear();
  });

  it("queries gps_bases by organization_id and organization_company_id", async () => {
    const eqCompany = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqOrg = vi.fn(() => ({ eq: eqCompany }));
    const select = vi.fn(() => ({ eq: eqOrg }));
    fromMock.mockReturnValue({ select });

    const { evaluateEmployeeWebPunchGps } = await import(
      "@/app/lib/horodateur-gps-punch.server"
    );

    await evaluateEmployeeWebPunchGps({
      latitude: 0,
      longitude: 0,
      organizationId: "org-1",
      organizationCompanyId: "company-1",
      companyContext: "oliem_solutions",
    });

    expect(fromMock).toHaveBeenCalledWith("gps_bases");
    expect(select).toHaveBeenCalled();
    expect(eqOrg).toHaveBeenCalledWith("organization_id", "org-1");
    expect(eqCompany).toHaveBeenCalledWith(
      "organization_company_id",
      "company-1"
    );
  });
});

describe("generic AccountRequestCompany / punch zone keys", () => {
  it("accepts any valid company_code and never hardcodes qa_phase4d_lot2", async () => {
    const { normalizeCompany, ACCOUNT_REQUEST_COMPANIES } = await import(
      "@/app/lib/account-requests.shared"
    );
    const { isPunchZoneCompanyKey } = await import(
      "@/app/lib/horodateur-qr-punch.shared"
    );

    expect(normalizeCompany("oliem_solutions")).toBe("oliem_solutions");
    expect(normalizeCompany("titan_produits_industriels")).toBe(
      "titan_produits_industriels"
    );
    expect(normalizeCompany("acme_industrial")).toBe("acme_industrial");
    expect(normalizeCompany("Bad-Code")).toBeNull();
    expect(isPunchZoneCompanyKey("all")).toBe(true);
    expect(isPunchZoneCompanyKey("acme_industrial")).toBe(true);
    expect(isPunchZoneCompanyKey("qa_phase4d_lot2")).toBe(true);
    expect(
      JSON.stringify(ACCOUNT_REQUEST_COMPANIES)
    ).not.toContain("qa_phase4d_lot2");
  });

  it("keeps Oliem/Titan labels as derived display presets", async () => {
    const { getCompanyLabel } = await import(
      "@/app/lib/account-requests.shared"
    );
    expect(getCompanyLabel("oliem_solutions")).toBe("Oliem Solutions");
    expect(getCompanyLabel("titan_produits_industriels")).toBe(
      "Titan Produits Industriels"
    );
  });
});

describe("QR company authorization prefers organization IDs", () => {
  it("rejects cross-tenant zones even when company_key matches", async () => {
    const { employeeMayPunchInZone } = await import(
      "@/app/lib/horodateur-qr-punch.server"
    );

    const employee = {
      active: true,
      organizationId: "org-a",
      organizationCompanyId: "company-a",
      primaryCompany: "oliem_solutions",
      canWorkForOliemSolutions: true,
      canWorkForTitanProduitsIndustriels: true,
    };

    expect(
      employeeMayPunchInZone(employee, "oliem_solutions", {
        organization_id: "org-b",
        organization_company_id: "company-b",
      })
    ).toBe(false);

    expect(
      employeeMayPunchInZone(employee, "all", {
        organization_id: "org-a",
        organization_company_id: null,
      })
    ).toBe(true);
  });
});

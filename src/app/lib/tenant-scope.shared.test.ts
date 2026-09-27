import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isAccountRequestsViewerAllowed } from "@/app/direction/demandes-comptes/account-requests-page-load.shared";
import {
  assessClientScope,
  commissionLineVisibleToViewer,
  resolveCompanyInOrganization,
  tenantRowIsVisible,
} from "@/app/lib/tenant-scope.shared";

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";
const companyA = "33333333-3333-4333-8333-333333333333";
const companyB = "44444444-4444-4444-8444-444444444444";

const scopeA = { organizationId: orgA, organizationCompanyIds: [companyA] };

describe("tenant scope decisions", () => {
  it("hides another organization and another company", () => {
    expect(
      tenantRowIsVisible(
        { organizationId: orgB, organizationCompanyId: companyB },
        scopeA
      )
    ).toBe(false);
    expect(
      tenantRowIsVisible(
        { organizationId: orgA, organizationCompanyId: companyB },
        scopeA
      )
    ).toBe(false);
  });

  it("allows direction and owner inside their tenant and refuses an employee", () => {
    const row = { organizationId: orgA, organizationCompanyId: companyA };
    expect(
      commissionLineVisibleToViewer({
        role: "direction",
        viewerChauffeurId: null,
        lineChauffeurId: 9,
        row,
        scope: scopeA,
      })
    ).toBe(true);
    expect(
      commissionLineVisibleToViewer({
        role: "admin",
        viewerChauffeurId: null,
        lineChauffeurId: 9,
        row,
        scope: scopeA,
      })
    ).toBe(true);
    expect(
      commissionLineVisibleToViewer({
        role: "employe",
        viewerChauffeurId: 4,
        lineChauffeurId: 9,
        row,
        scope: scopeA,
      })
    ).toBe(false);
  });

  it("hides another employee commission line", () => {
    expect(
      commissionLineVisibleToViewer({
        role: "employe",
        viewerChauffeurId: 4,
        lineChauffeurId: 8,
        row: { organizationId: orgA, organizationCompanyId: companyA },
        scope: scopeA,
      })
    ).toBe(false);
    expect(
      commissionLineVisibleToViewer({
        role: "employe",
        viewerChauffeurId: 4,
        lineChauffeurId: 4,
        row: { organizationId: orgA, organizationCompanyId: companyA },
        scope: scopeA,
      })
    ).toBe(true);
  });

  it("refuses an employee on account requests", () => {
    expect(isAccountRequestsViewerAllowed("employe")).toBe(false);
    expect(isAccountRequestsViewerAllowed("direction")).toBe(true);
    expect(isAccountRequestsViewerAllowed("admin")).toBe(true);
  });

  it("refuses a spoofed organization or company from the client", () => {
    expect(
      assessClientScope({
        sessionOrganizationId: orgA,
        allowedCompanyIds: [companyA],
        clientOrganizationId: orgB,
      }).ok
    ).toBe(false);
    expect(
      assessClientScope({
        sessionOrganizationId: orgA,
        allowedCompanyIds: [companyA],
        clientCompanyId: companyB,
      }).ok
    ).toBe(false);
    expect(
      assessClientScope({
        sessionOrganizationId: orgA,
        allowedCompanyIds: [companyA],
      }).ok
    ).toBe(true);
  });

  it("keeps legacy unscoped rows invisible", () => {
    expect(
      tenantRowIsVisible({ organizationId: null, organizationCompanyId: null }, scopeA)
    ).toBe(false);
    expect(
      tenantRowIsVisible({ organizationId: orgA, organizationCompanyId: null }, scopeA)
    ).toBe(false);
  });

  it("resolves a company only inside the session organization", () => {
    const directory = [
      { organizationId: orgA, organizationCompanyId: companyA, companyCode: "oliem_solutions" },
      { organizationId: orgB, organizationCompanyId: companyB, companyCode: "oliem_solutions" },
    ];
    expect(
      resolveCompanyInOrganization({
        organizationId: orgA,
        companyCode: "oliem_solutions",
        directory,
      })
    ).toEqual({ ok: true, organizationId: orgA, organizationCompanyId: companyA });
  });
});

describe("tenant scope release files", () => {
  const root = process.cwd();

  it("hardens commission and account request scope without deleting rows", () => {
    const sql = readFileSync(
      join(root, "supabase/migrations/20260927160530_tenant_scope_commissions_and_account_requests.sql"),
      "utf8"
    );
    const lower = sql.toLowerCase();
    expect(sql).toContain("organization_id uuid null");
    expect(sql).toContain("organization_company_id uuid null");
    expect(sql).toContain("lock_timeout");
    expect(sql).toContain("statement_timeout");
    expect(lower).toContain("enable row level security");
    expect(lower).toContain("force row level security");
    expect(lower).not.toContain("security definer");
    expect(lower).not.toContain("delete from");
    expect(lower).not.toContain("truncate");
    expect(sql).toContain("commission_sale_line_scope_required");
    expect(sql).toContain("organization_id is not null");
  });

  it("keeps commission writes and account request reads on the server scope", () => {
    const sales = readFileSync(
      join(root, "src/app/api/direction/commissions/objectives/[id]/sales/route.ts"),
      "utf8"
    );
    const requests = readFileSync(
      join(root, "src/app/api/account-requests/route.ts"),
      "utf8"
    );
    expect(sales).toContain("auth.organizationId");
    expect(sales).toContain("assessClientScope");
    expect(requests).toContain("scopeAccountRequestQuery");
    expect(requests).toContain("rejectSpoofedAccountRequestScope");
    expect(requests).toContain("organization_id: writeScope.organizationId");
  });
});

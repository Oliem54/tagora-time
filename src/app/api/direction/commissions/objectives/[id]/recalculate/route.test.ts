import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildEstimatedCommissionEntries } from "@/app/lib/commissions/commission-rules.server";

vi.mock("server-only", () => ({}));

const { requireAdminFinanceCommissionsAccess } = vi.hoisted(() => ({
  requireAdminFinanceCommissionsAccess: vi.fn(),
}));

vi.mock("@/app/api/direction/commissions/_lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/direction/commissions/_lib")>();
  return {
    ...actual,
    requireAdminFinanceCommissionsAccess,
  };
});

import {
  chauffeurMatchesCompanyContext,
  mapRuleRow,
  resolveCommissionsCompanyContext,
} from "@/app/api/direction/commissions/_lib";
import { POST } from "./route";

function makeRequest() {
  return new NextRequest(
    "http://localhost/api/direction/commissions/objectives/obj-1/recalculate",
    { method: "POST" }
  );
}

function adminUser(company = "oliem_solutions") {
  return {
    id: "admin-1",
    email: "admin@example.com",
    app_metadata: {
      role: "admin",
      primary_company: company,
      company,
      allowed_companies: [company],
    },
    user_metadata: {},
  };
}

function chainable(result: unknown, eqs: Array<[string, unknown]> = []) {
  const api: Record<string, unknown> = {};
  const self = new Proxy(api, {
    get(_t, prop: string) {
      if (prop === "then") return undefined;
      if (prop === "eq") {
        return (col: string, val: unknown) => {
          eqs.push([col, val]);
          return self;
        };
      }
      if (prop === "maybeSingle" || prop === "single") {
        return async () => result;
      }
      return () => self;
    },
  });
  return self;
}

describe("recalculate route orchestration (F3)", () => {
  it("percentage on achieved_amount → sales_basis and estimated amount", () => {
    const mapped = mapRuleRow({
      id: "r1",
      objective_id: "obj-1",
      rule_name: "Pct",
      rule_type: "percentage",
      commission_basis: "achieved_amount",
      percentage_rate: 5,
      fixed_amount: null,
      per_unit_amount: null,
      tier_config: [],
      is_active: true,
    });
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: {
        achieved_amount: 70000,
        achieved_sales_count: 7,
        chauffeur_id: 11,
        team_name: null,
        period_start: "2026-07-01",
        period_end: "2026-07-31",
      },
      rules: [mapped],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].sales_basis_amount).toBe(70000);
    expect(entries[0].calculated_amount).toBe(3500);
  });

  it("per_unit on achieved_sales_count → units × amount", () => {
    const mapped = mapRuleRow({
      id: "r2",
      objective_id: "obj-1",
      rule_name: "Unit",
      rule_type: "per_unit",
      commission_basis: "achieved_sales_count",
      percentage_rate: null,
      fixed_amount: null,
      per_unit_amount: 100,
      tier_config: [],
      is_active: true,
    });
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: {
        achieved_amount: 999999,
        achieved_sales_count: 7,
        chauffeur_id: 11,
        team_name: null,
        period_start: "2026-07-01",
        period_end: "2026-07-31",
      },
      rules: [mapped],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].sales_basis_amount).toBe(7);
    expect(entries[0].calculated_amount).toBe(700);
  });

  it("mapRuleRow refuses unknown commission_basis", () => {
    expect(() =>
      mapRuleRow({
        id: "r3",
        objective_id: "obj-1",
        rule_type: "percentage",
        commission_basis: "unknown_basis",
        percentage_rate: 5,
      })
    ).toThrow(/inconnue/i);
  });

  it("mapRuleRow includes commission_basis and per_unit_amount (build contract)", () => {
    const mapped = mapRuleRow({
      id: "r4",
      objective_id: "obj-1",
      rule_type: "fixed",
      fixed_amount: 500,
    });
    expect(mapped).toMatchObject({
      commission_basis: "achieved_amount",
      per_unit_amount: null,
      rule_type: "fixed",
    });
  });

  it("buildEstimatedCommissionEntries accepts mapped legacy fixed rule", () => {
    const mapped = mapRuleRow({
      id: "r5",
      objective_id: "obj-1",
      rule_type: "fixed",
      fixed_amount: 500,
    });
    const entries = buildEstimatedCommissionEntries({
      objectiveId: "obj-1",
      objective: {
        achieved_amount: 1,
        achieved_sales_count: 0,
        chauffeur_id: 11,
        team_name: null,
        period_start: "2026-07-01",
        period_end: "2026-07-31",
      },
      rules: [mapped],
      objectiveAchieved: false,
      assigneeLabel: "Alex",
    });
    expect(mapped.commission_basis).toBe("achieved_amount");
    expect(entries[0].calculated_amount).toBe(500);
  });
});

describe("tenant helpers (F3)", () => {
  it("resolveCommissionsCompanyContext ignores client company and uses claims", () => {
    const user = adminUser("titan_produits_industriels") as never;
    expect(resolveCommissionsCompanyContext(user)).toBe("titan_produits_industriels");
  });

  it("chauffeurMatchesCompanyContext accepts same org only", () => {
    expect(
      chauffeurMatchesCompanyContext("oliem_solutions", "oliem_solutions")
    ).toBe(true);
    expect(
      chauffeurMatchesCompanyContext("titan_produits_industriels", "oliem_solutions")
    ).toBe(false);
    expect(chauffeurMatchesCompanyContext(null, "oliem_solutions")).toBe(false);
  });
});

describe("recalculate route POST auth and tenant", () => {
  beforeEach(() => {
    requireAdminFinanceCommissionsAccess.mockReset();
  });

  it("returns auth failure when access denied", async () => {
    requireAdminFinanceCommissionsAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Permission commissions requise." }), {
        status: 403,
      }),
    });
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "obj-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when objective is missing (RLS / authenticated client)", async () => {
    const eqs: Array<[string, unknown]> = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "sales_objectives") {
          return chainable({ data: null, error: null }, eqs);
        }
        return chainable({ data: [], error: null });
      }),
    };
    requireAdminFinanceCommissionsAccess.mockResolvedValue({
      ok: true,
      user: adminUser("oliem_solutions"),
      role: "admin",
      accessToken: "test-token",
      supabase,
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
    expect(eqs).toContainEqual(["id", "missing"]);
    expect(eqs).not.toContainEqual(["company_context", "oliem_solutions"]);
    const body = await res.json();
    expect(body.error).toMatch(/introuvable/i);
  });

  it("returns 404 for cross-tenant objective hidden by RLS", async () => {
    const eqs: Array<[string, unknown]> = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "sales_objectives") {
          return chainable({ data: null, error: null }, eqs);
        }
        return chainable({ data: [], error: null });
      }),
    };
    requireAdminFinanceCommissionsAccess.mockResolvedValue({
      ok: true,
      user: adminUser("oliem_solutions"),
      role: "admin",
      accessToken: "test-token",
      supabase,
    });

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ id: "obj-other-tenant" }),
    });
    expect(res.status).toBe(404);
    expect(eqs).toContainEqual(["id", "obj-other-tenant"]);
    expect(eqs).not.toContainEqual(["company_context", "oliem_solutions"]);
  });
});

describe("recalculate route source defense (tenant UUID)", () => {
  it("uses authenticated path helpers, not company_context authority", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/api/direction/commissions/objectives/[id]/recalculate/route.ts"
      ),
      "utf8"
    );
    expect(source).toMatch(/buildEstimatedCommissionEntries/);
    expect(source).toMatch(/requireAdminFinanceCommissionsAccess/);
    expect(source).toMatch(/organization_id/);
    expect(source).toMatch(/computeProgressPercent/);
    expect(source).not.toMatch(/salesBasisForObjective/);
    expect(source).not.toMatch(/resolveCommissionsCompanyContext/);
    expect(source).not.toMatch(/createAdminSupabaseClient/);
  });

  it("create route uses organization UUID membership asserts", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/direction/commissions/objectives/route.ts"),
      "utf8"
    );
    expect(source).toMatch(/assertChauffeurOrganizationAccess/);
    expect(source).toMatch(/resolveObjectiveWriteOrganizationId/);
    expect(source).toMatch(/rejectsTextTenantAuthority/);
    expect(source).not.toMatch(/assertChauffeurInCompany/);
    expect(source).not.toMatch(/company_context:\s*asText\(body\.company_context\)/);
  });
});

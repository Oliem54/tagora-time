import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HORORA_PORTAL_ROLES,
  evaluateHororaPayrollCapability,
  hororaPortalRoleAllows,
} from "@/app/lib/auth/horora-role-model.shared";
import {
  decideStoredHororaSupervisorAccess,
  isHororaSupervisorGrantTableAbsent,
  resolveHororaScopedTimeAccess,
  type HororaSupervisorGrantRow,
} from "@/app/lib/auth/horora-supervisor-grant.shared";
import { ORGANIZATION_MEMBERSHIP_ROLES } from "@/app/lib/saas/tenant-foundation.shared";

const FILE = "20261005120000_horora_supervisor_grants.sql";
const root = process.cwd();
const sql = readFileSync(join(root, "supabase", "migrations", FILE), "utf8");
const lower = sql.toLowerCase();
const bodies = lower.replace(/--[^\n]*/g, " ");

const ORG = "org-1";
const COMPANY = "company-1";
const DEPARTMENT = "livreur";
const USER = "auth-user-1";
const OTHER_USER = "auth-user-2";

function membership(overrides: Record<string, string | null> = {}) {
  return {
    authUserId: USER,
    membershipId: "membership-1",
    role: "employe",
    status: "active",
    ...overrides,
  };
}

function row(overrides: Partial<HororaSupervisorGrantRow> = {}): HororaSupervisorGrantRow {
  return {
    authUserId: USER,
    membershipId: "membership-1",
    organizationId: ORG,
    organizationCompanyId: COMPANY,
    effectifsDepartmentKey: DEPARTMENT,
    capabilities: ["view_team", "approve_anomalies", "correct_time"],
    status: "active",
    ...overrides,
  };
}

function target(overrides: Record<string, string | null> = {}) {
  return {
    organizationId: ORG,
    organizationCompanyId: COMPANY,
    effectifsDepartmentKey: DEPARTMENT,
    ...overrides,
  };
}

describe("HORORA supervisor grant migration file", () => {
  it("exists as a closed RLS file and does not change portal roles", () => {
    expect(sql.length).toBeGreaterThan(0);
    expect(bodies).toContain("create table if not exists public.horora_supervisor_grants");
    expect(bodies).toContain("auth_user_id");
    expect(bodies).toContain("membership_id");
    expect(bodies).toContain("organization_id");
    expect(bodies).toContain("organization_company_id");
    expect(bodies).toContain("effectifs_department_key");
    expect(bodies).toContain("capabilities");
    expect(bodies).toContain("status in ('active', 'inactive')");
    expect(bodies).toContain("created_at");
    expect(bodies).toContain("updated_at");
    expect(bodies).toContain("enable row level security");
    expect(bodies).toContain("force row level security");
    expect(bodies).toContain("revoke all on table public.horora_supervisor_grants from authenticated");
    expect(bodies).not.toMatch(/\bcreate policy\b/);
    expect(bodies).not.toContain("current_app_role");
    expect(bodies).not.toContain("organization_memberships_role_check");
    expect(ORGANIZATION_MEMBERSHIP_ROLES).toEqual([
      "organization_owner",
      "organization_admin",
      "direction",
      "employe",
    ]);
    expect(HORORA_PORTAL_ROLES).toEqual(["employe", "direction", "admin"]);
    const membershipSql = readFileSync(
      join(root, "supabase", "migrations", "20260712220300_saas1_organization_memberships.sql"),
      "utf8"
    );
    expect(membershipSql).toContain("'employe'");
    expect(membershipSql).not.toContain("'superviseur'");
    const roleSql = readFileSync(
      join(root, "supabase", "migrations", "20260525120000_phase_2b_2_finance_rls_views.sql"),
      "utf8"
    );
    expect(roleSql).toContain("create or replace function public.current_app_role()");
  });
});

describe("stored HORORA supervisor grant read", () => {
  it("refuses a missing table, a missing grant, an inactive grant, an inactive membership and another auth user", () => {
    const base = {
      callerAuthUserId: USER,
      membership: membership(),
      capability: "view_team" as const,
      target: target(),
    };
    expect(
      decideStoredHororaSupervisorAccess({
        ...base,
        lookup: { ok: false, reason: "table_absent" },
      }).reason
    ).toBe("table_absent");
    expect(isHororaSupervisorGrantTableAbsent({ code: "42P01", message: "undefined" })).toBe(
      true
    );
    expect(
      isHororaSupervisorGrantTableAbsent({
        code: "PGRST205",
        message: "Could not find the table public.horora_supervisor_grants in the schema cache",
      })
    ).toBe(true);
    expect(
      decideStoredHororaSupervisorAccess({
        ...base,
        lookup: { ok: true, rows: [] },
      }).reason
    ).toBe("grant_absent");
    expect(
      decideStoredHororaSupervisorAccess({
        ...base,
        lookup: { ok: true, rows: [row({ status: "inactive" })] },
      }).reason
    ).toBe("grant_inactive");
    expect(
      decideStoredHororaSupervisorAccess({
        ...base,
        membership: membership({ status: "inactive" }),
        lookup: { ok: true, rows: [row()] },
      }).reason
    ).toBe("membership_inactive");
    expect(
      decideStoredHororaSupervisorAccess({
        ...base,
        membership: null,
        lookup: { ok: true, rows: [row()] },
      }).reason
    ).toBe("membership_absent");
    expect(
      decideStoredHororaSupervisorAccess({
        ...base,
        lookup: { ok: true, rows: [row({ authUserId: OTHER_USER })] },
      }).reason
    ).toBe("auth_user_mismatch");
  });

  it("stays inside one organization, company and department and keeps payroll closed", () => {
    const lookup = { ok: true as const, rows: [row()] };
    const base = {
      callerAuthUserId: USER,
      membership: membership(),
      lookup,
      capability: "approve_anomalies" as const,
    };
    expect(
      decideStoredHororaSupervisorAccess({ ...base, target: target() })
    ).toMatchObject({ allowed: true, source: "supervisor_grant" });
    expect(
      decideStoredHororaSupervisorAccess({
        ...base,
        target: target({ organizationId: "org-2" }),
      }).reason
    ).toBe("target_organization_mismatch");
    expect(
      decideStoredHororaSupervisorAccess({
        ...base,
        target: target({ organizationCompanyId: "company-2" }),
      }).reason
    ).toBe("target_company_mismatch");
    expect(
      decideStoredHororaSupervisorAccess({
        ...base,
        capability: "correct_time",
        target: target({ effectifsDepartmentKey: "operations" }),
      }).reason
    ).toBe("target_department_mismatch");
    for (const capability of ["read_payroll", "admin_finance", "manage_configuration"] as const) {
      expect(
        decideStoredHororaSupervisorAccess({
          callerAuthUserId: USER,
          membership: membership(),
          lookup,
          capability,
          target: target(),
        })
      ).toMatchObject({ allowed: false, reason: "capability_denied" });
    }
    expect(
      evaluateHororaPayrollCapability({
        portalRole: "employe",
        explicitPermissions: ["horodateur_payroll_manage"],
        required: "manage",
      }).allowed
    ).toBe(false);
  });

  it("leaves direction and admin on the portal role", () => {
    for (const portalRole of ["direction", "admin"] as const) {
      expect(
        resolveHororaScopedTimeAccess({
          portalRole,
          capability: "view_team",
          grant: null,
          target: null,
        })
      ).toMatchObject({ allowed: true, source: "portal_role" });
    }
    expect(hororaPortalRoleAllows("admin", "admin_finance")).toBe(true);
    expect(hororaPortalRoleAllows("direction", "manage_configuration")).toBe(false);
    const shared = readFileSync(join(root, "src/app/api/horodateur/_shared.ts"), "utf8");
    expect(shared).toContain("readEmployeSupervisorTimeAccess");
    expect(shared).toContain('role === "direction" || role === "admin"');
  });
});

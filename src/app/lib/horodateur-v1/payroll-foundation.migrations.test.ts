import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

const FILES = {
  cycles: "20260824113609_horodateur_payroll_cycle_foundation.sql",
  reports: "20260824113611_horodateur_payroll_reports_immutability.sql",
  deliveries: "20260824113613_horodateur_payroll_recipients_deliveries.sql",
  audit: "20260824113615_horodateur_payroll_audit_and_permission_helpers.sql",
} as const;

const TABLES = [
  "horodateur_payroll_cycle_templates",
  "horodateur_payroll_cycles",
  "horodateur_payroll_reports",
  "horodateur_payroll_recipients",
  "horodateur_payroll_deliveries",
  "horodateur_payroll_audit_log",
] as const;

function readSql(file: string) {
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8");
}

function stripComments(sql: string) {
  return sql
    .toLowerCase()
    .replace(/--[^\n]*/g, " ")
    .replace(/comment on[\s\S]*?;/g, " ");
}

type AuditReferenceRow = {
  organizationCompanyId: string | null;
  cycleId: string | null;
  reportId: string | null;
  deliveryId: string | null;
};

/** Mirrors the three table CHECKs that close MATCH SIMPLE on audit FKs. */
function auditReferenceCompletenessAllows(row: AuditReferenceRow): boolean {
  const cycleOk =
    row.cycleId === null || row.organizationCompanyId !== null;
  const reportOk =
    row.reportId === null ||
    (row.cycleId !== null && row.organizationCompanyId !== null);
  const deliveryOk =
    row.deliveryId === null ||
    (row.reportId !== null &&
      row.cycleId !== null &&
      row.organizationCompanyId !== null);
  return cycleOk && reportOk && deliveryOk;
}

describe("HORORA payroll accountant report foundation migrations", () => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const sql = {
    cycles: readSql(FILES.cycles),
    reports: readSql(FILES.reports),
    deliveries: readSql(FILES.deliveries),
    audit: readSql(FILES.audit),
  };
  const allSql = `${sql.cycles}\n${sql.reports}\n${sql.deliveries}\n${sql.audit}`;
  const bodies = stripComments(allSql);

  it("ships the four foundation files after Phase 4D tenant migrations", () => {
    for (const file of Object.values(FILES)) {
      expect(existsSync(join(MIGRATIONS_DIR, file))).toBe(true);
      expect(files).toContain(file);
    }
    expect(
      files.indexOf("20260823233805_recompute_horodateur_shift_tenant_context.sql")
    ).toBeLessThan(files.indexOf(FILES.cycles));
  });

  it("creates the six payroll tables with organization and company constraints", () => {
    for (const table of TABLES) {
      expect(bodies).toContain(`create table if not exists public.${table}`);
    }
    expect(bodies).toContain("organization_id uuid not null");
    expect(bodies).toContain("references public.organizations (id)");
    expect(bodies).toContain(
      "references public.organization_companies (id, organization_id)"
    );
    for (const table of [
      "horodateur_payroll_cycle_templates",
      "horodateur_payroll_cycles",
      "horodateur_payroll_reports",
      "horodateur_payroll_deliveries",
    ]) {
      expect(sql.cycles.includes(table) || allSql.includes(`public.${table}`)).toBe(
        true
      );
      expect(allSql).toMatch(
        new RegExp(`${table}[\\s\\S]*organization_company_id uuid not null`)
      );
    }
  });

  it("enforces the recurring 14-day cycle on templates and recurring instances", () => {
    expect(bodies).toContain("horodateur_payroll_cycle_templates_interval_days_check");
    expect(bodies).toContain("check (interval_days = 14)");
    expect(bodies).toContain("horodateur_payroll_cycles_recurring_span_check");
    expect(bodies).toContain("period_end = (period_start + 13)");
  });

  it("protects non-cancelled cycles against overlapping org/company periods", () => {
    expect(bodies).toContain("create extension if not exists btree_gist");
    expect(bodies).toContain("constraint horodateur_payroll_cycles_no_overlap");
    expect(bodies).toContain("exclude using gist");
    expect(bodies).toContain("daterange(period_start, period_end, '[]') with &&");
    expect(bodies).toContain("where (status <> 'cancelled')");
  });

  it("keeps issued reports immutable and revisions unique per org/company/cycle", () => {
    expect(bodies).toContain(
      "horodateur_payroll_reports_org_company_cycle_revision_uidx"
    );
    expect(bodies).toContain("prevent_horodateur_payroll_issued_report_mutation");
    expect(sql.reports).toMatch(
      /create or replace function public\.prevent_horodateur_payroll_issued_report_mutation\(\)[\s\S]*?security invoker[\s\S]*?set search_path = pg_catalog/
    );
    expect(bodies).toContain("issued horodateur payroll reports are immutable");
    expect(bodies).toContain(
      "before update or delete on public.horodateur_payroll_reports"
    );
  });

  it("binds template → cycle on the same organization and company", () => {
    expect(bodies).toContain("horodateur_payroll_cycle_templates_id_org_company_uidx");
    expect(bodies).toContain("constraint horodateur_payroll_cycles_template_tenant_fkey");
    expect(sql.cycles).toMatch(
      /foreign key \(template_id,\s*organization_id,\s*organization_company_id\)\s*references public\.horodateur_payroll_cycle_templates \(\s*id,\s*organization_id,\s*organization_company_id\s*\)/
    );
  });

  it("binds cycle → report on the same organization and company", () => {
    expect(bodies).toContain("horodateur_payroll_cycles_id_org_company_uidx");
    expect(bodies).toContain("constraint horodateur_payroll_reports_cycle_tenant_fkey");
    expect(sql.reports).toMatch(
      /foreign key \(cycle_id,\s*organization_id,\s*organization_company_id\)\s*references public\.horodateur_payroll_cycles \(\s*id,\s*organization_id,\s*organization_company_id\s*\)/
    );
  });

  it("binds report + cycle → delivery on the same tenant and cycle_id", () => {
    expect(bodies).toContain("horodateur_payroll_reports_id_org_company_cycle_uidx");
    expect(bodies).toContain("constraint horodateur_payroll_deliveries_cycle_tenant_fkey");
    expect(bodies).toContain(
      "constraint horodateur_payroll_deliveries_report_cycle_tenant_fkey"
    );
    expect(sql.deliveries).toMatch(
      /foreign key \(cycle_id,\s*organization_id,\s*organization_company_id\)\s*references public\.horodateur_payroll_cycles \(\s*id,\s*organization_id,\s*organization_company_id\s*\)/
    );
    expect(sql.deliveries).toMatch(
      /foreign key \(\s*report_id,\s*organization_id,\s*organization_company_id,\s*cycle_id\s*\)\s*references public\.horodateur_payroll_reports \(\s*id,\s*organization_id,\s*organization_company_id,\s*cycle_id\s*\)/
    );
  });

  it("binds audit cycle/report/delivery references to the same tenant", () => {
    expect(bodies).toContain("constraint horodateur_payroll_audit_log_cycle_tenant_fkey");
    expect(bodies).toContain("constraint horodateur_payroll_audit_log_report_tenant_fkey");
    expect(bodies).toContain(
      "constraint horodateur_payroll_audit_log_delivery_tenant_fkey"
    );
    expect(sql.audit).toMatch(
      /foreign key \(cycle_id,\s*organization_id,\s*organization_company_id\)\s*references public\.horodateur_payroll_cycles/
    );
    expect(sql.audit).toMatch(
      /foreign key \(\s*report_id,\s*organization_id,\s*organization_company_id,\s*cycle_id\s*\)\s*references public\.horodateur_payroll_reports/
    );
    expect(sql.audit).toMatch(
      /foreign key \(\s*delivery_id,\s*organization_id,\s*organization_company_id,\s*cycle_id,\s*report_id\s*\)\s*references public\.horodateur_payroll_deliveries/
    );
    expect(bodies).toContain("horodateur_payroll_audit_log_report_cycle_org_fkey");
  });

  it("closes MATCH SIMPLE gaps with declarative completeness CHECKs, not MATCH FULL", () => {
    expect(sql.audit.toLowerCase()).not.toMatch(/match\s+full/);
    expect(bodies).not.toContain("prevent_horodateur_payroll_audit_log_reference");
    expect(bodies).toContain(
      "horodateur_payroll_audit_log_cycle_reference_complete_check"
    );
    expect(bodies).toContain(
      "horodateur_payroll_audit_log_report_reference_complete_check"
    );
    expect(bodies).toContain(
      "horodateur_payroll_audit_log_delivery_reference_complete_check"
    );
    expect(sql.audit).toMatch(
      /constraint horodateur_payroll_audit_log_cycle_reference_complete_check\s+check \(\s*cycle_id is null\s+or organization_company_id is not null\s*\)/
    );
    expect(sql.audit).toMatch(
      /constraint horodateur_payroll_audit_log_report_reference_complete_check\s+check \(\s*report_id is null\s+or \(\s*cycle_id is not null\s+and organization_company_id is not null\s*\)\s*\)/
    );
    expect(sql.audit).toMatch(
      /constraint horodateur_payroll_audit_log_delivery_reference_complete_check\s+check \(\s*delivery_id is null\s+or \(\s*report_id is not null\s+and cycle_id is not null\s+and organization_company_id is not null\s*\)\s*\)/
    );
    expect(sql.audit).toMatch(
      /create table if not exists public\.horodateur_payroll_audit_log \([\s\S]*cycle_reference_complete_check[\s\S]*report_reference_complete_check[\s\S]*delivery_reference_complete_check[\s\S]*cycle_tenant_fkey[\s\S]*report_tenant_fkey[\s\S]*delivery_tenant_fkey[\s\S]*\);/
    );
  });

  it("accepts org-level and company-level audit rows without entity references", () => {
    expect(
      auditReferenceCompletenessAllows({
        organizationCompanyId: null,
        cycleId: null,
        reportId: null,
        deliveryId: null,
      })
    ).toBe(true);
    expect(
      auditReferenceCompletenessAllows({
        organizationCompanyId: "company-a",
        cycleId: null,
        reportId: null,
        deliveryId: null,
      })
    ).toBe(true);
    expect(sql.audit).toMatch(
      /organization_id uuid not null[\s\S]*organization_company_id uuid null[\s\S]*cycle_id uuid null[\s\S]*report_id uuid null[\s\S]*delivery_id uuid null/
    );
  });

  it("accepts a cycle reference only when the company is present", () => {
    expect(
      auditReferenceCompletenessAllows({
        organizationCompanyId: "company-a",
        cycleId: "cycle-a",
        reportId: null,
        deliveryId: null,
      })
    ).toBe(true);
    expect(
      auditReferenceCompletenessAllows({
        organizationCompanyId: null,
        cycleId: "cycle-a",
        reportId: null,
        deliveryId: null,
      })
    ).toBe(false);
  });

  it("rejects a report reference without cycle and company", () => {
    expect(
      auditReferenceCompletenessAllows({
        organizationCompanyId: "company-a",
        cycleId: null,
        reportId: "report-a",
        deliveryId: null,
      })
    ).toBe(false);
    expect(
      auditReferenceCompletenessAllows({
        organizationCompanyId: "company-a",
        cycleId: "cycle-a",
        reportId: "report-a",
        deliveryId: null,
      })
    ).toBe(true);
  });

  it("rejects a delivery reference without report, cycle, and company", () => {
    expect(
      auditReferenceCompletenessAllows({
        organizationCompanyId: "company-a",
        cycleId: null,
        reportId: null,
        deliveryId: "delivery-a",
      })
    ).toBe(false);
    expect(
      auditReferenceCompletenessAllows({
        organizationCompanyId: "company-a",
        cycleId: "cycle-a",
        reportId: "report-a",
        deliveryId: "delivery-a",
      })
    ).toBe(true);
  });

  it("keeps inter-company audit mixes blocked by composite tenant FKs after completeness CHECKs", () => {
    expect(bodies).toContain("horodateur_payroll_audit_log_cycle_tenant_fkey");
    expect(bodies).toContain("horodateur_payroll_audit_log_report_tenant_fkey");
    expect(bodies).toContain("horodateur_payroll_audit_log_delivery_tenant_fkey");
    expect(sql.audit).toMatch(
      /foreign key \(cycle_id,\s*organization_id,\s*organization_company_id\)/
    );
    expect(sql.audit).toMatch(
      /foreign key \(\s*report_id,\s*organization_id,\s*organization_company_id,\s*cycle_id\s*\)/
    );
    expect(sql.audit).toMatch(
      /foreign key \(\s*delivery_id,\s*organization_id,\s*organization_company_id,\s*cycle_id,\s*report_id\s*\)/
    );
    expect(sql.audit.toLowerCase()).toMatch(
      /grant select,\s*insert on table public\.horodateur_payroll_audit_log to service_role/
    );
    expect(sql.audit.toLowerCase()).not.toMatch(
      /create policy[\s\S]*cycle_reference_complete_check/
    );
  });

  it("blocks TRUNCATE on reports with a distinct statement trigger", () => {
    expect(bodies).toContain("prevent_horodateur_payroll_reports_truncate");
    expect(bodies).toContain("horodateur_payroll_reports truncate is forbidden");
    expect(sql.reports).toMatch(
      /create trigger trg_horodateur_payroll_reports_no_truncate\s+before truncate on public\.horodateur_payroll_reports\s+for each statement/
    );
    expect(sql.reports).toMatch(
      /create trigger trg_horodateur_payroll_reports_issued_immutable\s+before update or delete on public\.horodateur_payroll_reports/
    );
  });

  it("keeps the audit log append-only and deliveries idempotent", () => {
    expect(bodies).toContain("horodateur_payroll_deliveries_idempotency_key_uidx");
    expect(bodies).toContain("prevent_horodateur_payroll_audit_log_mutation");
    expect(bodies).toContain("horodateur_payroll_audit_log is append-only");
    expect(bodies).toContain(
      "before update or delete on public.horodateur_payroll_audit_log"
    );
    expect(bodies).toContain(
      "before truncate on public.horodateur_payroll_audit_log"
    );
    expect(sql.audit.toLowerCase()).toMatch(
      /grant select,\s*insert on table public\.horodateur_payroll_audit_log to service_role/
    );
    const auditGrants = [
      ...sql.audit
        .toLowerCase()
        .matchAll(/grant[^;]+on table public\.horodateur_payroll_audit_log[^;]+;/g),
    ].map((match) => match[0]);
    expect(auditGrants.join("\n")).not.toMatch(/\bupdate\b/);
    expect(auditGrants.join("\n")).not.toMatch(/\bdelete\b/);
  });

  it("enables and forces RLS then revokes anon and authenticated on every payroll table", () => {
    expect((bodies.match(/enable row level security/g) ?? []).length).toBe(
      TABLES.length
    );
    expect((bodies.match(/force row level security/g) ?? []).length).toBe(
      TABLES.length
    );
    for (const table of TABLES) {
      expect(bodies).toContain(`revoke all on table public.${table} from public`);
      expect(bodies).toContain(`revoke all on table public.${table} from anon`);
      expect(bodies).toContain(
        `revoke all on table public.${table} from authenticated`
      );
      expect(bodies).toContain(`${table}_anon_deny`);
      expect(bodies).toContain(`${table}_authenticated_deny`);
    }
    expect(bodies).toContain("using (false)");
    expect(bodies).toContain("with check (false)");
  });

  it("does not use SECURITY DEFINER and does not store salary amounts", () => {
    expect(bodies).not.toMatch(/security\s+definer/);
    expect(bodies).toContain("security invoker");
    expect(bodies).not.toMatch(/\b(salary|wage|hourly_rate|montant)\b/);
    expect(bodies).not.toMatch(/alter table public\.horodateur_(events|shifts|exceptions)/);
  });

  it("adds INVOKER permission helpers that read app_metadata functions only", () => {
    expect(bodies).toContain("current_user_has_horodateur_payroll_read()");
    expect(bodies).toContain("current_user_has_horodateur_payroll_manage()");
    expect(sql.audit).toMatch(/security invoker[\s\S]*current_app_permissions\(\)/);
    expect(bodies).toContain("current_app_permissions()");
    expect(bodies).not.toContain("auth.jwt() -> 'user_metadata'");
    expect(bodies).not.toContain("user_metadata ->");
  });
});

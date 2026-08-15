import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const FILE =
  "20260815140000_phase4d_generic_tenant_operational_fk_and_rls.sql";

describe("Phase4D generic tenant operational FK + RLS migration", () => {
  const path = join(MIGRATIONS_DIR, FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();

  it("ships the planned migration after the Oliem seed", () => {
    expect(existsSync(path)).toBe(true);
    expect(files).toContain(FILE);
    expect(files.indexOf("20260809120000_v1_oliem_tenant_company_seed.sql")).toBeLessThan(
      files.indexOf(FILE)
    );
  });

  it("adds combined tenant keys and composite org/company consistency", () => {
    for (const table of [
      "chauffeurs",
      "gps_bases",
      "horodateur_events",
      "horodateur_shifts",
      "horodateur_current_state",
      "horodateur_exceptions",
      "horodateur_punch_zones",
    ]) {
      expect(lower).toContain(`alter table public.${table}`);
      expect(lower).toContain(`${table}_organization_id_fkey`);
      expect(lower).toContain(`${table}_org_company_consistency_fkey`);
    }
    expect(lower).toContain("organization_companies_id_organization_uidx");
  });

  it("uses the legacy Oliem fallback only for missing organization_id", () => {
    expect(sql).toContain("oliem-solution");
    expect(sql).toContain("oliem_solutions");
    expect(sql).toContain("titan_produits_industriels");
    expect(sql).toContain("Phase4D tenant backfill blocked");
    expect(sql).toMatch(
      /update public\.chauffeurs c\s+set organization_id = v_legacy_oliem_organization_id\s+where c\.organization_id is null\s+and c\.primary_company in/i
    );
    const organizationUpdates =
      sql.match(/update public\.\w+\s+\w+\s+set organization_id =[\s\S]*?;/gi) ?? [];
    expect(organizationUpdates).toHaveLength(7);
    for (const update of organizationUpdates) {
      expect(update).toMatch(/where[\s\S]*?\w+\.organization_id is null/i);
      expect(update).not.toMatch(
        /where[\s\S]*?\w+\.organization_id is null\s+or/i
      );
      expect(update).not.toContain("organization_company_id is null");
    }
  });

  it("maps company IDs only inside each row tenant", () => {
    for (const alias of ["c", "b", "e", "s", "st", "x", "z"]) {
      expect(lower).toContain(`oc.organization_id = ${alias}.organization_id`);
    }
    expect(sql).toMatch(
      /update public\.chauffeurs c[\s\S]*?set organization_company_id = oc\.id[\s\S]*?oc\.organization_id = c\.organization_id[\s\S]*?oc\.company_code = c\.primary_company/i
    );
    expect(sql).not.toMatch(
      /set organization_company_id\s*=\s*case[\s\S]*?v_(?:oliem|titan)_company_id/i
    );
  });

  it("does not hardcode QA tenants or rewrite historical QA fixtures", () => {
    expect(lower).not.toContain("tagora-time-qa-v1");
    expect(sql).not.toContain("qa_phase4d_lot2");
    expect(sql).not.toContain("qa-phase4d-lot2");
    expect(lower).not.toMatch(/delete\s+from\s+public\.chauffeurs/);
  });

  it("reuses only the canonical historical tenant helper", () => {
    expect(sql).toMatch(
      /to_regprocedure\('public\.current_user_can_access_organization\(uuid\)'\) is null[\s\S]*raise exception/i
    );
    expect(lower).toContain("public.current_user_can_access_organization(organization_id)");
    expect(lower).not.toContain("has_active_organization_membership");
    expect(lower).not.toMatch(
      /create\s+(?:or\s+replace\s+)?function\s+public\.current_user_can_access_organization/
    );
    expect(
      lower.match(/current_user_can_access_organization\(organization_id\)/g)
    ).toHaveLength(20);
  });

  it("drops all six live chauffeur policies before canonical recreation", () => {
    for (const policy of [
      "chauffeurs_admin_select_tenant",
      "chauffeurs_admin_insert_tenant",
      "chauffeurs_admin_update_tenant",
      "chauffeurs_admin_delete_tenant",
      "chauffeurs_direction_select_tenant",
      "chauffeurs_employee_select",
    ]) {
      expect(lower).toContain(`drop policy if exists "${policy}" on public.chauffeurs`);
    }
    expect(lower).toContain("chauffeurs_employee_self_select");
    expect(lower).toContain("horodateur_events_select_phase1");
    expect(lower).toContain("gps_bases_select_policy");
  });

  it("keeps commissions and tenant scope in the direction chauffeur policy", () => {
    expect(sql).toMatch(
      /create policy "chauffeurs_direction_operational_select"[\s\S]*?has_app_permission\('ressources'\)[\s\S]*?has_app_permission\('livraisons'\)[\s\S]*?has_app_permission\('terrain'\)[\s\S]*?has_app_permission\('commissions'\)[\s\S]*?current_user_can_access_organization\(organization_id\)/i
    );
  });

  it("requires employee self identity and canonical tenant access", () => {
    expect(sql).toMatch(
      /create policy "chauffeurs_employee_self_select"[\s\S]*?auth_user_id = \(select auth\.uid\(\)\)[\s\S]*?current_user_can_access_organization\(organization_id\)/i
    );
  });

  it("validates every existing FK definition and fails closed on mismatch", () => {
    expect(lower).toContain("if not found then");
    expect(lower).toContain("add constraint %i foreign key");
    expect(lower).toContain("v_constraint.contype <> 'f'");
    expect(lower).toContain("v_constraint.confdeltype <> 'r'");
    expect(lower).toContain("v_constraint.confupdtype <> 'a'");
    expect(lower).toContain("v_constraint.confmatchtype <> 's'");
    expect(lower).toContain("v_constraint.condeferrable");
    expect(lower).toContain("v_constraint.condeferred");
    expect(lower).toContain("not v_constraint.convalidated");
    expect(lower).toContain("v_local_columns is distinct from r.local_columns");
    expect(lower).toContain(
      "v_referenced_columns is distinct from r.referenced_columns"
    );
    expect(lower).toContain("exists with an incompatible definition");
    expect(lower).toContain("chauffeurs_organization_id_fkey");
    expect(lower).toContain("chauffeurs_organization_company_id_fkey");
    expect(lower).toContain("chauffeurs_org_company_consistency_fkey");
    expect(lower.match(/_organization_id_fkey'/g)).toHaveLength(7);
    expect(lower.match(/_organization_company_id_fkey'/g)).toHaveLength(7);
    expect(lower.match(/_org_company_consistency_fkey'/g)).toHaveLength(7);
  });

  it("fails closed on unresolved rows and org/company mismatches before NOT NULL", () => {
    const unresolvedAt = lower.indexOf("unresolved row(s)");
    const mismatchAt = lower.indexOf("org/company mismatch(es)");
    const notNullAt = lower.indexOf("alter column organization_id set not null");
    expect(unresolvedAt).toBeGreaterThan(-1);
    expect(mismatchAt).toBeGreaterThan(-1);
    expect(notNullAt).toBeGreaterThan(unresolvedAt);
    expect(notNullAt).toBeGreaterThan(mismatchAt);
    expect(lower).toContain(
      "where organization_id is null or organization_company_id is null"
    );
    expect(lower).toContain("employee tenant mismatch(es)");
  });

  it("keeps all-company punch zones tenant-scoped with no company FK", () => {
    expect(sql).toMatch(
      /update public\.horodateur_punch_zones z\s+set organization_id = v_legacy_oliem_organization_id\s+where z\.organization_id is null\s+and z\.company_key in/i
    );
    expect(lower).toContain(
      "(company_key = 'all' and organization_company_id is null)"
    );
    expect(lower).toContain(
      "(company_key <> 'all' and organization_company_id is not null)"
    );
    expect(lower).toContain("alter column organization_id set not null");
  });

  it("keeps legacy company text columns and does not drop them", () => {
    expect(lower).not.toMatch(/drop column.*(primary_company|company_context|company_key)/);
    expect(lower).toContain("primary_company");
    expect(lower).toContain("company_context");
    expect(lower).toContain("company_key");
    expect(lower).toContain("work_company_key");
    expect(lower).toContain("employer_company_key");
  });
});

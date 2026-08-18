import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const FILE =
  "20260818171334_phase4d_replace_closed_company_list_checks_with_generic_tenant_consistency.sql";
const PHASE4D_FILE =
  "20260815140000_phase4d_generic_tenant_operational_fk_and_rls.sql";

describe("Phase4D closed company-list replacement migration", () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, FILE), "utf8");
  const lower = sql.toLowerCase();
  const phase4d = readFileSync(join(MIGRATIONS_DIR, PHASE4D_FILE), "utf8");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  it("is the official CLI migration after the Phase 4D tenant FK file", () => {
    expect(files).toContain(FILE);
    expect(files).toContain(PHASE4D_FILE);
    expect(files.indexOf(FILE)).toBeGreaterThan(files.indexOf(PHASE4D_FILE));
  });

  it("detects both SQL IN (...) and PostgreSQL ANY (ARRAY[...]) closed lists", () => {
    expect(sql).toContain("~* '\\yIN\\s*\\('");
    expect(sql).toContain("~* '=\\s*ANY\\s*\\(\\s*ARRAY\\['");
    expect(phase4d).toContain("~* '\\yIN\\s*\\('");
    expect(phase4d).not.toContain("ANY\\s*\\(\\s*ARRAY\\[");
  });

  it("drops leftover closed lists on the operational company projection columns", () => {
    for (const table of [
      "chauffeurs",
      "gps_bases",
      "horodateur_events",
      "horodateur_shifts",
      "horodateur_current_state",
      "horodateur_punch_zones",
    ]) {
      expect(sql).toContain(`'${table}'`);
    }
    expect(sql).toContain("primary_company|company_context|company_key|work_company_key|employer_company_key");
    expect(lower).toContain("drop constraint if exists");
    expect(sql).toMatch(/pg_get_constraintdef\(con\.oid\) !~\* '~'/);
  });

  it("preserves generic format checks and punch-zone all-company semantics", () => {
    expect(sql).toContain("chauffeurs_primary_company_format_check");
    expect(sql).toContain("gps_bases_company_context_format_check");
    expect(sql).toContain("horodateur_punch_zones_company_key_format_check");
    expect(sql).toContain("horodateur_punch_zones_all_company_consistency_check");
    expect(sql).toContain("company_key = 'all'");
    expect(sql).toContain("^[a-z0-9]+(?:_[a-z0-9]+)*$");
    expect(sql).not.toContain("oliem_solutions");
    expect(sql).not.toContain("titan_produits_industriels");
  });

  it("handles gps_bases.compagnie only when the live legacy column already exists", () => {
    expect(sql).toContain("a.attname = 'compagnie'");
    expect(sql).toContain("not a.attisdropped");
    expect(sql).toContain("if not v_has_compagnie then");
    expect(sql).toContain("return;");
    const ddl = lower.replace(/--[^\n]*/g, "");
    expect(ddl).not.toMatch(/add\s+column\s+.*compagnie/);
    expect(ddl).not.toMatch(/\badd\s+column\b/);
    expect(ddl).not.toMatch(/\bdrop\s+column\b/);
    expect(ddl).not.toMatch(/\balter\s+column\b/);
    expect(ddl).not.toContain("backfill");
  });

  it("fails closed on compagnie/company_context/org mismatches before dropping the closed list", () => {
    expect(sql).toContain("b.compagnie is distinct from b.company_context");
    expect(sql).toContain("oc.company_code is distinct from b.compagnie");
    expect(sql).toContain("oc.organization_id is distinct from b.organization_id");
    expect(sql).toContain("oc.company_code is distinct from b.company_context");
    expect(sql).toContain("compagnie/company_context/org mismatch(es)");
    expect(sql.indexOf("compagnie/company_context/org mismatch(es)")).toBeLessThan(
      sql.indexOf("gps_bases_compagnie_check")
    );
  });

  it("drops the historical gps_bases.compagnie closed list including ANY (ARRAY[...])", () => {
    expect(sql).toContain("gps_bases_compagnie_check");
    expect(sql).toContain("~* '\\ycompagnie\\y'");
    expect(sql).toContain("~* '\\yIN\\s*\\('");
    expect(sql).toContain("~* '=\\s*ANY\\s*\\(\\s*ARRAY\\['");
    expect(sql).toMatch(
      /alter table public\.gps_bases drop constraint if exists %I/
    );
  });

  it("adds a generic compagnie format check and compagnie = company_context", () => {
    expect(sql).toContain("gps_bases_compagnie_format_check");
    expect(sql).toContain("gps_bases_compagnie_company_context_consistency_check");
    expect(sql).toContain("check (compagnie ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')");
    expect(sql).toContain("check (compagnie = company_context)");
    expect("qa_phase4d_lot2").toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    expect("oliem_solutions").toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    expect("titan_produits_industriels").toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    expect("Not A Company").not.toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    const coherent = "qa_phase4d_lot2";
    const otherCompany = "oliem_solutions";
    expect(coherent).not.toBe(otherCompany);
  });

  it("keeps org-company authority on the existing composite FK and never mutates data or RLS", () => {
    expect(sql).toContain("gps_bases_org_company_code_consistency_fkey");
    expect(sql).toContain(
      "array['organization_company_id', 'organization_id', 'company_context']::text[]"
    );
    expect(lower).not.toMatch(/\bupdate\s+public\./);
    expect(lower).not.toMatch(/\bdelete\s+from\s+/);
    expect(lower).not.toContain("create trigger");
    expect(lower).not.toContain("create or replace function");
    expect(lower).not.toContain("drop policy");
    expect(lower).not.toContain("create policy");
    expect(lower).not.toContain("on delete cascade");
    expect(lower).not.toMatch(/drop constraint[^;]*cascade/);
    expect(lower).not.toMatch(/drop constraint.*organization_id_fkey/);
    expect(lower).not.toMatch(/drop constraint.*org_company_consistency_fkey/);
  });

  it("uses a declarative composite FK to organization_companies id/org/code", () => {
    expect(sql).toContain("organization_companies_id_organization_code_uidx");
    expect(sql).toContain("(id, organization_id, company_code)");
    expect(sql).toContain("gps_bases_org_company_code_consistency_fkey");
    expect(sql).toContain("chauffeurs_org_company_code_consistency_fkey");
    expect(sql).toContain("horodateur_punch_zones_org_company_code_consistency_fkey");
    expect(lower).toContain(
      "references public.organization_companies (id, organization_id, company_code) on delete restrict"
    );
    expect(lower).not.toContain("create trigger");
    expect(lower).not.toContain("create or replace function");
  });

  it("fails closed on historical mismatches and never rewrites data", () => {
    expect(sql).toContain("company-code mismatch(es)");
    expect(lower).not.toMatch(/\bupdate\s+public\./);
    expect(lower).not.toMatch(/\bdelete\s+from\s+/);
    expect(lower).not.toContain("on delete cascade");
    expect(lower).not.toMatch(/drop constraint[^;]*cascade/);
    expect(lower).not.toContain("drop policy");
    expect(lower).not.toContain("create policy");
    expect(lower).not.toMatch(/drop constraint.*organization_id_fkey/);
  });

  it("accepts the QA generic company code at the format layer", () => {
    expect("qa_phase4d_lot2").toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    expect("oliem_solutions").toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    expect("titan_produits_industriels").toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
    expect("not a company").not.toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
  });
});

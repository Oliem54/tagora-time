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

  it("backfills only Oliem/Titan and fails closed on unknown mapping", () => {
    expect(sql).toContain("oliem-solution");
    expect(sql).toContain("oliem_solutions");
    expect(sql).toContain("titan_produits_industriels");
    expect(sql).toContain("Phase4D tenant backfill blocked");
    expect(sql).not.toContain("qa_phase4d_lot2");
    expect(sql).not.toContain("qa-phase4d-lot2");
  });

  it("creates hardened membership helper and tenant-scoped policies", () => {
    expect(sql).toMatch(
      /create or replace function public\.has_active_organization_membership\(\s*p_organization_id uuid\s*\)[\s\S]*security definer[\s\S]*set search_path\s*=\s*pg_catalog/i
    );
    expect(lower).toContain(
      "grant execute on function public.has_active_organization_membership(uuid) to authenticated"
    );
    expect(lower).toContain(
      "revoke all on function public.has_active_organization_membership(uuid) from public"
    );
    expect(lower).toContain(
      "and public.has_active_organization_membership(organization_id)"
    );
    expect(lower).toContain("chauffeurs_employee_self_select");
    expect(lower).toContain("horodateur_events_select_phase1");
    expect(lower).toContain("gps_bases_select_policy");
  });

  it("keeps legacy company text columns and does not drop them", () => {
    expect(lower).not.toMatch(/drop column.*(primary_company|company_context|company_key)/);
    expect(lower).toContain("primary_company");
    expect(lower).toContain("company_context");
    expect(lower).toContain("company_key");
  });
});

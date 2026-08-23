import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const SUFFIX = "_recompute_horodateur_current_state_tenant_context.sql";
const PREVIOUS =
  "20260818171334_phase4d_replace_closed_company_list_checks_with_generic_tenant_consistency.sql";
const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const FILE = files.find((name) => name.endsWith(SUFFIX));
const path = FILE ? join(MIGRATIONS_DIR, FILE) : "";
const sql = FILE ? readFileSync(path, "utf8") : "";
const lower = sql.toLowerCase();
const bodies = lower.replace(/--[^\n]*/g, " ");

describe("recompute_horodateur_current_state tenant-context SQL contract", () => {
  it("ships the official CLI migration after the Phase 4D closed-list file", () => {
    expect(FILE).toBeTruthy();
    expect(existsSync(path)).toBe(true);
    expect(files.filter((name) => name.endsWith(SUFFIX))).toEqual([FILE]);
    expect(files).toContain(PREVIOUS);
    expect(files.indexOf(FILE as string)).toBeGreaterThan(files.indexOf(PREVIOUS));
  });

  it("replaces only recompute_horodateur_current_state and keeps its signature", () => {
    expect(bodies).toMatch(
      /create or replace function public\.recompute_horodateur_current_state\s*\(\s*p_employee_id\s+bigint\s*\)\s*returns void/
    );
    expect(bodies.match(/create or replace function/g)).toEqual([
      "create or replace function",
    ]);
    expect(bodies).not.toContain("trg_recompute_horodateur_current_state");
    expect(bodies).not.toContain("recompute_horodateur_shift");
    expect(bodies).not.toMatch(/\bcreate\s+trigger\b/);
    expect(bodies).not.toMatch(/\bdrop\s+trigger\b/);
    expect(bodies).not.toMatch(/\bdrop\s+function\b/);
  });

  it("does not add SECURITY DEFINER, RLS, grants, or service_role", () => {
    expect(bodies).not.toMatch(/security\s+definer/);
    expect(bodies).not.toMatch(/\benable row level security\b/);
    expect(bodies).not.toMatch(/\bforce row level security\b/);
    expect(bodies).not.toMatch(/\bcreate policy\b/);
    expect(bodies).not.toMatch(/\bdrop policy\b/);
    expect(bodies).not.toMatch(/\balter policy\b/);
    expect(bodies).not.toMatch(/\bgrant\b/);
    expect(bodies).not.toMatch(/\brevoke\b/);
    expect(bodies).not.toContain("service_role");
    expect(bodies).not.toContain("user_metadata");
    expect(bodies).not.toContain("apply_migration");
    expect(bodies).not.toContain("db push");
  });

  it("loads tenant fields from the matching chauffeur and fail-closes when they are missing", () => {
    expect(bodies).toContain("from public.chauffeurs c");
    expect(bodies).toContain("where c.id = p_employee_id");
    expect(bodies).toContain("c.organization_id");
    expect(bodies).toContain("c.organization_company_id");
    expect(bodies).toContain("c.primary_company");
    expect(bodies).toMatch(
      /raise exception[\s\S]*chauffeur % not found[\s\S]*p_employee_id/
    );
    expect(bodies).toMatch(
      /raise exception[\s\S]*missing required tenant fields[\s\S]*p_employee_id/
    );
    expect(bodies).toContain("v_organization_id is null");
    expect(bodies).toContain("v_organization_company_id is null");
    expect(bodies).toContain("v_company_context is null");
  });

  it("adds tenant fields to the current-state INSERT and ON CONFLICT update", () => {
    expect(bodies).toMatch(
      /insert into public\.horodateur_current_state\s*\([\s\S]*organization_id[\s\S]*organization_company_id[\s\S]*company_context[\s\S]*\)/
    );
    expect(bodies).toContain("v_organization_id");
    expect(bodies).toContain("v_organization_company_id");
    expect(bodies).toContain("v_company_context");
    expect(bodies).toMatch(/on conflict \(employee_id\)/);
    expect(bodies).toContain("organization_id = excluded.organization_id");
    expect(bodies).toContain(
      "organization_company_id = excluded.organization_company_id"
    );
    expect(bodies).toContain("company_context = excluded.company_context");
  });

  it("preserves existing state calculation and the empty-latest delete path", () => {
    expect(bodies).toContain("'clock_in', 'shift_start'");
    expect(bodies).toContain("'en_quart'::public.horodateur_state_kind");
    expect(bodies).toContain("'break_start', 'pause_start'");
    expect(bodies).toContain("'en_pause'::public.horodateur_state_kind");
    expect(bodies).toContain("'break_end', 'pause_end'");
    expect(bodies).toContain("'lunch_start', 'diner_start', 'dinner_start'");
    expect(bodies).toContain("'en_diner'::public.horodateur_state_kind");
    expect(bodies).toContain("'lunch_end', 'diner_end', 'dinner_end'");
    expect(bodies).toContain("'clock_out', 'shift_end'");
    expect(bodies).toContain("'termine'::public.horodateur_state_kind");
    expect(bodies).toContain("'hors_quart'::public.horodateur_state_kind");
    expect(bodies).toContain(
      "e.status <> 'refuse'::public.horodateur_event_status"
    );
    expect(bodies).toContain(
      "x.status = 'en_attente'::public.horodateur_exception_status"
    );
    expect(bodies).toContain("delete from public.horodateur_current_state");
    expect(bodies).toContain("and not exists (select 1 from latest)");
  });

  it("does not hardcode tenants, chauffeurs, GPS, QR, Auth, or punch flows", () => {
    expect(sql).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    expect(lower).not.toContain("oliem_solutions");
    expect(lower).not.toContain("titan_produits_industriels");
    expect(lower).not.toMatch(/\boliem\b/);
    expect(lower).not.toMatch(/\btitan\b/);
    expect(bodies).not.toContain("auth.users");
    expect(bodies).not.toContain("gps_bases");
    expect(bodies).not.toContain("gps_positions");
    expect(bodies).not.toContain("horodateur_punch_zones");
    expect(bodies).not.toMatch(/\bqr\b/);
    expect(bodies).not.toMatch(/\bpunch\b/);
    expect(bodies).not.toContain("auth.uid");
    expect(bodies).not.toContain("user_metadata");
  });
});

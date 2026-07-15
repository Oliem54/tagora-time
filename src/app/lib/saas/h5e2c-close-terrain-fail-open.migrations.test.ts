import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const H5E2C_FILE = "20260715140000_h5e2c_close_terrain_fail_open_policies.sql";
const H5E2A_FILE = "20260715130000_h5e2a_harden_authorization_helpers.sql";
const H5D2_FILE = "20260715120000_h5d2_deprecate_horodateur_user_id.sql";
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5E2C-TERRAIN-RLS-CLOSURE-2026-07-15.md"
);
const E1 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5E1-SECURITY-RLS-AUDIT-2026-07-15.md"
);
const E2A = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5E2A-AUTH-HELPERS-HARDENING-2026-07-15.md"
);
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);

const FAIL_OPEN = [
  "horodateur_events_select",
  "horodateur_events_insert",
  "horodateur_events_update",
  "horodateur_events_delete",
  "allow all ",
] as const;

describe("H5-E2C close terrain/timeclock fail-open policies", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const path = join(MIGRATIONS_DIR, H5E2C_FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const bodies = lower
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

  it("ships a single H5-E2C migration after H5-E2A", () => {
    expect(existsSync(path)).toBe(true);
    expect(H5E2C_FILE).toMatch(/^\d{14}_h5e2c_close_terrain_fail_open_policies\.sql$/);
    expect(files.filter((f) => /h5e2c/i.test(f))).toEqual([H5E2C_FILE]);
    expect(files.indexOf(H5E2A_FILE)).toBeLessThan(files.indexOf(H5E2C_FILE));
  });

  it("drops the six exact fail-open policies including trailing-space allow all", () => {
    for (const name of FAIL_OPEN) {
      expect(sql).toContain(`drop policy if exists "${name}"`);
    }
    expect(sql).toContain('drop policy if exists "allow all " on public.chauffeurs');
    expect(sql).toContain('drop policy if exists "allow all " on public.sorties_terrain');
  });

  it("creates Phase1+admin HE SELECTs on employee_id and forbids authenticated HE writes", () => {
    for (const table of [
      "horodateur_events",
      "horodateur_shifts",
      "horodateur_current_state",
      "horodateur_exceptions",
    ]) {
      expect(sql).toMatch(
        new RegExp(`create policy "${table}_select_phase1"[\\s\\S]*on public\\.${table}[\\s\\S]*for select`, "i")
      );
      expect(sql).toMatch(
        new RegExp(
          `${table}_select_phase1[\\s\\S]*c\\.id = ${table}\\.employee_id[\\s\\S]*c\\.auth_user_id = auth\\.uid\\(\\)`,
          "i"
        )
      );
      expect(sql).toMatch(
        new RegExp(
          `${table}_select_phase1[\\s\\S]*current_app_role\\(\\) = 'admin'[\\s\\S]*is_direction_user\\(\\)[\\s\\S]*has_app_permission\\('terrain'\\)`,
          "i"
        )
      );
    }
    const createPolicies = [...sql.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0].toLowerCase());
    expect(
      createPolicies.filter(
        (p) =>
          /on public\.horodateur_(events|shifts|current_state|exceptions)/.test(p) &&
          /for (insert|update|delete)/.test(p)
      )
    ).toEqual([]);
  });

  it("secures chauffeurs and sorties without public/anon/ALL/true policies", () => {
    expect(sql).toContain('create policy "chauffeurs_select_h5e2c"');
    expect(sql).toMatch(/auth_user_id = auth\.uid\(\)/);
    expect(sql).toContain('create policy "sorties_terrain_select_h5e2c"');
    expect(sql).toContain('create policy "sorties_terrain_insert_h5e2c"');
    expect(sql).toContain('create policy "sorties_terrain_update_h5e2c"');
    expect(sql).toContain('create policy "sorties_terrain_delete_h5e2c"');
    expect(sql).toMatch(
      /sorties_terrain_delete_h5e2c[\s\S]*for delete[\s\S]*current_app_role\(\) = 'admin'[\s\S]*is_direction_user\(\)[\s\S]*has_app_permission\('terrain'\)/i
    );
    expect(bodies).not.toMatch(/to\s+public\b|to\s+anon\b/);
    expect(bodies).not.toMatch(/for\s+all\b/);
    expect(bodies).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(bodies).not.toMatch(/with check\s*\(\s*true\s*\)/);
  });

  it("does not modify helpers, views, grants, FORCE RLS, or data", () => {
    expect(bodies).not.toMatch(/create or replace function|alter function/);
    expect(bodies).not.toMatch(/direction_terrain_positions|create view|replace view/);
    expect(bodies).not.toMatch(/\bgrant\b|\brevoke\b/);
    expect(bodies).not.toMatch(/force row level security|disable row level security/);
    expect(bodies).not.toMatch(/insert into|update |delete from|truncate/);
    expect(bodies).not.toMatch(/drop column|user_metadata|security definer/);
    expect(existsSync(join(MIGRATIONS_DIR, H5E2A_FILE))).toBe(true);
    expect(existsSync(join(MIGRATIONS_DIR, H5D2_FILE))).toBe(true);
  });

  it("forbids H5-E2B/D, H5-F, H4, and historical replay versions in body", () => {
    expect(bodies).not.toMatch(/h5-e2b|h5e2b|h5-e2d|h5e2d|h5-f\b|h5f\b/);
    expect(bodies).not.toContain("20260429120000");
    expect(bodies).not.toContain("20260429130000");
    expect(bodies).not.toContain("20260418141000");
    expect(bodies).not.toContain("20260712220");
  });

  it("documents handoff + matrix contracts and updates E1/E2A/plan", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    const handoff = readFileSync(HANDOFF, "utf8");
    const e1 = readFileSync(E1, "utf8");
    const e2a = readFileSync(E2A, "utf8");
    const plan = readFileSync(PLAN, "utf8");
    expect(handoff).toContain(H5E2C_FILE);
    expect(handoff).toMatch(/allow all /);
    expect(handoff).toMatch(/horodateur_events_select/);
    expect(handoff).toMatch(/cross-employee|cross.employee/i);
    expect(handoff).toMatch(/51\s*%/);
    expect(handoff).toContain("qokyobcvplzufshydhih");
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/Rollback|ROLLBACK/);
    expect(e1).toMatch(/H5-E2C/);
    expect(e2a).toMatch(/H5-E2C/);
    expect(plan).toMatch(/H5-E2C/);
  });

  it("fingerprints non-empty SHA-256", () => {
    const sha = createHash("sha256").update(sql).digest("hex");
    expect(sha).toHaveLength(64);
  });
});

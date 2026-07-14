import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const BOOTSTRAP_NAME = "20260409120000_historical_schema_bootstrap.sql";
const BLOCKING_NAME = "20260410120000_company_activation_and_payroll.sql";
const BASELINE_NAME = "20260407000000_rbac_auth_helpers_baseline.sql";

const REQUIRED_TABLES = [
  "chauffeurs",
  "account_requests",
  "sorties_terrain",
  "livraisons_planifiees",
  "temps_titan",
  "photos_dossier",
  "dossiers",
  "notes_dossier",
  "vehicules",
  "remorques",
  "delivery_day_closures",
  "department_coverage_requirements",
  "employee_schedules",
  "employee_usual_schedules",
  "feedback",
  "gps_base_events",
  "horodateur",
  "horodateur_punch_challenges",
  "remorque_unavailabilities",
  "vehicule_unavailabilities",
] as const;

const REQUIRED_FUNCTIONS = [
  "approve_horodateur_exception",
  "reject_horodateur_exception",
  "recompute_horodateur_current_state",
  "recompute_horodateur_shift",
  "trg_recompute_horodateur_current_state",
  "trg_recompute_horodateur_shift",
  "trg_recompute_horodateur_shift_from_exception",
  "horodateur_punch_challenges_touch_updated_at",
  "set_updated_at",
  "set_updated_at_gps_bases",
  "set_admin_improvement_notification_preferences_updated_at",
  "validate_livraison_planning_guardrails",
] as const;

function withoutFunctionBodies(sql: string): string {
  return sql.replace(
    /create or replace function[\s\S]*?\$\$;/gi,
    "create or replace function /*omitted*/;"
  );
}

describe("Historical schema bootstrap migration", () => {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();
  const sql = readFileSync(join(MIGRATIONS_DIR, BOOTSTRAP_NAME), "utf8");
  const lower = sql.toLowerCase();
  const topLevel = withoutFunctionBodies(lower);

  it("uses the expected 14-digit timestamp filename", () => {
    expect(BOOTSTRAP_NAME).toMatch(
      /^\d{14}_historical_schema_bootstrap\.sql$/
    );
    expect(names).toContain(BOOTSTRAP_NAME);
  });

  it("is ordered before company_activation and after RBAC baseline", () => {
    expect(names.indexOf(BASELINE_NAME)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(BOOTSTRAP_NAME)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(BLOCKING_NAME)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(BASELINE_NAME)).toBeLessThan(
      names.indexOf(BOOTSTRAP_NAME)
    );
    expect(names.indexOf(BOOTSTRAP_NAME)).toBeLessThan(
      names.indexOf(BLOCKING_NAME)
    );
    expect(BOOTSTRAP_NAME < BLOCKING_NAME).toBe(true);
  });

  it("creates the 20 historical tables and excludes public.test", () => {
    for (const table of REQUIRED_TABLES) {
      expect(lower).toContain(
        `create table if not exists "public"."${table}"`
      );
    }
    expect(lower).not.toContain('create table if not exists "public"."test"');
    expect(lower).not.toMatch(/create table(?: if not exists)?\s+(?:public\.)?test\b/);
  });

  it("includes the twelve historical functions", () => {
    for (const fn of REQUIRED_FUNCTIONS) {
      expect(lower).toContain(
        `create or replace function "public"."${fn}"`
      );
    }
  });

  it("has no top-level data mutation or destructive table ops", () => {
    expect(topLevel).not.toMatch(/\binsert\s+into\b/);
    expect(topLevel).not.toMatch(/\bdelete\s+from\b/);
    expect(topLevel).not.toMatch(/\btruncate\b/);
    expect(topLevel).not.toMatch(/\bdrop\s+table\b/);
    expect(topLevel).not.toMatch(/\bdrop\s+schema\b/);
  });

  it("contains no seeds, secrets, or real emails", () => {
    expect(lower).not.toContain("groupe-oliem");
    expect(lower).not.toContain("groupe oliem");
    expect(lower).not.toContain("oliem solutions");
    expect(lower).not.toContain("produits industriels titan");
    expect(lower).not.toMatch(/eyJ[a-z0-9_-]+\.[a-z0-9_-]+/i);
    expect(lower).not.toMatch(
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
    );
  });

  it("does not add organization_id columns to business tables", () => {
    for (const table of REQUIRED_TABLES) {
      const tableBlock = sql.match(
        new RegExp(
          `CREATE TABLE IF NOT EXISTS "public"."${table}" \\(([\\s\\S]*?)\\);`,
          "i"
        )
      );
      expect(tableBlock?.[1]).toBeTruthy();
      expect(tableBlock![1].toLowerCase()).not.toContain("organization_id");
    }
  });

  it("does not rewrite legacy migration files", () => {
    const legacy = names.filter(
      (n) =>
        n !== BOOTSTRAP_NAME &&
        !n.startsWith("2026071222") &&
        n.endsWith(".sql")
    );
    expect(legacy.length).toBeGreaterThan(50);
    expect(legacy).toContain(BASELINE_NAME);
    expect(legacy).toContain(BLOCKING_NAME);
  });

  it("remains compatible with RBAC baseline ordering", () => {
    expect(names.indexOf(BASELINE_NAME)).toBeLessThan(
      names.indexOf(BOOTSTRAP_NAME)
    );
  });
});

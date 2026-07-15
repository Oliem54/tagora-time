import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const HISTORICAL = "20260412161500_employee_account_management.sql";
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5F2-EMPLOYEE-ACCOUNT-HISTORY-2026-07-15.md"
);
const F1 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5F1-OTHER-DOMAINS-AUDIT-2026-07-15.md"
);
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);

const COLS = [
  "auth_user_id",
  "social_benefits_percent",
  "titan_billable",
  "planned_daily_hours",
  "planned_weekly_hours",
  "scheduled_work_days",
] as const;

describe("H5-F2 employee account history normalization documentary", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const handoff = readFileSync(HANDOFF, "utf8");
  const f1 = readFileSync(F1, "utf8");
  const plan = readFileSync(PLAN, "utf8");
  const historicalPath = join(MIGRATIONS_DIR, HISTORICAL);
  const historical = readFileSync(historicalPath, "utf8");
  const historicalSha = createHash("sha256").update(historical).digest("hex");

  it("targets exact R5 version 20260412161500 without new SQL", () => {
    expect(existsSync(historicalPath)).toBe(true);
    expect(handoff).toContain("20260412161500");
    expect(handoff).toMatch(/R5/);
    expect(handoff).toMatch(/d[ée]cisions? Martin|Martin/i);
    expect(files.filter((f) => /h5f2/i.test(f))).toEqual([]);
    expect(files.some((f) => /20260715\d{6}_h5f2/i.test(f))).toBe(false);
    expect(historicalSha).toMatch(/^[a-f0-9]{64}$/);
  });

  it("documents six columns, FK Auth, partial unique index, types and defaults", () => {
    for (const c of COLS) expect(handoff).toContain(c);
    expect(handoff).toMatch(/uuid/i);
    expect(handoff).toMatch(/numeric\(5,\s*2\)|numeric\(5,2\)/);
    expect(handoff).toMatch(/boolean/i);
    expect(handoff).toMatch(/text\[\]|ARRAY/);
    expect(handoff).toMatch(/default 15|default\s+15/i);
    expect(handoff).toMatch(/default false|default\s+false/i);
    expect(handoff).toMatch(/\{\}|tableau vide/);
    expect(handoff).toContain("idx_chauffeurs_auth_user_id");
    expect(handoff).toMatch(/auth\.users|ON DELETE SET NULL/i);
    expect(handoff).toMatch(/IS NOT NULL|auth_user_id IS NOT NULL/);
  });

  it("is history-only: no UPDATE, no backfill, candidate_update_count 0, protected lots", () => {
    expect(handoff).toMatch(/candidate_update_count\s*=\s*0|candidate_update_count.*0/);
    expect(handoff).toMatch(/history-only|migration repair/i);
    expect(handoff).toMatch(/aucun UPDATE|UPDATE.*interdit|ne.*rejou/i);
    expect(handoff).toMatch(/backfill.*interdit|aucun backfill|backfill interdit/i);
    expect(handoff).toMatch(/H5-F3/);
    expect(handoff).toMatch(/H5-F5/);
    expect(handoff).toMatch(/H4/);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE/);
    expect(handoff).toMatch(/\*\*51 %\*\*/);
    expect(handoff.toLowerCase()).toContain("rollback");
    expect(f1).toMatch(/H5-F2/);
    expect(plan).toMatch(/H5-F2/);
    expect(historical).toMatch(/update public\.chauffeurs/i);
  });
});

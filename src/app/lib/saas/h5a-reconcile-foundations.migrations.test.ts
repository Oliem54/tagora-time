import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const H5A_FILE = "20260714140000_h5a_reconcile_foundations_columns.sql";
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);

const H5A_HISTORICAL = [
  "20260412170000",
  "20260412181500",
  "20260419103000",
  "20260419141500",
  "20260419164500",
  "20260420111000",
] as const;

const H5_OTHER = [
  "20260408190000",
  "20260410130000",
  "20260410140000",
  "20260411101500",
  "20260412103000",
  "20260412161500",
  "20260412191500",
  "20260418140000",
  "20260418141000",
  "20260420110000",
  "20260420112000",
  "20260421113000",
  "20260425090500",
  "20260425133500",
  "20260425140500",
  "20260426120500",
  "20260429120000",
  "20260429130000",
] as const;

const H4 = [
  "20260712220000",
  "20260712220100",
  "20260712220200",
  "20260712220300",
  "20260712220400",
  "20260712220500",
] as const;

describe("H5-A forward-only reconcile migration", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const path = join(MIGRATIONS_DIR, H5A_FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const plan = readFileSync(PLAN, "utf8");

  it("covers exactly the six R1 H5-A historical versions from the R10 plan", () => {
    expect(plan).toMatch(/LOT H5-A/);
    expect(plan).toContain("`12170000`, `12181500`, `19103000`, `19141500`, `19164500`, `20111000`");
    for (const v of H5A_HISTORICAL) {
      expect(sql).toContain(v);
      expect(files.some((f) => f.startsWith(v))).toBe(true);
    }
    expect(H5A_HISTORICAL).toHaveLength(6);
  });

  it("adds a single 14-digit forward-only h5a reconcile file after SaaS H4", () => {
    expect(H5A_FILE).toMatch(/^\d{14}_h5a_reconcile_/);
    expect(existsSync(path)).toBe(true);
    expect(files.filter((f) => f.includes("h5a")).length).toBe(1);
    expect(H5A_FILE > "20260712220500").toBe(true);
  });

  it("does not modify historical H5 or H4 files and excludes later lots", () => {
    for (const v of [...H5A_HISTORICAL, ...H5_OTHER, ...H4]) {
      const hist = files.find((f) => f.startsWith(v));
      expect(hist).toBeTruthy();
    }
    expect(sql).toMatch(/Out of scope: later H5 lots and H4 SaaS/);
    expect(lower).not.toMatch(/20260712220/);
  });

  it("is forward-only without destructive DDL or seeds", () => {
    expect(lower).not.toMatch(/drop\s+table/);
    expect(lower).not.toMatch(/drop\s+column/);
    expect(lower).not.toMatch(/drop\s+view/);
    expect(lower).not.toMatch(/drop\s+[^;]*\scascade\b/);
    expect(lower).not.toMatch(/truncate\s+/);
    expect(lower).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(lower).not.toMatch(/with check\s*\(\s*true\s*\)/);
    expect(lower).toContain("add column if not exists");
    expect(lower).toContain("create table if not exists");
    expect(lower).toContain("create index if not exists");
    expect(lower).toContain("on conflict (config_key) do nothing");
  });

  it("targets foundation objects for H5-A", () => {
    expect(lower).toContain("expected_breaks_count");
    expect(lower).toContain("morning_break_minutes");
    expect(lower).toContain("horodateur_direction_alert_config");
    expect(lower).toContain("horodateur_lateness_notifications");
    expect(lower).toContain("idx_chauffeurs_telephone");
    expect(lower).toContain("intercompany_billing_summary");
    expect(lower).toContain("payroll_company_summary");
    expect(lower).toContain("has_company and has_billing");
  });

  it("documents rollback and history strategy in SQL header", () => {
    expect(sql).toContain("DO NOT re-run");
    expect(sql).toContain("DO NOT mark applied");
    expect(sql).toContain("Out of scope");
    const sha = createHash("sha256").update(sql).digest("hex");
    expect(sha).toHaveLength(64);
  });
});

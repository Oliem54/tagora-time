import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const H5B_FILE = "20260714150000_h5b_reconcile_company_context_tracking.sql";
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);
const EXEC = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5B-EXECUTION-2026-07-14.md"
);

const H5B_HISTORICAL = [
  "20260410130000",
  "20260412103000",
  "20260411101500",
  "20260421113000",
] as const;

const H5_OTHER = [
  "20260408190000",
  "20260410140000",
  "20260412161500",
  "20260412170000",
  "20260412181500",
  "20260412191500",
  "20260418140000",
  "20260418141000",
  "20260419103000",
  "20260419141500",
  "20260419164500",
  "20260420110000",
  "20260420111000",
  "20260420112000",
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

describe("H5-B forward-only reconcile migration", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const path = join(MIGRATIONS_DIR, H5B_FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const plan = readFileSync(PLAN, "utf8");

  it("covers exactly the four H5-B historical versions from the R10 plan", () => {
    expect(plan).toMatch(/LOT H5-B/);
    expect(plan).toContain("`10130000` (R2), `12103000` (R2), `11101500` (R4), `21113000` (R2)");
    for (const v of H5B_HISTORICAL) {
      expect(sql).toContain(v);
      expect(files.some((f) => f.startsWith(v))).toBe(true);
    }
    expect(H5B_HISTORICAL).toHaveLength(4);
  });

  it("adds a single 14-digit forward-only h5b reconcile file after H5-A", () => {
    expect(H5B_FILE).toMatch(/^\d{14}_h5b_reconcile_/);
    expect(existsSync(path)).toBe(true);
    expect(files.filter((f) => f.includes("h5b")).length).toBe(1);
    expect(H5B_FILE > "20260714140000").toBe(true);
  });

  it("does not modify historical H5 or H4 and excludes later lots", () => {
    for (const v of [...H5B_HISTORICAL, ...H5_OTHER, ...H4]) {
      expect(files.some((f) => f.startsWith(v))).toBe(true);
    }
    expect(sql).toMatch(/Out of scope: subsequent H5 lots/);
    expect(lower).not.toMatch(/20260712220/);
    expect(lower).not.toMatch(/\bh5-c\b|\bh5c_|\bh5-d\b|\bh5-e\b|\bh5-f\b/);
  });

  it("is forward-only without destructive DDL, seeds, or permissive policies", () => {
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
    expect(lower).toContain("gen_random_bytes");
  });

  it("avoids blanket oliem_solutions backfill and auto-activating tracking", () => {
    expect(lower).not.toMatch(
      /set\s+company_context\s*=\s*'oliem_solutions'\s*where\s+company_context\s+is\s+null/
    );
    expect(lower).toContain("no blanket fallback");
    expect(lower).toContain("tracking_enabled = false");
    expect(lower).toContain("alter column tracking_enabled set default true");
    expect(lower).not.toMatch(/insert\s+into\s+public\.livraisons_planifiees/);
    expect(lower).not.toMatch(/twilio|send.?sms|notify.?sms/);
  });

  it("validates before NOT NULL / unique index / FK and creates billing views", () => {
    expect(lower).toContain("company_context unresolved");
    expect(lower).toContain("tracking_token duplicates");
    expect(lower).toContain("orphan");
    expect(lower).toContain("idx_livraisons_planifiees_tracking_token");
    expect(lower).toContain("where tracking_token is not null");
    expect(lower).toContain("intercompany_billing_summary");
    expect(lower).toContain("payroll_company_summary");
    expect(lower).toContain("type_operation is null");
    expect(lower).not.toContain("direction_terrain_positions");
    expect(lower).not.toMatch(/drop\s+column\s+.*user_id/);
  });

  it("documents rollback and production forbid with execution handoff", () => {
    expect(sql).toContain("DO NOT re-run");
    expect(sql).toContain("DO NOT mark applied");
    expect(sql).toContain("Rollback");
    const sha = createHash("sha256").update(sql).digest("hex");
    expect(sha).toHaveLength(64);
    expect(existsSync(EXEC)).toBe(true);
    expect(readFileSync(EXEC, "utf8")).toContain("20260714150000");
    expect(readFileSync(EXEC, "utf8")).toMatch(/\*\*51 %\*\*/);
  });
});

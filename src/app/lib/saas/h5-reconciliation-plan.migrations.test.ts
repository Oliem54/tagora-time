import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);

const H5 = [
  "20260408190000",
  "20260410130000",
  "20260410140000",
  "20260411101500",
  "20260412103000",
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

const CATEGORIES = ["R1", "R2", "R3", "R4", "R5", "R6"] as const;

describe("H5 reconciliation plan documentary (R10)", () => {
  const plan = readFileSync(PLAN, "utf8");
  const migrationFiles = readdirSync(join(ROOT, "supabase", "migrations")).filter(
    (n) => n.endsWith(".sql")
  );

  it("documents exactly 24 H5 with versions present locally", () => {
    expect(H5).toHaveLength(24);
    expect(plan).toMatch(/total 24/i);
    for (const v of H5) {
      expect(plan).toContain(v);
      expect(migrationFiles.some((f) => f.startsWith(v))).toBe(true);
    }
  });

  it("assigns each H5 a single category R1–R6", () => {
    const assigned = new Map<string, string>();
    for (const v of H5) {
      const row = plan
        .split("\n")
        .find((line) => line.includes(`\`${v}\``) && line.includes("|"));
      expect(row, v).toBeTruthy();
      const cats = CATEGORIES.filter((c) =>
        new RegExp(`\\*\\*${c}\\*\\*`).test(row!)
      );
      expect(cats, v).toHaveLength(1);
      assigned.set(v, cats[0]);
    }
    expect(assigned.size).toBe(24);
    expect(plan).toMatch(/R1=6/);
    expect(plan).toMatch(/R2=9/);
    expect(plan).toMatch(/R3=2/);
    expect(plan).toMatch(/R4=1/);
    expect(plan).toMatch(/R5=3/);
    expect(plan).toMatch(/R6=3/);
  });

  it("documents staging state, local target, risk, and history strategy", () => {
    expect(plan).toMatch(/État staging/);
    expect(plan).toMatch(/Cible locale/);
    expect(plan).toMatch(/Risque/);
    expect(plan).toMatch(/Stratégie historique/);
    for (const v of H5) {
      expect(plan).toContain(v);
    }
  });

  it("orders future lots and separates six SaaS H4", () => {
    expect(plan).toMatch(/LOT H5-A/);
    expect(plan).toMatch(/LOT H5-B/);
    expect(plan).toMatch(/LOT H5-C/);
    expect(plan).toMatch(/LOT H5-D/);
    expect(plan).toMatch(/LOT H5-E/);
    expect(plan).toMatch(/LOT H5-F/);
    for (const v of H4) {
      expect(plan).toContain(v);
    }
    expect(plan).toMatch(/H4 SaaS/);
  });

  it("forbids R10 remote writes and migration SQL creation", () => {
    expect(plan).toMatch(/repair \/ db push \/ migration up/);
    expect(plan).toMatch(/aucune/i);
    expect(plan).toContain("qcgvzdlfsxybrmloijpt");
    expect(plan).toContain("qokyobcvplzufshydhih");
    expect(plan).toMatch(/Rollback/);
    expect(plan).toMatch(/\*\*51 %\*\*/);
    expect(plan).toMatch(/DOC ONLY/);
    // R10 itself created no SQL. Post-R10 lots may add forward-only reconcile files (H5-A, H5-B).
    const r10OnlySql = migrationFiles.filter((f) => /r10/i.test(f));
    expect(r10OnlySql).toEqual([]);
    const h5a = migrationFiles.filter((f) => /h5a_reconcile/i.test(f));
    const h5b = migrationFiles.filter((f) => /h5b_reconcile/i.test(f));
    const h5c = migrationFiles.filter((f) => /h5c_reconcile/i.test(f));
    expect(h5a.length).toBeLessThanOrEqual(1);
    expect(h5b.length).toBeLessThanOrEqual(1);
    expect(h5c.length).toBeLessThanOrEqual(1);
  });

  it("keeps plan file outside temporary dump paths", () => {
    expect(existsSync(PLAN)).toBe(true);
    expect(plan).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/i);
    expect(plan).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });
});

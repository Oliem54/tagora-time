import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const OBS = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5D3-OBSERVATION-2026-07-15.md"
);
const H5D2 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5D2-DEPRECATION-2026-07-15.md"
);
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);

describe("H5-D3 post-deprecation observation documentary", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const obs = readFileSync(OBS, "utf8");
  const h5d2 = readFileSync(H5D2, "utf8");
  const plan = readFileSync(PLAN, "utf8");

  it("references H5-D2 and stays documentation-only without new migrations", () => {
    expect(existsSync(OBS)).toBe(true);
    expect(existsSync(H5D2)).toBe(true);
    expect(obs).toMatch(/20260715120000/);
    expect(obs).toMatch(/H5-D2/);
    expect(files.some((f) => /h5d3/i.test(f))).toBe(false);
    expect(obs).toMatch(/lecture seule|read-only|observation/i);
    expect(obs).toMatch(/aucun[\s\S]*migration|Aucune fixture staging|aucun code/i);
  });

  it("forbids mutation / QA punches and documents aggregate matrices", () => {
    expect(obs).toMatch(/aucun INSERT|écriture|Aucun.*DDL\/DML|aucune.*fixture/i);
    expect(obs).toMatch(/événement QA|punch QA|aucun événement QA/i);
    expect(obs).toMatch(/Matrices agrégées|Total post-D2/);
    expect(obs).toMatch(/employee_id/);
    expect(obs).toMatch(/actor_user_id/);
    expect(obs).toMatch(/direction_terrain|vue/i);
  });

  it("requires at least one real post-D2 event for VALIDÉ and marks zero as insuffisant", () => {
    expect(obs).toMatch(/≥ 1 événement post-H5-D2|au moins un/);
    expect(obs).toMatch(/Événements post-H5-D2[\s\S]*\*\*0\*\*|Total post-D2 \| 0/);
    expect(obs).toMatch(
      /H5-D3 OBSERVATION INSUFFISANTE — AUCUN ÉVÉNEMENT POST-DÉPLOIEMENT/
    );
    expect(obs).not.toMatch(/H5-D3 VALIDÉ — TRANSITION HORODATEUR STABLE/);
  });

  it("forbids H5-E / H4 and production; keeps V1 at 51 %", () => {
    expect(obs).toMatch(/H5-E[\s\S]*Non|pas H5-E/i);
    expect(obs).toMatch(/H4[\s\S]*Non|pending = 6/i);
    expect(obs).toContain("qcgvzdlfsxybrmloijpt");
    expect(obs).toMatch(/INTERDITE|interdite/);
    expect(obs).toContain("qokyobcvplzufshydhih");
    expect(obs).toMatch(/51\s*%/);
    expect(plan).toMatch(/H5-D3|OBSERVATION INSUFFISANTE|observation/i);
  });
});

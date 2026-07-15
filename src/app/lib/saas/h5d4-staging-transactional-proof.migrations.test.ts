import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const D4 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5D4-STAGING-TRANSACTIONAL-PROOF-2026-07-15.md"
);
const D2 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5D2-DEPRECATION-2026-07-15.md"
);
const D3 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5D3-OBSERVATION-2026-07-15.md"
);
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);

describe("H5-D4 staging transactional proof documentary", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const d4 = readFileSync(D4, "utf8");
  const plan = readFileSync(PLAN, "utf8");

  it("references H5-D2 and H5-D3 without creating migrations or TEMP SQL in Git", () => {
    expect(existsSync(D4)).toBe(true);
    expect(existsSync(D2)).toBe(true);
    expect(existsSync(D3)).toBe(true);
    expect(d4).toMatch(/H5-D2/);
    expect(d4).toMatch(/H5-D3/);
    expect(d4).toMatch(/20260715120000/);
    expect(files.some((f) => /h5d4/i.test(f))).toBe(false);
    expect(files.some((f) => /transactional-proof/i.test(f))).toBe(false);
  });

  it("documents BEGIN transaction, mandatory ROLLBACK, and forbids QA COMMIT", () => {
    expect(d4).toMatch(/\bBEGIN\b/);
    expect(d4).toMatch(/ROLLBACK/);
    expect(d4).toMatch(/COMMIT de donnée QA[\s\S]*\*\*Non\*\*|COMMIT de donnée QA.*Non/i);
    expect(d4).toMatch(/H5-D4 ROLLBACK COMPLETED/);
    expect(d4).toMatch(/H5-D4 VALIDÉ — PREUVE TRANSACTIONNELLE STAGING RÉUSSIE, AUCUNE DONNÉE PERSISTANTE/);
  });

  it("requires null user_id and canonical employee_id / actor_user_id / terrain view checks", () => {
    expect(d4).toMatch(/`user_id` \| \*\*NULL\*\*/);
    expect(d4).toMatch(/employee_id/);
    expect(d4).toMatch(/actor_user_id/);
    expect(d4).toMatch(/Vue `chauffeur_id` = employee_id/);
    expect(d4).toMatch(/Vue `user_id` = auth_user_id/);
    expect(d4).toMatch(/18 colonnes/);
  });

  it("forbids notifications, H5-E execution, H4, production; keeps V1 at 51 %", () => {
    expect(d4).toMatch(/aucun effet externe|SMS\/courriel|non validé[\s\S]*SMS/i);
    expect(d4).toMatch(/H5-E exécution[\s\S]*Non/);
    expect(d4).toMatch(/H4[\s\S]*Non|pending = 6/i);
    expect(d4).toContain("qcgvzdlfsxybrmloijpt");
    expect(d4).toMatch(/INTERDITE/);
    expect(d4).toContain("qokyobcvplzufshydhih");
    expect(d4).toMatch(/51\s*%/);
    expect(plan).toMatch(/H5-D4 VALIDÉ|preuve transactionnelle/i);
  });
});

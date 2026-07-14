import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const AUDIT = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5D1-USER-ID-DECISION-2026-07-15.md"
);
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);

const H5D_MIGRATIONS = [
  "20260418140000_horodateur_phase1_schema.sql",
  "20260418141000_horodateur_phase1_rls.sql",
  "20260408190000_horodateur.sql",
  "20260420110000_horodateur_events_canonical_minimal.sql",
  "20260420112000_horodateur_core_guardrails_minimal.sql",
] as const;

describe("H5-D1 user_id transition audit documentary", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const audit = readFileSync(AUDIT, "utf8");
  const plan = readFileSync(PLAN, "utf8");

  it("identifies exactly the five H5-D historical migrations", () => {
    expect(H5D_MIGRATIONS).toHaveLength(5);
    for (const name of H5D_MIGRATIONS) {
      expect(existsSync(join(MIGRATIONS_DIR, name))).toBe(true);
      expect(audit).toContain(name.replace(/\.sql$/, "").slice(0, 14));
    }
    expect(audit).toMatch(/20260418140000/);
    expect(audit).toMatch(/20260418141000/);
    expect(audit).toMatch(/20260408190000/);
    expect(audit).toMatch(/20260420110000/);
    expect(audit).toMatch(/20260420112000/);
  });

  it("creates no new SQL migration and no DROP user_id execution", () => {
    expect(files.some((f) => /h5d1/i.test(f))).toBe(false);
    expect(audit).toMatch(/Aucune migration SQL nouvelle créée dans H5-D1/i);
    expect(audit).toMatch(/Aucun DROP `user_id` exécuté/i);
    expect(audit).not.toMatch(/DROP COLUMN user_id exécuté/i);
  });

  it("documents three column roles and forbids H5-E / H4 scope creep", () => {
    expect(audit).toMatch(/employee_id/);
    expect(audit).toMatch(/actor_user_id/);
    expect(audit).toMatch(/user_id/);
    expect(audit).toMatch(/Identifiant métier|canonique/i);
    expect(audit).toMatch(/acteur/i);
    expect(audit).toMatch(/[Ll]egacy|compatibilité/i);
    expect(audit).toMatch(/H5-E \/ H5-F[\s\S]*Non démarrés/);
    expect(audit).toMatch(/H4 SaaS[\s\S]*Non touché/);
    expect(audit).not.toMatch(/\bH5-E démarré\b/);
  });

  it("contains A/B/C options, Option B recommendation, and H5-D2 criteria", () => {
    expect(audit).toMatch(/OPTION A/i);
    expect(audit).toMatch(/OPTION B/i);
    expect(audit).toMatch(/OPTION C/i);
    expect(audit).toMatch(/OPTION B — DÉPRÉCIER/i);
    expect(audit).toMatch(/Critères GO H5-D2/i);
    expect(audit).toMatch(/GO Martin/i);
  });

  it("forbids production and keeps V1 at 51 %", () => {
    expect(audit).toContain("qcgvzdlfsxybrmloijpt");
    expect(audit).toMatch(/INTERDITE|interdite/);
    expect(audit).toContain("qokyobcvplzufshydhih");
    expect(audit).toMatch(/51\s*%/);
    expect(audit).toMatch(/H5-D1 TERMINÉ — AUDIT USER_ID DOCUMENTÉ, DÉCISION MARTIN REQUISE/);
  });

  it("keeps R10 H5-D lot aware of decision gate and update note", () => {
    expect(plan).toMatch(/LOT H5-D/);
    expect(plan).toMatch(/DROP COLUMN user_id/);
    expect(plan).toMatch(/OPTION B APPROUVÉE|H5-D2/);
  });
});

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const AUDIT = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5E1-SECURITY-RLS-AUDIT-2026-07-15.md"
);
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);
const D4 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5D4-STAGING-TRANSACTIONAL-PROOF-2026-07-15.md"
);

const H5E = [
  "20260429120000_rls_account_requests_temps_titan.sql",
  "20260429130000_security_advisor_view_and_metadata_policies.sql",
] as const;

describe("H5-E1 security RLS audit documentary", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const audit = readFileSync(AUDIT, "utf8");
  const plan = readFileSync(PLAN, "utf8");
  const d4 = readFileSync(D4, "utf8");

  it("identifies both H5-E historical migrations and forbids replay or new SQL", () => {
    expect(H5E).toHaveLength(2);
    for (const name of H5E) {
      expect(existsSync(join(MIGRATIONS_DIR, name))).toBe(true);
      expect(audit).toContain(name.slice(0, 14));
    }
    expect(files.some((f) => /h5e1/i.test(f))).toBe(false);
    expect(files.some((f) => /h5e2a_harden_authorization_helpers/i.test(f))).toBe(true);
    expect(files.some((f) => /h5e2c_close_terrain_fail_open/i.test(f))).toBe(true);
    expect(files.some((f) => /h5e2[bd]_/i.test(f))).toBe(false);
    expect(audit).toMatch(/NE PAS REJOUER|ne jamais rejouer|Ne jamais rejouer/i);
    expect(audit).toMatch(/aucune[\s\S]*migration|audit RO uniquement/i);
    expect(audit).toMatch(/aucune[\s\S]*policy|policy.*modifiés/i);
  });

  it("audits fail-open USING/WITH CHECK true, metadata sources, DEFINER and search_path", () => {
    expect(audit).toMatch(/USING true|USING \(true\)|`true`/);
    expect(audit).toMatch(/WITH CHECK true|WITH CHECK \(true\)|with_check/);
    expect(audit).toMatch(/app_metadata/);
    expect(audit).toMatch(/user_metadata/);
    expect(audit).toMatch(/SECURITY DEFINER|DEFINER/);
    expect(audit).toMatch(/search_path/);
    expect(audit).toMatch(/GRANT|Grants/);
    expect(audit).toMatch(/CRITIQUE/);
  });

  it("preserves H5-D2 view contract and documents H5-E2A/B/C/D strategy", () => {
    expect(audit).toMatch(/security_invoker/);
    expect(audit).toMatch(/18/);
    expect(audit).toMatch(/H5-D2/);
    expect(audit).toMatch(/he\.user_id[\s\S]*absent|absent[\s\S]*he\.user_id/i);
    expect(audit).toMatch(/H5-E2A/);
    expect(audit).toMatch(/H5-E2B/);
    expect(audit).toMatch(/H5-E2C/);
    expect(audit).toMatch(/H5-E2D/);
    expect(audit).toMatch(/Forward-only H5-E2/);
  });

  it("forbids H5-F / H4 execution, production; keeps V1 51 %; notes E1 admissible after D4", () => {
    expect(audit).toMatch(/H5-F[\s\S]*Non|Non touchés/);
    expect(audit).toMatch(/H4[\s\S]*Non|pending = 6/);
    expect(audit).toContain("qcgvzdlfsxybrmloijpt");
    expect(audit).toMatch(/INTERDITE/);
    expect(audit).toContain("qokyobcvplzufshydhih");
    expect(audit).toMatch(/51\s*%/);
    expect(audit).toMatch(/H5-E1 TERMINÉ/);
    expect(audit).toMatch(/H5-E2A/);
    expect(plan).toMatch(/H5-E1|LOT H5-E/);
    expect(plan).toMatch(/H5-E2A/);
    expect(d4).toMatch(/H5-E1/);
  });
});

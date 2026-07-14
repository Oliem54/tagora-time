import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const MANIFEST = join(
  process.cwd(),
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-MIGRATION-VERSION-MAP-2026-07-13.md"
);

const BOOTSTRAP = "20260409120000_historical_schema_bootstrap.sql";
const COMPANY = "20260410120000_company_activation_and_payroll.sql";
const GPS = "20260410130000_gps_direction_and_company_hardening.sql";

const SAAS_PREFIXES = [
  "20260712220000_saas1_organizations",
  "20260712220100_saas1_organization_companies",
  "20260712220200_saas1_organization_settings",
  "20260712220300_saas1_organization_memberships",
  "20260712220400_saas1_organization_invitations",
  "20260712220500_saas1_platform_access",
] as const;

describe("Migration version format and uniqueness", () => {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();

  it("uses a 14-digit unique version prefix on every migration", () => {
    const versions = names.map((n) => {
      const m = n.match(/^(\d{14})_.+\.sql$/);
      expect(m, n).toBeTruthy();
      return m![1];
    });
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.length).toBe(names.length);
  });

  it("has no remaining YYYYMMDD_HHMMSS_ legacy filenames", () => {
    for (const n of names) {
      expect(n).not.toMatch(/^\d{8}_\d{6}_/);
    }
  });

  it("keeps lexical sort as chronological order", () => {
    expect([...names]).toEqual([...names].sort());
  });

  it("keeps bootstrap before company activation before GPS", () => {
    expect(names.indexOf(BOOTSTRAP)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(COMPANY)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(GPS)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(BOOTSTRAP)).toBeLessThan(names.indexOf(COMPANY));
    expect(names.indexOf(COMPANY)).toBeLessThan(names.indexOf(GPS));
    expect(BOOTSTRAP < COMPANY).toBe(true);
    expect(COMPANY < GPS).toBe(true);
  });

  it("preserves the six SaaS 1B.1 migration versions", () => {
    for (const prefix of SAAS_PREFIXES) {
      expect(names).toContain(`${prefix}.sql`);
    }
  });

  it("does not create public.test migration artifacts", () => {
    for (const n of names) {
      expect(n.toLowerCase()).not.toContain("public.test");
      const sql = readFileSync(join(MIGRATIONS_DIR, n), "utf8").toLowerCase();
      if (n === BOOTSTRAP) {
        expect(sql).not.toContain('create table if not exists "public"."test"');
      }
    }
  });

  it("has a normalization manifest documenting the remaps", () => {
    expect(existsSync(MANIFEST)).toBe(true);
    const body = readFileSync(MANIFEST, "utf8");
    expect(body).toContain("20260410_130000_gps_direction_and_company_hardening.sql");
    expect(body).toContain("20260410130000_gps_direction_and_company_hardening.sql");
    expect(body).toContain("20260409120000_historical_schema_bootstrap.sql");
  });

  it("still contains non-empty SQL bodies after renames", () => {
    for (const n of names) {
      const buf = readFileSync(join(MIGRATIONS_DIR, n));
      expect(buf.byteLength).toBeGreaterThan(20);
      createHash("sha256").update(buf).digest("hex");
    }
  });
});

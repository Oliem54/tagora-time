import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  SAAS_1B1_FORBIDDEN_BUSINESS_TABLES,
  SAAS_1B1_FOUNDATION_TABLES,
} from "./tenant-foundation.shared";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const SAAS_1B1_MIGRATION_PREFIXES = [
  "20260712220000_saas1_organizations",
  "20260712220100_saas1_organization_companies",
  "20260712220200_saas1_organization_settings",
  "20260712220300_saas1_organization_memberships",
  "20260712220400_saas1_organization_invitations",
  "20260712220500_saas1_platform_access",
] as const;

function readSaas1b1Migrations(): { name: string; sql: string }[] {
  return SAAS_1B1_MIGRATION_PREFIXES.map((prefix) => {
    const name = `${prefix}.sql`;
    const sql = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    return { name, sql };
  });
}

describe("SaaS 1B.1 migration files", () => {
  const migrations = readSaas1b1Migrations();
  const combined = migrations.map((m) => m.sql).join("\n");

  it("uses YYYYMMDDHHMMSS filenames (14-digit version)", () => {
    for (const migration of migrations) {
      expect(migration.name).toMatch(/^\d{14}_saas1_.+\.sql$/);
    }
  });

  it("creates all foundation tables and no Groupe Oliem seed", () => {
    for (const table of SAAS_1B1_FOUNDATION_TABLES) {
      expect(combined.toLowerCase()).toContain(`create table if not exists public.${table}`);
    }
    expect(combined.toLowerCase()).not.toContain("groupe-oliem");
    expect(combined.toLowerCase()).not.toContain("oliem solutions");
    expect(combined.toLowerCase()).not.toContain("produits industriels titan");
    expect(combined.toLowerCase()).not.toMatch(/insert into public\.organizations/);
  });

  it("enables fail-closed RLS without USING (true) policies", () => {
    expect(combined.toLowerCase()).toContain("enable row level security");
    expect(combined.toLowerCase()).toContain("force row level security");
    expect(combined.toLowerCase()).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(combined.toLowerCase()).not.toMatch(/with check\s*\(\s*true\s*\)/);
    expect(combined.toLowerCase()).toContain("revoke all on table");
  });

  it("forbids platform_super_admin in membership role check", () => {
    const memberships = migrations.find((m) =>
      m.name.includes("organization_memberships")
    );
    expect(memberships).toBeTruthy();
    const roleCheck = memberships!.sql.match(
      /constraint organization_memberships_role_check\s+check\s*\(([\s\S]*?)\)\s*,/
    );
    expect(roleCheck?.[1]).toBeTruthy();
    expect(roleCheck![1]).toContain("organization_owner");
    expect(roleCheck![1]).toContain("organization_admin");
    expect(roleCheck![1]).toContain("direction");
    expect(roleCheck![1]).toContain("employe");
    expect(roleCheck![1]).not.toContain("platform_super_admin");
  });

  it("stores invitation token_hash and requires support expiration", () => {
    expect(combined).toContain("token_hash");
    expect(combined.toLowerCase()).toContain("platform_access_support_expires_check");
    expect(combined).toContain("platform_access_audit");
  });

  it("does not alter historical business tables", () => {
    for (const table of SAAS_1B1_FORBIDDEN_BUSINESS_TABLES) {
      expect(combined.toLowerCase()).not.toContain(`alter table public.${table}`);
      expect(combined.toLowerCase()).not.toContain(`alter table if exists public.${table}`);
    }
  });

  it("does not include seed/backfill migrations in this lot", () => {
    const names = readdirSync(MIGRATIONS_DIR);
    expect(names.some((n) => n.includes("seed_groupe_oliem"))).toBe(false);
    expect(names.some((n) => n.includes("backfill_memberships"))).toBe(false);
  });

  it("uses on delete restrict for tenant FKs (no destructive cascade of tenant graph)", () => {
    expect(combined.toLowerCase()).toContain("on delete restrict");
    expect(combined.toLowerCase()).not.toMatch(
      /organization_id uuid not null[\s\S]{0,80}on delete cascade/
    );
  });
});

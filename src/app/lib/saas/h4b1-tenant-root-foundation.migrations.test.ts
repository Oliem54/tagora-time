import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAAS_1B1_FORBIDDEN_BUSINESS_TABLES } from "./tenant-foundation.shared";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const FILE = "20260716220000_h4b1_tenant_root_foundation.sql";

describe("H4-B1 tenant root foundation DDL", () => {
  const path = join(MIGRATIONS_DIR, FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const bodies = lower.replace(/--[^\n]*/g, " ").replace(/comment on[\s\S]*?;/g, " ");
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();

  it("ships exact version 20260716220000", () => {
    expect(existsSync(path)).toBe(true);
    expect(FILE).toBe("20260716220000_h4b1_tenant_root_foundation.sql");
    expect(files.filter((f) => f.startsWith("20260716220000"))).toEqual([FILE]);
  });

  it("is transactional and creates exactly the B1 root objects", () => {
    expect(lower.trimStart().startsWith("begin") || lower.includes("\nbegin;")).toBe(true);
    expect(lower).toMatch(/\bbegin\s*;/);
    expect(lower).toMatch(/\bcommit\s*;/);
    expect(bodies).toContain("create table if not exists public.organizations");
    expect(bodies).toContain("create table if not exists public.organization_companies");
    expect(bodies).toContain("create table if not exists public.organization_settings");
    expect(bodies).toContain("create or replace function public.set_saas_foundation_updated_at");
    expect(bodies).toContain("trg_organizations_updated_at");
    expect(bodies).toContain("trg_organization_companies_updated_at");
    expect(bodies).toContain("trg_organization_settings_updated_at");
    expect((bodies.match(/on delete restrict/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(bodies).not.toMatch(/on delete cascade/);
    for (const idx of [
      "organizations_slug_active_uidx",
      "organizations_status_idx",
      "organizations_deleted_at_idx",
      "organization_companies_org_code_uidx",
      "organization_companies_one_default_uidx",
      "organization_companies_org_id_idx",
      "organization_companies_org_status_idx",
    ]) {
      expect(bodies).toContain(idx);
    }
  });

  it("hardens the updated_at function (INVOKER, search_path, EXECUTE ACL)", () => {
    expect(sql).toMatch(
      /create or replace function public\.set_saas_foundation_updated_at\(\)[\s\S]*?security invoker[\s\S]*?set search_path\s*=\s*pg_catalog[\s\S]*?as \$\$/i
    );
    expect(bodies).not.toMatch(/security\s+definer/);
    expect(lower).toMatch(
      /revoke all on function\s+public\.set_saas_foundation_updated_at\(\)\s+from public/
    );
    expect(lower).toMatch(
      /revoke all on function\s+public\.set_saas_foundation_updated_at\(\)\s+from anon/
    );
    expect(lower).toMatch(
      /revoke all on function\s+public\.set_saas_foundation_updated_at\(\)\s+from authenticated/
    );
    expect(lower).toMatch(
      /grant execute on function\s+public\.set_saas_foundation_updated_at\(\)\s+to service_role/
    );
    expect(lower).not.toMatch(
      /grant execute on function\s+public\.set_saas_foundation_updated_at\(\)\s+to\s+(anon|authenticated|public)\b/
    );
  });

  it("is fail-closed RLS with no B2/B3/biz/seed/backfill", () => {
    expect((lower.match(/enable row level security/g) ?? []).length).toBe(3);
    expect((lower.match(/force row level security/g) ?? []).length).toBe(3);
    expect(bodies).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(bodies).not.toMatch(/with check\s*\(\s*true\s*\)/);
    expect(bodies).not.toMatch(/\bcreate policy\b/);
    expect(lower).toMatch(/revoke all on table public\.organizations from (public|anon)/);
    expect(bodies).not.toMatch(/\binsert\s+into\b/);
    expect(bodies).not.toMatch(/\bbackfill\b/);
    expect(bodies).not.toContain("organization_memberships");
    expect(bodies).not.toContain("organization_invitations");
    expect(bodies).not.toContain("platform_access");
    expect(bodies).not.toContain("enforce_organization_has_owner");
    for (const t of SAAS_1B1_FORBIDDEN_BUSINESS_TABLES) {
      expect(bodies).not.toContain(`alter table public.${t}`);
    }
  });
});

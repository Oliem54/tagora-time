import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAAS_1B1_FORBIDDEN_BUSINESS_TABLES } from "./tenant-foundation.shared";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const FILE = "20260716220000_h4b1_tenant_root_foundation.sql";
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H4B1-TENANT-ROOT-EXECUTION-2026-07-16.md"
);

const ORIGINALS = [
  "20260712220000_saas1_organizations.sql",
  "20260712220100_saas1_organization_companies.sql",
  "20260712220200_saas1_organization_settings.sql",
  "20260712220300_saas1_organization_memberships.sql",
  "20260712220400_saas1_organization_invitations.sql",
  "20260712220500_saas1_platform_access.sql",
] as const;

const ORIGINAL_HASHES = {
  "20260712220000_saas1_organizations.sql":
    "ea4a486d7fc3686e9792d6986c23b45a6d0aaea8ee89669118a7e38d17153186",
  "20260712220100_saas1_organization_companies.sql":
    "6f3f12245cbb825e8e541201f1d134c2b4d88a164942ec9c885c73a3e754ac19",
  "20260712220200_saas1_organization_settings.sql":
    "7d19617344f6114a84845855eaf096f1e378e9f776322539e295375f67e94398",
} as const;

describe("H4-B1 tenant root foundation forward-only", () => {
  const path = join(MIGRATIONS_DIR, FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const bodies = lower.replace(/--[^\n]*/g, " ").replace(/comment on[\s\S]*?;/g, " ");
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();

  it("ships exact version 20260716220000 after H5-E2D", () => {
    expect(existsSync(path)).toBe(true);
    expect(FILE).toBe("20260716220000_h4b1_tenant_root_foundation.sql");
    expect(files.filter((f) => f.startsWith("20260716220000"))).toEqual([FILE]);
    expect(files.indexOf("20260715160000_h5e2d_harden_direction_terrain_view_grants.sql")).toBeLessThan(
      files.indexOf(FILE)
    );
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

  it("leaves original H4 migrations unchanged and protects H5-F5 / production / V1 math", () => {
    for (const name of ORIGINALS) {
      expect(existsSync(join(MIGRATIONS_DIR, name))).toBe(true);
    }
    for (const [name, sha] of Object.entries(ORIGINAL_HASHES)) {
      const content = readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(/\r\n/g, "\n");
      expect(createHash("sha256").update(content).digest("hex")).toBe(sha);
    }
    expect(existsSync(HANDOFF)).toBe(true);
    const handoff = readFileSync(HANDOFF, "utf8");
    expect(handoff).toContain("20260716220000");
    expect(handoff).toContain("20260425133500");
    expect(handoff).toMatch(/H5-F5/);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE|interdite/);
    expect(handoff).toMatch(/55\s*%/);
    expect(handoff).toMatch(/57\s*%/);
    expect(handoff).toMatch(/six migrations originales.*pending|originales H4.*pending|20260712220x00.*pending/i);
    expect(sql).not.toContain("20260425133500");
    expect(sql).not.toContain("migration repair");
  });
});

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAAS_1B1_FORBIDDEN_BUSINESS_TABLES } from "./tenant-foundation.shared";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const FILE = "20260716221000_h4b2_organization_identities.sql";

describe("H4-B2 organization identities DDL", () => {
  const path = join(MIGRATIONS_DIR, FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const bodies = lower.replace(/--[^\n]*/g, " ").replace(/comment on[\s\S]*?;/g, " ");
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();

  it("ships exact version 20260716221000 after H4-B1", () => {
    expect(existsSync(path)).toBe(true);
    expect(FILE).toBe("20260716221000_h4b2_organization_identities.sql");
    expect(files.filter((f) => f.startsWith("20260716221000"))).toEqual([FILE]);
    expect(files.indexOf("20260716220000_h4b1_tenant_root_foundation.sql")).toBeLessThan(
      files.indexOf(FILE)
    );
  });

  it("is transactional and creates memberships, invitations, owner fn, triggers, indexes, FKs", () => {
    expect(lower).toMatch(/\bbegin\s*;/);
    expect(lower).toMatch(/\bcommit\s*;/);
    expect(bodies).toContain("create table if not exists public.organization_memberships");
    expect(bodies).toContain("create table if not exists public.organization_invitations");
    expect(bodies).toContain("create or replace function public.enforce_organization_has_owner");
    expect(bodies).toContain("trg_organization_memberships_enforce_owner");
    expect(bodies).toContain("trg_organization_memberships_updated_at");
    expect(bodies).toContain("trg_organization_invitations_updated_at");
    for (const idx of [
      "organization_memberships_org_user_uidx",
      "organization_memberships_user_default_uidx",
      "organization_memberships_user_id_idx",
      "organization_memberships_org_role_idx",
      "organization_memberships_org_status_idx",
      "organization_invitations_pending_email_uidx",
      "organization_invitations_token_hash_uidx",
      "organization_invitations_org_id_idx",
      "organization_invitations_expires_at_idx",
    ]) {
      expect(bodies).toContain(idx);
    }
    expect((bodies.match(/on delete restrict/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(bodies).toContain("on delete set null");
    expect(bodies).not.toMatch(/on delete cascade/);
  });

  it("hardens owner fn: INVOKER, search_path, immutable organization_id, FOR UPDATE, ACL", () => {
    expect(sql).toMatch(
      /create or replace function public\.enforce_organization_has_owner\(\)[\s\S]*?security invoker[\s\S]*?set search_path\s*=\s*pg_catalog[\s\S]*?as \$\$/i
    );
    expect(bodies).not.toMatch(/security\s+definer/);
    expect(bodies).toContain("new.organization_id is distinct from old.organization_id");
    expect(bodies).toContain("organization_id is immutable");
    expect(bodies).toMatch(/from public\.organizations[\s\S]*for update/);
    expect(bodies).toContain("v_org_id := old.organization_id");
    expect(lower).toMatch(
      /revoke all on function\s+public\.enforce_organization_has_owner\(\)\s+from public/
    );
    expect(lower).toMatch(
      /revoke all on function\s+public\.enforce_organization_has_owner\(\)\s+from anon/
    );
    expect(lower).toMatch(
      /revoke all on function\s+public\.enforce_organization_has_owner\(\)\s+from authenticated/
    );
    expect(lower).toMatch(
      /grant execute on function\s+public\.enforce_organization_has_owner\(\)\s+to service_role/
    );
    expect(sql).toContain("organization_owner");
    expect(sql).toContain("organization_admin");
    expect(sql).toContain("'direction'");
    expect(sql).toContain("'employe'");
    const roleCheck = sql.match(
      /constraint organization_memberships_role_check\s+check\s*\(([\s\S]*?)\)\s*,/
    );
    expect(roleCheck?.[1]).toBeTruthy();
    expect(roleCheck![1]).not.toContain("platform_super_admin");
    expect(roleCheck![1]).not.toContain("platform_support");
  });

  it("is fail-closed RLS; token_hash only; no B3/biz/seed", () => {
    expect((lower.match(/enable row level security/g) ?? []).length).toBe(2);
    expect((lower.match(/force row level security/g) ?? []).length).toBe(2);
    expect(bodies).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(bodies).not.toMatch(/with check\s*\(\s*true\s*\)/);
    expect(bodies).not.toMatch(/\bcreate policy\b/);
    expect(bodies).toContain("token_hash");
    const inv = bodies.replace(/comment on[\s\S]*?;/g, " ");
    expect(inv).not.toMatch(/invitation_token\s+text/);
    expect(inv).not.toMatch(/\braw_token\b/);
    expect(bodies).not.toMatch(/\binsert\s+into\b/);
    expect(bodies).not.toMatch(/\bbackfill\b/);
    expect(bodies).not.toContain("platform_access");
    expect(bodies).not.toContain("platform_access_audit");
    for (const t of SAAS_1B1_FORBIDDEN_BUSINESS_TABLES) {
      expect(bodies).not.toContain(`alter table public.${t}`);
    }
  });
});

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAAS_1B1_FORBIDDEN_BUSINESS_TABLES } from "./tenant-foundation.shared";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const FILE = "20260716221000_h4b2_organization_identities.sql";
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H4B2-ORGANIZATION-IDENTITIES-EXECUTION-2026-07-16.md"
);

const ORIGINAL_HASHES = {
  "20260712220300_saas1_organization_memberships.sql":
    "baf21d05a6faf9651ea767f705c83af2b78e31828515e24edb58177c9def512f",
  "20260712220400_saas1_organization_invitations.sql":
    "fa63050919feb281e677bdfabfcc9071581b4c8e8b76d8f2af16bf4623d04a47",
  "20260716220000_h4b1_tenant_root_foundation.sql":
    "23ddacc8eeae8f299ed6a45816360cf3cc514e1e0046ccf72a2fd4ff944111a6",
} as const;

describe("H4-B2 organization identities forward-only", () => {
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

  it("keeps originals/B1 unchanged and documents protections + V1 57→59", () => {
    for (const [name, sha] of Object.entries(ORIGINAL_HASHES)) {
      const content = readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(/\r\n/g, "\n");
      expect(createHash("sha256").update(content).digest("hex")).toBe(sha);
    }
    expect(existsSync(HANDOFF)).toBe(true);
    const handoff = readFileSync(HANDOFF, "utf8");
    expect(handoff).toContain("20260716221000");
    expect(handoff).toContain("20260425133500");
    expect(handoff).toMatch(/H5-F5/);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE|interdite/);
    expect(handoff).toMatch(/57\s*%/);
    expect(handoff).toMatch(/59\s*%/);
    expect(handoff).toMatch(/six migrations originales H4[\s\S]*pending/i);
    expect(sql).not.toContain("20260425133500");
    expect(sql).not.toContain("migration repair");
  });
});

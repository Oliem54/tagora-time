import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAAS_1B1_FORBIDDEN_BUSINESS_TABLES } from "./tenant-foundation.shared";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const FILE = "20260716222000_h4b3_platform_access_audit.sql";
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H4B3-PLATFORM-ACCESS-AUDIT-EXECUTION-2026-07-16.md"
);

const ORIGINAL_HASHES = {
  "20260712220500_saas1_platform_access.sql":
    "3e9544f09ce34e7d70542c6e5ac65aaab7944f9ce1190f80bb144d61867bd657",
  "20260716220000_h4b1_tenant_root_foundation.sql":
    "23ddacc8eeae8f299ed6a45816360cf3cc514e1e0046ccf72a2fd4ff944111a6",
  "20260716221000_h4b2_organization_identities.sql":
    "efd8ec331bebf8716cb3cb7d41e3bb4a48d4f470ae074e0afac0ac17817e881b",
} as const;

describe("H4-B3 platform access audit forward-only", () => {
  const path = join(MIGRATIONS_DIR, FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const bodies = lower.replace(/--[^\n]*/g, " ").replace(/comment on[\s\S]*?;/g, " ");
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();

  it("ships exact version 20260716222000 after H4-B2", () => {
    expect(existsSync(path)).toBe(true);
    expect(FILE).toBe("20260716222000_h4b3_platform_access_audit.sql");
    expect(files.filter((f) => f.startsWith("20260716222000"))).toEqual([FILE]);
    expect(files.indexOf("20260716221000_h4b2_organization_identities.sql")).toBeLessThan(
      files.indexOf(FILE)
    );
  });

  it("is transactional and creates platform_access, audit, function, triggers, indexes, FKs", () => {
    expect(lower).toMatch(/\bbegin\s*;/);
    expect(lower).toMatch(/\bcommit\s*;/);
    expect(bodies).toContain("create table if not exists public.platform_access");
    expect(bodies).toContain("create table if not exists public.platform_access_audit");
    expect(bodies).toContain(
      "create or replace function public.prevent_platform_access_audit_mutation"
    );
    expect(bodies).toContain("trg_platform_access_updated_at");
    expect(bodies).toContain("trg_platform_access_audit_no_update_delete");
    expect(bodies).toContain("trg_platform_access_audit_no_truncate");
    expect(bodies).toMatch(/before truncate on public\.platform_access_audit/);
    for (const idx of [
      "platform_access_user_id_idx",
      "platform_access_status_idx",
      "platform_access_expires_at_idx",
      "platform_access_active_super_admin_uidx",
      "platform_access_audit_actor_idx",
      "platform_access_audit_target_org_idx",
      "platform_access_audit_created_at_idx",
    ]) {
      expect(bodies).toContain(idx);
    }
    expect(bodies).toContain("platform_super_admin");
    expect(bodies).toContain("platform_support");
    expect(bodies).toContain("platform_access_support_expires_check");
    expect(bodies).toContain("service_role_key");
    expect(bodies).not.toMatch(/on delete cascade/);
  });

  it("hardens mutation fn and audit grants append-only", () => {
    expect(sql).toMatch(
      /create or replace function public\.prevent_platform_access_audit_mutation\(\)[\s\S]*?security invoker[\s\S]*?set search_path\s*=\s*pg_catalog[\s\S]*?as \$\$/i
    );
    expect(bodies).not.toMatch(/security\s+definer/);
    expect(bodies).toContain("platform_access_audit is append-only");
    expect(lower).toMatch(
      /revoke all on function\s+public\.prevent_platform_access_audit_mutation\(\)\s+from public/
    );
    expect(lower).toMatch(
      /revoke all on function\s+public\.prevent_platform_access_audit_mutation\(\)\s+from anon/
    );
    expect(lower).toMatch(
      /revoke all on function\s+public\.prevent_platform_access_audit_mutation\(\)\s+from authenticated/
    );
    expect(lower).toMatch(
      /grant execute on function\s+public\.prevent_platform_access_audit_mutation\(\)\s+to service_role/
    );
    expect(lower).toMatch(
      /revoke all on table public\.platform_access_audit from service_role/
    );
    expect(lower).toMatch(
      /grant select,\s*insert on table public\.platform_access_audit to service_role/
    );
    const auditGrants = [...lower.matchAll(/grant[^;]+on table public\.platform_access_audit[^;]+;/g)].map(
      (m) => m[0]
    );
    expect(auditGrants.length).toBeGreaterThan(0);
    expect(auditGrants.join("\n")).not.toMatch(/\bupdate\b/);
    expect(auditGrants.join("\n")).not.toMatch(/\bdelete\b/);
    expect(auditGrants.join("\n")).not.toMatch(/\btruncate\b/);
  });

  it("is fail-closed RLS without seed/biz/B1-B2 mutation", () => {
    expect((lower.match(/enable row level security/g) ?? []).length).toBe(2);
    expect((lower.match(/force row level security/g) ?? []).length).toBe(2);
    expect(bodies).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(bodies).not.toMatch(/with check\s*\(\s*true\s*\)/);
    expect(bodies).not.toMatch(/\bcreate policy\b/);
    expect(bodies).not.toMatch(/\binsert\s+into\b/);
    expect(bodies).not.toMatch(/\bbackfill\b/);
    expect(bodies).not.toContain("alter table public.organizations");
    expect(bodies).not.toContain("alter table public.organization_memberships");
    expect(bodies).not.toContain("enforce_organization_has_owner");
    for (const t of SAAS_1B1_FORBIDDEN_BUSINESS_TABLES) {
      expect(bodies).not.toContain(`alter table public.${t}`);
    }
  });

  it("keeps B1/B2/original unchanged and documents V1 59→65 + H5-F5 protection", () => {
    for (const [name, sha] of Object.entries(ORIGINAL_HASHES)) {
      const content = readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(/\r\n/g, "\n");
      expect(createHash("sha256").update(content).digest("hex")).toBe(sha);
    }
    expect(existsSync(HANDOFF)).toBe(true);
    const handoff = readFileSync(HANDOFF, "utf8");
    expect(handoff).toContain("20260716222000");
    expect(handoff).toContain("20260425133500");
    expect(handoff).toMatch(/H5-F5/);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE|interdite/);
    expect(handoff).toMatch(/59\s*%/);
    expect(handoff).toMatch(/65\s*%/);
    expect(handoff).toMatch(/--include-all/);
    expect(sql).not.toContain("20260425133500");
    expect(sql).not.toContain("migration repair");
    expect(sql).not.toContain("--include-all");
  });
});

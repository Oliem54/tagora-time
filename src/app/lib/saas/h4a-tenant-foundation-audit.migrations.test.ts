import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SAAS_1B1_FORBIDDEN_BUSINESS_TABLES,
  SAAS_1B1_FOUNDATION_TABLES,
} from "./tenant-foundation.shared";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H4A-TENANT-FOUNDATION-AUDIT-2026-07-16.md"
);

const H4 = [
  "20260712220000_saas1_organizations.sql",
  "20260712220100_saas1_organization_companies.sql",
  "20260712220200_saas1_organization_settings.sql",
  "20260712220300_saas1_organization_memberships.sql",
  "20260712220400_saas1_organization_invitations.sql",
  "20260712220500_saas1_platform_access.sql",
] as const;

const FUNCS = ["set_saas_foundation_updated_at", "enforce_organization_has_owner"] as const;

describe("H4-A tenant foundation audit documentary", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const sqls = H4.map((name) => ({
    name,
    sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
  }));
  const combined = sqls.map((s) => s.sql).join("\n");
  const lower = combined.toLowerCase();
  const handoff = readFileSync(HANDOFF, "utf8");

  it("has exactly six H4 migrations with fixed versions", () => {
    expect(H4).toHaveLength(6);
    for (const name of H4) {
      expect(existsSync(join(MIGRATIONS_DIR, name))).toBe(true);
      expect(name).toMatch(/^20260712220\d00_saas1_.+\.sql$/);
    }
    expect(files.filter((f) => f.startsWith("20260712220")).sort()).toEqual([...H4]);
  });

  it("defines seven foundation tables and two functions without seed/backfill/biz alters", () => {
    expect(SAAS_1B1_FOUNDATION_TABLES).toHaveLength(7);
    for (const t of SAAS_1B1_FOUNDATION_TABLES) {
      expect(lower).toContain(`create table if not exists public.${t}`);
    }
    for (const f of FUNCS) {
      expect(lower).toContain(`create or replace function public.${f}`);
    }
    const bodies = lower.replace(/--[^\n]*/g, " ");
    expect(bodies).not.toMatch(/insert\s+into\s+public\.(organizations|organization_|platform_)/);
    expect(bodies).not.toMatch(/\binsert\s+into\b/);
    expect(bodies).not.toMatch(/\bupdate\s+public\./);
    expect(bodies).not.toMatch(/\bbackfill\b/);
    for (const t of SAAS_1B1_FORBIDDEN_BUSINESS_TABLES) {
      expect(lower).not.toContain(`alter table public.${t}`);
    }
  });

  it("is fail-closed RLS: FORCE, no USING/CHECK true, revoke anon/authenticated", () => {
    expect((lower.match(/enable row level security/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect((lower.match(/force row level security/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect(lower).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(lower).not.toMatch(/with check\s*\(\s*true\s*\)/);
    expect(lower).toContain("revoke all on table");
    expect(lower).toMatch(/revoke all on table[\s\S]*from anon,\s*authenticated/);
    expect(lower).not.toMatch(/grant\s+select[\s\S]*\bto\s+anon\b/);
    expect(lower).not.toMatch(/grant\s+select[\s\S]*\bto\s+authenticated\b/);
  });

  it("keeps platform roles outside memberships; invitations use token_hash; support expires", () => {
    const mem = sqls.find((s) => s.name.includes("memberships"))!.sql;
    expect(mem).toContain("organization_owner");
    const roleCheck = mem.match(
      /constraint organization_memberships_role_check\s+check\s*\(([\s\S]*?)\)\s*,/
    );
    expect(roleCheck?.[1]).toBeTruthy();
    expect(roleCheck![1]).not.toContain("platform_super_admin");
    expect(roleCheck![1]).not.toContain("platform_support");
    expect(combined).toContain("token_hash");
    const invBodies = sqls
      .find((s) => s.name.includes("invitations"))!
      .sql.toLowerCase()
      .replace(/--[^\n]*/g, " ")
      .replace(/comment on[\s\S]*?;/g, " ");
    expect(invBodies).toContain("token_hash");
    expect(invBodies).not.toMatch(/invitation_token\s+text/);
    expect(invBodies).not.toMatch(/\braw_token\b/);
    expect(combined).toContain("platform_access_support_expires_check");
    expect(combined).toContain("platform_access_audit");
  });

  it("documents organization_id membership risk, audit append-only gap, dry-run bans include-all", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    expect(handoff).toMatch(/organization_id/);
    expect(handoff).toMatch(/immutable|immuable|supprimé puis recréé|TRANSFER/i);
    expect(handoff).toMatch(/append-only|UPDATE\/DELETE|service_role/i);
    expect(handoff).toMatch(/--include-all/);
    expect(handoff).toMatch(/dry-run|DRY RUN/i);
    expect(handoff).toContain("20260425133500");
    expect(handoff).toMatch(/H5-F5/);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE|interdite/);
    expect(handoff).toContain("qokyobcvplzufshydhih");
    expect(handoff).toMatch(/51\s*%/);
    expect(handoff).toMatch(/H4-B1|H4-B2|H4-B3/);
    expect(handoff).toMatch(/Option A|Option B|Option C|Option D/);
    expect(handoff).toMatch(/aucune[\s\S]*migration SQL|Ne créer aucune migration|aucune migration créée/i);
  });

  it("fingerprints the six H4 files", () => {
    for (const { name, sql } of sqls) {
      const sha = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
      expect(sha).toHaveLength(64);
      expect(handoff.toUpperCase()).toContain(
        createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex").toUpperCase()
      );
      expect(name.length).toBeGreaterThan(10);
    }
  });
});

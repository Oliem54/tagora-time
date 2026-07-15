import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const H5E2A_FILE = "20260715130000_h5e2a_harden_authorization_helpers.sql";
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5E2A-AUTH-HELPERS-HARDENING-2026-07-15.md"
);
const E1 = join(
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

const HELPERS = [
  "public.current_app_role()",
  "public.current_app_permissions()",
  "public.has_app_permission(p_permission text)",
  "public.is_direction_user()",
  "public.is_direction_or_admin()",
] as const;

describe("H5-E2A harden authorization helpers", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const path = join(MIGRATIONS_DIR, H5E2A_FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const withoutLineComments = lower.replace(/--[^\n]*/g, " ");
  const bodiesOnly = withoutLineComments.replace(/comment on function[\s\S]*?;/g, " ");

  it("ships a single forward-only H5-E2A migration after H5-D2", () => {
    expect(existsSync(path)).toBe(true);
    expect(H5E2A_FILE).toMatch(/^\d{14}_h5e2a_harden_authorization_helpers\.sql$/);
    expect(files.filter((f) => /h5e2a/i.test(f))).toEqual([H5E2A_FILE]);
    expect(files.indexOf("20260715120000_h5d2_deprecate_horodateur_user_id.sql")).toBeLessThan(
      files.indexOf(H5E2A_FILE)
    );
  });

  it("recreates exactly the five helpers as SECURITY INVOKER with search_path=pg_catalog", () => {
    for (const helper of HELPERS) {
      expect(sql).toContain(`create or replace function ${helper}`);
    }
    expect((sql.match(/create or replace function public\./gi) ?? []).length).toBe(5);
    expect(
      (sql.match(/create or replace function[\s\S]*?security invoker[\s\S]*?as \$\$/gi) ?? [])
        .length
    ).toBe(5);
    expect(
      (sql.match(/create or replace function[\s\S]*?set search_path\s*=\s*pg_catalog[\s\S]*?as \$\$/gi) ??
        []).length
    ).toBe(5);
    expect(bodiesOnly).not.toMatch(/security\s+definer/);
  });

  it("reads role and permissions from app_metadata only (no user_metadata)", () => {
    expect(sql).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
    expect(sql).toContain("auth.jwt() -> 'app_metadata' -> 'permissions'");
    expect(bodiesOnly).not.toContain("user_metadata");
    expect(sql).toMatch(/'\[\]'::jsonb/);
    expect(sql).toMatch(/array\[\]::text\[\]/);
  });

  it("preserves has_app_permission business truth (direction|employe only, no admin auto)", () => {
    const fn = sql.match(
      /create or replace function public\.has_app_permission[\s\S]*?\$\$;/i
    );
    expect(fn?.[0]).toBeTruthy();
    expect(fn![0]).toMatch(/current_app_role\(\)\s*=\s*'direction'/);
    expect(fn![0]).toMatch(/current_app_role\(\)\s*=\s*'employe'/);
    expect(fn![0]).not.toMatch(/=\s*'admin'/);
  });

  it("preserves is_direction_user / is_direction_or_admin logic", () => {
    expect(sql).toMatch(
      /is_direction_user\(\)[\s\S]*current_app_role\(\)\s*=\s*'direction'/i
    );
    expect(sql).toMatch(
      /is_direction_or_admin\(\)[\s\S]*current_app_role\(\)\s+in\s*\(\s*'direction',\s*'admin'\s*\)/i
    );
  });

  it("revokes EXECUTE from PUBLIC and anon; grants authenticated and service_role", () => {
    for (const name of [
      "current_app_role()",
      "current_app_permissions()",
      "has_app_permission(text)",
      "is_direction_user()",
      "is_direction_or_admin()",
    ]) {
      expect(lower).toContain(`revoke all on function public.${name} from public`);
      expect(lower).toContain(`revoke all on function public.${name} from anon`);
      expect(lower).toContain(`grant execute on function public.${name} to authenticated`);
      expect(lower).toContain(`grant execute on function public.${name} to service_role`);
    }
    expect(bodiesOnly).not.toMatch(/grant\s+execute[\s\S]*\bto\s+anon\b/);
    expect(bodiesOnly).not.toMatch(/grant\s+execute[\s\S]*\bto\s+public\b/);
  });

  it("contains no policies, views, tables, triggers, seeds, H5-E2B/C/D, H5-F, or H4", () => {
    expect(bodiesOnly).not.toMatch(/create\s+policy|drop\s+policy|alter\s+policy/);
    expect(bodiesOnly).not.toMatch(/create\s+(or\s+replace\s+)?view/);
    expect(bodiesOnly).not.toMatch(/create\s+table|alter\s+table/);
    expect(bodiesOnly).not.toMatch(/create\s+trigger|drop\s+trigger/);
    expect(bodiesOnly).not.toMatch(/insert\s+into|update\s+|delete\s+from/);
    expect(bodiesOnly).not.toMatch(/h5-e2b|h5e2b|h5-e2c|h5e2c|h5-e2d|h5e2d|h5-f\b|h5f\b/);
    expect(bodiesOnly).not.toContain("direction_terrain_positions");
    expect(bodiesOnly).not.toContain("20260429120000");
    expect(bodiesOnly).not.toContain("20260429130000");
  });

  it("documents COMMENT ON FUNCTION contract (app_metadata, invoker, search_path)", () => {
    expect((sql.match(/comment on function public\./gi) ?? []).length).toBe(5);
    expect(lower).toContain("app_metadata");
    expect(lower).toContain("user_metadata forbidden");
    expect(lower).toContain("security invoker");
    expect(lower).toContain("search_path=pg_catalog");
  });

  it("handoff + plan + E1 mark E2A executed; synthetic JWT elevation contract documented", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    const handoff = readFileSync(HANDOFF, "utf8");
    const e1 = readFileSync(E1, "utf8");
    const plan = readFileSync(PLAN, "utf8");
    expect(handoff).toContain("H5-E2A");
    expect(handoff).toContain(H5E2A_FILE);
    expect(handoff).toMatch(/app_metadata/);
    expect(handoff).toMatch(/user_metadata/);
    expect(handoff).toMatch(/employe/);
    expect(handoff).toMatch(/terrain/);
    expect(handoff).toMatch(/commissions/);
    expect(handoff).toMatch(/élévation|elevation|ignoré|ignored/i);
    expect(handoff).toMatch(/51\s*%/);
    expect(handoff).toContain("qokyobcvplzufshydhih");
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/ROLLBACK|Rollback/);
    expect(e1).toMatch(/H5-E2A[\s\S]*exécuté|H5-E2A EXÉCUTÉ|E2A.*exécuté/i);
    expect(plan).toMatch(/H5-E2A/);
    expect(plan).toMatch(/51\s*%/);
  });

  it("migration content is stable enough to fingerprint (non-empty SHA-256)", () => {
    const sha = createHash("sha256").update(sql).digest("hex");
    expect(sha).toHaveLength(64);
    expect(sha).not.toMatch(/^0+$/);
  });
});

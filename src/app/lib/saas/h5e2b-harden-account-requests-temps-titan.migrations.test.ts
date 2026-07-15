import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const H5E2B_FILE = "20260715150000_h5e2b_harden_account_requests_temps_titan.sql";
const H5E2A_FILE = "20260715130000_h5e2a_harden_authorization_helpers.sql";
const H5E2C_FILE = "20260715140000_h5e2c_close_terrain_fail_open_policies.sql";
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5E2B-ACCOUNT-REQUESTS-TEMPS-TITAN-RLS-2026-07-15.md"
);
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);
const E1 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5E1-SECURITY-RLS-AUDIT-2026-07-15.md"
);

describe("H5-E2B harden account_requests and temps_titan RLS", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const path = join(MIGRATIONS_DIR, H5E2B_FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const body = lower
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

  it("ships a single H5-E2B migration after H5-E2C", () => {
    expect(existsSync(path)).toBe(true);
    expect(H5E2B_FILE).toMatch(/^\d{14}_h5e2b_harden_account_requests_temps_titan\.sql$/);
    expect(files.filter((f) => /h5e2b/i.test(f))).toEqual([H5E2B_FILE]);
    expect(files.indexOf(H5E2C_FILE)).toBeLessThan(files.indexOf(H5E2B_FILE));
    expect(existsSync(join(MIGRATIONS_DIR, H5E2A_FILE))).toBe(true);
  });

  it("bounds public account_requests insert and drops legacy aliases", () => {
    expect(sql).toContain("anon_insert_account_requests");
    expect(sql).toContain("deny_read_account_requests");
    expect(sql).toContain("deny_update_account_requests");
    expect(sql).toContain("account_requests_insert_pending_public_h5e2b");
    expect(lower).toContain("to anon, authenticated");
    expect(lower).toContain("status = 'pending'");
    expect(lower).toContain("assigned_role is null");
    expect(lower).toContain("review_note is null");
    expect(lower).toContain("reviewed_by is null");
    expect(lower).toContain("reviewed_at is null");
    expect(lower).toContain("invited_user_id is null");
    expect(lower).toContain("review_lock_token is null");
    expect(lower).toContain("review_started_at is null");
    expect(lower).toContain("last_error is null");
    expect(lower).toContain("oliem_solutions");
    expect(lower).toContain("titan_produits_industriels");
    expect(lower).toContain("request_submitted");
    expect(lower).toContain("requester");
    expect(lower).toContain("jsonb_array_length(audit_log) <= 1");
    expect(lower).toContain("cardinality(requested_permissions)");
    for (const p of [
      "documents",
      "dossiers",
      "terrain",
      "livraisons",
      "ressources",
      "commissions",
    ]) {
      expect(sql).toContain(`'${p}'`);
    }
  });

  it("restricts account_requests management to direction/admin only", () => {
    expect(sql).toContain("account_requests_select_direction_admin_h5e2b");
    expect(sql).toContain("account_requests_update_direction_admin_h5e2b");
    expect(sql).toContain("account_requests_delete_direction_admin_h5e2b");
    expect(lower).toContain("using (public.is_direction_or_admin())");
    expect(lower).not.toMatch(
      /create policy[\s\S]*account_requests[\s\S]*for select[\s\S]*to anon/
    );
    expect(lower).not.toMatch(
      /create policy[\s\S]*account_requests[\s\S]*for update[\s\S]*to anon/
    );
    expect(lower).not.toMatch(
      /create policy[\s\S]*account_requests[\s\S]*for delete[\s\S]*to anon/
    );
  });

  it("requires admin or direction+terrain for temps_titan and omits DELETE", () => {
    expect(sql).toContain("temps_titan_select_privileged_h5e2b");
    expect(sql).toContain("temps_titan_insert_privileged_h5e2b");
    expect(sql).toContain("temps_titan_update_privileged_h5e2b");
    expect(sql).toContain("temps_titan_admin_delete");
    expect(sql).toContain("temps_titan_admin_select");
    expect(lower).toContain("current_app_role() = 'admin'");
    expect(lower).toContain("is_direction_user()");
    expect(lower).toContain("has_app_permission('terrain')");
    expect(lower).not.toMatch(/create policy[\s\S]*temps_titan[\s\S]*for delete/);
    expect(lower).toContain("intentionally no authenticated delete");
    expect(lower).toContain("isolation oliem/titan not invented");
  });

  it("touches only the two tables and forbids fail-open / ALL / helper edits", () => {
    expect(body).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(body).not.toMatch(/with check\s*\(\s*true\s*\)/);
    expect(body).not.toMatch(/for all\b/);
    expect(body).not.toMatch(/force row level security/);
    expect(body).not.toMatch(/disable row level security/);
    expect(body).not.toMatch(/create or replace function/);
    expect(body).not.toMatch(/alter table public\.(chauffeurs|sorties_terrain|horodateur)/);
    expect(body).not.toMatch(/direction_terrain_positions/);
    expect(body).not.toMatch(/20260715130000|20260715140000/);
    expect(body).not.toMatch(/\bh5-e2d\b|\bh5-f\b|20260712220/);
    expect(lower).toContain("account_requests");
    expect(lower).toContain("temps_titan");
  });

  it("documents handoff/plan and preserves historical migration files", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    expect(readFileSync(HANDOFF, "utf8")).toContain("20260715150000");
    expect(readFileSync(HANDOFF, "utf8")).toMatch(/\*\*51 %\*\*/);
    expect(readFileSync(PLAN, "utf8")).toMatch(/H5-E2B/i);
    expect(readFileSync(E1, "utf8")).toMatch(/H5-E2B/);
    expect(existsSync(join(MIGRATIONS_DIR, "20260429120000_rls_account_requests_temps_titan.sql"))).toBe(
      true
    );
    expect(createHash("sha256").update(sql).digest("hex")).toHaveLength(64);
  });
});

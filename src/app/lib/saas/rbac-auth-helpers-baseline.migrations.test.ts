import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const BASELINE_NAME = "20260407000000_rbac_auth_helpers_baseline.sql";
const HORODATEUR_NAME = "20260408190000_horodateur.sql";

const REQUIRED_HELPERS = [
  "public.current_app_role()",
  "public.current_app_permissions()",
  "public.has_app_permission(p_permission text)",
  "public.is_direction_user()",
  "public.is_direction_or_admin()",
  "public.is_admin_user()",
] as const;

describe("RBAC auth helpers baseline migration", () => {
  const names = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const baselinePath = join(MIGRATIONS_DIR, BASELINE_NAME);
  const sql = readFileSync(baselinePath, "utf8");
  const lower = sql.toLowerCase();

  it("uses a unique 14-digit version filename", () => {
    expect(BASELINE_NAME).toMatch(/^\d{14}_rbac_auth_helpers_baseline\.sql$/);
    expect(names.filter((n) => n.startsWith("20260407000000_"))).toEqual([BASELINE_NAME]);
  });

  it("is ordered before Horodateur migration", () => {
    expect(names.indexOf(BASELINE_NAME)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(HORODATEUR_NAME)).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(BASELINE_NAME)).toBeLessThan(names.indexOf(HORODATEUR_NAME));
    expect(BASELINE_NAME < HORODATEUR_NAME).toBe(true);
  });

  it("defines the six helpers with CREATE OR REPLACE", () => {
    for (const helper of REQUIRED_HELPERS) {
      expect(sql).toContain(`create or replace function ${helper}`);
    }
    expect((sql.match(/create or replace function public\./gi) ?? []).length).toBe(6);
  });

  it("creates no tables, seeds, permissive policies, or tenant hardcodes", () => {
    const withoutLineComments = lower.replace(/--[^\n]*/g, " ");
    expect(withoutLineComments).not.toContain("create table");
    expect(withoutLineComments).not.toMatch(/insert\s+into/);
    expect(withoutLineComments).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(withoutLineComments).not.toMatch(/with check\s*\(\s*true\s*\)/);
    expect(withoutLineComments).not.toContain("create policy");
    expect(withoutLineComments).not.toContain("groupe-oliem");
    expect(withoutLineComments).not.toContain("oliem");
    expect(withoutLineComments).not.toContain("titan");
  });

  it("does not alter historical business tables", () => {
    expect(lower).not.toContain("alter table");
  });

  it("keeps role helper on app_metadata only (final migration semantics)", () => {
    expect(sql).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
    const roleFn = sql.match(
      /create or replace function public\.current_app_role\(\)[\s\S]*?\$\$;/i
    );
    expect(roleFn?.[0]).toBeTruthy();
    expect(roleFn![0]).not.toContain("user_metadata");
  });
});

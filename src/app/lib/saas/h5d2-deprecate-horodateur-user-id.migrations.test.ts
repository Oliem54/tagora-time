import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const H5D2_FILE = "20260715120000_h5d2_deprecate_horodateur_user_id.sql";
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);
const AUDIT_D1 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5D1-USER-ID-DECISION-2026-07-15.md"
);
const EXEC_D2 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5D2-DEPRECATION-2026-07-15.md"
);
const TERRAIN_PAGE = join(ROOT, "src", "app", "direction", "terrain", "page.tsx");
const REPO = join(ROOT, "src", "app", "lib", "horodateur-v1", "repository.ts");
const TYPES = join(ROOT, "src", "app", "lib", "horodateur-v1", "types.ts");

const COLUMNS = [
  "id",
  "source_kind",
  "source_label",
  "user_id",
  "chauffeur_id",
  "company_context",
  "company_directory_context",
  "latitude",
  "longitude",
  "speed_kmh",
  "gps_status",
  "activity_label",
  "sortie_id",
  "livraison_id",
  "horodateur_event_id",
  "intervention_label",
  "metadata",
  "recorded_at",
] as const;

describe("H5-D2 deprecate horodateur user_id without drop", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const path = join(MIGRATIONS_DIR, H5D2_FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const plan = readFileSync(PLAN, "utf8");
  const audit = readFileSync(AUDIT_D1, "utf8");
  const repo = readFileSync(REPO, "utf8");
  const types = readFileSync(TYPES, "utf8");
  const page = readFileSync(TERRAIN_PAGE, "utf8");

  it("adds a single forward-only h5d2 file after H5-C", () => {
    expect(H5D2_FILE).toMatch(/^\d{14}_h5d2_deprecate_/);
    expect(existsSync(path)).toBe(true);
    expect(files.filter((f) => f.includes("h5d2")).length).toBe(1);
    expect(H5D2_FILE > "20260714160000").toBe(true);
    expect(createHash("sha256").update(sql).digest("hex")).toHaveLength(64);
  });

  it("never drops user_id column and only drops NOT NULL when present", () => {
    const ddl = lower.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(ddl).not.toMatch(/drop\s+column\s+(if\s+exists\s+)?user_id/);
    expect(ddl).toMatch(/alter column user_id drop not null/);
    expect(lower).toMatch(/legacy compatibility only/i);
    expect(lower).toMatch(/employee_id is the canonical employee identity/i);
    expect(lower).toMatch(/actor_user_id identifies the actor/i);
    expect(lower).toMatch(/do not use user_id for new business logic/i);
    expect(ddl).not.toMatch(/drop\s+table/);
    expect(ddl).not.toMatch(/\bcascade\b/);
    expect(ddl).not.toMatch(/truncate\s+/);
  });

  it("recreates direction_terrain_positions on employee_id + chauffeurs.auth_user_id", () => {
    expect(lower).toContain("create view public.direction_terrain_positions");
    expect(lower).toContain("security_invoker = true");
    expect(lower).toContain("c.auth_user_id as user_id");
    expect(lower).toContain("he.employee_id as chauffeur_id");
    expect(lower).toMatch(/join\s+public\.chauffeurs\s+c\s+on\s+c\.id\s*=\s*he\.employee_id/);
    expect(lower).not.toMatch(/he\.user_id/);
    expect(lower).toContain("'gps'::text as source_kind");
    expect(lower).toContain("'sortie_depart'::text as source_kind");
    expect(lower).toContain("'sortie_retour'::text as source_kind");
    expect(lower).toContain("'horodateur'::text as source_kind");
    expect((lower.match(/\bunion all\b/g) || []).length).toBe(3);
    for (const col of COLUMNS) {
      expect(lower).toContain(col);
    }
    expect(COLUMNS).toHaveLength(18);
  });

  it("touches no policies, RBAC helpers, H5-E, or H4 SaaS", () => {
    const ddl = lower.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(ddl).not.toMatch(/create\s+policy/);
    expect(ddl).not.toMatch(/alter\s+policy/);
    expect(ddl).not.toMatch(/drop\s+policy/);
    expect(ddl).not.toMatch(/current_app_role|is_direction_or_admin/);
    expect(ddl).not.toMatch(/create\s+(or\s+replace\s+)?function/);
    expect(ddl).not.toMatch(/20260712220/);
    expect(sql).toMatch(/H5-E\/F|Out of scope[\s\S]*H5-E/);
    expect(ddl).not.toMatch(/insert\s+into/);
  });

  it("documents Option B approval and keeps Direction page contract", () => {
    expect(audit).toMatch(/OPTION B APPROUVÉE|Option B approuvée/i);
    expect(plan).toMatch(/H5-D2|OPTION B APPROUVÉE/i);
    expect(page).toContain('from("direction_terrain_positions")');
    expect(page).toContain("user_id");
    expect(page).toContain("chauffeur_id");
    expect(existsSync(EXEC_D2)).toBe(true);
  });

  it("repository canonical insert omits user_id with bounded legacy fallback", () => {
    const insertFn = repo.slice(repo.indexOf("export async function insertEvent"));
    const insertBody = insertFn.slice(0, insertFn.indexOf("export async function insertException"));
    expect(insertBody).toMatch(/Canonical write: employee_id \+ actor_user_id/);
    expect(insertBody).toMatch(/Do not dual-write user_id/);
    expect(insertBody).toMatch(/isNotNullViolationOnColumn\(error, "user_id"\)/);
    expect(insertBody).toMatch(/resolveLegacyEmployeeUserId/);
    expect(insertBody).toMatch(/attempt < 8/);
    expect(insertBody).not.toMatch(/user_id:\s*input\.userId/);
    expect(types).toMatch(/Legacy compatibility hint only/);
    expect(types).toMatch(/Canonical employee identity/);
    expect(types).toMatch(/Actor who performed the action/);
  });
});

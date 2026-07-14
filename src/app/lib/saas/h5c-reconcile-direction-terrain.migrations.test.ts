import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const H5C_FILE = "20260714160000_h5c_reconcile_direction_terrain_view.sql";
const HIST = "20260410140000_direction_terrain_compatibility.sql";
const PARTIAL = "20260429130000_security_advisor_view_and_metadata_policies.sql";
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);
const EXEC = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5C-EXECUTION-2026-07-14.md"
);
const TERRAIN_PAGE = join(ROOT, "src", "app", "direction", "terrain", "page.tsx");

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

describe("H5-C forward-only direction terrain view", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const path = join(MIGRATIONS_DIR, H5C_FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const hist = readFileSync(join(MIGRATIONS_DIR, HIST), "utf8");
  const plan = readFileSync(PLAN, "utf8");
  const page = readFileSync(TERRAIN_PAGE, "utf8");

  it("covers historical 10140000 and limited 29130000 security_invoker dependency", () => {
    expect(plan).toMatch(/LOT H5-C/);
    expect(sql).toContain("20260410140000");
    expect(sql).toContain("20260429130000");
    expect(sql).toContain("security_invoker = true");
    expect(sql).toMatch(/belong to later security lot|OUT of scope from 20260429130000/i);
    expect(files.some((f) => f.startsWith("20260410140000"))).toBe(true);
    expect(files.some((f) => f.startsWith("20260429130000"))).toBe(true);
  });

  it("adds a single forward-only h5c file after H5-B", () => {
    expect(H5C_FILE).toMatch(/^\d{14}_h5c_reconcile_/);
    expect(existsSync(path)).toBe(true);
    expect(files.filter((f) => f.includes("h5c")).length).toBe(1);
    expect(H5C_FILE > "20260714150000").toBe(true);
  });

  it("is view-only without table/policy/function/H4/H5-D/E mutations", () => {
    expect(lower).toContain("create view public.direction_terrain_positions");
    expect(lower).toContain("drop view if exists public.direction_terrain_positions");
    expect(lower).not.toMatch(/drop\s+table/);
    expect(lower).not.toMatch(/drop\s+column/);
    expect(lower).not.toMatch(/drop\s+view\s+[^;]*\scascade\b/);
    expect(lower).not.toMatch(/\bcascade\b/);
    expect(lower).not.toMatch(/truncate\s+/);
    expect(lower).not.toMatch(/alter\s+table/);
    expect(lower).not.toMatch(/create\s+policy/);
    expect(lower).not.toMatch(/create\s+(or\s+replace\s+)?function/);
    expect(lower).not.toMatch(/current_app_role|is_direction_or_admin/);
    expect(lower).not.toMatch(/20260712220/);
    expect(lower).not.toMatch(/\bh5-d\b|\bh5-e\b|\bh5-f\b/);
  });

  it("preserves pre-H5-D user_id contract and four source branches", () => {
    expect(lower).toContain("'gps'::text as source_kind");
    expect(lower).toContain("'sortie_depart'::text as source_kind");
    expect(lower).toContain("'sortie_retour'::text as source_kind");
    expect(lower).toContain("'horodateur'::text as source_kind");
    expect((lower.match(/\bunion all\b/g) || []).length).toBe(3);
    expect(lower).toContain("he.user_id");
    expect(lower).toContain("heure_depart is not null");
    expect(lower).toContain("heure_retour is not null");
    expect(lower).toContain("america/toronto");
    expect(lower).not.toMatch(/join\s+public\.chauffeurs/);
    expect(lower).not.toMatch(/c\.auth_user_id\s+as\s+user_id/);
    expect(lower).not.toMatch(/he\.employee_id\s+as\s+chauffeur_id/);
    for (const col of COLUMNS) {
      expect(lower).toContain(col);
    }
    expect(COLUMNS).toHaveLength(18);
  });

  it("matches canonical R5 body from 10140000 and keeps Direction page compatible", () => {
    expect(hist.toLowerCase()).toContain("security_invoker = true");
    expect(hist.toLowerCase()).toContain("he.user_id");
    expect(page).toContain('from("direction_terrain_positions")');
    expect(page).toContain("source_kind");
    expect(page).toContain("recorded_at");
    expect(existsSync(join(MIGRATIONS_DIR, PARTIAL))).toBe(true);
  });

  it("documents rollback and execution handoff", () => {
    expect(sql).toContain("DO NOT re-run");
    expect(sql).toContain("DO NOT mark applied");
    expect(sql).toContain("Rollback");
    expect(createHash("sha256").update(sql).digest("hex")).toHaveLength(64);
    expect(existsSync(EXEC)).toBe(true);
    expect(readFileSync(EXEC, "utf8")).toContain("20260714160000");
    expect(readFileSync(EXEC, "utf8")).toMatch(/\*\*51 %\*\*/);
  });
});

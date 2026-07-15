import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const H5E2D_FILE = "20260715160000_h5e2d_harden_direction_terrain_view_grants.sql";
const H5E2A_FILE = "20260715130000_h5e2a_harden_authorization_helpers.sql";
const H5E2B_FILE = "20260715150000_h5e2b_harden_account_requests_temps_titan.sql";
const H5E2C_FILE = "20260715140000_h5e2c_close_terrain_fail_open_policies.sql";
const H5D2_FILE = "20260715120000_h5d2_deprecate_horodateur_user_id.sql";
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5E2D-DIRECTION-TERRAIN-VIEW-GRANTS-2026-07-15.md"
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

const COLS = [
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

describe("H5-E2D harden direction_terrain_positions grants", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const path = join(MIGRATIONS_DIR, H5E2D_FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const body = lower
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

  it("ships a single H5-E2D migration after H5-E2B and keeps H5-D2 file untouched", () => {
    expect(existsSync(path)).toBe(true);
    expect(H5E2D_FILE).toMatch(
      /^\d{14}_h5e2d_harden_direction_terrain_view_grants\.sql$/
    );
    expect(files.filter((f) => /h5e2d/i.test(f))).toEqual([H5E2D_FILE]);
    expect(files.indexOf(H5E2B_FILE)).toBeLessThan(files.indexOf(H5E2D_FILE));
    expect(existsSync(join(MIGRATIONS_DIR, H5E2A_FILE))).toBe(true);
    expect(existsSync(join(MIGRATIONS_DIR, H5E2C_FILE))).toBe(true);
    expect(existsSync(join(MIGRATIONS_DIR, H5D2_FILE))).toBe(true);
    expect(createHash("sha256").update(sql).digest("hex")).toHaveLength(64);
  });

  it("validates H5-D2 contract gates without recreating the view", () => {
    expect(body).not.toMatch(/create\s+(or\s+replace\s+)?view/);
    expect(body).not.toMatch(/drop\s+view/);
    expect(body).not.toMatch(/alter\s+view/);
    expect(lower).toContain("security_invoker");
    expect(lower).toContain("c.auth_user_id");
    expect(lower).toContain("he.employee_id");
    expect(lower).toContain("he.user_id");
    expect(lower).toContain("H5-E2D STOP: forbidden he.user_id".toLowerCase());
    for (const c of COLS) {
      expect(sql).toContain(`'${c}'`);
    }
    expect(lower).toContain("'gps'");
    expect(lower).toContain("'sortie_depart'");
    expect(lower).toContain("'sortie_retour'");
    expect(lower).toContain("'horodateur'");
    expect(lower).toContain("america/toronto");
  });

  it("revokes public/anon fully and grants SELECT only to authenticated and service_role", () => {
    expect(lower).toMatch(
      /revoke all privileges[\s\S]*direction_terrain_positions[\s\S]*from public/
    );
    expect(lower).toMatch(
      /revoke all privileges[\s\S]*direction_terrain_positions[\s\S]*from anon/
    );
    expect(lower).toMatch(
      /revoke all privileges[\s\S]*direction_terrain_positions[\s\S]*from authenticated/
    );
    expect(lower).toMatch(
      /revoke all privileges[\s\S]*direction_terrain_positions[\s\S]*from service_role/
    );
    expect(lower).toMatch(
      /grant select[\s\S]*direction_terrain_positions[\s\S]*to authenticated/
    );
    expect(lower).toMatch(
      /grant select[\s\S]*direction_terrain_positions[\s\S]*to service_role/
    );
    expect(body).not.toMatch(/grant\s+(insert|update|delete|all)/);
    expect(body).not.toMatch(/grant[\s\S]*\b(gps_positions|sorties_terrain|horodateur_events|chauffeurs)\b/);
  });

  it("touches no policies, helpers, underlying tables, or later lots", () => {
    expect(body).not.toMatch(/create\s+policy|drop\s+policy|alter\s+policy/);
    expect(body).not.toMatch(/create\s+or\s+replace\s+function/);
    expect(body).not.toMatch(/security\s+definer/);
    expect(body).not.toMatch(/force row level security|disable row level security/);
    expect(body).not.toMatch(/alter table public\.(gps_positions|sorties_terrain|horodateur_events|chauffeurs)/);
    expect(body).not.toMatch(/20260715130000|20260715140000|20260715150000/);
    expect(body).not.toMatch(/\bh5-f\b|20260712220/);
  });

  it("documents handoff/plan and keeps V1 at 51 %", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    const handoff = readFileSync(HANDOFF, "utf8");
    expect(handoff).toContain("20260715160000");
    expect(handoff).toMatch(/\*\*51 %\*\*/);
    expect(handoff).toContain("security_invoker");
    expect(readFileSync(PLAN, "utf8")).toMatch(/H5-E2D/i);
    expect(readFileSync(E1, "utf8")).toMatch(/H5-E2D/);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
  });
});

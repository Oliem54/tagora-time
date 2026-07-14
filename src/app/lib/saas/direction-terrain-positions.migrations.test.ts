import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const DIRECTION = "20260410140000_direction_terrain_compatibility.sql";
const SECURITY = "20260429130000_security_advisor_view_and_metadata_policies.sql";

describe("direction_terrain_positions recorded_at timestamptz fix", () => {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();
  const directionSql = readFileSync(join(MIGRATIONS_DIR, DIRECTION), "utf8");
  const securitySql = readFileSync(join(MIGRATIONS_DIR, SECURITY), "utf8");

  it("keeps both canonical migrations that define the view", () => {
    expect(names).toContain(DIRECTION);
    expect(names).toContain(SECURITY);
    expect(directionSql.toLowerCase()).toContain(
      "create or replace view public.direction_terrain_positions"
    );
    expect(securitySql.toLowerCase()).toContain(
      "create or replace view public.direction_terrain_positions"
    );
  });

  it("combines date_sortie with heures using America/Toronto", () => {
    for (const sql of [directionSql, securitySql]) {
      expect(sql).toMatch(
        /case\s+when st\.date_sortie is null then null::timestamptz\s+else \(st\.date_sortie \+ st\.heure_depart\) at time zone 'America\/Toronto'\s+end as recorded_at/i
      );
      expect(sql).toMatch(
        /case\s+when st\.date_sortie is null then null::timestamptz\s+else \(st\.date_sortie \+ st\.heure_retour\) at time zone 'America\/Toronto'\s+end as recorded_at/i
      );
    }
  });

  it("keeps identical départ/retour expressions across both migrations", () => {
    const extract = (sql: string, kind: "depart" | "retour") => {
      const re =
        kind === "depart"
          ? /case\s+when st\.date_sortie is null then null::timestamptz\s+else \(st\.date_sortie \+ st\.heure_depart\) at time zone 'America\/Toronto'\s+end as recorded_at/i
          : /case\s+when st\.date_sortie is null then null::timestamptz\s+else \(st\.date_sortie \+ st\.heure_retour\) at time zone 'America\/Toronto'\s+end as recorded_at/i;
      const m = sql.match(re);
      expect(m, kind).toBeTruthy();
      return m![0].replace(/\s+/g, " ").trim();
    };
    expect(extract(directionSql, "depart")).toBe(extract(securitySql, "depart"));
    expect(extract(directionSql, "retour")).toBe(extract(securitySql, "retour"));
  });

  it("avoids forbidden time casts and artificial dates", () => {
    for (const sql of [directionSql, securitySql]) {
      expect(sql.toLowerCase()).not.toMatch(/heure_depart\s*::\s*timestamptz/);
      expect(sql.toLowerCase()).not.toMatch(/heure_retour\s*::\s*timestamptz/);
      expect(sql.toLowerCase()).not.toContain("current_date");
      expect(sql).not.toMatch(/\bnow\(\)\s*::\s*date/i);
      expect(sql).not.toMatch(/st\.heure_depart as recorded_at/i);
      expect(sql).not.toMatch(/st\.heure_retour as recorded_at/i);
    }
  });

  it("keeps security_invoker = true on both view definitions", () => {
    expect(directionSql.toLowerCase()).toContain("security_invoker = true");
    expect(securitySql.toLowerCase()).toContain("security_invoker = true");
  });

  it("leaves no stale raw time recorded_at assignments anywhere for this view pattern", () => {
    for (const n of names) {
      const sql = readFileSync(join(MIGRATIONS_DIR, n), "utf8");
      if (!sql.includes("direction_terrain_positions")) continue;
      expect(sql).not.toMatch(/st\.heure_depart as recorded_at/i);
      expect(sql).not.toMatch(/st\.heure_retour as recorded_at/i);
    }
  });
});

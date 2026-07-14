import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const PHASE1 = "20260418140000_horodateur_phase1_schema.sql";
const SECURITY = "20260429130000_security_advisor_view_and_metadata_policies.sql";
const EARLY_VIEW = "20260410140000_direction_terrain_compatibility.sql";

describe("Horodateur Phase 1 direction_terrain_positions transition", () => {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();
  const phase1 = readFileSync(join(MIGRATIONS_DIR, PHASE1), "utf8");
  const security = readFileSync(join(MIGRATIONS_DIR, SECURITY), "utf8");
  const early = readFileSync(join(MIGRATIONS_DIR, EARLY_VIEW), "utf8");

  const dropIdx = phase1.search(
    /alter table public\.horodateur_events\s+drop column user_id/i
  );
  const viewIdx = phase1.search(
    /create or replace view public\.direction_terrain_positions/i
  );

  it("backfills actor_user_id from legacy user_id and resolves employee_id", () => {
    expect(phase1).toMatch(/add column if not exists actor_user_id/i);
    expect(phase1).toMatch(
      /set actor_user_id = he\.user_id[\s\S]*he\.user_id is not null/i
    );
    expect(phase1).toMatch(
      /set employee_id = c\.id[\s\S]*c\.auth_user_id = he\.actor_user_id/i
    );
    expect(phase1).toMatch(/alter column employee_id set not null/i);
  });

  it("recreates the view before dropping horodateur_events.user_id", () => {
    expect(viewIdx).toBeGreaterThanOrEqual(0);
    expect(dropIdx).toBeGreaterThan(viewIdx);
    expect(phase1.slice(dropIdx, dropIdx + 120).toLowerCase()).not.toContain(
      "cascade"
    );
    expect(phase1.toLowerCase()).not.toContain("drop view");
  });

  it("exposes employee auth identity without depending on he.user_id", () => {
    const viewBlock = phase1.slice(viewIdx, dropIdx);
    expect(viewBlock).toMatch(/c\.auth_user_id\s+as\s+user_id/i);
    expect(viewBlock).toMatch(/he\.employee_id\s+as\s+chauffeur_id/i);
    expect(viewBlock).toMatch(
      /join\s+public\.chauffeurs\s+c\s+on\s+c\.id\s*=\s*he\.employee_id/i
    );
    expect(viewBlock).not.toMatch(/\bhe\.user_id\b/);
    expect(viewBlock).toMatch(
      /where he\.occurred_at is not null\s+and he\.employee_id is not null/i
    );
  });

  it("keeps R5 temporal expressions and security_invoker", () => {
    for (const sql of [phase1.slice(viewIdx, dropIdx), security]) {
      expect(sql.toLowerCase()).toContain("security_invoker = true");
      expect(sql).toMatch(
        /\(st\.date_sortie \+ st\.heure_depart\) at time zone 'America\/Toronto'/i
      );
      expect(sql).toMatch(
        /\(st\.date_sortie \+ st\.heure_retour\) at time zone 'America\/Toronto'/i
      );
    }
  });

  it("aligns the later security advisor Horodateur branch", () => {
    expect(security).toMatch(/c\.auth_user_id\s+as\s+user_id/i);
    expect(security).toMatch(/he\.employee_id\s+as\s+chauffeur_id/i);
    expect(security).toMatch(
      /join\s+public\.chauffeurs\s+c\s+on\s+c\.id\s*=\s*he\.employee_id/i
    );
    expect(security).not.toMatch(/\bhe\.user_id\b/);
  });

  it("keeps the early pre-Phase1 view on legacy he.user_id", () => {
    expect(early).toMatch(/\bhe\.user_id\b/);
    expect(early).toMatch(/null::bigint as chauffeur_id/i);
  });

  it("leaves no active he.user_id in view definitions after Phase 1 timestamp", () => {
    for (const n of names) {
      if (n < PHASE1) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, n), "utf8");
      if (!sql.includes("direction_terrain_positions")) continue;
      const viewMatches = [
        ...sql.matchAll(
          /create or replace view public\.direction_terrain_positions[\s\S]*?;/gi
        ),
      ];
      for (const m of viewMatches) {
        expect(m[0], n).not.toMatch(/\bhe\.user_id\b/);
      }
    }
  });
});

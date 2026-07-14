import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const GPS_NAME = "20260410130000_gps_direction_and_company_hardening.sql";

describe("GPS company_context UPDATE (sorties_terrain) PG-compat fix", () => {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();
  const sql = readFileSync(join(MIGRATIONS_DIR, GPS_NAME), "utf8");

  const sortiesUpdate = sql.match(
    /update\s+public\.sorties_terrain\s+st\s+set\s+company_context\s*=\s*coalesce\([\s\S]*?\)\s*from\s+public\.chauffeurs\s+c\s+where[\s\S]*?;/i
  )?.[0];

  it("keeps the GPS migration file", () => {
    expect(names).toContain(GPS_NAME);
  });

  it("keeps the sorties_terrain company_context UPDATE block", () => {
    expect(sortiesUpdate).toBeTruthy();
  });

  it("uses a scalar correlated subquery on livraisons_planifiees", () => {
    expect(sortiesUpdate).toMatch(
      /select\s+lp\.company_context\s+from\s+public\.livraisons_planifiees\s+lp\s+where\s+lp\.id\s*=\s*st\.livraison_id/i
    );
  });

  it("preserves COALESCE order: current, livraison, chauffeur, fallback", () => {
    const coalesce = sortiesUpdate!.match(
      /coalesce\s*\(\s*st\.company_context\s*,\s*\([\s\S]*?\)\s*,\s*c\.primary_company\s*,\s*'oliem_solutions'\s*\)/i
    );
    expect(coalesce).toBeTruthy();
  });

  it("preserves WHERE chauffeur and company_context filters", () => {
    expect(sortiesUpdate).toMatch(
      /\(st\.chauffeur_id\s*=\s*c\.id\s+or\s+st\.chauffeur_id\s+is\s+null\)/i
    );
    expect(sortiesUpdate).toMatch(
      /st\.company_context\s+not\s+in\s*\(\s*'oliem_solutions'\s*,\s*'titan_produits_industriels'\s*\)/i
    );
  });

  it("does not reference UPDATE target st inside a FROM JOIN ON", () => {
    expect(sortiesUpdate!.toLowerCase()).not.toMatch(
      /left\s+join[\s\S]*\bon\b[\s\S]*\bst\./
    );
    expect(sortiesUpdate!.toLowerCase()).not.toMatch(
      /join\s+public\.livraisons_planifiees[\s\S]*\bon\b[\s\S]*\bst\./
    );
  });

  it("leaves horodateur_events and temps_titan UPDATE shapes intact", () => {
    expect(sql).toMatch(
      /update\s+public\.horodateur_events\s+he\s+set\s+company_context\s*=\s*coalesce\(/i
    );
    expect(sql).toMatch(
      /update\s+public\.temps_titan\s+tt\s+set\s+company_context\s*=\s*coalesce\(/i
    );
    expect(sql).toMatch(
      /from\s+public\.chauffeurs\s+c\s+left\s+join\s+public\.sorties_terrain\s+st\s+on\s+st\.chauffeur_id\s*=\s*c\.id/i
    );
  });
});

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-QA-V1C1A-STAGING-LOCAL-ENV-2026-07-16.md"
);
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

describe("QA V1-C1A staging local env documentary", () => {
  const handoff = readFileSync(HANDOFF, "utf8");
  const migrations = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));

  it("keeps secrets out of Git and documents ignored .env.local", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    const ignore = execSync("git check-ignore -v .env.local", {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(ignore).toMatch(/\.env\.local/);
    expect(handoff).toMatch(/ignoré|\.gitignore/);
    expect(handoff).not.toMatch(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
    expect(handoff).not.toMatch(/sb_secret_|sb_publishable_/i);
    expect(handoff).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
  });

  it("documents staging switch, production absent, no Auth/membership/data writes", () => {
    expect(handoff).toContain("qokyobcvplzufshydhih");
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE|interdite|Production présente[\s\S]*\*\*non\*\*/i);
    expect(handoff).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(handoff).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(handoff).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(handoff).toMatch(/aucune modification Auth|Auth[\s\S]*non/i);
    expect(handoff).toMatch(/Membership Employé[\s\S]*\*\*non créé\*\*|non créé/i);
    expect(handoff).toMatch(/Aucune donnée métier|aucune donnée métier/i);
    expect(handoff).toMatch(/Aucun objet Storage|aucun objet Storage/i);
    expect(handoff).toMatch(/memberships[\s\S]*3|memberships = 3/i);
    expect(handoff).toMatch(/77 %/);
    expect(handoff).toMatch(/GO QA V1-C1A/);
    expect(handoff).toMatch(/QA V1-C1/);
    expect(migrations.some((f) => /qa.?v1c1a|staging.?local.?env/i.test(f))).toBe(
      false
    );
  });
});

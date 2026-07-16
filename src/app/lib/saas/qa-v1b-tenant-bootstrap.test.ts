import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-QA-V1B-TENANT-BOOTSTRAP-2026-07-16.md"
);
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const TEMP = process.env.TEMP || process.env.TMPDIR || "/tmp";

describe("QA V1-B tenant bootstrap documentary", () => {
  const handoff = readFileSync(HANDOFF, "utf8");
  const migrations = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));

  it("keeps bootstrap/cleanup SQL outside Git and documents TEMP method", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    expect(
      existsSync(join(ROOT, "tagora-time-qa-v1b-bootstrap-2026-07-16.sql"))
    ).toBe(false);
    expect(
      existsSync(join(ROOT, "tagora-time-qa-v1b-cleanup-2026-07-16.sql"))
    ).toBe(false);
    expect(handoff).toMatch(/%TEMP%|hors Git/i);
    expect(handoff).toContain("tagora-time-qa-v1b-bootstrap-2026-07-16.sql");
    expect(handoff).toContain("tagora-time-qa-v1b-cleanup-2026-07-16.sql");
    expect(handoff).toMatch(/non exécuté|non exécut/i);
    // TEMP scripts may exist on the bootstrap machine; absence elsewhere is OK
    const bootstrapTemp = join(TEMP, "tagora-time-qa-v1b-bootstrap-2026-07-16.sql");
    const cleanupTemp = join(TEMP, "tagora-time-qa-v1b-cleanup-2026-07-16.sql");
    if (existsSync(bootstrapTemp)) {
      expect(bootstrapTemp.includes(ROOT)).toBe(false);
    }
    if (existsSync(cleanupTemp)) {
      expect(cleanupTemp.includes(ROOT)).toBe(false);
    }
  });

  it("confirms no QA migration and V1 stays at 77 %", () => {
    expect(migrations.some((f) => /qa.?v1b|tenant.?qa.?bootstrap/i.test(f))).toBe(
      false
    );
    expect(handoff).toMatch(/migration QA[\s\S]*aucune|aucune[\s\S]*migration QA/i);
    expect(handoff).toMatch(/77 %\s*→\s*77 %|77 %/);
    expect(handoff).toContain("qokyobcvplzufshydhih");
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE|interdite/);
  });

  it("documents three initial memberships, unique owner, QA-USER-2 non-member", () => {
    expect(handoff).toContain("tagora-time-qa-v1");
    expect(handoff).toContain("organization_owner");
    expect(handoff).toContain("organization_admin");
    expect(handoff).toContain("direction");
    expect(handoff).toMatch(/QA-USER-2[\s\S]*aucun membership|non membre/i);
    expect(handoff).toMatch(/Owner unique[\s\S]*oui|owner unique actif/i);
    expect(handoff).toMatch(/is_default[\s\S]*true/);
    expect(handoff).toMatch(/organization_memberships[\s\S]*\*\*3\*\*|Memberships créés/);
    expect(handoff).not.toMatch(/employe[\s\S]*créé[\s\S]*oui/i);
  });

  it("documents no platform_access, Storage, business data, or production", () => {
    expect(handoff).toMatch(/platform_access[\s\S]*\*\*0\*\*|platform_access[\s\S]*0/);
    expect(handoff).toMatch(/Storage[\s\S]*\*\*0\*\*|photos-dossiers[\s\S]*0/);
    expect(handoff).toMatch(/Donnée métier[\s\S]*\*\*0\*\*|aucune[\s\S]*donnée métier/i);
    expect(handoff).toMatch(/Production[\s\S]*non|production non touchée/i);
    expect(handoff).toMatch(/organization_company[\s\S]*différée|différée/i);
    expect(handoff).toMatch(/Invitations[\s\S]*\*\*0\*\*|Invitations : \*\*0\*\*/);
    expect(handoff).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(handoff).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
    expect(handoff).toMatch(/GO QA V1-B/);
    expect(handoff).toMatch(/QA V1-C/);
  });
});

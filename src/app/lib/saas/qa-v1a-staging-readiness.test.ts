import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-QA-V1A-STAGING-READINESS-2026-07-16.md"
);
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

describe("QA V1-A staging readiness documentary", () => {
  const handoff = readFileSync(HANDOFF, "utf8");
  const migrations = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));

  it("is read-only planning: no bootstrap SQL migration and no writes claimed", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    expect(migrations.some((f) => /qa.?v1|tenant.?qa|bootstrap.?qa/i.test(f))).toBe(
      false
    );
    expect(handoff).toMatch(/aucune[\s\S]*organisation|Organisation créée[\s\S]*\*\*non\*\*/i);
    expect(handoff).toMatch(/Membership créé[\s\S]*\*\*non\*\*|aucun membership/i);
    expect(handoff).toMatch(/Utilisateur créé[\s\S]*\*\*non\*\*|aucun utilisateur/i);
    expect(handoff).toMatch(/Migration QA[\s\S]*aucune|aucune[\s\S]*migration QA/i);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE|interdite/);
    expect(handoff).toMatch(/77 %/);
  });

  it("documents anonymized accounts, tenant contract, matrices, cleanup, Option A", () => {
    expect(handoff).toContain("QA-USER-1");
    expect(handoff).toContain("QA-USER-2");
    expect(handoff).toContain("tagora-time-qa-v1");
    expect(handoff).toMatch(/Ordre de création/);
    expect(handoff).toMatch(/Ordre de suppression/);
    expect(handoff).toMatch(/Matrice QA multi-rôles|### Authentification/);
    expect(handoff).toMatch(/Horodateur|Livraisons|Storage|Compensation|Plateforme/);
    expect(handoff).toMatch(/Option recommandée\s*:\s*\*\*A\*\*/i);
    expect(handoff).toMatch(/plan de suppression|Ordre de suppression/i);
    expect(handoff).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(handoff).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
    expect(handoff).toMatch(/READY QA V1-A/);
    expect(handoff).toMatch(/QA V1-B/);
  });
});

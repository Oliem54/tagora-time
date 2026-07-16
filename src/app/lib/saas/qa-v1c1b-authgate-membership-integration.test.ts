import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-QA-V1C1B-AUTHGATE-MEMBERSHIP-INTEGRATION-2026-07-16.md"
);
const HANDOFF_C1 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-QA-V1C1-NONMEMBER-EMPLOYEE-ACCESS-2026-07-16.md"
);
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

describe("QA V1-C1B AuthGate membership integration documentary", () => {
  const handoff = readFileSync(HANDOFF, "utf8");
  const handoffC1 = readFileSync(HANDOFF_C1, "utf8");
  const migrations = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));

  it("documents H4 as authorization source and AuthGate wiring", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    expect(handoff).toContain("organization_memberships");
    expect(handoff).toContain("AuthGate");
    expect(handoff).toContain("/api/auth/session-context");
    expect(handoff).toMatch(/JWT historique[\s\S]*n’autorise jamais|ne doit jamais autoriser/i);
    expect(handoff).toMatch(/hasAdminFinanceAccess|Finance/);
    expect(handoff).toMatch(/GO QA V1-C1B/);
    expect(handoff).toMatch(/77 %/);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(migrations.some((f) => /authgate|membership.?integration|qa.?v1c1b/i.test(f))).toBe(
      false
    );
  });

  it("documents employe JWT none access and closed V1-C1", () => {
    expect(handoff).toMatch(/appRole=employe|appRole`=employe|employe/);
    expect(handoff).toMatch(/JWT[\s\S]*none/i);
    expect(handoff).toMatch(/mon-horaire[\s\S]*200|200[\s\S]*mon-horaire/);
    expect(handoff).toMatch(/Auth[\s\S]*non modifié|Auth non modifié/i);
    expect(handoffC1).toMatch(/Verdict final[\s\S]*GO QA V1-C1|GO QA V1-C1 — FAIL-CLOSED/);
    expect(handoffC1).toMatch(/QA V1-C1B/);
    expect(handoff).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(handoff).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
  });
});

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-QA-V1C1-NONMEMBER-EMPLOYEE-ACCESS-2026-07-16.md"
);
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

describe("QA V1-C1 nonmember/employee access documentary", () => {
  const handoff = readFileSync(HANDOFF, "utf8");
  const migrations = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));

  it("documents fail-closed non-member before employe membership", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    expect(handoff).toMatch(/sans membership|non-membre|Fail-closed non-membre/i);
    expect(handoff).toMatch(/verdict preuve[\s\S]*PASS|Verdict preuve : \*\*PASS\*\*/i);
    expect(handoff).toContain("QA-USER-2");
    expect(handoff).toMatch(/memberships avant[\s\S]*\*\*3\*\*|memberships avant \| \*\*3\*\*/i);
  });

  it("documents H4 employe membership and AuthGate JWT gap as PARTIAL", () => {
    expect(handoff).toMatch(/PARTIAL QA V1-C1/);
    expect(handoff).toMatch(/organization_memberships|Membership Employé \(H4\)/);
    expect(handoff).toMatch(/employe/);
    expect(handoff).toMatch(/Memberships après[\s\S]*\*\*4\*\*/);
    expect(handoff).toMatch(/AuthGate/);
    expect(handoff).toMatch(/JWT[\s\S]*none|jwt[\s\S]*none/i);
    expect(handoff).toMatch(/ne débloque pas|NON RACCORDÉ|non raccord/i);
    expect(handoff).toMatch(/Direction[\s\S]*refus/i);
    expect(handoff).toMatch(/Admin[\s\S]*refus/i);
    expect(handoff).toMatch(/Compensation[\s\S]*refus/i);
    expect(handoff).toMatch(/Aucune élévation|élévation[\s\S]*non/i);
    expect(handoff).toMatch(/Donnée métier[\s\S]*non|aucune donnée métier/i);
    expect(handoff).toMatch(/Storage[\s\S]*0/);
    expect(handoff).toMatch(/Auth modifiée[\s\S]*non/i);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/77 %/);
    expect(handoff).not.toMatch(/GO QA V1-C1 — FAIL-CLOSED/);
    expect(migrations.some((f) => /qa.?v1c1.?employ|add.?employee/i.test(f))).toBe(
      false
    );
    expect(handoff).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(handoff).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
  });
});

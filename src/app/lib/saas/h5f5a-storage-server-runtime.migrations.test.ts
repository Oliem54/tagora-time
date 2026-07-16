import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5F5A-STORAGE-SERVER-RUNTIME-2026-07-16.md"
);

describe("H5-F5A storage server runtime documentary", () => {
  const handoff = readFileSync(HANDOFF, "utf8");
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));

  it("documents Option A runtime; F5B owns the forward SQL migration file", () => {
    expect(existsSync(HANDOFF)).toBe(true);
    expect(handoff).toMatch(/Option[\s\S]*\*\*A\*\*|Option A/i);
    expect(handoff).toContain("resolveStorageOrganizationContext");
    expect(handoff).toContain("/api/operation-proofs/upload");
    expect(handoff).toContain("signed-url");
    expect(handoff).toContain("<organization_id>/");
    expect(handoff).toMatch(/300/);
    expect(handoff).toMatch(/upsert[\s\S]*false|upsert.*\*\*false\*\*/i);
    expect(handoff).toMatch(/65 %/);
    expect(handoff).toMatch(/H5-F5B/);
    // Forward SQL is H5-F5B-owned; H5-F5A handoff still records that the runtime pass created none.
    expect(files.some((f) => f.startsWith("20260716223000"))).toBe(true);
    expect(handoff).toMatch(/Migration SQL[\s\S]*\*\*non\*\*|Migration SQL : \*\*non\*\*/i);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
  });
});

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  IMPROVEMENT_DEFAULT_STATUS,
  IMPROVEMENT_STATUS_OPTIONS,
} from "@/app/lib/improvements";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const CREATE = "20260426103500_create_app_improvements.sql";
const ARCHIVE = "20260428120000_app_improvements_archive_and_soft_delete.sql";
const FIRST = "20260412201500_app_improvements.sql";
/** Hash attendu de l'archive (inchangée durant R7). */
const ARCHIVE_SHA256 =
  "2ACEB39EEDBA8006E425AACC8CCA2669556B9F0DE4506C22869486D04D818752";

function sha256File(name: string): string {
  return createHash("sha256")
    .update(readFileSync(join(MIGRATIONS_DIR, name)))
    .digest("hex")
    .toUpperCase();
}

describe("app_improvements alignment (R7)", () => {
  const createSql = readFileSync(join(MIGRATIONS_DIR, CREATE), "utf8");
  const archiveSql = readFileSync(join(MIGRATIONS_DIR, ARCHIVE), "utf8");
  const firstSql = readFileSync(join(MIGRATIONS_DIR, FIRST), "utf8");
  const createLower = createSql.toLowerCase();

  it("keeps CREATE TABLE IF NOT EXISTS and adds treated_at / deleted_at", () => {
    expect(createSql).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+public\.app_improvements/i
    );
    expect(createSql).toMatch(
      /add\s+column\s+if\s+not\s+exists\s+treated_at\s+timestamptz/i
    );
    expect(createSql).toMatch(
      /add\s+column\s+if\s+not\s+exists\s+deleted_at\s+timestamptz/i
    );
  });

  it("does not add archive-only columns prematurely", () => {
    expect(createLower).not.toMatch(/add\s+column\s+if\s+not\s+exists\s+archived_at/);
    expect(createLower).not.toMatch(/add\s+column\s+if\s+not\s+exists\s+archived_by/);
    expect(createLower).not.toMatch(/add\s+column\s+if\s+not\s+exists\s+deleted_by/);
  });

  it("forbids destructive DDL and business data mutation", () => {
    expect(createLower).not.toContain("drop table");
    expect(createLower).not.toContain("drop column");
    expect(createLower).not.toContain("cascade");
    expect(createLower).not.toMatch(/\btruncate\b/);
    expect(createLower).not.toMatch(/\binsert\s+into\b/);
    expect(createLower).not.toMatch(/\bupdate\s+public\.app_improvements\b/);
    expect(createLower).not.toMatch(/\bdelete\s+from\b/);
  });

  it("aligns status default and check with current app contract", () => {
    expect(IMPROVEMENT_DEFAULT_STATUS).toBe("en_attente");
    expect([...IMPROVEMENT_STATUS_OPTIONS]).toEqual([
      "en_attente",
      "en_traitement",
      "traitee",
      "supprimee",
    ]);
    expect(createSql).toMatch(
      /alter\s+column\s+status\s+set\s+default\s+'en_attente'/i
    );
    expect(createSql).toMatch(
      /drop\s+constraint\s+if\s+exists\s+app_improvements_status_check/i
    );
    expect(createSql).toMatch(
      /add\s+constraint\s+app_improvements_status_check[\s\S]*en_attente[\s\S]*en_traitement[\s\S]*traitee[\s\S]*supprimee/i
    );
  });

  it("aligns module and priority checks", () => {
    expect(createSql).toMatch(
      /drop\s+constraint\s+if\s+exists\s+app_improvements_module_check/i
    );
    expect(createSql).toMatch(
      /add\s+constraint\s+app_improvements_module_check/i
    );
    expect(createSql).toMatch(
      /drop\s+constraint\s+if\s+exists\s+app_improvements_priority_check/i
    );
    expect(createSql).toMatch(
      /add\s+constraint\s+app_improvements_priority_check[\s\S]*Faible[\s\S]*Moyenne[\s\S]*Elevee/i
    );
  });

  it("documents that the first migration lacked treated_at / deleted_at", () => {
    expect(firstSql.toLowerCase()).not.toContain("treated_at");
    expect(firstSql.toLowerCase()).not.toContain("deleted_at");
    expect(firstSql).toMatch(/default\s+'nouveau'/i);
  });

  it("leaves archive migration unchanged", () => {
    expect(sha256File(ARCHIVE)).toBe(ARCHIVE_SHA256);
    expect(archiveSql).toMatch(/add\s+column\s+if\s+not\s+exists\s+archived_at/i);
    expect(archiveSql).toMatch(/add\s+column\s+if\s+not\s+exists\s+deleted_by/i);
  });

  it("keeps unique 14-digit migration versions", () => {
    const versions = readdirSync(MIGRATIONS_DIR)
      .filter((n) => n.endsWith(".sql"))
      .map((n) => n.slice(0, 14));
    expect(versions.every((v) => /^\d{14}$/.test(v))).toBe(true);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

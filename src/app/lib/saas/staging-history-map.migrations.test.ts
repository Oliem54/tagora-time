import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const MAP_DOC = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-STAGING-HISTORY-MAP-2026-07-14.md"
);
const RENAME_DOC = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-MIGRATION-VERSION-MAP-2026-07-13.md"
);

const H2 = [
  "20260410120000",
  "20260412201500",
  "20260412213000",
  "20260416120000",
  "20260416193500",
  "20260425093500",
  "20260425143000",
  "20260426103500",
  "20260426111500",
  "20260428120000",
  "20260428150000",
  "20260428203500",
  "20260428214500",
  "20260428220500",
  "20260428235500",
  "20260429001500",
  "20260429140000",
  "20260513103000",
];

const H5 = [
  "20260408190000",
  "20260410130000",
  "20260410140000",
  "20260411101500",
  "20260412103000",
  "20260412161500",
  "20260412170000",
  "20260412181500",
  "20260412191500",
  "20260418140000",
  "20260418141000",
  "20260419103000",
  "20260419141500",
  "20260419164500",
  "20260420110000",
  "20260420111000",
  "20260420112000",
  "20260421113000",
  "20260425090500",
  "20260425133500",
  "20260425140500",
  "20260426120500",
  "20260429120000",
  "20260429130000",
];

const SAAS = [
  "20260712220000",
  "20260712220100",
  "20260712220200",
  "20260712220300",
  "20260712220400",
  "20260712220500",
];

const LEGACY_GROUPS_8 = [
  "20260408",
  "20260410",
  "20260411",
  "20260412",
  "20260416",
  "20260418",
  "20260419",
  "20260420",
  "20260421",
  "20260425",
  "20260426",
  "20260428",
  "20260429",
  "20260513",
];

describe("staging history map documentary (R8)", () => {
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();
  const mapDoc = readFileSync(MAP_DOC, "utf8");
  const renameDoc = readFileSync(RENAME_DOC, "utf8");

  it("inventories local migrations with unique 14-digit versions", () => {
    // R8 baseline was 84; H5-A/B/C + H5-D2 forward-only → 88.
    expect(migrationFiles.length).toBeGreaterThanOrEqual(84);
    expect(migrationFiles).toHaveLength(88);
    const versions = migrationFiles.map((n) => n.slice(0, 14));
    expect(versions.every((v) => /^\d{14}$/.test(v))).toBe(true);
    expect(new Set(versions).size).toBe(88);
  });

  it("documents 42 renames with unique old→new mapping", () => {
    expect(renameDoc).toMatch(/Fichiers renommés \|\s*\*\*42\*\*/);
    expect(mapDoc).toMatch(/Renommages legacy \(R4\) \|\s*\*\*42\*\*/);
    const renameRows = [
      ...renameDoc.matchAll(
        /`(\d{8}_\d{6}_[^`]+)`\s*\|\s*`(\d{14}_[^`]+)`/g
      ),
    ];
    expect(renameRows.length).toBeGreaterThanOrEqual(40);
    const news = renameRows.map((m) => m[2]);
    expect(new Set(news).size).toBe(news.length);
  });

  it("documents all 8-digit legacy groups", () => {
    for (const g of LEGACY_GROUPS_8) {
      expect(mapDoc).toContain(g);
    }
    expect(mapDoc).toMatch(/Versions staging à 8 chiffres \(14\)/);
  });

  it("classifies every rename into H2 or H5 without overlap", () => {
    expect(H2).toHaveLength(18);
    expect(H5).toHaveLength(24);
    const overlap = H2.filter((v) => H5.includes(v));
    expect(overlap).toEqual([]);
    const classified = new Set([...H2, ...H5]);
    expect(classified.size).toBe(42);
    for (const v of [...H2, ...H5]) {
      expect(mapDoc).toContain(v);
      expect(migrationFiles.some((f) => f.startsWith(v))).toBe(true);
    }
  });

  it("classifies baseline, bootstrap, and six SaaS individually", () => {
    expect(mapDoc).toMatch(/Baseline RBAC `20260407000000`\s*\|\s*\*\*H3\*\*/);
    expect(mapDoc).toMatch(/Bootstrap `20260409120000`\s*\|\s*\*\*H3\*\*/);
    for (const v of SAAS) {
      expect(mapDoc).toContain(v);
      expect(migrationFiles.some((f) => f.startsWith(v))).toBe(true);
    }
    expect(mapDoc).toMatch(
      /SaaS organizations `20260712220000`\s*\|\s*\*\*H4\*\*/
    );
  });

  it("includes H1–H6 counts and rollback plan", () => {
    expect(mapDoc).toMatch(/\|\s*\*\*H1\*\*.*\|\s*\*\*34\*\*/);
    expect(mapDoc).toMatch(/\|\s*\*\*H2\*\*.*\|\s*\*\*18\*\*/);
    expect(mapDoc).toMatch(/\|\s*\*\*H3\*\*.*\|\s*\*\*2\*\*/);
    expect(mapDoc).toMatch(/\|\s*\*\*H4\*\*.*\|\s*\*\*6\*\*/);
    expect(mapDoc).toMatch(/\|\s*\*\*H5\*\*.*\|\s*\*\*24\*\*/);
    expect(mapDoc).toMatch(/\|\s*\*\*H6\*\*.*\|\s*\*\*0\*\*/);
    expect(mapDoc.toLowerCase()).toContain("plan de retour arrière");
    expect(mapDoc).toMatch(/migration repair --status reverted/);
    expect(mapDoc).toMatch(/migration repair --status applied/);
  });

  it("proves no R8 remote writes and no secrets in docs", () => {
    expect(mapDoc).toMatch(/migration repair \/ db push R8/);
    expect(mapDoc).toMatch(/\*\*non executes\*\*/);
    expect(mapDoc).toMatch(/Staging modifié \|\s*non/);
    expect(mapDoc).toMatch(/Production touchée \|\s*non/);
    expect(mapDoc).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(mapDoc).not.toMatch(/password\s*=\s*\S+/i);
    expect(mapDoc).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/i);
    expect(mapDoc).toContain("qokyobcvplzufshydhih");
    expect(mapDoc).toContain("qcgvzdlfsxybrmloijpt");
    expect(mapDoc).toMatch(/Avancement V1/);
    expect(mapDoc).toMatch(/\*\*51 %\*\*/);
  });

  it("keeps dump path outside the repo", () => {
    expect(mapDoc).toContain("tagora-time-staging-schema-r8-2026-07-14.sql");
    expect(mapDoc).toContain(
      "0395B82B2CF263E004BA21E501D712BC512EADADD149812F2E175A8D1BCD3269"
    );
    expect(
      existsSync(
        join(ROOT, "tagora-time-staging-schema-r8-2026-07-14.sql")
      )
    ).toBe(false);
  });

  it("records manifest fingerprint for local inventory", () => {
    // Portable: normalize CRLF→LF before hashing file contents.
    const parts = migrationFiles.map((name) => {
      const content = readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(
        /\r\n/g,
        "\n"
      );
      const sha = createHash("sha256").update(content).digest("hex").toLowerCase();
      return `${name}|${sha}`;
    });
    const manifest = createHash("sha256")
      .update(parts.join("\n") + "\n")
      .digest("hex")
      .toUpperCase();
    expect(mapDoc).toContain(manifest);
    expect(manifest).toBe(
      "F0AED47A8C7791A08873C10E2741D503E325105FEF78A5AD7B7A731CD48A93B6"
    );
  });
});

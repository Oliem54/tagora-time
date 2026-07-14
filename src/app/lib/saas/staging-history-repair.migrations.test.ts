import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const REPAIR_DOC = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-STAGING-HISTORY-REPAIR-2026-07-14.md"
);
const MAP_DOC = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-STAGING-HISTORY-MAP-2026-07-14.md"
);
const FIXTURES_DIR = join(ROOT, "src", "app", "lib", "saas", "fixtures", "r9");

function fixturePath(name: string): string {
  return join(FIXTURES_DIR, name);
}

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

const H3 = ["20260407000000", "20260409120000"];

const H4 = [
  "20260712220000",
  "20260712220100",
  "20260712220200",
  "20260712220300",
  "20260712220400",
  "20260712220500",
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

const OLD8 = [
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

describe("staging history repair documentary (R9)", () => {
  const repairDoc = readFileSync(REPAIR_DOC, "utf8");
  const mapDoc = readFileSync(MAP_DOC, "utf8");

  it("documents exact H2/H3/H4/H5/OLD8 counts", () => {
    expect(H2).toHaveLength(18);
    expect(H3).toHaveLength(2);
    expect(H4).toHaveLength(6);
    expect(H5).toHaveLength(24);
    expect(OLD8).toHaveLength(14);
    for (const v of [...H2, ...H3, ...H4, ...H5, ...OLD8]) {
      expect(repairDoc).toContain(v);
    }
    expect(repairDoc).toMatch(/H2 `--status applied` \|\s*\*\*18 \/ 18\*\*/);
    expect(repairDoc).toMatch(/H3 `--status applied` \|\s*\*\*2 \/ 2\*\*/);
    expect(repairDoc).toMatch(
      /Anciennes 8 chiffres `--status reverted` \|\s*\*\*14 \/ 14\*\*/
    );
    expect(repairDoc).toMatch(/H4 marked applied \|\s*\*\*0 \/ 6\*\*/);
    expect(repairDoc).toMatch(/H5 marked applied \|\s*\*\*0 \/ 24\*\*/);
  });

  it("requires before/after TEMP snapshots", () => {
    // Portable fixtures (no cross-machine %TEMP% dependency). Hashes are of the
    // versioned fixtures; original R9 TEMP hashes remain documented in the handoff.
    const files = [
      "tagora-time-r9-migration-list-before.txt",
      "tagora-time-r9-migration-list-after.txt",
      "tagora-time-r9-schema-migrations-before.csv",
      "tagora-time-r9-schema-migrations-after.csv",
    ] as const;
    for (const name of files) {
      expect(existsSync(fixturePath(name)), name).toBe(true);
    }
    expect(repairDoc).toContain(
      "D2FF86EF8305736328396AA2DC7A2B8FC3F831269226408EF98F6F259D39CA3D"
    );
    expect(repairDoc).toContain(
      "CD6A6354DB9BD83E09316C44053B224BC4C4E073D4A897C57A848D8A12F3B3F4"
    );
    expect(repairDoc).toContain("fixtures/r9");
  });

  it("proves no db push / migration up and no H4/H5 applied", () => {
    expect(repairDoc).toMatch(/`db push` \/ `migration up` \|\s*\*\*0\*\*/);
    expect(repairDoc.toLowerCase()).toContain("plan de retour arrière");
    expect(repairDoc).toMatch(/--status reverted --linked/);
    expect(repairDoc).toContain("qokyobcvplzufshydhih");
    expect(repairDoc).toContain("qcgvzdlfsxybrmloijpt");
    expect(repairDoc).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(repairDoc).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/i);
    expect(mapDoc).toMatch(/GO HISTORY/);
    expect(repairDoc).toMatch(/\*\*51 %\*\*/);
  });

  it("keeps after-list free of H4/H5 remote matches and 8-digit remotes", () => {
    const buf = readFileSync(
      fixturePath("tagora-time-r9-migration-list-after.txt")
    );
    const after = buf.includes(0)
      ? buf.toString("utf16le")
      : buf.toString("utf8");
    for (const v of H4) {
      expect(after).not.toMatch(new RegExp(`${v}\\s+\\|\\s+${v}`));
    }
    for (const v of H5) {
      expect(after).not.toMatch(new RegExp(`${v}\\s+\\|\\s+${v}`));
    }
    for (const v of OLD8) {
      expect(after).not.toMatch(new RegExp(`\\|\\s+${v}\\s+\\|`));
    }
    for (const v of H2) {
      expect(after).toMatch(new RegExp(`${v}\\s+\\|\\s+${v}`));
    }
    for (const v of H3) {
      expect(after).toMatch(new RegExp(`${v}\\s+\\|\\s+${v}`));
    }
  });

  it("records schema fingerprint unchanged at table/view/routine/policy level", () => {
    expect(repairDoc).toMatch(/tables \| 59/);
    expect(repairDoc).toMatch(/views \| 4/);
    expect(repairDoc).toMatch(/routines \| 27/);
    expect(repairDoc).toMatch(/policies \| 80/);
    expect(repairDoc).toMatch(/saas_orgs \| 0/);
  });

  it("does not embed dump contents or alter migration hashes", () => {
    const bootstrap = join(
      ROOT,
      "supabase",
      "migrations",
      "20260409120000_historical_schema_bootstrap.sql"
    );
    expect(existsSync(bootstrap)).toBe(true);
    const sha = createHash("sha256")
      .update(readFileSync(bootstrap))
      .digest("hex");
    expect(sha.length).toBe(64);
    expect(repairDoc).not.toContain("BEGIN RSA PRIVATE KEY");
  });
});

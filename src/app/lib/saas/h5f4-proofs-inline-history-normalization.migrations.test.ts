import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5F4-PROOFS-PHOTOS-INLINE-HISTORY-2026-07-15.md"
);
const F1 = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5F1-OTHER-DOMAINS-AUDIT-2026-07-15.md"
);
const PLAN = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5-RECONCILIATION-PLAN-2026-07-14.md"
);

const H5F4 = [
  "20260425090500_photos_dossier_proof_metadata.sql",
  "20260425140500_operation_proofs_note_type.sql",
  "20260426120500_livraisons_planifiees_inline_stop_fields.sql",
] as const;

const PHOTO_COLS = [
  "proof_type",
  "proof_name",
  "linked_record_type",
  "linked_record_id",
] as const;

const INLINE_COLS = [
  "ville",
  "code_postal",
  "province",
  "latitude",
  "longitude",
  "note_chauffeur",
  "commentaire_operationnel",
] as const;

describe("H5-F4 proofs photos inline history normalization documentary", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const handoff = readFileSync(HANDOFF, "utf8");
  const f1 = readFileSync(F1, "utf8");
  const plan = readFileSync(PLAN, "utf8");

  it("covers exactly three historical H5-F4 versions without new SQL", () => {
    expect(H5F4).toHaveLength(3);
    for (const name of H5F4) {
      expect(existsSync(join(MIGRATIONS_DIR, name))).toBe(true);
      expect(handoff).toContain(name.slice(0, 14));
    }
    expect(files.filter((f) => /h5f4/i.test(f))).toEqual([]);
    expect(files.some((f) => /20260715\d{6}_h5f4/i.test(f))).toBe(false);
  });

  it("documents photos metadata, indexes, proofs catalogue, and inline fields", () => {
    for (const c of PHOTO_COLS) expect(handoff).toContain(c);
    expect(handoff).toContain("idx_photos_dossier_proof_type");
    expect(handoff).toContain("idx_photos_dossier_linked_record");
    expect(handoff).toMatch(/document[\s\S]*voice[\s\S]*signature[\s\S]*note/);
    for (const c of INLINE_COLS) expect(handoff).toContain(c);
  });

  it("is history-only: no Storage, no F2/F3/F5 execution, no H4, production forbidden", () => {
    expect(handoff.toLowerCase()).toMatch(/history-only|historique|migration repair/);
    expect(handoff).toMatch(/aucune[\s\S]*migration SQL|aucun SQL historique rejoué|ne rejoue aucun SQL/i);
    expect(handoff).toMatch(/H5-F2/);
    expect(handoff).toMatch(/H5-F3/);
    expect(handoff).toMatch(/H5-F5/);
    expect(handoff).toMatch(/Storage|photos-dossiers/);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE/);
    expect(handoff).toMatch(/pending = 6|H4/);
    expect(handoff).toMatch(/\*\*51 %\*\*/);
    expect(handoff.toLowerCase()).toContain("rollback");
    expect(f1).toMatch(/H5-F4/);
    expect(plan).toMatch(/H5-F4/);
  });
});

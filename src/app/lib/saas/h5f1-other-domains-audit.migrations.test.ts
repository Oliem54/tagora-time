import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const HANDOFF = join(
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

const H5F = [
  {
    version: "20260412161500",
    file: "20260412161500_employee_account_management.sql",
    category: "R5",
  },
  {
    version: "20260412191500",
    file: "20260412191500_employee_schedule_and_sms_alerts.sql",
    category: "R6",
  },
  {
    version: "20260425090500",
    file: "20260425090500_photos_dossier_proof_metadata.sql",
    category: "R6",
  },
  {
    version: "20260425133500",
    file: "20260425133500_storage_photos_dossiers_policy_alignment.sql",
    category: "R6",
  },
  {
    version: "20260425140500",
    file: "20260425140500_operation_proofs_note_type.sql",
    category: "R2",
  },
  {
    version: "20260426120500",
    file: "20260426120500_livraisons_planifiees_inline_stop_fields.sql",
    category: "R2",
  },
] as const;

describe("H5-F1 other domains audit documentary", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const handoff = readFileSync(HANDOFF, "utf8");
  const plan = readFileSync(PLAN, "utf8");

  it("inventories exactly six H5-F historical migrations with categories", () => {
    expect(H5F).toHaveLength(6);
    for (const m of H5F) {
      expect(existsSync(join(MIGRATIONS_DIR, m.file))).toBe(true);
      expect(handoff).toContain(m.version);
      expect(handoff).toContain(m.category);
    }
    expect(files.filter((f) => /h5f1/i.test(f))).toEqual([]);
    expect(files.some((f) => /20260715\d{6}_h5f/i.test(f))).toBe(false);
  });

  it("forbids SQL execution, repair, db push, Storage and data changes in H5-F1", () => {
    expect(handoff).toMatch(/aucune[\s\S]*migration SQL|audit RO|READ-ONLY|lecture seule/i);
    expect(handoff).toMatch(/migration repair/);
    expect(handoff).toMatch(/db push/i);
    expect(handoff).toMatch(/Storage/);
    expect(handoff.toLowerCase()).toContain("aucune écriture staging");
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE/);
  });

  it("preserves H5-A..E and protects H4 / feature", () => {
    expect(files.some((f) => f.startsWith("20260714140000"))).toBe(true);
    expect(files.some((f) => f.startsWith("20260715160000"))).toBe(true);
    expect(handoff).toMatch(/H5-E2D|H5-E complet/i);
    expect(handoff).toMatch(/H4[\s\S]*pending|pending = 6|protég/);
    expect(handoff).toContain("feature/sales-book-grants");
    expect(handoff).toMatch(/\*\*51 %\*\*/);
  });

  it("documents H5-F2..F5 cut, Martin decisions, and rollback", () => {
    expect(handoff).toMatch(/H5-F2/);
    expect(handoff).toMatch(/H5-F3/);
    expect(handoff).toMatch(/H5-F4/);
    expect(handoff).toMatch(/H5-F5/);
    expect(handoff).toMatch(/Décisions Martin|décision Martin/i);
    expect(handoff.toLowerCase()).toContain("rollback");
    expect(handoff).toMatch(/ne jamais rejouer|NE PAS REJOUER/i);
    expect(plan).toMatch(/H5-F1|LOT H5-F/);
    expect(handoff).toMatch(/photos-dossiers/);
    expect(handoff).toMatch(/DELETE/);
  });
});

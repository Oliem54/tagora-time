import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5F5-STORAGE-ISOLATION-READINESS-2026-07-16.md"
);
const HIST = "20260425133500_storage_photos_dossiers_policy_alignment.sql";
const H4B3 = "20260716222000_h4b3_platform_access_audit.sql";

describe("H5-F5 storage isolation readiness documentary", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const handoff = readFileSync(HANDOFF, "utf8");
  const histSql = readFileSync(join(MIGRATIONS_DIR, HIST), "utf8");

  it("requires H4 complete and documents H4 pending = 0", () => {
    expect(existsSync(join(MIGRATIONS_DIR, H4B3))).toBe(true);
    expect(handoff).toMatch(/H4 complet|H4 pending[\s\S]*\*\*0\*\*/i);
    expect(handoff).toMatch(/H4 pending[\s\S]*\*\*0\*\*|pending[\s\S]*\*\*0\*\*/i);
    expect(handoff).toContain("organization_memberships");
    expect(handoff).toMatch(/fail-closed|policies H4[\s\S]*\*\*0\*\*/i);
  });

  it("keeps historical 20260425133500 unmodified and forbids replay", () => {
    expect(existsSync(join(MIGRATIONS_DIR, HIST))).toBe(true);
    expect(histSql).toContain("photos_dossiers_storage_delete_policy");
    expect(histSql).toContain("has_app_permission");
    expect(histSql).not.toMatch(/organization_id/);
    expect(handoff).toContain("20260425133500");
    expect(handoff).toMatch(/rejouée[\s\S]*non|interdite/i);
    expect(handoff).toMatch(/ne pas rejouer|NE PAS REJOUER|interdite/i);
  });

  it("forbids new SQL, bucket, policy, Storage writes, production, and repair in this pass", () => {
    expect(files.some((f) => f.startsWith("20260716223000"))).toBe(false);
    expect(files.filter((f) => /h5f5/i.test(f))).toEqual([]);
    expect(handoff).toMatch(/aucune[\s\S]*migration SQL créée|ne pas créer maintenant/i);
    expect(handoff).toMatch(/aucun[\s\S]*bucket|Bucket[\s\S]*non cré/i);
    expect(handoff).toMatch(/aucune[\s\S]*policy|policy[\s\S]*non cré/i);
    expect(handoff).toMatch(/aucun[\s\S]*objet Storage|objet[\s\S]*non cré/i);
    expect(handoff).toMatch(/Écriture staging[\s\S]*aucune|aucune[\s\S]*écriture staging/i);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE|interdite/);
    expect(handoff).toMatch(/migration repair/);
    expect(handoff).toMatch(/db push/i);
  });

  it("freezes private bucket, org path, no UPDATE, no employee DELETE, no platform business access", () => {
    expect(handoff).toContain("photos-dossiers");
    expect(handoff).toMatch(/privé|private/i);
    expect(handoff).toContain("<organization_id>/");
    expect(handoff).toMatch(/documents/);
    expect(handoff).toMatch(/livraisons/);
    expect(handoff).toMatch(/terrain/);
    expect(handoff).toMatch(/aucune[\s\S]*policy UPDATE|Aucune[\s\S]*policy UPDATE/i);
    expect(handoff).toMatch(/DELETE Employé[\s\S]*interdit|non\*\* général/i);
    expect(handoff).toMatch(/platform_support|platform_super_admin/);
    expect(handoff).toMatch(/aucun[\s\S]*accès métier implicite|aucun métier implicite/i);
  });

  it("documents Option A/B/C and recommends A", () => {
    expect(handoff).toMatch(/OPTION A/i);
    expect(handoff).toMatch(/OPTION B/i);
    expect(handoff).toMatch(/OPTION C/i);
    expect(handoff).toMatch(/Option recommandée\s*:\s*\*\*A\*\*/i);
    expect(handoff).toMatch(/service_role/);
    expect(handoff).toMatch(/SECURITY DEFINER[\s\S]*non requis|Helper[\s\S]*non requis/i);
  });

  it("specifies future migration 20260716223000 without creating it", () => {
    expect(handoff).toContain("20260716223000_h5f5_photos_dossiers_org_isolation.sql");
    expect(handoff).toContain("20260716223000");
    expect(handoff).toMatch(/forward-only|transactionnel/i);
    expect(existsSync(
      join(MIGRATIONS_DIR, "20260716223000_h5f5_photos_dossiers_org_isolation.sql")
    )).toBe(false);
  });

  it("keeps V1 at 65% for readiness and targets 77% only after full H5-F5 GO", () => {
    expect(handoff).toMatch(/\*\*65 %\*\*/);
    expect(handoff).toMatch(/inchangé|préparation seulement/i);
    expect(handoff).toMatch(/\*\*77 %\*\*/);
    expect(handoff).toMatch(
      /PARTIAL H5-F5 — CONTRAT STORAGE FIGÉ, INTÉGRATION DU CONTEXTE ORGANISATIONNEL REQUISE AVANT APPLICATION/
    );
  });
});

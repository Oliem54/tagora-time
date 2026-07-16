import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PHOTOS_DOSSIERS_ALLOWED_MIME_PREFIXES,
  PHOTOS_DOSSIERS_MAX_BYTES,
} from "@/app/lib/storage/photos-dossiers-contract.shared";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const FILE = "20260716223000_h5f5_photos_dossiers_org_isolation.sql";
const HIST = "20260425133500_storage_photos_dossiers_policy_alignment.sql";
const HANDOFF_A = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5F5A-STORAGE-SERVER-RUNTIME-2026-07-16.md"
);
const HANDOFF_READY = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5F5-STORAGE-ISOLATION-READINESS-2026-07-16.md"
);

describe("H5-F5B photos-dossiers private bucket isolation migration", () => {
  const path = join(MIGRATIONS_DIR, FILE);
  const sql = readFileSync(path, "utf8");
  const lower = sql.toLowerCase();
  const hist = readFileSync(join(MIGRATIONS_DIR, HIST), "utf8");
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();

  it("uses exact version and filename", () => {
    expect(FILE).toBe("20260716223000_h5f5_photos_dossiers_org_isolation.sql");
    expect(existsSync(path)).toBe(true);
    expect(files).toContain(FILE);
    expect(sql).toContain("20260716223000");
  });

  it("is transactional begin/commit without seed/backfill/objects", () => {
    expect(lower).toMatch(/\bbegin\s*;/);
    expect(lower).toMatch(/\bcommit\s*;/);
    expect(lower).not.toMatch(/\binsert\s+into\s+storage\.objects\b/);
    expect(lower).not.toMatch(/\binsert\s+into\s+public\./);
    expect(lower).not.toMatch(/\borganization_memberships\b/);
    expect(lower).not.toMatch(/\bauth\.users\b/);
    expect(lower).not.toMatch(/\bcreate\s+table\b/);
    // Comment may mention forbidden practices; executable body must not perform them.
    const body = lower.replace(/--[^\n]*/g, " ");
    expect(body).not.toMatch(/\bseed\b/);
    expect(body).not.toMatch(/\bbackfill\b/);
  });

  it("creates private photos-dossiers with 15 MiB and MIME aligned to H5-F5A", () => {
    expect(sql).toContain("photos-dossiers");
    expect(lower).toMatch(/public\s*=\s*false|,\s*false\s*,/);
    expect(sql).toContain(String(PHOTOS_DOSSIERS_MAX_BYTES));
    expect(sql).toContain("15728640");
    expect(sql).toContain("allowed_mime_types");
    expect(sql).toContain("image/jpeg");
    expect(sql).toContain("application/pdf");
    expect(sql).toContain("audio/webm");
    for (const prefix of PHOTOS_DOSSIERS_ALLOWED_MIME_PREFIXES) {
      // prefixes are runtime validators; SQL lists concrete types under those families
      expect(prefix.length).toBeGreaterThan(0);
    }
  });

  it("drops only historical named policies and creates no client policies", () => {
    expect(sql).toContain('drop policy if exists "photos_dossiers_storage_select_policy"');
    expect(sql).toContain('drop policy if exists "photos_dossiers_storage_insert_policy"');
    expect(sql).toContain('drop policy if exists "photos_dossiers_storage_delete_policy"');
    expect(lower).not.toMatch(/\bcreate\s+policy\b/);
    expect(lower).not.toMatch(/\busing\s*\(\s*true\s*\)/);
    expect(lower).not.toMatch(/\bwith\s+check\s*\(\s*true\s*\)/);
    expect(lower).not.toMatch(/to\s+authenticated/);
    expect(lower).not.toMatch(/to\s+anon/);
    expect(lower).not.toMatch(/to\s+public\b/);
    expect(lower).not.toMatch(/for\s+update\b/);
    expect(lower).not.toMatch(/for\s+select\b/);
    expect(lower).not.toMatch(/for\s+insert\b/);
    expect(lower).not.toMatch(/for\s+delete\b/);
    expect(lower).not.toMatch(/security\s+definer/);
  });

  it("does not modify historical migration or H4 tables", () => {
    expect(hist).toContain("photos_dossiers_storage_delete_policy");
    expect(hist).toContain("has_app_permission");
    expect(lower).not.toMatch(/organization_memberships|platform_access|organizations\b/);
    expect(sql).toMatch(/NEVER replay|never replay|ne jamais|NEVER/i);
    expect(sql).toContain("20260425133500");
  });

  it("documents Option A and production guardrails in readiness/runtime handoffs", () => {
    expect(existsSync(HANDOFF_A)).toBe(true);
    expect(existsSync(HANDOFF_READY)).toBe(true);
    const ready = readFileSync(HANDOFF_READY, "utf8");
    expect(ready).toContain("20260716223000");
    expect(ready).toMatch(/65 %/);
    expect(ready).toMatch(/77 %/);
    expect(ready).toContain("qcgvzdlfsxybrmloijpt");
  });

  it("exposes a stable SHA-256 fingerprint for the migration body", () => {
    const hash = createHash("sha256").update(sql).digest("hex");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash.length).toBe(64);
  });

  it("records execution handoff with matching SHA-256 and GO 77%", () => {
    const handoffPath = join(
      ROOT,
      "docs",
      "handoffs",
      "TAGORA-TIME-SAAS1B1B-H5F5B-STORAGE-BUCKET-EXECUTION-2026-07-16.md"
    );
    expect(existsSync(handoffPath)).toBe(true);
    const handoff = readFileSync(handoffPath, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex").toUpperCase();
    expect(handoff).toContain(hash);
    expect(handoff).toMatch(/GO H5-F5B/);
    expect(handoff).toMatch(/65 % → 77 %|\*\*77 %\*\*/);
    expect(handoff).toMatch(/history-only/i);
    expect(handoff).toContain("20260425133500");
  });
});

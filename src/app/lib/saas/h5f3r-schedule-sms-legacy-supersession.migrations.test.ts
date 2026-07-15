import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const HISTORICAL = "20260412191500_employee_schedule_and_sms_alerts.sql";
const HANDOFF = join(
  ROOT,
  "docs",
  "handoffs",
  "TAGORA-TIME-SAAS1B1B-H5F3R-SCHEDULE-SMS-LEGACY-SUPERSESSION-2026-07-15.md"
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

const BREAK_COLS = [
  "break_am_enabled",
  "break_am_time",
  "break_am_minutes",
  "break_am_paid",
  "lunch_enabled",
  "lunch_time",
  "lunch_minutes",
  "lunch_paid",
  "break_pm_enabled",
  "break_pm_time",
  "break_pm_minutes",
  "break_pm_paid",
] as const;

const SMS_COLS = [
  "sms_alert_depart_terrain",
  "sms_alert_arrivee_terrain",
  "sms_alert_sortie",
  "sms_alert_retour",
  "sms_alert_pause_debut",
  "sms_alert_pause_fin",
  "sms_alert_dinner_debut",
  "sms_alert_dinner_fin",
  "sms_alert_quart_debut",
  "sms_alert_quart_fin",
] as const;

describe("H5-F3R schedule SMS legacy supersession documentary", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort();
  const handoff = readFileSync(HANDOFF, "utf8");
  const f1 = readFileSync(F1, "utf8");
  const plan = readFileSync(PLAN, "utf8");
  const historical = readFileSync(join(MIGRATIONS_DIR, HISTORICAL), "utf8");

  it("targets 20260412191500 without new SQL and keeps historical file unchanged pattern", () => {
    expect(existsSync(join(MIGRATIONS_DIR, HISTORICAL))).toBe(true);
    expect(handoff).toContain("20260412191500");
    expect(BREAK_COLS).toHaveLength(12);
    expect(SMS_COLS).toHaveLength(10);
    for (const c of BREAK_COLS) expect(handoff).toContain(c);
    for (const c of SMS_COLS) expect(handoff).toContain(c);
    expect(files.filter((f) => /h5f3r/i.test(f))).toEqual([]);
    expect(files.some((f) => /20260715\d{6}_h5f3/i.test(f))).toBe(false);
    expect(historical).toMatch(/where true/i);
  });

  it("documents approved legacy gap: break_am_minutes only, 2 rows, invalid=0", () => {
    expect(handoff).toMatch(/break_am_minutes/);
    expect(handoff).toMatch(/nullable|NULL est une valeur valide/i);
    expect(handoff).toMatch(/écart legacy|divergence|approuv/i);
    expect(handoff).toMatch(/break_am_minutes.*2|2.*break_am_minutes|lignes divergentes.*2|divergence.*=\s*2|total.*2/i);
    expect(handoff).toMatch(/contract_invalid_count\s*=\s*0/);
    expect(handoff).toMatch(/UPDATE.*supersédé|backfill.*supersédé|supersession/i);
    expect(handoff.toLowerCase()).toMatch(/aucun.*backfill|backfill interdit|pas de backfill/);
    expect(handoff.toLowerCase()).toMatch(/update where true|update historique|aucun update/);
  });

  it("is history-only repair with protections, office closure, home resume, V1 51%", () => {
    expect(handoff.toLowerCase()).toMatch(/history-only|migration repair/);
    expect(handoff).toMatch(/aucun SMS|pas de SMS|SMS réel/i);
    expect(handoff).toMatch(/H5-F5/);
    expect(handoff).toMatch(/H4/);
    expect(handoff).toContain("qcgvzdlfsxybrmloijpt");
    expect(handoff).toMatch(/INTERDITE/);
    expect(handoff).toMatch(/\*\*51 %\*\*/);
    expect(handoff.toLowerCase()).toContain("rollback");
    expect(handoff.toLowerCase()).toMatch(/fermeture bureau|fermeture/);
    expect(handoff.toLowerCase()).toMatch(/reprise maison|maison/);
    expect(
      existsSync(
        join(
          ROOT,
          "docs",
          "handoffs",
          "TAGORA-TIME-OFFICE-CLOSURE-AFTER-H5F3R-2026-07-15.md"
        )
      )
    ).toBe(true);
    expect(f1).toMatch(/H5-F3/);
    expect(plan).toMatch(/H5-F3/);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1ShiftRecord,
} from "./types";
import {
  buildPayrollAccountantSnapshot,
  refuseIssuedReportMutation,
} from "./payroll-accountant-snapshot.shared";
import {
  bindPayrollAccountantPersistSourceHash,
  listPayrollAccountantRevisionsInMemory,
  persistPayrollAccountantReportInMemory,
  readPayrollAccountantDraftInMemory,
  readPayrollAccountantReportInMemory,
  requirePayrollReportReadScope,
  resetPayrollPersistIdCounter,
  type PayrollPersistMemoryStore,
} from "./payroll-accountant-report.shared";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const OTHER_COMPANY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CYCLE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_CYCLE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const TENANT = {
  organizationId: ORG,
  organizationCompanyId: COMPANY,
  cycleId: CYCLE,
  timezone: "America/Toronto",
  periodStart: "2026-08-10",
  periodEnd: "2026-08-23",
  cycleKind: "recurring" as const,
};

const MIGRATION =
  "20260826015229_horodateur_payroll_accountant_report_persist_rpc.sql";
const HOTFIX_MIGRATION =
  "20260827121213_horodateur_payroll_accountant_report_persist_rpc_current_user_hotfix.sql";

function profile(
  partial?: Partial<HorodateurPhase1EmployeeProfile>
): HorodateurPhase1EmployeeProfile {
  return {
    employeeId: 7,
    organizationId: ORG,
    organizationCompanyId: COMPANY,
    authUserId: null,
    fullName: "Yves Test",
    email: null,
    phoneNumber: null,
    active: true,
    scheduleActive: true,
    primaryCompany: "oliem_solutions",
    scheduleStart: "08:00",
    scheduleEnd: "17:00",
    scheduledWorkDays: null,
    plannedWeeklyHours: 40,
    pausePaid: false,
    pauseMinutes: 15,
    lunchPaid: false,
    lunchMinutes: 30,
    expectedBreaksCount: null,
    toleranceBeforeStartMinutes: 0,
    toleranceAfterEndMinutes: 0,
    maxShiftMinutes: 720,
    smsAlertQuartDebut: false,
    smsAlertQuartFin: false,
    smsAlertPauseDebut: false,
    smsAlertPauseFin: false,
    smsAlertDinnerDebut: false,
    smsAlertDinnerFin: false,
    smsAlertDepartTerrain: false,
    smsAlertArriveeTerrain: false,
    smsAlertSortie: false,
    smsAlertRetour: false,
    alertEmailEnabled: false,
    alertSmsEnabled: false,
    isDirectionAlertRecipient: false,
    weeklyScheduleConfig: null,
    canWorkForOliemSolutions: true,
    canWorkForTitanProduitsIndustriels: false,
    ...partial,
  };
}

function shift(
  partial: Partial<HorodateurPhase1ShiftRecord> & Pick<
    HorodateurPhase1ShiftRecord,
    "id" | "work_date"
  >
): HorodateurPhase1ShiftRecord {
  return {
    employee_id: 7,
    organization_id: ORG,
    organization_company_id: COMPANY,
    week_start_date: "",
    company_context: "oliem_solutions",
    shift_start_at: `${partial.work_date}T12:00:00.000Z`,
    shift_end_at: `${partial.work_date}T20:00:00.000Z`,
    gross_minutes: 480,
    paid_break_minutes: 0,
    unpaid_break_minutes: 15,
    unpaid_lunch_minutes: 30,
    worked_minutes: 480,
    payable_minutes: 480,
    anomalies_count: 0,
    status: "valide",
    last_recomputed_at: `${partial.work_date}T20:01:00.000Z`,
    ...partial,
  };
}

function persistable(
  snapshot: ReturnType<typeof buildPayrollAccountantSnapshot>
) {
  return bindPayrollAccountantPersistSourceHash(snapshot);
}

function completeSnapshot(forceEmitReason?: string | null) {
  return persistable(
    buildPayrollAccountantSnapshot({
      tenant: TENANT,
      profiles: [profile()],
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
      events: [],
      exceptions: [],
      forceEmitReason,
    })
  );
}

function incompleteSnapshot(forceEmitReason?: string | null) {
  return persistable(
    buildPayrollAccountantSnapshot({
      tenant: TENANT,
      profiles: [profile()],
      shifts: [
        shift({
          id: "open",
          work_date: "2026-08-10",
          shift_end_at: null,
          status: "ouvert",
        }),
      ],
      events: [],
      exceptions: [],
      forceEmitReason,
    })
  );
}

function seededStore(): PayrollPersistMemoryStore {
  return {
    cycles: [
      {
        organizationId: ORG,
        organizationCompanyId: COMPANY,
        cycleId: CYCLE,
        timezone: "America/Toronto",
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
      },
    ],
    reports: [],
    audits: [],
  };
}

describe("payroll accountant persist memory and RPC SQL", () => {
  beforeEach(() => {
    resetPayrollPersistIdCounter();
  });

  it("saves a valid draft with matching source_hash and audit", () => {
    const snapshot = completeSnapshot();
    const store = seededStore();
    const saved = persistPayrollAccountantReportInMemory(store, {
      operation: "save_draft",
      snapshot,
      actorUserId: "user-1",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.result.status).toBe("draft");
    expect(saved.result.sourceHash).toBe(snapshot.sourceHash);
    expect(saved.result.idempotent).toBe(false);
    expect(store.reports).toHaveLength(1);
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]?.action).toBe("recalculate");
    expect(JSON.stringify(store.audits[0]?.metadata)).not.toMatch(
      /salary|hourly|commission|service_role/i
    );
  });

  it("repeats the same draft snapshot idempotently", () => {
    const snapshot = completeSnapshot();
    const store = seededStore();
    const first = persistPayrollAccountantReportInMemory(store, {
      operation: "save_draft",
      snapshot,
      actorUserId: "user-1",
    });
    const second = persistPayrollAccountantReportInMemory(store, {
      operation: "save_draft",
      snapshot,
      actorUserId: "user-1",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.result.idempotent).toBe(true);
    expect(second.result.reportId).toBe(first.result.reportId);
    expect(store.reports).toHaveLength(1);
    expect(store.audits).toHaveLength(1);
  });

  it("refuses a foreign organization cycle", () => {
    const snapshot = completeSnapshot();
    const store = seededStore();
    store.cycles[0]!.organizationId = OTHER_ORG;
    const saved = persistPayrollAccountantReportInMemory(store, {
      operation: "save_draft",
      snapshot,
      actorUserId: "user-1",
    });
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.reason).toBe("cycle_tenant_mismatch");
    expect(store.reports).toHaveLength(0);
  });

  it("refuses another company in the same organization", () => {
    const snapshot = completeSnapshot();
    const store = seededStore();
    store.cycles[0]!.organizationCompanyId = OTHER_COMPANY;
    const saved = persistPayrollAccountantReportInMemory(store, {
      operation: "save_draft",
      snapshot,
      actorUserId: "user-1",
    });
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.reason).toBe("cycle_tenant_mismatch");
  });

  it("refuses a foreign cycle id", () => {
    const snapshot = completeSnapshot();
    const store = seededStore();
    store.cycles[0]!.cycleId = OTHER_CYCLE;
    const saved = persistPayrollAccountantReportInMemory(store, {
      operation: "save_draft",
      snapshot,
      actorUserId: "user-1",
    });
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.reason).toBe("cycle_tenant_mismatch");
  });

  it("updates the draft when source_hash changes", () => {
    const firstSnap = completeSnapshot();
    const secondSnap = buildPayrollAccountantSnapshot({
      tenant: TENANT,
      profiles: [profile()],
      shifts: [
        shift({
          id: "s1",
          work_date: "2026-08-10",
          shift_start_at: "2026-08-10T12:15:00.000Z",
        }),
      ],
      events: [],
      exceptions: [],
    });
    expect(firstSnap.sourceHash).not.toBe(secondSnap.sourceHash);
    const store = seededStore();
    persistPayrollAccountantReportInMemory(store, {
      operation: "save_draft",
      snapshot: persistable(firstSnap),
      actorUserId: "user-1",
    });
    const updated = persistPayrollAccountantReportInMemory(store, {
      operation: "save_draft",
      snapshot: persistable(secondSnap),
      actorUserId: "user-1",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.result.idempotent).toBe(false);
    expect(store.reports).toHaveLength(1);
    expect(store.reports[0]?.sourceHash).toBe(
      persistable(secondSnap).sourceHash
    );
    expect(store.audits).toHaveLength(2);
  });

  it("blocks issuing blocked_incomplete", () => {
    const snapshot = incompleteSnapshot();
    expect(snapshot.canIssue).toBe(false);
    const issued = persistPayrollAccountantReportInMemory(seededStore(), {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    expect(issued.ok).toBe(false);
    if (issued.ok) return;
    expect(issued.reason).toBe("blocked_incomplete");
  });

  it("refuses forced issue without a reason", () => {
    const withReason = incompleteSnapshot("Cloture comptable exceptionnelle");
    const snapshot = persistable({
      ...withReason,
      payload: { ...withReason.payload, forceEmitReason: null },
    });
    const issued = persistPayrollAccountantReportInMemory(seededStore(), {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    expect(issued.ok).toBe(false);
    if (issued.ok) return;
    expect(issued.reason).toBe("forced_reason_required");
  });

  it("issues a forced snapshot when the reason is present in payload and hash", () => {
    const snapshot = incompleteSnapshot("Cloture comptable exceptionnelle");
    expect(snapshot.payload.forceEmitReason).toBe(
      "Cloture comptable exceptionnelle"
    );
    const issued = persistPayrollAccountantReportInMemory(seededStore(), {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.result.status).toBe("issued");
    expect(issued.result.completenessStatus).toBe("forced");
    expect(issued.result.sourceHash).toBe(snapshot.sourceHash);
  });

  it("writes report and audit together and rolls back the report if audit fails", () => {
    const snapshot = completeSnapshot();
    const store = seededStore();
    store.failNextAudit = true;
    const issued = persistPayrollAccountantReportInMemory(store, {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    expect(issued.ok).toBe(false);
    if (issued.ok) return;
    expect(issued.reason).toBe("audit_write_failed");
    expect(store.reports).toHaveLength(0);
    expect(store.audits).toHaveLength(0);

    store.failNextAudit = false;
    const ok = persistPayrollAccountantReportInMemory(store, {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(store.reports).toHaveLength(1);
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]?.reportId).toBe(store.reports[0]?.id);
  });

  it("repeats an identical issued snapshot without a new revision", () => {
    const snapshot = completeSnapshot();
    const store = seededStore();
    const first = persistPayrollAccountantReportInMemory(store, {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    const second = persistPayrollAccountantReportInMemory(store, {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.result.idempotent).toBe(true);
    expect(second.result.reportId).toBe(first.result.reportId);
    expect(second.result.revision).toBe(first.result.revision);
    expect(store.reports.filter((row) => row.status === "issued")).toHaveLength(
      1
    );
    expect(store.audits).toHaveLength(1);
  });

  it("serializes identical concurrent issues to one report and one audit", () => {
    const snapshot = completeSnapshot();
    const store = seededStore();
    const first = persistPayrollAccountantReportInMemory(store, {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    const second = persistPayrollAccountantReportInMemory(store, {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(store.reports.filter((row) => row.status === "issued")).toHaveLength(
      1
    );
    expect(store.audits).toHaveLength(1);
    expect(new Set([first.result.reportId, second.result.reportId]).size).toBe(
      1
    );
  });

  it("creates a sequential revision when the persist source_hash changes", () => {
    const first = persistable(
      buildPayrollAccountantSnapshot({
        tenant: TENANT,
        profiles: [profile()],
        shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
        events: [],
        exceptions: [],
      })
    );
    const second = persistable(
      buildPayrollAccountantSnapshot({
        tenant: TENANT,
        profiles: [profile()],
        shifts: [
          shift({
            id: "s1",
            work_date: "2026-08-10",
            shift_start_at: "2026-08-10T12:15:00.000Z",
          }),
        ],
        events: [],
        exceptions: [],
      })
    );
    expect(first.sourceHash).not.toBe(second.sourceHash);
    const store = seededStore();
    const issuedFirst = persistPayrollAccountantReportInMemory(store, {
      operation: "issue",
      snapshot: first,
      actorUserId: "user-1",
    });
    const issuedSecond = persistPayrollAccountantReportInMemory(store, {
      operation: "issue",
      snapshot: second,
      actorUserId: "user-1",
    });
    expect(issuedFirst.ok && issuedSecond.ok).toBe(true);
    if (!issuedFirst.ok || !issuedSecond.ok) return;
    expect(issuedFirst.result.revision).toBe(1);
    expect(issuedSecond.result.revision).toBe(2);
    expect(store.reports.filter((row) => row.status === "issued")).toHaveLength(
      2
    );
  });

  it("refuses an empty or invalid persist source_hash", () => {
    const snapshot = completeSnapshot();
    const empty = persistPayrollAccountantReportInMemory(seededStore(), {
      operation: "save_draft",
      snapshot: { ...snapshot, sourceHash: "" },
      actorUserId: "user-1",
    });
    const invalid = persistPayrollAccountantReportInMemory(seededStore(), {
      operation: "save_draft",
      snapshot: { ...snapshot, sourceHash: "not-a-sha256" },
      actorUserId: "user-1",
    });
    expect(empty).toMatchObject({ ok: false, reason: "source_hash_mismatch" });
    expect(invalid).toMatchObject({ ok: false, reason: "source_hash_mismatch" });
  });

  it("refuses a payload mutated after the persist hash was bound", () => {
    const snapshot = completeSnapshot();
    snapshot.payload.forceEmitReason = "tampered-after-hash";
    const denied = persistPayrollAccountantReportInMemory(seededStore(), {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    expect(denied).toMatchObject({ ok: false, reason: "source_hash_mismatch" });
  });

  it("never mutates an issued report", () => {
    const snapshot = completeSnapshot();
    const store = seededStore();
    const issued = persistPayrollAccountantReportInMemory(store, {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const frozen = { ...store.reports[0]! };
    expect(
      refuseIssuedReportMutation({
        id: frozen.id,
        revision: frozen.revision,
        status: frozen.status,
        cycleId: frozen.cycleId,
        organizationId: frozen.organizationId,
        organizationCompanyId: frozen.organizationCompanyId,
      }).ok
    ).toBe(false);
    persistPayrollAccountantReportInMemory(store, {
      operation: "save_draft",
      snapshot,
      actorUserId: "user-1",
    });
    const issuedRow = store.reports.find((row) => row.id === frozen.id);
    expect(issuedRow).toEqual(frozen);
  });

  it("forbids reading a report by id alone", () => {
    expect(
      requirePayrollReportReadScope({
        mode: "report",
        reportId: "report-1",
      }).ok
    ).toBe(false);
    expect(
      readPayrollAccountantReportInMemory(seededStore(), {
        reportId: "report-1",
      })
    ).toMatchObject({ ok: false, reason: "id_only_read_forbidden" });
  });

  it("reads draft, exact report, and revisions only with org+company+cycle", () => {
    const snapshot = completeSnapshot();
    const store = seededStore();
    persistPayrollAccountantReportInMemory(store, {
      operation: "issue",
      snapshot,
      actorUserId: "user-1",
    });
    persistPayrollAccountantReportInMemory(store, {
      operation: "save_draft",
      snapshot,
      actorUserId: "user-1",
    });

    const draft = readPayrollAccountantDraftInMemory(store, TENANT);
    expect(draft.ok && draft.report?.status).toBe("draft");

    const issuedId = store.reports.find((row) => row.status === "issued")?.id;
    const exact = readPayrollAccountantReportInMemory(store, {
      ...TENANT,
      reportId: issuedId,
    });
    expect(exact.ok && exact.report?.status).toBe("issued");

    const leaked = readPayrollAccountantReportInMemory(store, {
      organizationId: OTHER_ORG,
      organizationCompanyId: COMPANY,
      cycleId: CYCLE,
      reportId: issuedId,
    });
    expect(leaked.ok && leaked.report).toBeNull();

    const revisions = listPayrollAccountantRevisionsInMemory(store, TENANT);
    expect(revisions.ok && revisions.reports.map((row) => row.revision)).toEqual(
      [1, 2]
    );
  });

  it("locks cycle revision allocation and revokes RPC from public roles", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", MIGRATION),
      "utf8"
    );
    const lower = sql.toLowerCase();
    expect(lower).toContain("security invoker");
    expect(lower).not.toContain("security definer");
    expect(lower).toContain("and r.source_hash = p_source_hash");
    expect(lower.indexOf("for update")).toBeLessThan(
      lower.indexOf("coalesce(pg_catalog.max(r.revision), 0) + 1")
    );
    expect(lower.indexOf("and r.source_hash = p_source_hash")).toBeLessThan(
      lower.indexOf("coalesce(pg_catalog.max(r.revision), 0) + 1")
    );
    expect(lower).toContain("insert into public.horodateur_payroll_reports");
    expect(lower).toContain("insert into public.horodateur_payroll_audit_log");
    expect(lower).toContain("and r.status = 'draft'");
    expect(lower).toContain("revoke execute");
    expect(lower).toContain("from public");
    expect(lower).toContain("from anon");
    expect(lower).toContain("from authenticated");
    expect(lower).toContain("grant execute");
    expect(lower).toContain("to service_role");
    expect(lower).toContain("current_user is distinct from 'service_role'");
    expect(sql).toContain("persist_horodateur_payroll_accountant_report");
    expect(lower).not.toContain("raise log");
    expect(lower).not.toContain("salary");
    expect(lower).not.toContain("hourly_rate");
    expect(lower).not.toContain("commission");
  });

  it("hotfixes the role guard to pg_catalog.current_user() without changing grants", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", HOTFIX_MIGRATION),
      "utf8"
    );
    const lower = sql.toLowerCase();
    expect(sql).toContain("pg_catalog.current_user()");
    expect(sql).not.toMatch(/pg_catalog\.current_user(?!\s*\()/);
    expect(lower).toContain("security invoker");
    expect(lower).not.toContain("security definer");
    expect(lower).toContain("revoke execute");
    expect(lower).toContain("from public");
    expect(lower).toContain("from anon");
    expect(lower).toContain("from authenticated");
    expect(lower).toContain("grant execute");
    expect(lower).toContain("to service_role");
    expect(sql).toContain("persist_horodateur_payroll_accountant_report");
    expect(lower).not.toContain("raise log");
  });
});

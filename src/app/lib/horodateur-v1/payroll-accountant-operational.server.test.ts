import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  from,
  previewPayrollAccountantReportSnapshot,
  issueAuthorizedPayrollAccountantReport,
  saveAuthorizedPayrollAccountantDraft,
  loadAuthorizedPayrollAccountantReport,
  loadAuthorizedPayrollAccountantDraft,
  listAuthorizedPayrollAccountantRevisions,
} = vi.hoisted(() => ({
  from: vi.fn(),
  previewPayrollAccountantReportSnapshot: vi.fn(),
  issueAuthorizedPayrollAccountantReport: vi.fn(),
  saveAuthorizedPayrollAccountantDraft: vi.fn(),
  loadAuthorizedPayrollAccountantReport: vi.fn(),
  loadAuthorizedPayrollAccountantDraft: vi.fn(),
  listAuthorizedPayrollAccountantRevisions: vi.fn(),
}));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ from }),
}));

vi.mock("./payroll-report-snapshot.server", () => ({
  previewPayrollAccountantReportSnapshot,
}));

vi.mock("./payroll-accountant-report.server", () => ({
  issueAuthorizedPayrollAccountantReport,
  saveAuthorizedPayrollAccountantDraft,
  loadAuthorizedPayrollAccountantReport,
  loadAuthorizedPayrollAccountantDraft,
  listAuthorizedPayrollAccountantRevisions,
}));

import {
  loadPayrollAccountantOperationalContext,
  persistPayrollAccountantOperational,
  resolvePayrollAccountantExportSnapshot,
} from "./payroll-accountant-operational.server";
import { bindPayrollAccountantPersistSourceHash } from "./payroll-accountant-report.shared";
import { buildPayrollAccountantSnapshot } from "./payroll-accountant-snapshot.shared";
import { isRecurringFourteenDayPeriod } from "./payroll-accountant-snapshot.shared";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1ShiftRecord,
} from "./types";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const OTHER_COMPANY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CYCLE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function profile(): HorodateurPhase1EmployeeProfile {
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
  };
}

function shift(): HorodateurPhase1ShiftRecord {
  return {
    id: "s1",
    employee_id: 7,
    organization_id: ORG,
    organization_company_id: COMPANY,
    week_start_date: "",
    company_context: "oliem_solutions",
    work_date: "2026-08-10",
    shift_start_at: "2026-08-10T12:00:00.000Z",
    shift_end_at: "2026-08-10T20:00:00.000Z",
    gross_minutes: 480,
    paid_break_minutes: 0,
    unpaid_break_minutes: 15,
    unpaid_lunch_minutes: 30,
    worked_minutes: 480,
    payable_minutes: 480,
    anomalies_count: 0,
    status: "valide",
    last_recomputed_at: "2026-08-10T20:01:00.000Z",
  };
}

function snapshot() {
  return buildPayrollAccountantSnapshot({
    tenant: {
      organizationId: ORG,
      organizationCompanyId: COMPANY,
      organizationName: "Org QA",
      organizationCompanyName: "Oliem Solutions",
      cycleId: CYCLE,
      timezone: "America/Toronto",
      periodStart: "2026-08-10",
      periodEnd: "2026-08-23",
      cycleKind: "recurring",
    },
    profiles: [profile()],
    shifts: [shift()],
    events: [],
    exceptions: [],
  });
}

function makeUser(permissions: string[]): User {
  return {
    id: "user-operational",
    app_metadata: { role: "direction", permissions },
    user_metadata: { permissions: ["horodateur_payroll_manage"] },
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

const accessOk = {
  allowed: true,
  canRead: true,
  canManage: true,
  source: "app_metadata" as const,
  reason: "direction_app_metadata",
};

function auth(permissions = ["horodateur_payroll_manage"]) {
  return {
    user: makeUser(permissions),
    membership: { role: "direction", status: "active" },
    membershipOrganizationId: ORG,
  };
}

function queryChain(result: { data: unknown; error: unknown }) {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    neq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
  } = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    order: vi.fn(async () => result),
  };
  return query;
}

describe("payroll accountant operational server", () => {
  beforeEach(() => {
    from.mockReset();
    previewPayrollAccountantReportSnapshot.mockReset();
    issueAuthorizedPayrollAccountantReport.mockReset();
    saveAuthorizedPayrollAccountantDraft.mockReset();
    loadAuthorizedPayrollAccountantReport.mockReset();
    loadAuthorizedPayrollAccountantDraft.mockReset();
    listAuthorizedPayrollAccountantRevisions.mockReset();
  });

  it("refuses a browser organization that is not the membership org", async () => {
    const result = await loadPayrollAccountantOperationalContext({
      ...auth(),
      untrustedBrowserOrganizationId: OTHER_ORG,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("reason" in result && result.reason).toBe("browser_organization_rejected");
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a company that does not belong to the membership organization", async () => {
    from.mockImplementation((table: string) => {
      if (table === "organization_companies") {
        return queryChain({
          data: [
            {
              id: COMPANY,
              display_name: "Oliem Solutions",
              legal_name: "Oliem",
              company_code: "oliem",
              is_default: true,
              status: "active",
            },
          ],
          error: null,
        });
      }
      return queryChain({ data: [], error: null });
    });

    const result = await loadPayrollAccountantOperationalContext({
      ...auth(),
      organizationCompanyId: OTHER_COMPANY,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("reason" in result && result.reason).toBe("company_tenant_mismatch");
  });

  it("defaults to an inclusive two-week period when no cycle covers today", async () => {
    from.mockImplementation((table: string) => {
      if (table === "organization_companies") {
        return queryChain({
          data: [
            {
              id: COMPANY,
              display_name: "Oliem Solutions",
              legal_name: "Oliem",
              company_code: "oliem",
              is_default: true,
              status: "active",
            },
          ],
          error: null,
        });
      }
      return queryChain({ data: [], error: null });
    });

    const result = await loadPayrollAccountantOperationalContext(auth());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.organizationId).toBe(ORG);
    expect(result.selectedCompanyId).toBe(COMPANY);
    expect(
      isRecurringFourteenDayPeriod(
        result.defaultPeriod.periodStart,
        result.defaultPeriod.periodEnd
      )
    ).toBe(true);
    expect(result.defaultPeriod.periodEnd).toBe(new Date().toISOString().slice(0, 10));
  });

  it("requires explicit confirmation before issue and does not persist", async () => {
    const result = await persistPayrollAccountantOperational({
      ...auth(),
      operation: "issue",
      query: {
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
        cycleId: CYCLE,
      },
    });
    expect(result).toEqual({ ok: false, reason: "confirm_required" });
    expect(previewPayrollAccountantReportSnapshot).not.toHaveBeenCalled();
    expect(issueAuthorizedPayrollAccountantReport).not.toHaveBeenCalled();
  });

  it("rebuilds the snapshot on the server, recomputes the hash, and ignores a client payload", async () => {
    const rebuilt = snapshot();
    previewPayrollAccountantReportSnapshot.mockResolvedValue({
      ok: true,
      access: accessOk,
      datesAdjustedFromCycle: false,
      snapshot: { ...rebuilt, sourceHash: "a".repeat(64) },
    });
    saveAuthorizedPayrollAccountantDraft.mockResolvedValue({
      ok: true,
      access: accessOk,
      result: {
        reportId: "draft-1",
        revision: 1,
        status: "draft",
        sourceHash: rebuilt.sourceHash,
        completenessStatus: "complete",
        idempotent: false,
        auditId: "audit-1",
      },
    });

    const result = await persistPayrollAccountantOperational({
      ...auth(["horodateur_payroll_read"]),
      operation: "save_draft",
      query: {
        organizationId: OTHER_ORG,
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
        cycleId: CYCLE,
        untrustedBrowserOrganizationId: OTHER_ORG,
      },
      untrustedBrowserOrganizationCompanyId: COMPANY,
    });

    expect(result.ok).toBe(true);
    expect(previewPayrollAccountantReportSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipOrganizationId: ORG,
        query: expect.objectContaining({
          organizationId: ORG,
          organizationCompanyId: COMPANY,
        }),
      })
    );
    const persistArg = saveAuthorizedPayrollAccountantDraft.mock.calls[0]?.[0];
    expect(persistArg.snapshot.sourceHash).toBe(
      bindPayrollAccountantPersistSourceHash(rebuilt).sourceHash
    );
    expect(persistArg.tenant.organizationId).toBe(ORG);
    expect(issueAuthorizedPayrollAccountantReport).not.toHaveBeenCalled();
  });

  it("issues only after confirmation and uses the manage persist path", async () => {
    const rebuilt = snapshot();
    previewPayrollAccountantReportSnapshot.mockResolvedValue({
      ok: true,
      access: accessOk,
      datesAdjustedFromCycle: false,
      snapshot: rebuilt,
    });
    issueAuthorizedPayrollAccountantReport.mockResolvedValue({
      ok: true,
      access: accessOk,
      result: {
        reportId: "issued-1",
        revision: 1,
        status: "issued",
        sourceHash: rebuilt.sourceHash,
        completenessStatus: "complete",
        idempotent: true,
        auditId: null,
      },
    });

    const result = await persistPayrollAccountantOperational({
      ...auth(),
      operation: "issue",
      confirmIssue: true,
      query: {
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
        cycleId: CYCLE,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("result" in result && result.result.idempotent).toBe(true);
    expect(issueAuthorizedPayrollAccountantReport).toHaveBeenCalledTimes(1);
    expect(saveAuthorizedPayrollAccountantDraft).not.toHaveBeenCalled();
  });

  it("surfaces blocked_incomplete and forced_reason_required from persist", async () => {
    const rebuilt = snapshot();
    previewPayrollAccountantReportSnapshot.mockResolvedValue({
      ok: true,
      access: accessOk,
      datesAdjustedFromCycle: false,
      snapshot: {
        ...rebuilt,
        canIssue: false,
        completenessStatus: "blocked_incomplete",
      },
    });
    issueAuthorizedPayrollAccountantReport.mockResolvedValue({
      ok: false,
      reason: "blocked_incomplete",
    });

    const blocked = await persistPayrollAccountantOperational({
      ...auth(),
      operation: "issue",
      confirmIssue: true,
      query: {
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
        cycleId: CYCLE,
      },
    });
    expect(blocked).toEqual({ ok: false, reason: "blocked_incomplete" });

    previewPayrollAccountantReportSnapshot.mockResolvedValue({
      ok: true,
      access: accessOk,
      datesAdjustedFromCycle: false,
      snapshot: {
        ...rebuilt,
        canIssue: true,
        completenessStatus: "forced",
        payload: { ...rebuilt.payload, forceEmitReason: null },
      },
    });
    issueAuthorizedPayrollAccountantReport.mockResolvedValue({
      ok: false,
      reason: "forced_reason_required",
    });
    const missingReason = await persistPayrollAccountantOperational({
      ...auth(),
      operation: "issue",
      confirmIssue: true,
      forceEmitReason: null,
      query: {
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
        cycleId: CYCLE,
      },
    });
    expect(missingReason).toEqual({ ok: false, reason: "forced_reason_required" });
  });

  it("refuses an export by report id without company and cycle scope", async () => {
    const result = await resolvePayrollAccountantExportSnapshot({
      ...auth(),
      reportId: "report-1",
      query: {
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
      },
    });
    expect(result).toEqual({ ok: false, reason: "tenant_required" });
    expect(loadAuthorizedPayrollAccountantReport).not.toHaveBeenCalled();
  });

  it("refuses exporting a persisted report from another organization", async () => {
    loadAuthorizedPayrollAccountantReport.mockResolvedValue({
      ok: true,
      access: accessOk,
      report: {
        id: "report-1",
        organizationId: OTHER_ORG,
        organizationCompanyId: COMPANY,
        payload: snapshot().payload,
        totals: snapshot().totals,
        sourceHash: snapshot().sourceHash,
        completenessStatus: "complete",
        status: "issued",
        revision: 1,
        issuedAt: "2026-08-24T12:00:00.000Z",
      },
    });

    const result = await resolvePayrollAccountantExportSnapshot({
      ...auth(),
      reportId: "report-1",
      query: {
        organizationCompanyId: COMPANY,
        cycleId: CYCLE,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
      },
    });
    expect(result).toEqual({ ok: false, reason: "payload_tenant_mismatch" });
  });

  it("is server-only and never emails, schedules, or invents payroll rates", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/lib/horodateur-v1/payroll-accountant-operational.server.ts"
      ),
      "utf8"
    );
    expect(source).toContain('import "server-only"');
    expect(source).toContain("bindPayrollAccountantPersistSourceHash");
    expect(source).not.toContain("resend");
    expect(source).not.toContain("cron");
    expect(source).not.toMatch(/hourlyRate|salary|commission/i);
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

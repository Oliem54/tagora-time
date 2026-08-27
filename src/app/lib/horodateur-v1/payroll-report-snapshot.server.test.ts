import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1ShiftRecord,
} from "./types";

vi.mock("server-only", () => ({}));

const {
  from,
  listShiftsInWorkDateRange,
  listHorodateurEventsInWorkDateRange,
  listHorodateurExceptionsForEmployees,
  getEmployeesByIdsForRegistre,
} = vi.hoisted(() => ({
  from: vi.fn(),
  listShiftsInWorkDateRange: vi.fn(),
  listHorodateurEventsInWorkDateRange: vi.fn(),
  listHorodateurExceptionsForEmployees: vi.fn(),
  getEmployeesByIdsForRegistre: vi.fn(),
}));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ from }),
}));

vi.mock("./repository", () => ({
  listShiftsInWorkDateRange,
  listHorodateurEventsInWorkDateRange,
  listHorodateurExceptionsForEmployees,
  getEmployeesByIdsForRegistre,
}));

import { previewPayrollAccountantReportSnapshot } from "./payroll-report-snapshot.server";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const OTHER_COMPANY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CYCLE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeUser(appPermissions: string[]): User {
  return {
    id: "user-payroll-preview",
    app_metadata: { role: "direction", permissions: appPermissions },
    user_metadata: { permissions: ["horodateur_payroll_manage"] },
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

function chain(result: { data: unknown; error: unknown }) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = self;
  api.eq = self;
  api.maybeSingle = async () => result;
  return api;
}

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

function shift(
  partial?: Partial<HorodateurPhase1ShiftRecord>
): HorodateurPhase1ShiftRecord {
  return {
    id: "s1",
    employee_id: 7,
    organization_id: ORG,
    organization_company_id: COMPANY,
    work_date: "2026-08-10",
    week_start_date: "",
    company_context: "oliem_solutions",
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
    ...partial,
  };
}

function correction(): HorodateurPhase1EventRecord {
  return {
    id: "e-note",
    organization_id: ORG,
    organization_company_id: COMPANY,
    employee_id: 7,
    event_type: "correction",
    occurred_at: "2026-08-10T12:05:00.000Z",
    status: "approuve",
    work_date: "2026-08-10",
    week_start_date: "2026-08-10",
    is_manual_correction: true,
    notes: "Correction Direction",
  };
}

function exceptionRow(): HorodateurPhase1ExceptionRecord & {
  source_event: { work_date: string };
} {
  return {
    id: "x1",
    employee_id: 7,
    organization_id: ORG,
    organization_company_id: COMPANY,
    shift_id: "s1",
    source_event_id: "e-note",
    exception_type: "shift_too_long",
    reason_label: "Quart long",
    details: null,
    impact_minutes: 0,
    status: "approuve",
    requested_at: "2026-08-10T20:00:00.000Z",
    requested_by_user_id: null,
    reviewed_at: "2026-08-10T21:00:00.000Z",
    reviewed_by_user_id: null,
    review_note: null,
    approved_minutes: 0,
    source_event: { work_date: "2026-08-10" },
  };
}

function stubTenantTables(input?: {
  org?: unknown;
  company?: unknown;
  cycle?: unknown;
}) {
  from.mockImplementation((table: string) => {
    if (table === "organizations") {
      return chain({
        data:
          input?.org === undefined
            ? { id: ORG, display_name: "Oliem QA", legal_name: "Oliem Inc" }
            : input.org,
        error: null,
      });
    }
    if (table === "organization_companies") {
      return chain({
        data:
          input?.company === undefined
            ? {
                id: COMPANY,
                organization_id: ORG,
                display_name: "Oliem Solutions",
                legal_name: "Oliem Solutions Inc",
              }
            : input.company,
        error: null,
      });
    }
    if (table === "horodateur_payroll_cycles") {
      return chain({
        data:
          input?.cycle === undefined
            ? {
                id: CYCLE,
                organization_id: ORG,
                organization_company_id: COMPANY,
                period_start: "2026-08-10",
                period_end: "2026-08-23",
                timezone: "America/Toronto",
                kind: "recurring",
              }
            : input.cycle,
        error: null,
      });
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("previewPayrollAccountantReportSnapshot", () => {
  beforeEach(() => {
    from.mockReset();
    listShiftsInWorkDateRange.mockReset();
    listHorodateurEventsInWorkDateRange.mockReset();
    listHorodateurExceptionsForEmployees.mockReset();
    getEmployeesByIdsForRegistre.mockReset();
    stubTenantTables();
    listShiftsInWorkDateRange.mockResolvedValue([shift()]);
    listHorodateurEventsInWorkDateRange.mockResolvedValue([correction()]);
    listHorodateurExceptionsForEmployees.mockResolvedValue([exceptionRow()]);
    getEmployeesByIdsForRegistre.mockResolvedValue([profile()]);
  });

  it("builds a read-only snapshot from the registre without writing payroll rows", async () => {
    const result = await previewPayrollAccountantReportSnapshot({
      user: makeUser(["horodateur_payroll_read"]),
      membership: { role: "direction", status: "active" },
      membershipOrganizationId: ORG,
      query: {
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.payload.organizationId).toBe(ORG);
    expect(result.snapshot.payload.organizationCompanyId).toBe(COMPANY);
    expect(result.snapshot.payload.organizationName).toBe("Oliem QA");
    expect(result.snapshot.payload.organizationCompanyName).toBe(
      "Oliem Solutions"
    );
    expect(result.snapshot.payload.cycleId).toBeNull();
    expect(result.snapshot.payload.employees[0]?.totals.unpaidLunchMinutes).toBe(
      30
    );
    expect(result.snapshot.payload.employees[0]?.weeks[0]?.days[0]?.corrections).toEqual(
      [{ id: "e-note", notes: "Correction Direction" }]
    );
    expect(result.snapshot.payload.employees[0]?.exceptions).toHaveLength(1);
    expect(listShiftsInWorkDateRange).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        organizationCompanyId: COMPANY,
        startWorkDate: "2026-08-10",
        endWorkDate: "2026-08-23",
      })
    );
    expect(from).not.toHaveBeenCalledWith("horodateur_payroll_reports");
  });

  it("loads an optional cycle then lets request dates win", async () => {
    const result = await previewPayrollAccountantReportSnapshot({
      user: makeUser(["horodateur_payroll_read"]),
      membership: { role: "direction", status: "active" },
      membershipOrganizationId: ORG,
      query: {
        organizationCompanyId: COMPANY,
        cycleId: CYCLE,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-16",
        timezone: "America/Toronto",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.datesAdjustedFromCycle).toBe(true);
    expect(result.snapshot.payload.cycleId).toBe(CYCLE);
    expect(result.snapshot.payload.periodEnd).toBe("2026-08-16");
    expect(from).toHaveBeenCalledWith("horodateur_payroll_cycles");
  });

  it("is deterministic for the same registre window", async () => {
    const query = {
      organizationCompanyId: COMPANY,
      periodStart: "2026-08-10",
      periodEnd: "2026-08-23",
      timezone: "America/Toronto",
    };
    const a = await previewPayrollAccountantReportSnapshot({
      user: makeUser(["horodateur_payroll_read"]),
      membership: { role: "direction", status: "active" },
      membershipOrganizationId: ORG,
      query,
    });
    const b = await previewPayrollAccountantReportSnapshot({
      user: makeUser(["horodateur_payroll_read"]),
      membership: { role: "direction", status: "active" },
      membershipOrganizationId: ORG,
      query,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.snapshot.sourceHash).toBe(b.snapshot.sourceHash);
    expect(JSON.stringify(a.snapshot.payload)).toBe(
      JSON.stringify(b.snapshot.payload)
    );
  });

  it("fail-closes on a company outside the membership organization", async () => {
    stubTenantTables({ company: null });
    const result = await previewPayrollAccountantReportSnapshot({
      user: makeUser(["horodateur_payroll_read"]),
      membership: { role: "direction", status: "active" },
      membershipOrganizationId: ORG,
      query: {
        organizationCompanyId: OTHER_COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("reason" in result && result.reason).toBe("company_tenant_mismatch");
    expect(listShiftsInWorkDateRange).not.toHaveBeenCalled();
  });

  it("fail-closes on a cycle from another tenant", async () => {
    stubTenantTables({ cycle: null });
    const result = await previewPayrollAccountantReportSnapshot({
      user: makeUser(["horodateur_payroll_read"]),
      membership: { role: "direction", status: "active" },
      membershipOrganizationId: ORG,
      query: {
        organizationCompanyId: COMPANY,
        cycleId: CYCLE,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("reason" in result && result.reason).toBe("cycle_tenant_mismatch");
  });

  it("rejects a browser organization id that does not match membership", async () => {
    const result = await previewPayrollAccountantReportSnapshot({
      user: makeUser(["horodateur_payroll_read"]),
      membership: { role: "direction", status: "active" },
      membershipOrganizationId: ORG,
      query: {
        organizationId: OTHER_ORG,
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
        untrustedBrowserOrganizationId: OTHER_ORG,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("reason" in result && result.reason).toBe(
      "browser_organization_rejected"
    );
    expect(listShiftsInWorkDateRange).not.toHaveBeenCalled();
  });

  it("ignores user_metadata payroll permissions", async () => {
    const result = await previewPayrollAccountantReportSnapshot({
      user: makeUser(["terrain"]),
      membership: { role: "direction", status: "active" },
      membershipOrganizationId: ORG,
      query: {
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("access" in result && result.access?.reason).toBe(
      "payroll_permission_missing"
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("throws when the registre returns a foreign-organization shift", async () => {
    listShiftsInWorkDateRange.mockResolvedValue([
      shift({ organization_id: OTHER_ORG }),
    ]);
    await expect(
      previewPayrollAccountantReportSnapshot({
        user: makeUser(["horodateur_payroll_read"]),
        membership: { role: "direction", status: "active" },
        membershipOrganizationId: ORG,
        query: {
          organizationCompanyId: COMPANY,
          periodStart: "2026-08-10",
          periodEnd: "2026-08-23",
          timezone: "America/Toronto",
        },
      })
    ).rejects.toThrow(/hors organisation/);
  });

  it("does not mention persist, email, files, or a scheduler", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/lib/horodateur-v1/payroll-report-snapshot.server.ts"
      ),
      "utf8"
    );
    expect(source).toContain('import "server-only"');
    expect(source).toContain("void input.user?.user_metadata");
    expect(source).not.toContain("PAYROLL_ACCOUNTANT_PERSIST_RPC");
    expect(source).not.toContain("horodateur_payroll_reports");
    expect(source).not.toContain("resend");
    expect(source).not.toContain("cron");
    expect(source).not.toContain(".pdf");
    expect(source).not.toContain("xlsx");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

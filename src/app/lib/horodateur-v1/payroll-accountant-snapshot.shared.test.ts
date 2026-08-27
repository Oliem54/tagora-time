import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1ShiftRecord,
} from "./types";

vi.mock("server-only", () => ({}));

import { buildAuthorizedPayrollAccountantSnapshot } from "./payroll-accountant-snapshot.server";
import {
  PAYROLL_ACCOUNTANT_SNAPSHOT_SCHEMA,
  addUtcDays,
  buildPayrollAccountantSnapshot,
  defaultBiweeklyPayrollPeriod,
  isRecurringFourteenDayPeriod,
  planPayrollAccountantReportWrite,
  refuseIssuedReportMutation,
} from "./payroll-accountant-snapshot.shared";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const OTHER_COMPANY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CYCLE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const TENANT = {
  organizationId: ORG,
  organizationCompanyId: COMPANY,
  cycleId: CYCLE,
  timezone: "America/Toronto",
  periodStart: "2026-08-10",
  periodEnd: "2026-08-23",
  cycleKind: "recurring" as const,
};

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

function makeUser(appPermissions: string[]): User {
  return {
    id: "user-payroll-snapshot",
    app_metadata: { role: "direction", permissions: appPermissions },
    user_metadata: { permissions: ["horodateur_payroll_manage"] },
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

describe("payroll accountant server snapshot", () => {
  it("accepts the official 14-day inclusive recurring span", () => {
    expect(isRecurringFourteenDayPeriod("2026-08-10", "2026-08-23")).toBe(true);
    expect(addUtcDays("2026-08-10", 13)).toBe("2026-08-23");
    expect(isRecurringFourteenDayPeriod("2026-08-10", "2026-08-24")).toBe(false);
  });

  it("defaults the operational window to an inclusive 14-day period ending today", () => {
    const period = defaultBiweeklyPayrollPeriod("2026-08-27");
    expect(period).toEqual({
      periodStart: "2026-08-14",
      periodEnd: "2026-08-27",
    });
    expect(isRecurringFourteenDayPeriod(period.periodStart, period.periodEnd)).toBe(
      true
    );
  });

  it("groups by employee and week with daily punch, breaks, regular and overtime", () => {
    const weekShifts = [
      shift({ id: "s1", work_date: "2026-08-10", payable_minutes: 480, worked_minutes: 480 }),
      shift({ id: "s2", work_date: "2026-08-11", payable_minutes: 480, worked_minutes: 480 }),
      shift({ id: "s3", work_date: "2026-08-12", payable_minutes: 480, worked_minutes: 480 }),
      shift({ id: "s4", work_date: "2026-08-13", payable_minutes: 480, worked_minutes: 480 }),
      shift({ id: "s5", work_date: "2026-08-14", payable_minutes: 600, worked_minutes: 600 }),
    ];
    const snapshot = buildPayrollAccountantSnapshot({
      tenant: TENANT,
      profiles: [profile()],
      shifts: weekShifts,
      events: [
        {
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
        } satisfies HorodateurPhase1EventRecord,
      ],
      exceptions: [
        {
          id: "x1",
          employee_id: 7,
          organization_id: ORG,
          organization_company_id: COMPANY,
          shift_id: "s5",
          source_event_id: "e-note",
          exception_type: "shift_too_long",
          reason_label: "Quart long",
          details: null,
          impact_minutes: 0,
          status: "approuve",
          requested_at: "2026-08-14T20:00:00.000Z",
          requested_by_user_id: null,
          reviewed_at: "2026-08-14T21:00:00.000Z",
          reviewed_by_user_id: null,
          review_note: null,
          approved_minutes: 0,
        } satisfies HorodateurPhase1ExceptionRecord,
      ],
    });

    expect(snapshot.payload.schema).toBe(PAYROLL_ACCOUNTANT_SNAPSHOT_SCHEMA);
    expect(snapshot.completenessStatus).toBe("complete");
    expect(snapshot.canIssue).toBe(true);
    expect(snapshot.payload.employees).toHaveLength(1);
    const employee = snapshot.payload.employees[0];
    expect(employee.weeks.length).toBeGreaterThanOrEqual(1);
    const firstWeek = employee.weeks[0];
    expect(firstWeek.days[0]?.punchInAt).toContain("2026-08-10");
    expect(firstWeek.days[0]?.corrections[0]?.notes).toBe("Correction Direction");
    expect(employee.totals.regularMinutes).toBe(2400);
    expect(employee.totals.overtimeMinutes).toBe(120);
    expect(firstWeek.days[4]?.overtimeMinutes).toBe(120);
    expect(firstWeek.days[0]?.punchOutAt).toContain("2026-08-10");
    expect(firstWeek.days[0]?.unpaidBreakMinutes).toBe(15);
    expect(firstWeek.days[0]?.unpaidLunchMinutes).toBe(30);
    expect(employee.totals.paidBreakMinutes).toBe(0);
    expect(employee.totals.unpaidBreakMinutes).toBe(75);
    expect(employee.totals.unpaidLunchMinutes).toBe(150);
    expect(firstWeek.unpaidBreakMinutes).toBe(75);
    expect(firstWeek.unpaidLunchMinutes).toBe(150);
    expect(snapshot.totals.payableMinutes).toBe(2520);
    expect(snapshot.totals.unpaidBreakMinutes).toBe(75);
    expect(snapshot.totals.unpaidLunchMinutes).toBe(150);
    expect(employee.exceptions).toHaveLength(1);
  });

  it("blocks incomplete punches unless a force-emit reason is supplied", () => {
    const incomplete = buildPayrollAccountantSnapshot({
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
    });
    expect(incomplete.completenessStatus).toBe("blocked_incomplete");
    expect(incomplete.canIssue).toBe(false);
    expect(incomplete.payload.hadIncompleteSources).toBe(true);
    expect(incomplete.payload.forceEmitReason).toBeNull();

    const forced = buildPayrollAccountantSnapshot({
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
      forceEmitReason: "Cloture comptable exceptionnelle",
    });
    expect(forced.completenessStatus).toBe("forced");
    expect(forced.canIssue).toBe(true);
    expect(forced.payload.hadIncompleteSources).toBe(true);
    expect(forced.payload.employees[0]?.flags.incomplet).toBe(true);
    expect(forced.payload.forceEmitReason).toBe("Cloture comptable exceptionnelle");
  });

  it("changes source_hash when punch times change", () => {
    const base = {
      tenant: TENANT,
      profiles: [profile()],
      events: [] as HorodateurPhase1EventRecord[],
      exceptions: [] as HorodateurPhase1ExceptionRecord[],
    };
    const a = buildPayrollAccountantSnapshot({
      ...base,
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
    });
    const b = buildPayrollAccountantSnapshot({
      ...base,
      shifts: [
        shift({
          id: "s1",
          work_date: "2026-08-10",
          shift_start_at: "2026-08-10T12:15:00.000Z",
        }),
      ],
    });
    expect(a.sourceHash).not.toBe(b.sourceHash);
    expect(a.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fail-closes on foreign organization rows", () => {
    expect(() =>
      buildPayrollAccountantSnapshot({
        tenant: TENANT,
        profiles: [profile()],
        shifts: [
          shift({
            id: "leak",
            work_date: "2026-08-10",
            organization_id: OTHER_ORG,
          }),
        ],
        events: [],
        exceptions: [],
      })
    ).toThrow(/hors organisation/);
  });

  it("accepts sources bound to the requested organization and company", () => {
    const snapshot = buildPayrollAccountantSnapshot({
      tenant: TENANT,
      profiles: [profile()],
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
      events: [],
      exceptions: [],
    });
    expect(snapshot.payload.organizationId).toBe(ORG);
    expect(snapshot.payload.organizationCompanyId).toBe(COMPANY);
    expect(snapshot.payload.employees).toHaveLength(1);
  });

  it("rejects another company in the same organization", () => {
    expect(() =>
      buildPayrollAccountantSnapshot({
        tenant: TENANT,
        profiles: [profile()],
        shifts: [
          shift({
            id: "other-co",
            work_date: "2026-08-10",
            organization_company_id: OTHER_COMPANY,
          }),
        ],
        events: [],
        exceptions: [],
      })
    ).toThrow(/hors compagnie/);
  });

  it("rejects a source missing organization_company_id", () => {
    expect(() =>
      buildPayrollAccountantSnapshot({
        tenant: TENANT,
        profiles: [profile()],
        shifts: [
          shift({
            id: "no-co",
            work_date: "2026-08-10",
            organization_company_id: "",
          }),
        ],
        events: [],
        exceptions: [],
      })
    ).toThrow(/organization_company_id absent/);
  });

  it("keeps forceEmitReason on the serialized payload and in the hash", () => {
    const base = {
      tenant: TENANT,
      profiles: [profile()],
      shifts: [
        shift({
          id: "open",
          work_date: "2026-08-10",
          shift_end_at: null,
          status: "ouvert" as const,
        }),
      ],
      events: [] as HorodateurPhase1EventRecord[],
      exceptions: [] as HorodateurPhase1ExceptionRecord[],
    };
    const forced = buildPayrollAccountantSnapshot({
      ...base,
      forceEmitReason: "Cloture comptable exceptionnelle",
    });
    const serialized = JSON.stringify(forced.payload);
    expect(serialized).toContain("Cloture comptable exceptionnelle");
    expect(forced.payload.completenessStatus).toBe("forced");
    expect(forced.payload.hadIncompleteSources).toBe(true);

    const otherReason = buildPayrollAccountantSnapshot({
      ...base,
      forceEmitReason: "Autre motif",
    });
    expect(otherReason.sourceHash).not.toBe(forced.sourceHash);
  });

  it("does not attach a fake force reason to a complete snapshot", () => {
    const snapshot = buildPayrollAccountantSnapshot({
      tenant: TENANT,
      profiles: [profile()],
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
      events: [],
      exceptions: [],
      forceEmitReason: "ne doit pas apparaitre",
    });
    expect(snapshot.completenessStatus).toBe("complete");
    expect(snapshot.payload.forceEmitReason).toBeNull();
    expect(JSON.stringify(snapshot.payload)).not.toContain("ne doit pas apparaitre");
  });

  it("accepts an optional cycle and keeps names on the payload", () => {
    const snapshot = buildPayrollAccountantSnapshot({
      tenant: {
        ...TENANT,
        cycleId: null,
        cycleKind: undefined,
        organizationName: "Oliem QA",
        organizationCompanyName: "Oliem Solutions",
      },
      profiles: [profile()],
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
      events: [],
      exceptions: [],
    });
    expect(snapshot.payload.cycleId).toBeNull();
    expect(snapshot.payload.organizationName).toBe("Oliem QA");
    expect(snapshot.payload.organizationCompanyName).toBe("Oliem Solutions");
  });

  it("rejects a blank cycle id", () => {
    expect(() =>
      buildPayrollAccountantSnapshot({
        tenant: { ...TENANT, cycleId: "   " },
        profiles: [profile()],
        shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
        events: [],
        exceptions: [],
      })
    ).toThrow(/cycle_id invalide/);
  });

  it("changes source_hash when break minutes change", () => {
    const base = {
      tenant: TENANT,
      profiles: [profile()],
      events: [] as HorodateurPhase1EventRecord[],
      exceptions: [] as HorodateurPhase1ExceptionRecord[],
    };
    const a = buildPayrollAccountantSnapshot({
      ...base,
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
    });
    const b = buildPayrollAccountantSnapshot({
      ...base,
      shifts: [
        shift({
          id: "s1",
          work_date: "2026-08-10",
          paid_break_minutes: 20,
        }),
      ],
    });
    expect(a.sourceHash).not.toBe(b.sourceHash);
    expect(b.payload.employees[0]?.totals.paidBreakMinutes).toBe(20);
  });

  it("is deterministic for the same sources", () => {
    const input = {
      tenant: TENANT,
      profiles: [profile()],
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
      events: [] as HorodateurPhase1EventRecord[],
      exceptions: [] as HorodateurPhase1ExceptionRecord[],
    };
    const a = buildPayrollAccountantSnapshot(input);
    const b = buildPayrollAccountantSnapshot(input);
    expect(a.sourceHash).toBe(b.sourceHash);
    expect(JSON.stringify(a.payload)).toBe(JSON.stringify(b.payload));
  });

  it("ignores user_metadata company and rejects a mismatched browser company id", () => {
    const user = makeUser(["horodateur_payroll_read"]);
    user.user_metadata = {
      permissions: ["horodateur_payroll_manage"],
      organization_company_id: OTHER_COMPANY,
    };
    const allowed = buildAuthorizedPayrollAccountantSnapshot({
      user,
      membership: { role: "direction", status: "active" },
      tenant: TENANT,
      untrustedBrowserOrganizationCompanyId: OTHER_COMPANY,
      profiles: [profile()],
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
      events: [],
      exceptions: [],
    });
    expect(allowed.ok).toBe(false);
    if (!allowed.ok) {
      expect(allowed.access.reason).toBe("browser_company_rejected");
    }

    const serverTenant = buildAuthorizedPayrollAccountantSnapshot({
      user,
      membership: { role: "direction", status: "active" },
      tenant: TENANT,
      profiles: [profile()],
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
      events: [],
      exceptions: [],
    });
    expect(serverTenant.ok).toBe(true);
    if (serverTenant.ok) {
      expect(serverTenant.snapshot.payload.organizationCompanyId).toBe(COMPANY);
    }
  });

  it("plans draft upsert and issued insert without mutating issued rows", () => {
    const snapshot = buildPayrollAccountantSnapshot({
      tenant: TENANT,
      profiles: [profile()],
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
      events: [],
      exceptions: [],
    });

    const draftPlan = planPayrollAccountantReportWrite({
      snapshot,
      intent: "draft",
      existingReports: [],
      issuedBy: "user-payroll-snapshot",
      issuedByKind: "user",
    });
    expect(draftPlan.ok).toBe(true);
    if (draftPlan.ok) {
      expect(draftPlan.operation).toBe("insert");
      expect(draftPlan.row.status).toBe("draft");
      expect(draftPlan.mutatesIssued).toBe(false);
    }

    const issuedExisting = {
      id: "issued-1",
      revision: 1,
      status: "issued" as const,
      cycleId: CYCLE,
      organizationId: ORG,
      organizationCompanyId: COMPANY,
    };
    expect(refuseIssuedReportMutation(issuedExisting).ok).toBe(false);

    const issuePlan = planPayrollAccountantReportWrite({
      snapshot,
      intent: "issue",
      existingReports: [issuedExisting],
      issuedBy: "user-payroll-snapshot",
      issuedByKind: "user",
    });
    expect(issuePlan.ok).toBe(true);
    if (issuePlan.ok) {
      expect(issuePlan.operation).toBe("insert");
      expect(issuePlan.row.revision).toBe(2);
      expect(issuePlan.row.status).toBe("issued");
    }
  });

  it("refuses issue when the snapshot is blocked", () => {
    const snapshot = buildPayrollAccountantSnapshot({
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
    });
    const plan = planPayrollAccountantReportWrite({
      snapshot,
      intent: "issue",
      existingReports: [],
      issuedBy: null,
      issuedByKind: "user",
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toBe("blocked_incomplete");
    }
  });

  it("requires payroll read and ignores user_metadata", () => {
    const denied = buildAuthorizedPayrollAccountantSnapshot({
      user: makeUser(["terrain"]),
      membership: { role: "direction", status: "active" },
      tenant: TENANT,
      profiles: [profile()],
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
      events: [],
      exceptions: [],
    });
    expect(denied.ok).toBe(false);

    const allowed = buildAuthorizedPayrollAccountantSnapshot({
      user: makeUser(["horodateur_payroll_read"]),
      membership: { role: "direction", status: "active" },
      tenant: TENANT,
      profiles: [profile()],
      shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
      events: [],
      exceptions: [],
    });
    expect(allowed.ok).toBe(true);
  });

  it("does not open a database client or mention email delivery", () => {
    const shared = readFileSync(
      join(process.cwd(), "src/app/lib/horodateur-v1/payroll-accountant-snapshot.shared.ts"),
      "utf8"
    );
    const server = readFileSync(
      join(process.cwd(), "src/app/lib/horodateur-v1/payroll-accountant-snapshot.server.ts"),
      "utf8"
    );
    for (const source of [shared, server]) {
      expect(source).not.toContain("createAdminSupabaseClient");
      expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(source).not.toContain("resend");
      expect(source).not.toContain("cron");
      expect(source).not.toContain('.from("horodateur_payroll_reports")');
    }
    expect(server).toContain('import "server-only"');
  });
});

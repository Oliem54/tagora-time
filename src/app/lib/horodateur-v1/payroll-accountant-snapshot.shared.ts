import { createHash } from "node:crypto";
import { HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS, getWeekStartDate } from "./rules";
import {
  aggregateOvertimeForEmployee,
  computeRegistreRowFlags,
  shiftBreakTotal,
} from "./registre-aggregations.shared";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1ShiftRecord,
} from "./types";

export const PAYROLL_ACCOUNTANT_SNAPSHOT_SCHEMA =
  "horora.payroll.accountant.snapshot.v1" as const;

export const PAYROLL_RECURRING_INTERVAL_DAYS = 14;

export type PayrollCompletenessStatus =
  | "complete"
  | "blocked_incomplete"
  | "forced";

export type PayrollReportWriteIntent = "draft" | "issue";

export type PayrollAccountantSnapshotTenant = {
  organizationId: string;
  organizationCompanyId: string;
  cycleId: string;
  timezone: string;
  periodStart: string;
  periodEnd: string;
  cycleKind?: "recurring" | "exceptional";
};

export type PayrollAccountantDayEntry = {
  workDate: string;
  punchInAt: string | null;
  punchOutAt: string | null;
  workedMinutes: number;
  payableMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  paidBreakMinutes: number;
  unpaidBreakMinutes: number;
  unpaidLunchMinutes: number;
  hasIncompletePunch: boolean;
  corrections: Array<{ id: string; notes: string | null }>;
  notes: string[];
};

export type PayrollAccountantWeekGroup = {
  weekStart: string;
  weekEnd: string;
  regularMinutes: number;
  overtimeMinutes: number;
  payableMinutes: number;
  days: PayrollAccountantDayEntry[];
};

export type PayrollAccountantEmployeeGroup = {
  employeeId: number;
  employeeName: string | null;
  flags: ReturnType<typeof computeRegistreRowFlags>;
  weeks: PayrollAccountantWeekGroup[];
  totals: {
    workedMinutes: number;
    payableMinutes: number;
    regularMinutes: number;
    overtimeMinutes: number;
    breakMinutes: number;
  };
  exceptions: Array<{
    id: string;
    exceptionType: string;
    reasonLabel: string;
    details: string | null;
    impactMinutes: number;
    status: string;
  }>;
};

export type PayrollAccountantSnapshotPayload = {
  schema: typeof PAYROLL_ACCOUNTANT_SNAPSHOT_SCHEMA;
  organizationId: string;
  organizationCompanyId: string;
  cycleId: string;
  timezone: string;
  periodStart: string;
  periodEnd: string;
  completenessStatus: PayrollCompletenessStatus;
  hadIncompleteSources: boolean;
  forceEmitReason: string | null;
  employees: PayrollAccountantEmployeeGroup[];
  companyTotals: {
    workedMinutes: number;
    payableMinutes: number;
    regularMinutes: number;
    overtimeMinutes: number;
    employeeCount: number;
  };
};

export type PayrollAccountantSnapshotResult = {
  payload: PayrollAccountantSnapshotPayload;
  totals: PayrollAccountantSnapshotPayload["companyTotals"];
  sourceHash: string;
  completenessStatus: PayrollCompletenessStatus;
  canIssue: boolean;
};

export type ExistingPayrollReportRow = {
  id: string;
  revision: number;
  status: "draft" | "issued";
  cycleId: string;
  organizationId: string;
  organizationCompanyId: string;
};

function isoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function addUtcDays(iso: string, days: number) {
  const probe = new Date(`${iso}T12:00:00.000Z`);
  probe.setUTCDate(probe.getUTCDate() + days);
  return probe.toISOString().slice(0, 10);
}

export function inclusiveDayCount(periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T12:00:00.000Z`).getTime();
  const end = new Date(`${periodEnd}T12:00:00.000Z`).getTime();
  return Math.round((end - start) / 86400000) + 1;
}

export function isRecurringFourteenDayPeriod(
  periodStart: string,
  periodEnd: string
) {
  return (
    isoDate(periodStart) &&
    isoDate(periodEnd) &&
    periodEnd === addUtcDays(periodStart, PAYROLL_RECURRING_INTERVAL_DAYS - 1)
  );
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          stableJson((value as Record<string, unknown>)[key]),
        ])
    );
  }
  return value;
}

export function hashPayrollSnapshotSource(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableJson(value)))
    .digest("hex");
}

function assertTenant(tenant: PayrollAccountantSnapshotTenant) {
  if (!tenant.organizationId.trim()) {
    throw new Error("organization_id obligatoire.");
  }
  if (!tenant.organizationCompanyId.trim()) {
    throw new Error("organization_company_id obligatoire.");
  }
  if (!tenant.cycleId.trim()) {
    throw new Error("cycle_id obligatoire.");
  }
  if (!tenant.timezone.trim()) {
    throw new Error("timezone obligatoire.");
  }
  if (!isoDate(tenant.periodStart) || !isoDate(tenant.periodEnd)) {
    throw new Error("periode invalide.");
  }
  if (tenant.periodStart > tenant.periodEnd) {
    throw new Error("periode invalide: debut apres fin.");
  }
  if (
    tenant.cycleKind === "recurring" &&
    !isRecurringFourteenDayPeriod(tenant.periodStart, tenant.periodEnd)
  ) {
    throw new Error("cycle recurrent: exactement 14 jours inclusifs.");
  }
}

function rejectUnscopedTenantRow<
  T extends {
    organization_id?: string | null;
    organization_company_id?: string | null;
  },
>(
  rows: T[],
  organizationId: string,
  organizationCompanyId: string,
  label: string
) {
  for (const row of rows) {
    const orgId = (row.organization_id ?? "").trim();
    const companyId = (row.organization_company_id ?? "").trim();
    if (!orgId) {
      throw new Error(`isolation tenant: ${label} organization_id absent.`);
    }
    if (orgId !== organizationId) {
      throw new Error(`isolation tenant: ${label} hors organisation.`);
    }
    if (!companyId) {
      throw new Error(
        `isolation tenant: ${label} organization_company_id absent.`
      );
    }
    if (companyId !== organizationCompanyId) {
      throw new Error(`isolation tenant: ${label} hors compagnie.`);
    }
  }
  return rows;
}

function rejectUnscopedProfiles(
  profiles: HorodateurPhase1EmployeeProfile[],
  organizationId: string,
  organizationCompanyId: string
) {
  for (const profile of profiles) {
    const orgId = (profile.organizationId ?? "").trim();
    const companyId = (profile.organizationCompanyId ?? "").trim();
    if (!orgId) {
      throw new Error("isolation tenant: profile organization_id absent.");
    }
    if (orgId !== organizationId) {
      throw new Error("isolation tenant: profile hors organisation.");
    }
    if (!companyId) {
      throw new Error(
        "isolation tenant: profile organization_company_id absent."
      );
    }
    if (companyId !== organizationCompanyId) {
      throw new Error("isolation tenant: profile hors compagnie.");
    }
  }
  return profiles;
}

function eventNote(event: HorodateurPhase1EventRecord) {
  return event.notes ?? event.note ?? null;
}

function allocateWeeklyRegularOvertime(
  days: Array<{ workDate: string; payableMinutes: number }>,
  weeklyTargetMinutes: number
) {
  let remainingRegular = weeklyTargetMinutes;
  return days.map((day) => {
    const payable = Math.max(0, day.payableMinutes);
    const regularMinutes = Math.min(payable, remainingRegular);
    remainingRegular -= regularMinutes;
    return {
      workDate: day.workDate,
      regularMinutes,
      overtimeMinutes: payable - regularMinutes,
    };
  });
}

export function buildPayrollAccountantSnapshot(input: {
  tenant: PayrollAccountantSnapshotTenant;
  profiles: HorodateurPhase1EmployeeProfile[];
  shifts: HorodateurPhase1ShiftRecord[];
  events: HorodateurPhase1EventRecord[];
  exceptions: HorodateurPhase1ExceptionRecord[];
  forceEmitReason?: string | null;
}): PayrollAccountantSnapshotResult {
  assertTenant(input.tenant);

  const shifts = rejectUnscopedTenantRow(
    input.shifts,
    input.tenant.organizationId,
    input.tenant.organizationCompanyId,
    "shift"
  );
  const events = rejectUnscopedTenantRow(
    input.events,
    input.tenant.organizationId,
    input.tenant.organizationCompanyId,
    "event"
  );
  const exceptions = rejectUnscopedTenantRow(
    input.exceptions,
    input.tenant.organizationId,
    input.tenant.organizationCompanyId,
    "exception"
  );
  const profiles = rejectUnscopedProfiles(
    input.profiles,
    input.tenant.organizationId,
    input.tenant.organizationCompanyId
  );

  const profileById = new Map(profiles.map((p) => [p.employeeId, p]));
  const employeeIds = Array.from(
    new Set([
      ...shifts.map((s) => s.employee_id),
      ...events.map((e) => e.employee_id),
    ])
  ).sort((a, b) => a - b);

  const employees: PayrollAccountantEmployeeGroup[] = [];
  let blocked = false;

  for (const employeeId of employeeIds) {
    const empShifts = shifts
      .filter((s) => s.employee_id === employeeId)
      .sort((a, b) => a.work_date.localeCompare(b.work_date));
    const empEvents = events.filter((e) => e.employee_id === employeeId);
    const empExceptions = exceptions.filter((x) => x.employee_id === employeeId);
    if (empShifts.length === 0 && empEvents.length === 0) {
      continue;
    }

    const profile = profileById.get(employeeId);
    const flags = computeRegistreRowFlags({
      shifts: empShifts,
      events: empEvents,
      exceptions: empExceptions,
    });
    if (flags.incomplet || flags.en_attente) {
      blocked = true;
    }

    const overtime = aggregateOvertimeForEmployee(empShifts, profile);
    const weeklyTargetMinutes = Math.max(
      1,
      Math.round((profile?.plannedWeeklyHours ?? HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS) * 60)
    );

    const weeksMap = new Map<string, HorodateurPhase1ShiftRecord[]>();
    for (const shift of empShifts) {
      const weekStart =
        shift.week_start_date?.trim() ||
        getWeekStartDate(`${shift.work_date}T12:00:00`);
      const list = weeksMap.get(weekStart) ?? [];
      list.push(shift);
      weeksMap.set(weekStart, list);
    }

    const weeks: PayrollAccountantWeekGroup[] = Array.from(weeksMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, weekShifts]) => {
        const weekEnd = addUtcDays(weekStart, 6);
        const byDate = new Map<string, HorodateurPhase1ShiftRecord[]>();
        for (const shift of weekShifts) {
          const list = byDate.get(shift.work_date) ?? [];
          list.push(shift);
          byDate.set(shift.work_date, list);
        }
        const dayPayable = Array.from(byDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([workDate, dayShifts]) => ({
            workDate,
            payableMinutes: dayShifts.reduce(
              (sum, shift) => sum + Math.max(0, shift.payable_minutes ?? 0),
              0
            ),
          }));
        const allocation = allocateWeeklyRegularOvertime(
          dayPayable,
          weeklyTargetMinutes
        );
        const allocationByDate = new Map(
          allocation.map((row) => [row.workDate, row])
        );

        const days: PayrollAccountantDayEntry[] = dayPayable.map((day) => {
          const dayShifts = byDate.get(day.workDate) ?? [];
          const first = dayShifts[0];
          const last = dayShifts[dayShifts.length - 1];
          const dayEvents = empEvents.filter((event) => event.work_date === day.workDate);
          const split = allocationByDate.get(day.workDate) ?? {
            regularMinutes: 0,
            overtimeMinutes: 0,
          };
          return {
            workDate: day.workDate,
            punchInAt: first?.shift_start_at ?? null,
            punchOutAt: last?.shift_end_at ?? null,
            workedMinutes: dayShifts.reduce(
              (sum, shift) => sum + Math.max(0, shift.worked_minutes ?? 0),
              0
            ),
            payableMinutes: day.payableMinutes,
            regularMinutes: split.regularMinutes,
            overtimeMinutes: split.overtimeMinutes,
            paidBreakMinutes: dayShifts.reduce(
              (sum, shift) => sum + (shift.paid_break_minutes ?? 0),
              0
            ),
            unpaidBreakMinutes: dayShifts.reduce(
              (sum, shift) => sum + (shift.unpaid_break_minutes ?? 0),
              0
            ),
            unpaidLunchMinutes: dayShifts.reduce(
              (sum, shift) => sum + (shift.unpaid_lunch_minutes ?? 0),
              0
            ),
            hasIncompletePunch: dayShifts.some(
              (shift) => !shift.shift_end_at || shift.status === "ouvert"
            ),
            corrections: dayEvents
              .filter(
                (event) =>
                  event.event_type === "correction" ||
                  event.is_manual_correction === true
              )
              .map((event) => ({ id: event.id, notes: eventNote(event) })),
            notes: dayEvents
              .map((event) => eventNote(event))
              .filter((note): note is string => Boolean(note && note.trim())),
          };
        });

        return {
          weekStart,
          weekEnd:
            weekEnd < input.tenant.periodEnd ? weekEnd : input.tenant.periodEnd,
          regularMinutes: days.reduce((sum, day) => sum + day.regularMinutes, 0),
          overtimeMinutes: days.reduce((sum, day) => sum + day.overtimeMinutes, 0),
          payableMinutes: days.reduce((sum, day) => sum + day.payableMinutes, 0),
          days,
        };
      });

    employees.push({
      employeeId,
      employeeName: profile?.fullName ?? null,
      flags,
      weeks,
      totals: {
        workedMinutes: empShifts.reduce(
          (sum, shift) => sum + Math.max(0, shift.worked_minutes ?? 0),
          0
        ),
        payableMinutes: empShifts.reduce(
          (sum, shift) => sum + Math.max(0, shift.payable_minutes ?? 0),
          0
        ),
        regularMinutes: overtime.normal,
        overtimeMinutes: overtime.overtime,
        breakMinutes: empShifts.reduce((sum, shift) => sum + shiftBreakTotal(shift), 0),
      },
      exceptions: empExceptions.map((item) => ({
        id: item.id,
        exceptionType: item.exception_type,
        reasonLabel: item.reason_label,
        details: item.details,
        impactMinutes: item.impact_minutes ?? 0,
        status: item.status,
      })),
    });
  }

  employees.sort((a, b) =>
    String(a.employeeName ?? a.employeeId).localeCompare(
      String(b.employeeName ?? b.employeeId),
      "fr-CA"
    )
  );

  const companyTotals = {
    workedMinutes: employees.reduce((sum, row) => sum + row.totals.workedMinutes, 0),
    payableMinutes: employees.reduce((sum, row) => sum + row.totals.payableMinutes, 0),
    regularMinutes: employees.reduce((sum, row) => sum + row.totals.regularMinutes, 0),
    overtimeMinutes: employees.reduce((sum, row) => sum + row.totals.overtimeMinutes, 0),
    employeeCount: employees.length,
  };

  const requestedForceReason = (input.forceEmitReason ?? "").trim();
  const completenessStatus: PayrollCompletenessStatus = blocked
    ? requestedForceReason
      ? "forced"
      : "blocked_incomplete"
    : "complete";
  const forceEmitReason =
    completenessStatus === "forced" ? requestedForceReason : null;

  const payload: PayrollAccountantSnapshotPayload = {
    schema: PAYROLL_ACCOUNTANT_SNAPSHOT_SCHEMA,
    organizationId: input.tenant.organizationId,
    organizationCompanyId: input.tenant.organizationCompanyId,
    cycleId: input.tenant.cycleId,
    timezone: input.tenant.timezone,
    periodStart: input.tenant.periodStart,
    periodEnd: input.tenant.periodEnd,
    completenessStatus,
    hadIncompleteSources: blocked,
    forceEmitReason,
    employees,
    companyTotals,
  };

  const sourceHash = hashPayrollSnapshotSource({
    tenant: input.tenant,
    forceEmitReason,
    shifts: shifts.map((shift) => ({
      id: shift.id,
      employee_id: shift.employee_id,
      work_date: shift.work_date,
      payable_minutes: shift.payable_minutes,
      worked_minutes: shift.worked_minutes,
      shift_start_at: shift.shift_start_at,
      shift_end_at: shift.shift_end_at,
      status: shift.status,
    })),
    events: events.map((event) => ({
      id: event.id,
      employee_id: event.employee_id,
      event_type: event.event_type,
      occurred_at: event.occurred_at,
      status: event.status,
      notes: eventNote(event),
    })),
    exceptions: exceptions.map((item) => ({
      id: item.id,
      employee_id: item.employee_id,
      status: item.status,
      impact_minutes: item.impact_minutes,
    })),
  });

  return {
    payload,
    totals: companyTotals,
    sourceHash,
    completenessStatus,
    canIssue: completenessStatus === "complete" || completenessStatus === "forced",
  };
}

export function planPayrollAccountantReportWrite(input: {
  snapshot: PayrollAccountantSnapshotResult;
  intent: PayrollReportWriteIntent;
  existingReports: ExistingPayrollReportRow[];
  issuedBy: string | null;
  issuedByKind: "user" | "scheduler";
  forceEmitReason?: string | null;
}) {
  const { snapshot, intent } = input;
  void input.forceEmitReason;
  const tenant = {
    organizationId: snapshot.payload.organizationId,
    organizationCompanyId: snapshot.payload.organizationCompanyId,
    cycleId: snapshot.payload.cycleId,
  };

  const cycleReports = input.existingReports.filter(
    (row) =>
      row.cycleId === tenant.cycleId &&
      row.organizationId === tenant.organizationId &&
      row.organizationCompanyId === tenant.organizationCompanyId
  );

  if (
    input.existingReports.some(
      (row) =>
        row.cycleId === tenant.cycleId &&
        (row.organizationId !== tenant.organizationId ||
          row.organizationCompanyId !== tenant.organizationCompanyId)
    )
  ) {
    return { ok: false as const, reason: "tenant_mismatch" };
  }

  const draft = cycleReports.find((row) => row.status === "draft") ?? null;
  const nextRevision =
    cycleReports.reduce((max, row) => Math.max(max, row.revision), 0) + 1;

  if (intent === "issue" && !snapshot.canIssue) {
    return { ok: false as const, reason: "blocked_incomplete" };
  }

  if (intent === "issue") {
    return {
      ok: true as const,
      operation: "insert" as const,
      mutatesIssued: false,
      row: {
        organization_id: tenant.organizationId,
        organization_company_id: tenant.organizationCompanyId,
        cycle_id: tenant.cycleId,
        revision: nextRevision,
        status: "issued" as const,
        timezone: snapshot.payload.timezone,
        period_start: snapshot.payload.periodStart,
        period_end: snapshot.payload.periodEnd,
        source_hash: snapshot.sourceHash,
        completeness_status: snapshot.completenessStatus,
        force_emit_reason: snapshot.payload.forceEmitReason,
        payload: snapshot.payload,
        totals: snapshot.totals,
        issued_at: "NOW",
        issued_by: input.issuedBy,
        issued_by_kind: input.issuedByKind,
      },
    };
  }

  if (draft) {
    if (draft.status !== "draft") {
      return { ok: false as const, reason: "issued_immutable" };
    }
    return {
      ok: true as const,
      operation: "update_draft" as const,
      mutatesIssued: false,
      row: {
        id: draft.id,
        organization_id: tenant.organizationId,
        organization_company_id: tenant.organizationCompanyId,
        cycle_id: tenant.cycleId,
        revision: draft.revision,
        status: "draft" as const,
        source_hash: snapshot.sourceHash,
        completeness_status: snapshot.completenessStatus,
        payload: snapshot.payload,
        totals: snapshot.totals,
        issued_at: null,
        issued_by: null,
      },
    };
  }

  return {
    ok: true as const,
    operation: "insert" as const,
    mutatesIssued: false,
    row: {
      organization_id: tenant.organizationId,
      organization_company_id: tenant.organizationCompanyId,
      cycle_id: tenant.cycleId,
      revision: nextRevision,
      status: "draft" as const,
      timezone: snapshot.payload.timezone,
      period_start: snapshot.payload.periodStart,
      period_end: snapshot.payload.periodEnd,
      source_hash: snapshot.sourceHash,
      completeness_status: snapshot.completenessStatus,
      force_emit_reason: snapshot.payload.forceEmitReason,
      payload: snapshot.payload,
      totals: snapshot.totals,
      issued_at: null,
      issued_by: null,
      issued_by_kind: "user" as const,
    },
  };
}

export function refuseIssuedReportMutation(existing: ExistingPayrollReportRow) {
  if (existing.status === "issued") {
    return { ok: false as const, reason: "issued_immutable" };
  }
  return { ok: true as const };
}

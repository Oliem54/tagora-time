import { HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS, getEventOccurredAt, getWeekStartDate } from "./rules";
import type {
  HorodateurRegistreEmployeeRow,
  HorodateurRegistreExceptionDetail,
} from "./registre-types";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1ShiftRecord,
} from "./types";

export function unionRegistreScopeEmployeeIds(input: {
  shiftEmployeeIds: Iterable<number>;
  eventEmployeeIds: Iterable<number>;
  exceptionEmployeeIds?: Iterable<number>;
  requestedEmployeeId?: number | null;
}): number[] {
  const ids = new Set<number>();
  for (const id of input.shiftEmployeeIds) {
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  for (const id of input.eventEmployeeIds) {
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  for (const id of input.exceptionEmployeeIds ?? []) {
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  if (
    typeof input.requestedEmployeeId === "number" &&
    input.requestedEmployeeId > 0
  ) {
    ids.add(input.requestedEmployeeId);
  }
  return [...ids];
}

export function shiftBreakTotal(s: HorodateurPhase1ShiftRecord) {
  return (
    (s.paid_break_minutes ?? 0) +
    (s.unpaid_break_minutes ?? 0) +
    (s.unpaid_lunch_minutes ?? 0)
  );
}

export function aggregateOvertimeForEmployee(
  shifts: HorodateurPhase1ShiftRecord[],
  profile: HorodateurPhase1EmployeeProfile | undefined
): { normal: number; overtime: number } {
  const targetHours = profile?.plannedWeeklyHours ?? HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS;
  const targetMinutesPerWeek = Math.max(1, Math.round(targetHours * 60));

  const byWeek = new Map<string, number>();

  for (const s of shifts) {
    const wk =
      typeof s.week_start_date === "string" && s.week_start_date.trim()
        ? s.week_start_date
        : getWeekStartDate(`${s.work_date}T12:00:00`);
    const prev = byWeek.get(wk) ?? 0;
    byWeek.set(wk, prev + Math.max(0, s.payable_minutes ?? 0));
  }

  let normal = 0;
  let overtime = 0;
  for (const minutes of byWeek.values()) {
    normal += Math.min(minutes, targetMinutesPerWeek);
    overtime += Math.max(0, minutes - targetMinutesPerWeek);
  }

  return { normal, overtime };
}

export function pendingOperationalEventVisibleInRegistre(
  event: HorodateurPhase1EventRecord
): boolean {
  return event.status === "en_attente";
}

export function toRegistreExceptionFromPendingEvent(
  event: HorodateurPhase1EventRecord
): HorodateurRegistreExceptionDetail {
  return {
    id: event.id,
    exceptionType: event.exception_code ?? "pending_punch",
    reasonLabel: `Pointage ${event.event_type} en attente`,
    details: event.notes ?? event.approval_note ?? null,
    impactMinutes: 0,
    status: event.status,
    requestedAt: getEventOccurredAt(event) ?? event.created_at ?? "",
    reviewedAt: null,
    reviewNote: null,
    approvedMinutes: null,
    sourceEventId: event.id,
  };
}

export function countRegistreExceptionSignals(input: {
  events: HorodateurPhase1EventRecord[];
  exceptions: HorodateurPhase1ExceptionRecord[];
}): number {
  const exceptionIds = new Set(input.exceptions.map((item) => item.id));
  const exceptionSourceIds = new Set(
    input.exceptions
      .map((item) => item.source_event_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
  const pendingEventsWithoutException = input.events.filter(
    (event) =>
      pendingOperationalEventVisibleInRegistre(event) &&
      !exceptionSourceIds.has(event.id) &&
      !exceptionIds.has(event.id)
  );
  return input.exceptions.length + pendingEventsWithoutException.length;
}

export function computeRegistreRowFlags(input: {
  shifts: HorodateurPhase1ShiftRecord[];
  events: HorodateurPhase1EventRecord[];
  exceptions: HorodateurPhase1ExceptionRecord[];
}): HorodateurRegistreEmployeeRow["flags"] {
  const hasIncomplete = input.shifts.some(
    (s) => !s.shift_end_at || s.status === "ouvert"
  );
  const hasPendingEvent = input.events.some((e) => e.status === "en_attente");
  const hasPendingExc = input.exceptions.some((x) => x.status === "en_attente");
  const hasCorr = input.events.some(
    (e) => e.event_type === "correction" || e.is_manual_correction === true
  );
  const hasExc =
    input.exceptions.length > 0 ||
    hasPendingEvent ||
    input.shifts.some(
      (s) =>
        (s.anomalies_count ?? 0) > 0 ||
        (s.pending_exception_minutes ?? 0) > 0 ||
        (s.approved_exception_minutes ?? 0) > 0
    );

  const complet =
    !hasIncomplete &&
    !hasPendingEvent &&
    !hasPendingExc &&
    input.shifts.length > 0;

  return {
    complet,
    incomplet: hasIncomplete,
    en_attente: hasPendingEvent || hasPendingExc,
    corrige: hasCorr,
    exception: hasExc,
  };
}

export function primaryStatusFromFlags(
  flags: HorodateurRegistreEmployeeRow["flags"]
): HorodateurRegistreEmployeeRow["statusKey"] {
  if (flags.en_attente) {
    return "en_attente";
  }
  if (flags.incomplet) {
    return "incomplet";
  }
  if (flags.exception) {
    return "exception";
  }
  if (flags.corrige) {
    return "corrige";
  }
  return "complet";
}

export function sumShiftMinutesByUniqueId(
  shifts: Array<{ id: string; minutes: number }>
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const shift of shifts) {
    if (seen.has(shift.id)) {
      continue;
    }
    seen.add(shift.id);
    total += Math.max(0, shift.minutes);
  }
  return total;
}

export function filterShiftsForCallerOrganization<
  T extends { organization_id?: string | null },
>(shifts: T[], callerOrganizationId: string): T[] {
  return shifts.filter((shift) => shift.organization_id === callerOrganizationId);
}

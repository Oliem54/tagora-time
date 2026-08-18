import { HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS, getWeekStartDate } from "./rules";
import type { HorodateurRegistreEmployeeRow } from "./registre-types";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1ShiftRecord,
} from "./types";

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
  if (flags.incomplet) {
    return "incomplet";
  }
  if (flags.en_attente) {
    return "en_attente";
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

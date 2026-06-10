import { effectifsWeekdayIndexFromIso } from "@/app/direction/effectifs/effectifs-calendar-shared";
import {
  createWeeklyScheduleFromLegacy,
  WEEKLY_SCHEDULE_DAY_KEYS,
  type WeeklyScheduleConfig,
} from "@/app/lib/weekly-schedule";

/**
 * Filtre central des alertes horodateur (retard, punch attendu, AUTO_MISSING).
 *
 * Ne se fie pas aux champs legacy seuls (`schedule_start`, `scheduled_work_days`).
 * Un employé est planifié seulement si actif, `schedule_active`, jour actif avec
 * start/end valides, ou exception d'horaire approuvée pour la date.
 *
 * Si `weekly_schedule_config` est présent, il devient la source de vérité :
 * aucun fallback legacy. Données legacy incohérentes (ex. Martin #9, Yves #10) :
 * jours hebdo inactifs mais `schedule_start` / lun–ven encore remplis → hors horaire.
 */

export type HorodateurAlertScheduleDaySlice = {
  active: boolean;
  start: string | null;
  end: string | null;
};

export type HorodateurAlertScheduleEmployee = {
  active: boolean;
  scheduleActive: boolean;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  scheduledWorkDays: string[] | null;
  weeklyScheduleConfig: WeeklyScheduleConfig | null;
};

export type HorodateurAlertEffectiveSchedule =
  | { kind: "habitual" }
  | { kind: "off" }
  | { kind: "work"; start: string; end: string };

export type HorodateurAlertScheduleContext = {
  scheduled: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
};

export function parseScheduleTimeMinutes(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().slice(0, 5);
  const [hours, minutes] = trimmed.split(":").map((item) => Number.parseInt(item, 10));

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function isValidHorodateurScheduleTime(value: string | null | undefined): boolean {
  return parseScheduleTimeMinutes(value) != null;
}

export function isValidHorodateurShiftWindow(start: string, end: string): boolean {
  const startMinutes = parseScheduleTimeMinutes(start);
  const endMinutes = parseScheduleTimeMinutes(end);
  return startMinutes != null && endMinutes != null && endMinutes > startMinutes;
}

/** `weekly_schedule_config` présent en base : le legacy ne doit jamais planifier. */
export function isWeeklyScheduleHorodateurSourceOfTruth(
  employee: Pick<HorodateurAlertScheduleEmployee, "weeklyScheduleConfig">
): boolean {
  return employee.weeklyScheduleConfig != null;
}

export function hasAnyActiveHorodateurWeeklyScheduleDay(
  weeklyScheduleConfig: WeeklyScheduleConfig
): boolean {
  return WEEKLY_SCHEDULE_DAY_KEYS.some((dayKey) => {
    const day = weeklyScheduleConfig.days[dayKey];
    return (
      day.active &&
      isValidHorodateurScheduleTime(day.start) &&
      isValidHorodateurScheduleTime(day.end) &&
      isValidHorodateurShiftWindow(day.start, day.end)
    );
  });
}

export function getHabitualHorodateurDaySliceForWeekdayIndex(
  employee: Pick<
    HorodateurAlertScheduleEmployee,
    "scheduleStart" | "scheduleEnd" | "scheduledWorkDays" | "weeklyScheduleConfig"
  >,
  weekdayIndex: number
): HorodateurAlertScheduleDaySlice {
  const dayKey = WEEKLY_SCHEDULE_DAY_KEYS[weekdayIndex];

  if (!dayKey) {
    return { active: false, start: null, end: null };
  }

  if (employee.weeklyScheduleConfig) {
    const day = employee.weeklyScheduleConfig.days[dayKey];
    return {
      active: day.active,
      start: day.start?.trim().slice(0, 5) ?? null,
      end: day.end?.trim().slice(0, 5) ?? null,
    };
  }

  // Fallback legacy uniquement si weekly_schedule_config est absent/null côté profil.
  const legacy = createWeeklyScheduleFromLegacy({
    schedule_start: employee.scheduleStart,
    schedule_end: employee.scheduleEnd,
    scheduled_work_days: employee.scheduledWorkDays,
  });
  const day = legacy.days[dayKey];

  return {
    active: day.active,
    start: day.start,
    end: day.end,
  };
}

export function getHabitualHorodateurDaySlice(
  employee: Pick<
    HorodateurAlertScheduleEmployee,
    "scheduleStart" | "scheduleEnd" | "scheduledWorkDays" | "weeklyScheduleConfig"
  >,
  workDate: string
): HorodateurAlertScheduleDaySlice {
  return getHabitualHorodateurDaySliceForWeekdayIndex(
    employee,
    effectifsWeekdayIndexFromIso(workDate)
  );
}

export function resolveHorodateurAlertScheduleFromEffective(
  employee: HorodateurAlertScheduleEmployee,
  workDate: string,
  effective: HorodateurAlertEffectiveSchedule = { kind: "habitual" }
): HorodateurAlertScheduleContext {
  if (!employee.active || !employee.scheduleActive) {
    return { scheduled: false, shiftStart: null, shiftEnd: null };
  }

  if (effective.kind === "off") {
    return { scheduled: false, shiftStart: null, shiftEnd: null };
  }

  if (
    effective.kind === "habitual" &&
    employee.weeklyScheduleConfig &&
    !hasAnyActiveHorodateurWeeklyScheduleDay(employee.weeklyScheduleConfig)
  ) {
    return { scheduled: false, shiftStart: null, shiftEnd: null };
  }

  if (effective.kind === "work") {
    if (!isValidHorodateurShiftWindow(effective.start, effective.end)) {
      return { scheduled: false, shiftStart: null, shiftEnd: null };
    }

    return {
      scheduled: true,
      shiftStart: effective.start.trim().slice(0, 5),
      shiftEnd: effective.end.trim().slice(0, 5),
    };
  }

  const slice = getHabitualHorodateurDaySlice(employee, workDate);
  if (
    !slice.active ||
    !slice.start ||
    !slice.end ||
    !isValidHorodateurShiftWindow(slice.start, slice.end)
  ) {
    return { scheduled: false, shiftStart: null, shiftEnd: null };
  }

  return {
    scheduled: true,
    shiftStart: slice.start,
    shiftEnd: slice.end,
  };
}

export function isEmployeeScheduledForHorodateurAlerts(
  employee: HorodateurAlertScheduleEmployee,
  workDate: string,
  effective: HorodateurAlertEffectiveSchedule = { kind: "habitual" }
): boolean {
  return resolveHorodateurAlertScheduleFromEffective(employee, workDate, effective).scheduled;
}

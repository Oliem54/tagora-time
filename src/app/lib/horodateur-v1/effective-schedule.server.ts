import "server-only";

import { effectifsWeekdayIndexFromIso } from "@/app/direction/effectifs/effectifs-calendar-shared";
import {
  buildApprovedOverrideMap,
  listRequestDates,
  type EffectifsScheduleRequest,
} from "@/app/lib/effectifs-schedule-request.shared";
import {
  createWeeklyScheduleFromLegacy,
  WEEKLY_SCHEDULE_DAY_KEYS,
} from "@/app/lib/weekly-schedule";

import { listApprovedScheduleRequestsForEmployee } from "./repository";
import type { HorodateurPhase1EmployeeProfile } from "./types";

export type HorodateurEffectiveScheduleForDate =
  | { kind: "habitual" }
  | { kind: "off"; approvedScheduleException: true }
  | {
      kind: "work";
      start: string;
      end: string;
      approvedScheduleException: true;
    };

function getProfileDaySlice(
  employee: HorodateurPhase1EmployeeProfile,
  weekdayIndex: number
): { active: boolean; start: string | null; end: string | null } {
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

export function profileForScheduleValidation(
  employee: HorodateurPhase1EmployeeProfile,
  effective: HorodateurEffectiveScheduleForDate
): HorodateurPhase1EmployeeProfile {
  if (effective.kind !== "work") {
    return employee;
  }

  return {
    ...employee,
    scheduleStart: effective.start,
    scheduleEnd: effective.end,
    scheduledWorkDays: null,
  };
}

function resolveEffectiveSliceFromRequests(
  employee: HorodateurPhase1EmployeeProfile,
  workDate: string,
  requests: EffectifsScheduleRequest[]
): HorodateurEffectiveScheduleForDate {
  const covering = requests.filter((request) =>
    listRequestDates(request).includes(workDate)
  );

  if (covering.length === 0) {
    return { kind: "habitual" };
  }

  const getHabitualSlice = (employeeId: number, weekdayIndex: number) => {
    if (employeeId !== employee.employeeId) {
      return { active: false, start: null, end: null };
    }
    return getProfileDaySlice(employee, weekdayIndex);
  };

  const overrideMap = buildApprovedOverrideMap(
    requests,
    getHabitualSlice,
    effectifsWeekdayIndexFromIso
  );
  const override = overrideMap.get(workDate)?.get(employee.employeeId);

  if (override?.kind === "exclude") {
    return { kind: "off", approvedScheduleException: true };
  }

  if (override?.kind === "slice" && override.start && override.end && override.end > override.start) {
    return {
      kind: "work",
      start: override.start,
      end: override.end,
      approvedScheduleException: true,
    };
  }

  return { kind: "habitual" };
}

export async function resolveEffectiveHorodateurScheduleForDate(
  employee: HorodateurPhase1EmployeeProfile,
  workDate: string
): Promise<HorodateurEffectiveScheduleForDate> {
  const requests = await listApprovedScheduleRequestsForEmployee(employee.employeeId);
  return resolveEffectiveSliceFromRequests(employee, workDate, requests);
}

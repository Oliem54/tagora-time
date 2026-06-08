import "server-only";

import { resolveEffectiveHorodateurScheduleForDate } from "./effective-schedule.server";
import {
  resolveHorodateurAlertScheduleFromEffective,
  type HorodateurAlertEffectiveSchedule,
} from "./horodateur-alert-schedule.shared";
import type { HorodateurPhase1EmployeeProfile } from "./types";

function toAlertEffectiveSchedule(
  effective: Awaited<ReturnType<typeof resolveEffectiveHorodateurScheduleForDate>>
): HorodateurAlertEffectiveSchedule {
  if (effective.kind === "off") {
    return { kind: "off" };
  }

  if (effective.kind === "work") {
    return {
      kind: "work",
      start: effective.start,
      end: effective.end,
    };
  }

  return { kind: "habitual" };
}

export async function resolveHorodateurAlertScheduleContext(
  employee: HorodateurPhase1EmployeeProfile,
  workDate: string
) {
  const effective = await resolveEffectiveHorodateurScheduleForDate(employee, workDate);

  return resolveHorodateurAlertScheduleFromEffective(
    employee,
    workDate,
    toAlertEffectiveSchedule(effective)
  );
}

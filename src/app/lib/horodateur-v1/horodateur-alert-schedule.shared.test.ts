import { describe, expect, it } from "vitest";

import {
  createEmptyWeeklyScheduleConfig,
  type WeeklyScheduleConfig,
} from "@/app/lib/weekly-schedule";

import {
  isEmployeeScheduledForHorodateurAlerts,
  resolveHorodateurAlertScheduleFromEffective,
  type HorodateurAlertScheduleEmployee,
} from "./horodateur-alert-schedule.shared";

const WORK_DATE_MONDAY = "2026-06-08";

function inactiveWeeklyVariableConfig(): WeeklyScheduleConfig {
  const config = createEmptyWeeklyScheduleConfig("variable");

  for (const dayKey of Object.keys(config.days) as Array<keyof WeeklyScheduleConfig["days"]>) {
    config.days[dayKey] = {
      ...config.days[dayKey],
      active: false,
      start: "",
      end: "",
      plannedHours: 0,
      lunch: {
        ...config.days[dayKey].lunch,
        enabled: true,
        time: "12:00",
        minutes: 30,
      },
    };
  }

  return config;
}

function activeMondayWeeklyConfig(): WeeklyScheduleConfig {
  const config = createEmptyWeeklyScheduleConfig("fixed");
  config.days.monday = {
    ...config.days.monday,
    active: true,
    start: "07:00",
    end: "15:30",
    plannedHours: 8,
  };
  return config;
}

function baseEmployee(
  overrides: Partial<HorodateurAlertScheduleEmployee> = {}
): HorodateurAlertScheduleEmployee {
  return {
    active: true,
    scheduleActive: true,
    scheduleStart: "07:00:00",
    scheduleEnd: "15:30:00",
    scheduledWorkDays: ["lundi", "mardi", "mercredi", "jeudi", "vendredi"],
    weeklyScheduleConfig: null,
    ...overrides,
  };
}

describe("horodateur alert schedule filter", () => {
  it("schedule_active=false with legacy schedule_start filled produces no alert schedule", () => {
    const employee = baseEmployee({
      scheduleActive: false,
      weeklyScheduleConfig: inactiveWeeklyVariableConfig(),
    });

    expect(
      isEmployeeScheduledForHorodateurAlerts(employee, WORK_DATE_MONDAY)
    ).toBe(false);
  });

  it("weekly day inactive with legacy lun–ven produces no alert schedule", () => {
    const employee = baseEmployee({
      scheduleActive: true,
      weeklyScheduleConfig: inactiveWeeklyVariableConfig(),
    });

    expect(
      isEmployeeScheduledForHorodateurAlerts(employee, WORK_DATE_MONDAY)
    ).toBe(false);
  });

  it("schedule_active=true with active weekly day and valid start/end allows alerts", () => {
    const employee = baseEmployee({
      scheduleActive: true,
      weeklyScheduleConfig: activeMondayWeeklyConfig(),
    });

    expect(
      isEmployeeScheduledForHorodateurAlerts(employee, WORK_DATE_MONDAY)
    ).toBe(true);
  });

  it("direction recipient flag does not bypass inactive schedule", () => {
    const employee = baseEmployee({
      scheduleActive: false,
      weeklyScheduleConfig: inactiveWeeklyVariableConfig(),
    });

    expect(
      resolveHorodateurAlertScheduleFromEffective(employee, WORK_DATE_MONDAY).scheduled
    ).toBe(false);
  });

  it("expected punch schedule gate blocks inactive weekly days even with lunch config", () => {
    const employee = baseEmployee({
      scheduleActive: true,
      weeklyScheduleConfig: inactiveWeeklyVariableConfig(),
    });

    expect(
      resolveHorodateurAlertScheduleFromEffective(employee, WORK_DATE_MONDAY)
    ).toEqual({
      scheduled: false,
      shiftStart: null,
      shiftEnd: null,
    });
  });

  it("Dominic #11 pattern: schedule_active=false and legacy 07:00 produces no alert schedule", () => {
    const employee = baseEmployee({
      scheduleActive: false,
      scheduleStart: "07:00:00",
      scheduleEnd: "15:30:00",
      scheduledWorkDays: ["lundi", "mardi", "mercredi", "jeudi", "vendredi"],
      weeklyScheduleConfig: inactiveWeeklyVariableConfig(),
    });

    expect(
      isEmployeeScheduledForHorodateurAlerts(employee, WORK_DATE_MONDAY)
    ).toBe(false);
  });

  it("Martin/Yves pattern: schedule_active=true but weekly days inactive produces no alert schedule", () => {
    const employee = baseEmployee({
      scheduleActive: true,
      scheduleStart: "07:00:00",
      scheduleEnd: "15:30:00",
      scheduledWorkDays: ["lundi", "mardi", "mercredi", "jeudi", "vendredi"],
      weeklyScheduleConfig: inactiveWeeklyVariableConfig(),
    });

    expect(
      isEmployeeScheduledForHorodateurAlerts(employee, WORK_DATE_MONDAY)
    ).toBe(false);
  });

  it("approved schedule exception off day produces no alert schedule", () => {
    const employee = baseEmployee({
      scheduleActive: true,
      weeklyScheduleConfig: activeMondayWeeklyConfig(),
    });

    expect(
      isEmployeeScheduledForHorodateurAlerts(employee, WORK_DATE_MONDAY, { kind: "off" })
    ).toBe(false);
  });

  it("approved schedule exception work slice with valid hours allows alerts", () => {
    const employee = baseEmployee({
      scheduleActive: true,
      weeklyScheduleConfig: inactiveWeeklyVariableConfig(),
    });

    expect(
      isEmployeeScheduledForHorodateurAlerts(employee, WORK_DATE_MONDAY, {
        kind: "work",
        start: "08:00",
        end: "16:00",
      })
    ).toBe(true);
  });
});

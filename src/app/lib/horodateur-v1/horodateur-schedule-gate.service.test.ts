import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEmptyWeeklyScheduleConfig,
  type WeeklyScheduleConfig,
} from "@/app/lib/weekly-schedule";
import type { HorodateurPhase1EmployeeProfile } from "./types";

vi.mock("server-only", () => ({}));

const {
  listActiveEmployees,
  listApprovedScheduleRequestsForEmployee,
  getDirectionAlertConfig,
  listDirectionAlertRecipients,
  getLatenessNotification,
  listEventsForEmployee,
  getCurrentStateByEmployeeId,
  listExceptionsForEmployeeWorkDate,
  upsertLatenessNotification,
  insertException,
} = vi.hoisted(() => ({
  listActiveEmployees: vi.fn(),
  listApprovedScheduleRequestsForEmployee: vi.fn(),
  getDirectionAlertConfig: vi.fn(),
  listDirectionAlertRecipients: vi.fn(),
  getLatenessNotification: vi.fn(),
  listEventsForEmployee: vi.fn(),
  getCurrentStateByEmployeeId: vi.fn(),
  listExceptionsForEmployeeWorkDate: vi.fn(),
  upsertLatenessNotification: vi.fn(),
  insertException: vi.fn(),
}));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

vi.mock("@/app/lib/app-alerts-dual-write.server", () => ({
  dualWriteHorodateurExceptionCreated: vi.fn(),
  findOpenAppAlertIdByDedupeKey: vi.fn(),
  getChauffeurCompanyKey: vi.fn(),
  logNotificationFailureAppAlert: vi.fn(),
  markHorodateurExceptionAppAlertHandled: vi.fn(),
  recordDeliveriesFromHorodateurDirectionNotify: vi.fn(),
}));

vi.mock("@/app/lib/notifications", () => ({
  notifyHorodateurLateness: vi.fn(),
  notifyDirectionOfHorodateurException: vi.fn(),
  notifyDirectionHorodateurPunchSms: vi.fn(),
  notifyEmployeeExpectedPunchSms: vi.fn(),
  notifyEmployeeHorodateurExceptionDecision: vi.fn(),
  notifyEmployeeHorodateurPunchSms: vi.fn(),
}));

vi.mock("./repository", () => ({
  listActiveEmployees,
  listApprovedScheduleRequestsForEmployee,
  getDirectionAlertConfig,
  listDirectionAlertRecipients,
  getLatenessNotification,
  listEventsForEmployee,
  getCurrentStateByEmployeeId,
  listExceptionsForEmployeeWorkDate,
  upsertLatenessNotification,
  insertException,
  hasExpectedPunchSmsNotificationLog: vi.fn(),
  insertHorodateurSmsAlertLog: vi.fn(),
  upsertDirectionAlertConfig: vi.fn(),
  getEmployeeByAuthUserId: vi.fn(),
  getEmployeeById: vi.fn(),
  getEventById: vi.fn(),
  getExceptionById: vi.fn(),
  getShiftByEmployeeAndWorkDate: vi.fn(),
  insertEvent: vi.fn(),
  listPendingExceptions: vi.fn(),
  listExceptionsForShift: vi.fn(),
  listShiftsForEmployeeWeek: vi.fn(),
  updateEventOccurredAt: vi.fn(),
  updateEventReviewStatus: vi.fn(),
  updateExceptionEscalationFields: vi.fn(),
  updateExceptionNotificationStatus: vi.fn(),
  updateExceptionReview: vi.fn(),
  upsertCurrentState: vi.fn(),
  upsertShift: vi.fn(),
  attachShiftToException: vi.fn(),
  countPendingExceptionsForEmployee: vi.fn(),
}));

function martinYvesWeeklyConfig(): WeeklyScheduleConfig {
  const config = createEmptyWeeklyScheduleConfig("variable");

  for (const dayKey of Object.keys(config.days) as Array<keyof WeeklyScheduleConfig["days"]>) {
    config.days[dayKey] = {
      ...config.days[dayKey],
      active: false,
      start: "07:00",
      end: "15:30",
      plannedHours: 0,
    };
  }

  return config;
}

function martinEmployeeProfile(): HorodateurPhase1EmployeeProfile {
  return {
    employeeId: 9,
    authUserId: "auth-martin",
    fullName: "Martin ST-Gelais",
    email: "martin@example.com",
    phoneNumber: "+15555550109",
    active: true,
    scheduleActive: true,
    primaryCompany: "oliem_solutions",
    scheduleStart: "07:00:00",
    scheduleEnd: "15:30:00",
    scheduledWorkDays: ["lundi", "mardi", "mercredi", "jeudi", "vendredi"],
    plannedWeeklyHours: 40,
    pausePaid: true,
    pauseMinutes: 15,
    lunchPaid: false,
    lunchMinutes: 30,
    expectedBreaksCount: 1,
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
    alertEmailEnabled: true,
    alertSmsEnabled: false,
    isDirectionAlertRecipient: false,
    weeklyScheduleConfig: martinYvesWeeklyConfig(),
    canWorkForOliemSolutions: true,
    canWorkForTitanProduitsIndustriels: false,
  };
}

const defaultAlertConfig = {
  config_key: "default",
  email_enabled: true,
  sms_enabled: true,
  reminder_delay_minutes: 5,
  direction_emails: ["direction@example.com"],
  direction_sms_numbers: ["+15555550000"],
};

describe("horodateur schedule gate — cron jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T15:00:00.000Z"));

    listActiveEmployees.mockResolvedValue([martinEmployeeProfile()]);
    listApprovedScheduleRequestsForEmployee.mockResolvedValue([]);
    getDirectionAlertConfig.mockResolvedValue(defaultAlertConfig);
    listDirectionAlertRecipients.mockResolvedValue([]);
    getLatenessNotification.mockResolvedValue(null);
    listEventsForEmployee.mockResolvedValue([]);
    getCurrentStateByEmployeeId.mockResolvedValue(null);
    listExceptionsForEmployeeWorkDate.mockResolvedValue([]);
    upsertLatenessNotification.mockResolvedValue({
      id: "notif-1",
      employee_id: 9,
      work_date: "2026-06-08",
    });
    insertException.mockResolvedValue({ id: "exc-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processLateEmployeeNotifications does not create lateness when weekly inactive + legacy filled", async () => {
    const { processLateEmployeeNotifications } = await import("./service");
    const { notifyHorodateurLateness } = await import("@/app/lib/notifications");

    const result = await processLateEmployeeNotifications();

    expect(result.detectedCount).toBe(0);
    expect(result.processedCount).toBe(0);
    expect(upsertLatenessNotification).not.toHaveBeenCalled();
    expect(notifyHorodateurLateness).not.toHaveBeenCalled();
  });

  it("processMissingExpectedPunchEscalation does not create AUTO_MISSING when weekly inactive + legacy filled", async () => {
    const { processMissingExpectedPunchEscalation, resolveExpectedPunchScheduleItems } =
      await import("./service");

    expect(
      resolveExpectedPunchScheduleItems({
        employee: martinEmployeeProfile(),
        weekdayFr: "lundi",
      })
    ).toEqual([]);

    const result = await processMissingExpectedPunchEscalation();

    expect(result.processed).toEqual([]);
    expect(insertException).not.toHaveBeenCalled();
  });
});

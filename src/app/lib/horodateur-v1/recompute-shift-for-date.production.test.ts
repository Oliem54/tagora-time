import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1EventType,
} from "./types";

vi.mock("server-only", () => ({}));

const {
  listEventsForEmployee,
  getEmployeeById,
  getShiftByEmployeeAndWorkDate,
  listExceptionsForShift,
  upsertShift,
} = vi.hoisted(() => ({
  listEventsForEmployee: vi.fn(),
  getEmployeeById: vi.fn(),
  getShiftByEmployeeAndWorkDate: vi.fn(),
  listExceptionsForShift: vi.fn(),
  upsertShift: vi.fn(),
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
  notifyHorodateurLatenessDigest: vi.fn(),
}));

vi.mock("./repository", () => ({
  listEventsForEmployee,
  getEmployeeById,
  getShiftByEmployeeAndWorkDate,
  listExceptionsForShift,
  upsertShift,
  countPendingExceptionsForEmployee: vi.fn(),
  upsertCurrentState: vi.fn(),
  listActiveEmployees: vi.fn(),
  listApprovedScheduleRequestsForEmployee: vi.fn(),
  getDirectionAlertConfig: vi.fn(),
  listDirectionAlertRecipients: vi.fn(),
  getLatenessNotification: vi.fn(),
  getCurrentStateByEmployeeId: vi.fn(),
  listExceptionsForEmployeeWorkDate: vi.fn(),
  upsertLatenessNotification: vi.fn(),
  insertException: vi.fn(),
  hasExpectedPunchSmsNotificationLog: vi.fn(),
  insertHorodateurSmsAlertLog: vi.fn(),
  upsertDirectionAlertConfig: vi.fn(),
  getEmployeeByAuthUserId: vi.fn(),
  getEmployeeByIdForOrganization: vi.fn(),
  getEventById: vi.fn(),
  getExceptionById: vi.fn(),
  getExceptionByIdForOrganization: vi.fn(),
  insertEvent: vi.fn(),
  listPendingExceptions: vi.fn(),
  listPendingExceptionOrganizationIds: vi.fn(),
  listShiftsForEmployeeWeek: vi.fn(),
  updateEventOccurredAt: vi.fn(),
  updateEventReviewStatus: vi.fn(),
  updateExceptionEscalationFields: vi.fn(),
  updateExceptionNotificationStatus: vi.fn(),
  updateExceptionReview: vi.fn(),
  attachShiftToException: vi.fn(),
}));

const WORK_DATE = "2026-09-29";
const FIRST_START = "2026-09-29T14:00:00.000Z";
const FIRST_END = "2026-09-29T18:00:00.000Z";
const LATER_EXIT = "2026-09-29T22:00:00.000Z";

const employee: HorodateurPhase1EmployeeProfile = {
  employeeId: 7,
  organizationId: "org-oliem",
  organizationCompanyId: "company-oliem",
  authUserId: "auth-7",
  fullName: "Employe test",
  email: "employe@example.test",
  phoneNumber: null,
  active: true,
  scheduleActive: false,
  primaryCompany: "oliem_solutions",
  scheduleStart: null,
  scheduleEnd: null,
  scheduledWorkDays: null,
  plannedWeeklyHours: 40,
  pauseMinutes: 15,
  lunchMinutes: 30,
  pausePaid: true,
  lunchPaid: false,
  expectedBreaksCount: 1,
  toleranceBeforeStartMinutes: 0,
  toleranceAfterEndMinutes: 0,
  maxShiftMinutes: 600,
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

function event(
  partial: Partial<HorodateurPhase1EventRecord> &
    Pick<HorodateurPhase1EventRecord, "id" | "event_type" | "status">
): HorodateurPhase1EventRecord {
  return {
    employee_id: 7,
    work_date: WORK_DATE,
    week_start_date: "2026-09-28",
    occurred_at: partial.event_time ?? null,
    ...partial,
  };
}

function installEvents(events: HorodateurPhase1EventRecord[]) {
  listEventsForEmployee.mockImplementation(
    async (options: { statuses?: string[] }) => {
      const statuses = options.statuses;
      if (!statuses?.length) return events;
      return events.filter((item) => statuses.includes(item.status));
    }
  );
}

describe("recomputeShiftForDate closed segment guard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a closed shift when a pending English arrival is ignored and a later English exit is approved", async () => {
    const events = [
      event({
        id: "arrival",
        event_type: "quart_debut",
        status: "approuve",
        occurred_at: FIRST_START,
        event_time: FIRST_START,
      }),
      event({
        id: "exit",
        event_type: "quart_fin",
        status: "approuve",
        occurred_at: FIRST_END,
        event_time: FIRST_END,
      }),
      event({
        id: "pending-english-start",
        event_type: "clock_in" as HorodateurPhase1EventType,
        status: "en_attente",
        occurred_at: "2026-09-29T19:30:00.000Z",
        event_time: "2026-09-29T19:00:00.000Z",
      }),
      event({
        id: "english-exit",
        event_type: "clock_out" as HorodateurPhase1EventType,
        status: "normal",
        occurred_at: "2026-09-29T22:30:00.000Z",
        event_time: LATER_EXIT,
      }),
    ];
    installEvents(events);
    getEmployeeById.mockResolvedValue(employee);
    getShiftByEmployeeAndWorkDate.mockResolvedValue(null);
    listExceptionsForShift.mockResolvedValue([]);

    const { recomputeShiftForDate } = await import("./service");
    const shift = await recomputeShiftForDate(7, WORK_DATE, { persist: false });

    expect(listEventsForEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 7,
        workDate: WORK_DATE,
        statuses: ["normal", "approuve"],
      })
    );
    expect(shift.shift_start_at).toBe(FIRST_START);
    expect(shift.shift_end_at).toBe(FIRST_END);
    expect(shift.gross_minutes).toBe(240);
    expect(shift.worked_minutes).toBe(240);
    expect(shift.payable_minutes).toBe(240);
    expect(shift.gross_minutes).toBeLessThan(480);
    expect(upsertShift).not.toHaveBeenCalled();
  });

  it("does not let an approved English shift_end extend a closed segment", async () => {
    installEvents([
      event({
        id: "arrival",
        event_type: "quart_debut",
        status: "normal",
        occurred_at: FIRST_START,
        event_time: FIRST_START,
      }),
      event({
        id: "exit",
        event_type: "quart_fin",
        status: "approuve",
        occurred_at: FIRST_END,
        event_time: FIRST_END,
      }),
      event({
        id: "pending-english-start",
        event_type: "shift_start" as HorodateurPhase1EventType,
        status: "en_attente",
        occurred_at: "2026-09-29T19:30:00.000Z",
        event_time: "2026-09-29T19:00:00.000Z",
      }),
      event({
        id: "english-exit",
        event_type: "shift_end" as HorodateurPhase1EventType,
        status: "approuve",
        occurred_at: "2026-09-29T22:30:00.000Z",
        event_time: LATER_EXIT,
      }),
    ]);
    getEmployeeById.mockResolvedValue(employee);
    getShiftByEmployeeAndWorkDate.mockResolvedValue(null);
    listExceptionsForShift.mockResolvedValue([]);

    const { recomputeShiftForDate } = await import("./service");
    const shift = await recomputeShiftForDate(7, WORK_DATE, { persist: false });

    expect(shift.shift_start_at).toBe(FIRST_START);
    expect(shift.shift_end_at).toBe(FIRST_END);
    expect(shift.gross_minutes).toBe(240);
    expect(shift.worked_minutes).toBe(240);
    expect(shift.payable_minutes).toBe(240);
  });

  it("ignores an English exit whose event_time is before the open segment start", async () => {
    const earlyExit = "2026-09-29T13:00:00.000Z";
    const recordedAt = "2026-09-29T18:00:00.000Z";

    for (const eventType of ["clock_out", "shift_end"] as const) {
      installEvents([
        event({
          id: "arrival",
          event_type: "quart_debut",
          status: "approuve",
          occurred_at: FIRST_START,
          event_time: FIRST_START,
        }),
        event({
          id: "english-exit",
          event_type: eventType as HorodateurPhase1EventType,
          status: "normal",
          occurred_at: recordedAt,
          event_time: earlyExit,
        }),
      ]);
      getEmployeeById.mockResolvedValue(employee);
      getShiftByEmployeeAndWorkDate.mockResolvedValue(null);
      listExceptionsForShift.mockResolvedValue([]);

      const { recomputeShiftForDate } = await import("./service");
      const shift = await recomputeShiftForDate(7, WORK_DATE, { persist: false });

      expect(shift.shift_start_at).toBe(FIRST_START);
      expect(shift.shift_end_at).toBeNull();
      expect(shift.shift_end_at).not.toBe(earlyExit);
      expect(shift.worked_minutes).toBe(0);
      expect(shift.payable_minutes).toBe(0);
      expect(shift.gross_minutes).toBe(240);
    }
  });

  it("closes an open segment with the English exit event_time", async () => {
    installEvents([
      event({
        id: "arrival",
        event_type: "quart_debut",
        status: "approuve",
        occurred_at: FIRST_START,
        event_time: FIRST_START,
      }),
      event({
        id: "english-exit",
        event_type: "clock_out" as HorodateurPhase1EventType,
        status: "normal",
        occurred_at: LATER_EXIT,
        event_time: FIRST_END,
      }),
    ]);
    getEmployeeById.mockResolvedValue(employee);
    getShiftByEmployeeAndWorkDate.mockResolvedValue(null);
    listExceptionsForShift.mockResolvedValue([]);

    const { recomputeShiftForDate } = await import("./service");
    const shift = await recomputeShiftForDate(7, WORK_DATE, { persist: false });

    expect(shift.shift_start_at).toBe(FIRST_START);
    expect(shift.shift_end_at).toBe(FIRST_END);
    expect(shift.gross_minutes).toBe(240);
    expect(shift.worked_minutes).toBe(240);
    expect(shift.payable_minutes).toBe(240);
  });

  it("does not let a later approved punch_out extend a closed segment", async () => {
    installEvents([
      event({
        id: "arrival",
        event_type: "quart_debut",
        status: "approuve",
        occurred_at: FIRST_START,
        event_time: FIRST_START,
      }),
      event({
        id: "exit",
        event_type: "quart_fin",
        status: "approuve",
        occurred_at: FIRST_END,
        event_time: FIRST_END,
      }),
      event({
        id: "later-exit",
        event_type: "quart_fin",
        status: "approuve",
        occurred_at: LATER_EXIT,
        event_time: LATER_EXIT,
      }),
    ]);
    getEmployeeById.mockResolvedValue(employee);
    getShiftByEmployeeAndWorkDate.mockResolvedValue(null);
    listExceptionsForShift.mockResolvedValue([]);

    const { recomputeShiftForDate } = await import("./service");
    const shift = await recomputeShiftForDate(7, WORK_DATE, { persist: false });

    expect(shift.shift_end_at).toBe(FIRST_END);
    expect(shift.gross_minutes).toBe(240);
    expect(shift.worked_minutes).toBe(240);
    expect(shift.payable_minutes).toBe(240);
  });

  it("does not let an orphan gap pause consume the next valid pause", async () => {
    installEvents([
      event({
        id: "start-1",
        event_type: "quart_debut",
        status: "approuve",
        occurred_at: "2026-09-29T08:00:00.000Z",
        event_time: "2026-09-29T08:00:00.000Z",
      }),
      event({
        id: "end-1",
        event_type: "quart_fin",
        status: "approuve",
        occurred_at: "2026-09-29T12:00:00.000Z",
        event_time: "2026-09-29T12:00:00.000Z",
      }),
      event({
        id: "orphan-pause",
        event_type: "pause_debut",
        status: "approuve",
        occurred_at: "2026-09-29T12:30:00.000Z",
        event_time: "2026-09-29T12:30:00.000Z",
      }),
      event({
        id: "start-2",
        event_type: "quart_debut",
        status: "approuve",
        occurred_at: "2026-09-29T13:00:00.000Z",
        event_time: "2026-09-29T13:00:00.000Z",
      }),
      event({
        id: "pause-start",
        event_type: "pause_debut",
        status: "approuve",
        occurred_at: "2026-09-29T14:00:00.000Z",
        event_time: "2026-09-29T14:00:00.000Z",
      }),
      event({
        id: "pause-end",
        event_type: "pause_fin",
        status: "approuve",
        occurred_at: "2026-09-29T14:15:00.000Z",
        event_time: "2026-09-29T14:15:00.000Z",
      }),
      event({
        id: "orphan-pause-end",
        event_type: "pause_fin",
        status: "approuve",
        occurred_at: "2026-09-29T14:30:00.000Z",
        event_time: "2026-09-29T14:30:00.000Z",
      }),
      event({
        id: "end-2",
        event_type: "quart_fin",
        status: "approuve",
        occurred_at: "2026-09-29T17:00:00.000Z",
        event_time: "2026-09-29T17:00:00.000Z",
      }),
    ]);
    getEmployeeById.mockResolvedValue({ ...employee, pausePaid: false });
    getShiftByEmployeeAndWorkDate.mockResolvedValue(null);
    listExceptionsForShift.mockResolvedValue([]);

    const { recomputeShiftForDate } = await import("./service");
    const shift = await recomputeShiftForDate(7, WORK_DATE, { persist: false });

    expect(shift.shift_start_at).toBe("2026-09-29T08:00:00.000Z");
    expect(shift.shift_end_at).toBe("2026-09-29T17:00:00.000Z");
    expect(shift.unpaid_break_minutes).toBe(15);
    expect(shift.unpaid_break_minutes).not.toBe(105);
    expect(shift.worked_minutes).toBe(465);
    expect(shift.payable_minutes).toBe(465);
    expect(shift.gross_minutes).toBe(540);
  });

  it("adds approved exception minutes to payable and leaves pending minutes out", async () => {
    installEvents([
      event({
        id: "arrival",
        event_type: "quart_debut",
        status: "approuve",
        occurred_at: FIRST_START,
        event_time: FIRST_START,
      }),
      event({
        id: "exit",
        event_type: "quart_fin",
        status: "approuve",
        occurred_at: FIRST_END,
        event_time: FIRST_END,
      }),
    ]);
    getEmployeeById.mockResolvedValue(employee);
    getShiftByEmployeeAndWorkDate.mockResolvedValue(null);
    listExceptionsForShift.mockResolvedValue([
      {
        id: "exc-approved",
        employee_id: 7,
        shift_id: null,
        source_event_id: "arrival",
        exception_type: "missing_punch_adjustment",
        reason_label: "Ajustement",
        details: null,
        impact_minutes: 20,
        status: "approuve",
        requested_at: FIRST_END,
        requested_by_user_id: null,
        reviewed_at: FIRST_END,
        reviewed_by_user_id: null,
        review_note: null,
        approved_minutes: 30,
      },
      {
        id: "exc-pending",
        employee_id: 7,
        shift_id: null,
        source_event_id: "exit",
        exception_type: "missing_punch_adjustment",
        reason_label: "En attente",
        details: null,
        impact_minutes: 45,
        status: "en_attente",
        requested_at: FIRST_END,
        requested_by_user_id: null,
        reviewed_at: null,
        reviewed_by_user_id: null,
        review_note: null,
        approved_minutes: null,
      },
    ]);

    const { recomputeShiftForDate } = await import("./service");
    const shift = await recomputeShiftForDate(7, WORK_DATE, { persist: false });

    expect(shift.worked_minutes).toBe(240);
    expect(shift.approved_exception_minutes).toBe(30);
    expect(shift.pending_exception_minutes).toBe(45);
    expect(shift.payable_minutes).toBe(270);
    expect(shift.payable_minutes).not.toBe(315);
  });

  it("adds a modified exception with a null shift id once", async () => {
    installEvents([
      event({
        id: "arrival",
        event_type: "quart_debut",
        status: "approuve",
        occurred_at: FIRST_START,
        event_time: FIRST_START,
      }),
      event({
        id: "exit",
        event_type: "quart_fin",
        status: "approuve",
        occurred_at: FIRST_END,
        event_time: FIRST_END,
      }),
    ]);
    getEmployeeById.mockResolvedValue(employee);
    getShiftByEmployeeAndWorkDate.mockResolvedValue(null);
    listExceptionsForShift.mockResolvedValue([
      {
        id: "exc-modified",
        employee_id: 7,
        shift_id: null,
        source_event_id: "arrival",
        exception_type: "missing_punch_adjustment",
        reason_label: "Ajustement modifié",
        details: null,
        impact_minutes: 20,
        status: "modifie",
        requested_at: FIRST_END,
        requested_by_user_id: null,
        reviewed_at: FIRST_END,
        reviewed_by_user_id: null,
        review_note: null,
        approved_minutes: 20,
      },
      {
        id: "exc-approved",
        employee_id: 7,
        shift_id: null,
        source_event_id: "exit",
        exception_type: "missing_punch_adjustment",
        reason_label: "Approuvé",
        details: null,
        impact_minutes: 10,
        status: "approuve",
        requested_at: FIRST_END,
        requested_by_user_id: null,
        reviewed_at: FIRST_END,
        reviewed_by_user_id: null,
        review_note: null,
        approved_minutes: 10,
      },
    ]);

    const { recomputeShiftForDate } = await import("./service");
    const shift = await recomputeShiftForDate(7, WORK_DATE, { persist: false });

    expect(shift.worked_minutes).toBe(240);
    expect(shift.approved_exception_minutes).toBe(30);
    expect(shift.payable_minutes).toBe(270);
    expect(shift.payable_minutes).not.toBe(300);
  });
});

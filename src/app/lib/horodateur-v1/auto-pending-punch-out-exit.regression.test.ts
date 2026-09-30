import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveEmployeHorodateurPunchOutControl } from "../employee-punch-guidance.shared";
import { formatAutoMissingExpectedPunchDetails } from "../horodateur-expected-punch-missing.shared";
import { findActivePendingPunchOutFromEvents } from "./operational-state.shared";
import { employeePunchSubmissionFlags } from "./punch-confirmation.shared";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
} from "./types";

vi.mock("server-only", () => ({}));

const {
  listEventsForEmployee,
  getEmployeeById,
  getEmployeeByAuthUserId,
  countPendingExceptionsForEmployee,
  getShiftByEmployeeAndWorkDate,
  upsertCurrentState,
  upsertShift,
  listExceptionsForShift,
  listApprovedScheduleRequestsForEmployee,
  listPendingExceptions,
  listShiftsForEmployeeWeek,
  insertEvent,
  insertException,
  getDirectionAlertConfig,
  getCurrentStateByEmployeeId,
  insertHorodateurSmsAlertLog,
} = vi.hoisted(() => ({
  listEventsForEmployee: vi.fn(),
  getEmployeeById: vi.fn(),
  getEmployeeByAuthUserId: vi.fn(),
  countPendingExceptionsForEmployee: vi.fn(),
  getShiftByEmployeeAndWorkDate: vi.fn(),
  upsertCurrentState: vi.fn(),
  upsertShift: vi.fn(),
  listExceptionsForShift: vi.fn(),
  listApprovedScheduleRequestsForEmployee: vi.fn(),
  listPendingExceptions: vi.fn(),
  listShiftsForEmployeeWeek: vi.fn(),
  insertEvent: vi.fn(),
  insertException: vi.fn(),
  getDirectionAlertConfig: vi.fn(),
  getCurrentStateByEmployeeId: vi.fn(),
  insertHorodateurSmsAlertLog: vi.fn(),
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
  notifyEmployeeHorodateurPunchSms: vi.fn(async () => ({
    sent: false,
    skipped: true,
    reason: "test",
  })),
  notifyHorodateurLatenessDigest: vi.fn(),
}));

vi.mock("./repository", () => ({
  listEventsForEmployee,
  getEmployeeById,
  getEmployeeByAuthUserId,
  countPendingExceptionsForEmployee,
  getShiftByEmployeeAndWorkDate,
  upsertCurrentState,
  upsertShift,
  listExceptionsForShift,
  listApprovedScheduleRequestsForEmployee,
  listPendingExceptions,
  listShiftsForEmployeeWeek,
  insertEvent,
  insertException,
  getDirectionAlertConfig,
  getCurrentStateByEmployeeId,
  insertHorodateurSmsAlertLog,
  listActiveEmployees: vi.fn(),
  listDirectionAlertRecipients: vi.fn(),
  getLatenessNotification: vi.fn(),
  listExceptionsForEmployeeWorkDate: vi.fn(),
  upsertLatenessNotification: vi.fn(),
  hasExpectedPunchSmsNotificationLog: vi.fn(),
  upsertDirectionAlertConfig: vi.fn(),
  getEmployeeByIdForOrganization: vi.fn(),
  getEventById: vi.fn(),
  getExceptionById: vi.fn(),
  getExceptionByIdForOrganization: vi.fn(),
  listPendingExceptionOrganizationIds: vi.fn(),
  updateEventOccurredAt: vi.fn(),
  updateEventReviewStatus: vi.fn(),
  updateExceptionEscalationFields: vi.fn(),
  updateExceptionNotificationStatus: vi.fn(),
  updateExceptionReview: vi.fn(),
  attachShiftToException: vi.fn(),
}));

const WORK_DATE = "2026-09-29";
const ARRIVAL_AT = "2026-09-29T10:30:12.000Z";
const AUTOMATIC_END_AT = "2026-09-29T19:00:00.000Z";
const REAL_EXIT_AT = "2026-09-29T18:30:00.000Z";

const employee: HorodateurPhase1EmployeeProfile = {
  employeeId: 7,
  organizationId: "org-oliem",
  organizationCompanyId: "company-oliem",
  authUserId: "auth-7",
  fullName: "Employe test",
  email: "employe@example.test",
  phoneNumber: null,
  active: true,
  scheduleActive: true,
  primaryCompany: "oliem_solutions",
  scheduleStart: "06:30:00",
  scheduleEnd: "15:00:00",
  scheduledWorkDays: ["lundi", "mardi", "mercredi", "jeudi", "vendredi"],
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
    Pick<HorodateurPhase1EventRecord, "id" | "event_type" | "status" | "occurred_at">
): HorodateurPhase1EventRecord {
  return {
    employee_id: 7,
    work_date: WORK_DATE,
    week_start_date: "2026-09-28",
    ...partial,
  };
}

const arrival = event({
  id: "arrival",
  event_type: "quart_debut",
  status: "normal",
  occurred_at: ARRIVAL_AT,
  actor_role: "employe",
  source_kind: "employe",
});

const automaticEnd = event({
  id: "automatic-end",
  event_type: "quart_fin",
  status: "en_attente",
  occurred_at: AUTOMATIC_END_AT,
  actor_role: "systeme",
  source_kind: "automatique",
  exception_code: "missing_punch_adjustment",
  notes: formatAutoMissingExpectedPunchDetails({
    eventType: "quart_fin",
    workDate: WORK_DATE,
    scheduledLabel: "15:00",
  }),
});

const employeePendingExit = event({
  id: "employee-exit",
  event_type: "quart_fin",
  status: "en_attente",
  occurred_at: "2026-09-29T21:00:00.000Z",
  actor_role: "employe",
  source_kind: "employe",
  exception_code: "shift_too_long",
});

function installEventStore(events: HorodateurPhase1EventRecord[]) {
  listEventsForEmployee.mockImplementation(
    async (options: { workDate?: string; statuses?: string[] }) =>
      events.filter((item) => {
        if (options.workDate && item.work_date !== options.workDate) return false;
        if (options.statuses && !options.statuses.includes(item.status)) return false;
        return true;
      })
  );
}

function installCommonMocks() {
  getEmployeeById.mockResolvedValue(employee);
  getEmployeeByAuthUserId.mockResolvedValue(employee);
  countPendingExceptionsForEmployee.mockResolvedValue(1);
  getShiftByEmployeeAndWorkDate.mockResolvedValue(null);
  upsertCurrentState.mockImplementation(async (state) => state);
  upsertShift.mockImplementation(async (shift) => ({
    id: "shift-1",
    payable_minutes: 0,
    status: "ouvert",
    ...shift,
  }));
  listExceptionsForShift.mockResolvedValue([]);
  listApprovedScheduleRequestsForEmployee.mockResolvedValue([]);
  listShiftsForEmployeeWeek.mockResolvedValue([]);
  listPendingExceptions.mockResolvedValue([
    {
      id: "exc-auto",
      employee_id: 7,
      status: "en_attente",
      exception_type: "missing_punch_adjustment",
      source_event_id: "automatic-end",
    },
  ]);
  getDirectionAlertConfig.mockResolvedValue({
    email_enabled: false,
    sms_enabled: false,
    reminder_delay_minutes: 5,
    direction_emails: [],
    direction_sms_numbers: [],
  });
  getCurrentStateByEmployeeId.mockResolvedValue({
    employee_id: 7,
    current_state: "en_quart",
    last_event_id: "arrival",
    last_event_type: "quart_debut",
    last_event_at: ARRIVAL_AT,
    company_context: "oliem_solutions",
    has_open_exception: true,
  });
  insertEvent.mockImplementation(async (input: {
    eventType: string;
    occurredAt: string;
    workDate: string;
    status: string;
    actorRole: string;
    sourceKind: string;
  }) =>
    event({
      id: "real-exit",
      event_type: input.eventType as HorodateurPhase1EventRecord["event_type"],
      status: input.status as HorodateurPhase1EventRecord["status"],
      occurred_at: input.occurredAt,
      work_date: input.workDate,
      actor_role: input.actorRole as HorodateurPhase1EventRecord["actor_role"],
      source_kind: input.sourceKind as HorodateurPhase1EventRecord["source_kind"],
    })
  );
  insertException.mockResolvedValue({
    id: "exc-real",
    employee_id: 7,
    status: "en_attente",
    exception_type: "shift_too_long",
    source_event_id: "real-exit",
  });
}

describe("real punch-out after an automatic pending quart_fin", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("keeps the employee screen punch-out available and blocks only an employee submission", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/employe/horodateur/page.tsx"),
      "utf8"
    );
    expect(page).toContain("resolveEmployeHorodateurPunchOutControl");
    expect(page).toContain("punchOutControl.primaryDisabled");
    expect(page).toContain("punchOutControl.primaryLabel");

    const open = resolveEmployeHorodateurPunchOutControl({
      currentState: "en_quart",
      pendingPunchOut: null,
    });
    expect(open.canPunchOut).toBe(true);
    expect(open.primaryDisabled).toBe(false);
    expect(open.primaryLabel).toBe("Pointer ma sortie");
    expect(open.blockedReason).toBeNull();

    const submitted = resolveEmployeHorodateurPunchOutControl({
      currentState: "en_quart",
      pendingPunchOut: {
        occurredAt: employeePendingExit.occurred_at ?? "",
      },
    });
    expect(submitted.canPunchOut).toBe(false);
    expect(submitted.primaryDisabled).toBe(true);
    expect(submitted.primaryLabel).toBe("Sortie soumise");
    expect(submitted.blockedReason).toContain("validation de la direction");
  });

  it("records the real exit after the automatic exception and still refuses an employee pending exit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(REAL_EXIT_AT));
    installCommonMocks();
    installEventStore([arrival, automaticEnd]);

    const route = readFileSync(
      join(process.cwd(), "src/app/api/horodateur/punch/route.ts"),
      "utf8"
    );
    expect(route).toContain("employeePunchSubmissionFlags");
    expect(employeePunchSubmissionFlags(false)).toEqual({
      alreadySubmitted: false,
      code: undefined,
    });
    expect(employeePunchSubmissionFlags(true)).toEqual({
      alreadySubmitted: true,
      code: "punch_out_already_pending",
    });

    expect(
      findActivePendingPunchOutFromEvents([automaticEnd], [arrival], {
        operationalWorkDate: WORK_DATE,
        employeeId: 7,
      })
    ).toBeNull();
    expect(
      resolveEmployeHorodateurPunchOutControl({
        currentState: "en_quart",
        pendingPunchOut: null,
      }).canPunchOut
    ).toBe(true);

    const { createEmployeePunch, getEmployeeDashboardSnapshotByAuthUserId } = await import(
      "./service"
    );

    const snapshot = await getEmployeeDashboardSnapshotByAuthUserId("auth-7");
    expect(snapshot.currentState.current_state).toBe("en_quart");
    expect(snapshot.pendingPunchOut).toBeNull();
    expect(snapshot.pendingExceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_event_id: "automatic-end",
          exception_type: "missing_punch_adjustment",
        }),
      ])
    );
    expect(
      resolveEmployeHorodateurPunchOutControl({
        currentState: snapshot.currentState.current_state,
        pendingPunchOut: snapshot.pendingPunchOut,
      })
    ).toMatchObject({
      canPunchOut: true,
      primaryDisabled: false,
      primaryLabel: "Pointer ma sortie",
    });

    const created = await createEmployeePunch({
      actorUserId: "auth-7",
      eventType: "punch_out",
      occurredAt: REAL_EXIT_AT,
    });

    expect(created.alreadySubmitted).not.toBe(true);
    expect(created.event.id).toBe("real-exit");
    expect(insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "punch_out",
        actorRole: "employe",
        sourceKind: "employe",
      })
    );
    expect(employeePunchSubmissionFlags(created.alreadySubmitted).code).toBeUndefined();

    vi.clearAllMocks();
    installCommonMocks();
    installEventStore([arrival, employeePendingExit]);

    const duplicate = await createEmployeePunch({
      actorUserId: "auth-7",
      eventType: "punch_out",
      occurredAt: REAL_EXIT_AT,
    });

    expect(duplicate.alreadySubmitted).toBe(true);
    expect(duplicate.event.id).toBe("employee-exit");
    expect(insertEvent).not.toHaveBeenCalled();
    expect(employeePunchSubmissionFlags(duplicate.alreadySubmitted).code).toBe(
      "punch_out_already_pending"
    );
    expect(
      resolveEmployeHorodateurPunchOutControl({
        currentState: "en_quart",
        pendingPunchOut: {
          occurredAt: employeePendingExit.occurred_at ?? "",
        },
      }).primaryLabel
    ).toBe("Sortie soumise");
  });
});

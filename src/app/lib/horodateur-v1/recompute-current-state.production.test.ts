import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveEmployeePunchGuidance } from "../employee-punch-guidance.shared";
import { formatAutoMissingExpectedPunchDetails } from "../horodateur-expected-punch-missing.shared";
import { resolveRecomputeCurrentState } from "./recompute-current-state.shared";
import type { HorodateurPhase1EventRecord } from "./types";

vi.mock("server-only", () => ({}));

const {
  listEventsForEmployee,
  getEmployeeById,
  countPendingExceptionsForEmployee,
  getShiftByEmployeeAndWorkDate,
  upsertCurrentState,
} = vi.hoisted(() => ({
  listEventsForEmployee: vi.fn(),
  getEmployeeById: vi.fn(),
  countPendingExceptionsForEmployee: vi.fn(),
  getShiftByEmployeeAndWorkDate: vi.fn(),
  upsertCurrentState: vi.fn(),
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
  countPendingExceptionsForEmployee,
  getShiftByEmployeeAndWorkDate,
  upsertCurrentState,
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
  listExceptionsForShift: vi.fn(),
  listShiftsForEmployeeWeek: vi.fn(),
  updateEventOccurredAt: vi.fn(),
  updateEventReviewStatus: vi.fn(),
  updateExceptionEscalationFields: vi.fn(),
  updateExceptionNotificationStatus: vi.fn(),
  updateExceptionReview: vi.fn(),
  attachShiftToException: vi.fn(),
}));

const WORK_DATE = "2026-09-29";
const ARRIVAL_AT = "2026-09-29T10:30:12.000Z";
const AUTOMATIC_END_AT = "2026-09-29T19:10:23.000Z";
const MIGRATION = readdirSync(join(process.cwd(), "supabase", "migrations")).find((name) =>
  name.endsWith("_recompute_horodateur_current_state_event_types.sql")
);
const sql = MIGRATION
  ? readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8")
  : "";

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

describe("recomputeCurrentState after an automatic pending quart_fin", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("keeps the employee in service with punch-out available", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T20:30:00.000Z"));

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

    listEventsForEmployee.mockImplementation(
      async (options: { statuses?: string[] }) => {
        const statuses = options.statuses ?? [];
        if (statuses.includes("en_attente") && !statuses.includes("normal")) {
          return [automaticEnd];
        }
        return [arrival];
      }
    );
    getEmployeeById.mockResolvedValue({
      employeeId: 7,
      pausePaid: false,
      organizationId: "org-oliem",
      organizationCompanyId: "company-oliem",
    });
    countPendingExceptionsForEmployee.mockResolvedValue(1);
    getShiftByEmployeeAndWorkDate.mockResolvedValue(null);

    const { recomputeCurrentState } = await import("./service");
    const serviceSource = readFileSync(
      join(process.cwd(), "src/app/lib/horodateur-v1/service.ts"),
      "utf8"
    );
    const escalationStart = serviceSource.indexOf(
      "export async function processMissingExpectedPunchEscalation"
    );
    const escalationBody = serviceSource.slice(escalationStart, escalationStart + 12000);
    const automaticInsert = escalationBody.indexOf('sourceKind: "automatique"');
    const recomputeCall = escalationBody.indexOf(
      "await recomputeCurrentState(employee.employeeId)"
    );
    expect(automaticInsert).toBeGreaterThanOrEqual(0);
    expect(recomputeCall).toBeGreaterThan(automaticInsert);

    const persisted = await recomputeCurrentState(7, { persist: false });

    expect(persisted.current_state).toBe("en_quart");
    expect(persisted.current_state).not.toBe("termine");
    expect(
      resolveEmployeePunchGuidance({ currentState: persisted.current_state }).primary
    ).toEqual({ eventType: "punch_out", label: "Pointer ma sortie" });
    expect(upsertCurrentState).not.toHaveBeenCalled();

    const sqlMirror = resolveRecomputeCurrentState([
      {
        eventType: arrival.event_type,
        status: "normal",
        eventTime: arrival.occurred_at,
        sourceKind: arrival.source_kind,
        actorRole: arrival.actor_role,
      },
      {
        eventType: automaticEnd.event_type,
        status: "en_attente",
        eventTime: automaticEnd.occurred_at,
        sourceKind: automaticEnd.source_kind,
        actorRole: automaticEnd.actor_role,
      },
    ]);
    expect(sqlMirror).toEqual({
      currentState: "en_quart",
      lastEventType: "quart_debut",
    });
    expect(sql).toContain("'quart_fin'");
    expect(sql).toContain("'automatique'::public.horodateur_source_kind");
    expect(sql).toContain("'systeme'::public.horodateur_actor_role");
    expect(sql).toContain("'normal'::public.horodateur_event_status");
    expect(sql).toContain("'approuve'::public.horodateur_event_status");
  });
});

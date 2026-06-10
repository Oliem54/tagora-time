import { describe, expect, it } from "vitest";
import {
  buildOperationalStateEvents,
  computeStateFromEventTimeline,
  filterEventsForPayrollRecompute,
  findActivePendingPunchOutFromEvents,
  formatPendingPunchOutSubmittedMessage,
} from "./operational-state.shared";
import { classifyEventPhase1 } from "./rules";
import type { HorodateurPhase1EmployeeProfile, HorodateurPhase1EventRecord } from "./types";

function event(
  partial: Partial<HorodateurPhase1EventRecord> &
    Pick<HorodateurPhase1EventRecord, "id" | "event_type" | "status" | "occurred_at">
): HorodateurPhase1EventRecord {
  return {
    employee_id: 21,
    work_date: partial.work_date ?? "2026-06-05",
    week_start_date: "2026-06-01",
    ...partial,
  };
}

const vincentProfile: HorodateurPhase1EmployeeProfile = {
  employeeId: 21,
  authUserId: "auth-vincent",
  fullName: "Vincent Blouin",
  email: "blouin20100@gmail.com",
  phoneNumber: "4184566725",
  active: true,
  primaryCompany: "oliem_solutions",
  scheduleStart: "07:00:00",
  scheduleEnd: "15:30:00",
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
  smsAlertQuartDebut: true,
  smsAlertQuartFin: true,
  smsAlertPauseDebut: true,
  smsAlertPauseFin: true,
  smsAlertDinnerDebut: true,
  smsAlertDinnerFin: true,
  smsAlertDepartTerrain: true,
  smsAlertArriveeTerrain: true,
  smsAlertSortie: true,
  smsAlertRetour: true,
  alertEmailEnabled: true,
  alertSmsEnabled: true,
  isDirectionAlertRecipient: false,
  weeklyScheduleConfig: null,
  canWorkForOliemSolutions: true,
  canWorkForTitanProduitsIndustriels: false,
};

const patrickProfile: HorodateurPhase1EmployeeProfile = {
  ...vincentProfile,
  employeeId: 7,
  fullName: "Dufour Patrick",
  scheduleStart: "06:30:00",
  scheduleEnd: "15:00:00",
};

describe("operational-state.shared — Vincent", () => {
  it("punch_out shift_too_long en_attente ferme l etat operationnel mais pas la paie", () => {
    const punchIn = event({
      id: "in-1",
      event_type: "quart_debut",
      status: "approuve",
      occurred_at: "2026-06-05T11:00:00+00:00",
    });
    const punchOutPending = event({
      id: "out-pending",
      event_type: "quart_fin",
      status: "en_attente",
      occurred_at: "2026-06-05T21:00:00+00:00",
      exception_code: "shift_too_long",
    });

    const operational = computeStateFromEventTimeline(
      buildOperationalStateEvents([punchIn], [punchOutPending])
    );
    const payroll = computeStateFromEventTimeline(
      filterEventsForPayrollRecompute([punchIn, punchOutPending])
    );

    expect(operational.currentState).toBe("termine");
    expect(payroll.currentState).toBe("en_quart");
    expect(filterEventsForPayrollRecompute([punchIn, punchOutPending])).toHaveLength(1);
  });

  it("second punch_out avec sortie deja en attente est detecte comme active pending", () => {
    const approved = [
      event({
        id: "in-1",
        event_type: "quart_debut",
        status: "approuve",
        occurred_at: "2026-06-05T11:00:00+00:00",
      }),
    ];
    const pendingOut = event({
      id: "out-pending",
      event_type: "quart_fin",
      status: "en_attente",
      occurred_at: "2026-06-05T21:00:00+00:00",
    });

    expect(findActivePendingPunchOutFromEvents([pendingOut], approved)?.id).toBe("out-pending");
    expect(
      findActivePendingPunchOutFromEvents([pendingOut, pendingOut], approved)?.id
    ).toBe("out-pending");
  });

  it("formatte le message alreadySubmitted pour Vincent", () => {
    const message = formatPendingPunchOutSubmittedMessage("2026-06-05T10:40:26.034+00:00");
    expect(message).toContain("soumise a validation");
    expect(message).toContain("continuer a utiliser l'horodateur normalement");
    expect(message.toLowerCase()).not.toContain("refus");
  });
});

describe("operational-state.shared — Patrick", () => {
  it("punch_in 4 minutes avant horaire avec grace 10 min est accepte", () => {
    const occurredAt = "2026-06-05T10:26:22.187+00:00";
    const classification = classifyEventPhase1({
      employee: patrickProfile,
      currentState: null,
      latestApprovedEvents: [],
      allApprovedEvents: [],
      eventType: "quart_debut",
      occurredAt,
      actorRole: "employe",
    });

    expect(classification.status).toBe("normal");
    expect(classification.requiresApproval).toBe(false);
  });

  it("entree pending + sortie pending ne laisse pas l employe en_quart operationnel", () => {
    const punchInPending = event({
      id: "in-pending",
      employee_id: 7,
      event_type: "quart_debut",
      status: "en_attente",
      occurred_at: "2026-06-05T10:26:22.187+00:00",
      exception_code: "outside_schedule",
    });
    const punchOutPending = event({
      id: "out-pending",
      employee_id: 7,
      event_type: "quart_fin",
      status: "en_attente",
      occurred_at: "2026-06-05T18:00:21.822+00:00",
    });

    const operational = computeStateFromEventTimeline(
      buildOperationalStateEvents([], [punchOutPending])
    );
    const payroll = computeStateFromEventTimeline([]);

    expect(operational.currentState).toBe("termine");
    expect(payroll.currentState).toBe("hors_quart");
    expect(filterEventsForPayrollRecompute([punchInPending, punchOutPending])).toHaveLength(0);
  });
});

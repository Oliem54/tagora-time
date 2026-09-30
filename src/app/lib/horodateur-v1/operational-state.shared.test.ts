import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildOperationalStateEvents,
  computeStateFromEventTimeline,
  filterEventsForPayrollRecompute,
  findActivePendingPunchOutFromEvents,
  formatPendingPunchOutSubmittedMessage,
  resolveOperationalWorkDate,
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
  organizationId: "org-oliem",
  organizationCompanyId: "company-oliem",
  authUserId: "auth-vincent",
  fullName: "Vincent Blouin",
  email: "blouin20100@gmail.com",
  phoneNumber: "4184566725",
  active: true,
  scheduleActive: true,
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

  it("quart_fin automatique en_attente ne ferme pas le quart ouvert", () => {
    const punchIn = event({
      id: "in-1",
      event_type: "quart_debut",
      status: "approuve",
      occurred_at: "2026-09-29T10:30:12.000Z",
      work_date: "2026-09-29",
    });
    const automaticPunchOut = event({
      id: "out-automatic",
      event_type: "quart_fin",
      status: "en_attente",
      occurred_at: "2026-09-29T19:10:23.000Z",
      work_date: "2026-09-29",
      actor_role: "systeme",
      source_kind: "automatique",
      exception_code: "missing_punch_adjustment",
    });

    const operational = computeStateFromEventTimeline(
      buildOperationalStateEvents([punchIn], [automaticPunchOut], "2026-09-29")
    );

    expect(operational.currentState).toBe("en_quart");
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

describe("operational-state.shared — sortie en attente bornee a la date du quart", () => {
  const dossier13Profile: HorodateurPhase1EmployeeProfile = {
    employeeId: 13,
    organizationId: "org-test",
    organizationCompanyId: "company-test",
    authUserId: "auth-dossier-13",
    fullName: "Dossier 13",
    email: "dossier13@example.test",
    phoneNumber: "0000000000",
    active: true,
    scheduleActive: true,
    primaryCompany: "oliem_solutions",
    scheduleStart: "07:00:00",
    scheduleEnd: "17:00:00",
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

  const june5PendingOut = event({
    id: "out-2026-06-05",
    employee_id: 13,
    event_type: "quart_fin",
    status: "en_attente",
    work_date: "2026-06-05",
    occurred_at: "2026-06-05T15:01:24.222+00:00",
    exception_code: "missing_punch_adjustment",
  });
  const june17PendingOut = event({
    id: "out-2026-06-17",
    employee_id: 13,
    event_type: "quart_fin",
    status: "en_attente",
    work_date: "2026-06-17",
    occurred_at: "2026-06-17T19:30:00+00:00",
    exception_code: "missing_punch_adjustment",
  });
  const otherEmployeePendingOut = event({
    id: "out-other-employee",
    employee_id: 99,
    event_type: "quart_fin",
    status: "en_attente",
    work_date: "2026-09-29",
    occurred_at: "2026-09-29T21:00:00+00:00",
  });

  it("une sortie en attente du 17 juin ne bloque pas un punch_out du 29 septembre", () => {
    const occurredAt = "2026-09-29T12:14:34.358Z";
    const approved = [
      event({
        id: "in-2026-06-17",
        employee_id: 13,
        event_type: "quart_debut",
        status: "approuve",
        work_date: "2026-06-17",
        occurred_at: "2026-06-17T11:00:00+00:00",
      }),
    ];
    const pending = [june5PendingOut, june17PendingOut, otherEmployeePendingOut];
    const operationalWorkDate = resolveOperationalWorkDate({
      eventType: "quart_fin",
      occurredAt,
      approvedEvents: approved,
    });

    expect(operationalWorkDate).toBe("2026-09-29");
    expect(
      findActivePendingPunchOutFromEvents(pending, approved, {
        operationalWorkDate,
        employeeId: 13,
      })
    ).toBeNull();
    expect(june5PendingOut.status).toBe("en_attente");
    expect(june17PendingOut.status).toBe("en_attente");
    expect(otherEmployeePendingOut.status).toBe("en_attente");
    expect(otherEmployeePendingOut.employee_id).toBe(99);
  });

  it("une sortie en attente du meme quart reste deja soumise", () => {
    const approved = [
      event({
        id: "in-2026-09-29",
        employee_id: 13,
        event_type: "quart_debut",
        status: "approuve",
        work_date: "2026-09-29",
        occurred_at: "2026-09-29T11:00:00+00:00",
      }),
    ];
    const sameShiftPendingOut = event({
      id: "out-2026-09-29",
      employee_id: 13,
      event_type: "quart_fin",
      status: "en_attente",
      work_date: "2026-09-29",
      occurred_at: "2026-09-29T21:00:00+00:00",
    });
    const operationalWorkDate = resolveOperationalWorkDate({
      eventType: "quart_fin",
      occurredAt: "2026-09-29T21:05:00+00:00",
      approvedEvents: approved,
    });

    expect(operationalWorkDate).toBe("2026-09-29");
    expect(
      findActivePendingPunchOutFromEvents(
        [june17PendingOut, sameShiftPendingOut, otherEmployeePendingOut],
        approved,
        { operationalWorkDate, employeeId: 13 }
      )?.id
    ).toBe("out-2026-09-29");
    expect(june17PendingOut.status).toBe("en_attente");
  });

  it("une sortie en attente du quart continuable de nuit reste deja soumise", () => {
    const punchInAt = "2026-08-17T22:00:00-04:00";
    const punchOutAt = "2026-08-18T02:00:00-04:00";
    const approved = [
      event({
        id: "in-night",
        employee_id: 13,
        event_type: "quart_debut",
        status: "approuve",
        work_date: "2026-08-17",
        occurred_at: punchInAt,
      }),
    ];
    const overnightPendingOut = event({
      id: "out-night",
      employee_id: 13,
      event_type: "quart_fin",
      status: "en_attente",
      work_date: "2026-08-17",
      occurred_at: "2026-08-18T01:00:00-04:00",
    });
    const operationalWorkDate = resolveOperationalWorkDate({
      eventType: "quart_fin",
      occurredAt: punchOutAt,
      approvedEvents: approved,
    });

    expect(operationalWorkDate).toBe("2026-08-17");
    expect(
      findActivePendingPunchOutFromEvents([overnightPendingOut, june17PendingOut], approved, {
        operationalWorkDate,
        employeeId: 13,
      })?.id
    ).toBe("out-night");
  });

  it("prepare un nouvel evenement selon la regle existante sans reutiliser la sortie du 17 juin", () => {
    const occurredAt = "2026-09-29T12:14:34.358Z";
    const approved = [
      event({
        id: "in-2026-06-17",
        employee_id: 13,
        event_type: "quart_debut",
        status: "approuve",
        work_date: "2026-06-17",
        occurred_at: "2026-06-17T11:00:00+00:00",
      }),
    ];
    const operationalWorkDate = resolveOperationalWorkDate({
      eventType: "quart_fin",
      occurredAt,
      approvedEvents: approved,
    });
    const blocking = findActivePendingPunchOutFromEvents(
      [june5PendingOut, june17PendingOut],
      approved,
      { operationalWorkDate, employeeId: 13 }
    );
    const classification = classifyEventPhase1({
      employee: dossier13Profile,
      currentState: null,
      latestApprovedEvents: [],
      allApprovedEvents: approved,
      pendingPunchOutEvents: [june5PendingOut, june17PendingOut],
      eventType: "quart_fin",
      occurredAt,
      actorRole: "employe",
    });

    expect(blocking).toBeNull();
    expect(classification.status).toBe("en_attente");
    expect(classification.requiresApproval).toBe(true);
    expect(classification.exceptionType).toBe("missing_punch_adjustment");
    expect(june17PendingOut.id).toBe("out-2026-06-17");
    expect(june17PendingOut.status).toBe("en_attente");
  });

  it("reste une fonction pure, sans Nexus et sans ecriture de donnees", () => {
    const shared = readFileSync(
      "src/app/lib/horodateur-v1/operational-state.shared.ts",
      "utf8"
    );
    const service = readFileSync("src/app/lib/horodateur-v1/service.ts", "utf8");

    expect(shared).not.toContain("supabase");
    expect(shared).not.toContain("nexus");
    expect(service).toContain("operationalWorkDate: workDate");
    expect(service).toContain("employeeId,");
  });
});

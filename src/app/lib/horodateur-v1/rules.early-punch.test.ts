import { describe, expect, it } from "vitest";

import {
  classifyEventPhase1,
  diffMinutes,
  isEarlyPunchInWithinSilentWindow,
  resolvePayableWorkSegmentStartAt,
} from "./rules";
import type { HorodateurPhase1EmployeeProfile } from "./types";

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

describe("rules — entree tot silencieuse Phase 0", () => {
  const workDate = "2026-06-08";
  const punchAt = "2026-06-08T06:35:00-04:00";

  it("accepte un punch 25 minutes avant l horaire sans outside_schedule", () => {
    expect(isEarlyPunchInWithinSilentWindow(vincentProfile, punchAt)).toBe(true);

    const classification = classifyEventPhase1({
      employee: vincentProfile,
      currentState: null,
      latestApprovedEvents: [],
      allApprovedEvents: [],
      eventType: "quart_debut",
      occurredAt: punchAt,
      actorRole: "employe",
    });

    expect(classification.status).toBe("normal");
    expect(classification.requiresApproval).toBe(false);
    expect(classification.exceptionType).toBeNull();
  });

  it("plafonne l accrual payable a l horaire prevu", () => {
    const payableStart = resolvePayableWorkSegmentStartAt({
      punchInOccurredAt: punchAt,
      workDate,
      scheduleStart: vincentProfile.scheduleStart,
    });
    const endAt = "2026-06-08T08:00:00-04:00";

    expect(diffMinutes(payableStart, endAt)).toBe(60);
    expect(diffMinutes(punchAt, endAt)).toBe(85);
  });

  it("conserve outside_schedule au-dela de 45 minutes avant l horaire", () => {
    const tooEarly = "2026-06-08T05:00:00-04:00";
    expect(isEarlyPunchInWithinSilentWindow(vincentProfile, tooEarly)).toBe(false);

    const classification = classifyEventPhase1({
      employee: vincentProfile,
      currentState: null,
      latestApprovedEvents: [],
      allApprovedEvents: [],
      eventType: "quart_debut",
      occurredAt: tooEarly,
      actorRole: "employe",
    });

    expect(classification.exceptionType).toBe("outside_schedule");
    expect(classification.requiresApproval).toBe(true);
  });
});

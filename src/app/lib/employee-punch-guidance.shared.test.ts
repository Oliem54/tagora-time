import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildForgottenArrivalAudit,
  buildForgottenArrivalRequest,
  describeEmployeeException,
  elapsedMinutesBetween,
  formatElapsedHours,
  formatEnServiceDepuis,
  resolveEmployeePunchGuidance,
  resolveRecordedArrivalAt,
  resolveShiftTimePresentation,
  shouldRejectSecondArrivalPunch,
} from "./employee-punch-guidance.shared";

const ARRIVAL = "2026-09-29T11:00:00.000Z";
const NOW = "2026-09-29T13:20:00.000Z";

describe("employee punch actions by state", () => {
  it("asks to punch arrival before the shift and hides other punches", () => {
    const guidance = resolveEmployeePunchGuidance({ currentState: "hors_quart" });
    expect(guidance.phase).toBe("avant_quart");
    expect(guidance.primary).toEqual({
      eventType: "punch_in",
      label: "Pointer mon arrivée",
    });
    expect(guidance.secondary).toEqual([]);
    expect(guidance.arrivalBlocked).toBe(false);
  });

  it("removes a generic arrival punch during an active shift", () => {
    const guidance = resolveEmployeePunchGuidance({
      currentState: "en_quart",
      arrivalAt: ARRIVAL,
    });
    expect(guidance.phase).toBe("quart_actif");
    expect(guidance.statusLabel).toBe("En service");
    expect(guidance.primary?.label).toBe("Pointer ma sortie");
    expect(guidance.primary?.eventType).toBe("punch_out");
    expect(guidance.secondary.map((action) => action.eventType)).not.toContain("punch_in");
    expect(guidance.arrivalBlocked).toBe(true);
    expect(guidance.serviceSinceLabel).toMatch(/^En service depuis /);
  });

  it("keeps an obvious exit during a pending shift", () => {
    const guidance = resolveEmployeePunchGuidance({
      currentState: "en_quart",
      shiftStatus: "en_attente",
      pendingValidation: true,
    });
    expect(guidance.phase).toBe("quart_en_attente");
    expect(guidance.primary?.label).toBe("Pointer ma sortie");
    expect(guidance.guidance).toMatch(/provisoire/);
    expect(guidance.arrivalBlocked).toBe(true);
  });

  it("offers resume during pause and dinner, plus exit", () => {
    const pause = resolveEmployeePunchGuidance({ currentState: "en_pause" });
    expect(pause.phase).toBe("pause");
    expect(pause.primary).toEqual({
      eventType: "break_end",
      label: "Reprendre le service",
    });
    expect(pause.secondary).toEqual([
      { eventType: "punch_out", label: "Pointer ma sortie" },
    ]);

    const dinner = resolveEmployeePunchGuidance({ currentState: "en_diner" });
    expect(dinner.phase).toBe("diner");
    expect(dinner.statusLabel).toBe("Au dîner");
    expect(dinner.primary?.eventType).toBe("meal_end");
    expect(dinner.secondary[0]?.eventType).toBe("punch_out");
    expect(dinner.arrivalBlocked).toBe(true);
  });

  it("does not offer a second arrival after the shift is finished", () => {
    const guidance = resolveEmployeePunchGuidance({ currentState: "termine" });
    expect(guidance.phase).toBe("quart_termine");
    expect(guidance.primary?.eventType).toBeNull();
    expect(guidance.secondary).toEqual([]);
  });
});

describe("elapsed time", () => {
  it("counts minutes since the recorded arrival", () => {
    expect(elapsedMinutesBetween(ARRIVAL, NOW)).toBe(140);
    expect(formatElapsedHours(140)).toBe("2 h 20");
    expect(elapsedMinutesBetween(NOW, ARRIVAL)).toBe(0);
  });

  it("shows provisional elapsed time instead of 0 h 00 when validation is pending", () => {
    const presentation = resolveShiftTimePresentation({
      currentState: "en_quart",
      officialPayableMinutes: 0,
      livePayableMinutes: 0,
      hasOpenShiftAccrual: false,
      pendingValidation: true,
      arrivalAt: ARRIVAL,
      nowIso: NOW,
    });
    expect(presentation.timeDisplayKind).toBe("provisional");
    expect(presentation.displayedMinutes).toBe(140);
    expect(formatElapsedHours(presentation.displayedMinutes)).not.toBe("0 h 00");
    expect(presentation.headlineLabel).toMatch(/provisoire/);
    expect(presentation.payrollMinutes).toBe(0);
    expect(presentation.payrollLabel).toMatch(/approuvé pour la paie/);
    expect(presentation.showPayrollApart).toBe(true);
  });

  it("keeps approved payroll time separate from live time", () => {
    const presentation = resolveShiftTimePresentation({
      currentState: "en_quart",
      officialPayableMinutes: 0,
      livePayableMinutes: 45,
      hasOpenShiftAccrual: true,
      pendingValidation: false,
      arrivalAt: ARRIVAL,
      nowIso: NOW,
      computedAt: "2026-09-29T13:10:00.000Z",
    });
    expect(presentation.timeDisplayKind).toBe("live");
    expect(presentation.displayedMinutes).toBe(55);
    expect(presentation.payrollMinutes).toBe(0);
    expect(presentation.showPayrollApart).toBe(true);
  });

  it("uses the recorded arrival even when only a pending punch exists", () => {
    expect(
      resolveRecordedArrivalAt({
        currentState: "en_quart",
        approvedArrivalAt: null,
        pendingArrivalAt: ARRIVAL,
      })
    ).toBe(ARRIVAL);
    expect(formatEnServiceDepuis(ARRIVAL)).toBe("En service depuis 7 h 00");
  });
});

describe("second arrival prevention", () => {
  it("rejects a second arrival when the open shift is still continuable", () => {
    expect(
      shouldRejectSecondArrivalPunch({
        currentState: "en_quart",
        openShiftContinuable: true,
        pendingArrivalToday: false,
      })
    ).toBe(true);
    expect(
      shouldRejectSecondArrivalPunch({
        currentState: "en_pause",
        openShiftContinuable: false,
        pendingArrivalToday: true,
      })
    ).toBe(true);
  });

  it("allows the first arrival before a shift and ignores a stale open shift", () => {
    expect(
      shouldRejectSecondArrivalPunch({
        currentState: "hors_quart",
        openShiftContinuable: false,
        pendingArrivalToday: false,
      })
    ).toBe(false);
    expect(
      shouldRejectSecondArrivalPunch({
        currentState: "en_quart",
        openShiftContinuable: false,
        pendingArrivalToday: false,
      })
    ).toBe(false);
  });
});

describe("forgotten arrival request", () => {
  it("builds a traceable adjustment that does not create a second punch", () => {
    const request = buildForgottenArrivalRequest({
      date: "2026-09-29",
      time: "07:00",
      reason: "J'ai oublié de pointer en arrivant.",
      shiftOpen: true,
      initialEventId: "event-initial",
    });
    expect(request.ok).toBe(true);
    if (!request.ok) return;
    expect(request.eventType).toBe("retroactive_entry");
    expect(request.createsPunchIn).toBe(false);
    expect(request.preservesInitialEvent).toBe(true);
    expect(request.approvalRequired).toBe(true);
    expect(request.status).toBe("en_attente");
    expect(request.shiftRemainsOpen).toBe(true);
    expect(request.summary).toMatch(/quart reste en cours/);
    expect(request.summary).toMatch(/aucun deuxième pointage/i);
    expect(request.note).toContain("Événement initial conservé : event-initial");

    const audit = buildForgottenArrivalAudit({
      shiftRemainsOpen: request.shiftRemainsOpen,
      initialEventId: request.initialEventId,
      adjustmentEventId: "event-adjustment",
      exceptionId: "exception-1",
    });
    expect(audit).toMatchObject({
      kind: "forgotten_arrival_adjustment",
      createdSecondPunchIn: false,
      erasedInitialEvent: false,
      initialEventPreserved: true,
      approvalRequired: true,
      status: "en_attente",
      eventType: "retroactive_entry",
      initialEventId: "event-initial",
      adjustmentEventId: "event-adjustment",
      exceptionId: "exception-1",
    });
  });

  it("requires a reason and refuses a future date", () => {
    expect(
      buildForgottenArrivalRequest({
        date: "2026-09-29",
        time: "07:00",
        reason: "ok",
        shiftOpen: false,
      }).ok
    ).toBe(false);
    expect(
      buildForgottenArrivalRequest({
        date: "2099-01-01",
        time: "07:00",
        reason: "Arrivée oubliée ce matin-là.",
        shiftOpen: false,
      }).ok
    ).toBe(false);
  });
});

describe("server wiring", () => {
  it("rejects a second arrival and records a forgotten-arrival audit", () => {
    const service = readFileSync(
      join(process.cwd(), "src/app/lib/horodateur-v1/service.ts"),
      "utf8"
    );
    const route = readFileSync(
      join(process.cwd(), "src/app/api/horodateur/forgotten-arrival/route.ts"),
      "utf8"
    );
    expect(service).toContain("shouldRejectSecondArrivalPunch");
    expect(service).toContain("arrival_already_open");
    expect(service).toContain("buildForgottenArrivalAudit");
    expect(service).toContain('eventType: "retroactive_entry"');
    expect(service).not.toContain("createdSecondPunchIn: true");
    expect(route).toContain("createForgottenArrivalAdjustment");
    expect(route).toContain("createdSecondPunchIn: false");
  });
});

describe("exception copy", () => {
  it("explains the current shift separately from history", () => {
    const current = describeEmployeeException({
      exceptionType: "missing_punch_adjustment",
      reasonLabel: "Punch attendu manquant",
      status: "en_attente",
      scope: "current_shift",
    });
    expect(current.scopeLabel).toBe("Exception du quart en cours");
    expect(current.explanation.length).toBeGreaterThan(20);
    expect(current.expectedAction).toMatch(/direction|oubliée/i);
    expect(current.statusLabel).toBe("En attente d'approbation");
    expect(current.title).not.toBe("missing_punch_adjustment");

    const history = describeEmployeeException({
      exceptionType: "outside_schedule",
      status: "approuve",
      scope: "history",
    });
    expect(history.scopeLabel).toBe("Historique des exceptions");
    expect(history.statusLabel).toBe("Approuvée pour la paie");
  });
});

import { describe, expect, it } from "vitest";
import { resolveEmployeeHorodateurClockView } from "./employee-horodateur-clock.shared";
import {
  explainEmployeePunchError,
  resolveEmployeePunchGuidance,
  resolveOpenShiftSafetyCapAlert,
} from "./employee-punch-guidance.shared";

describe("actions de pointage selon l'état", () => {
  it("reprend le service en pause et termine le dîner avant de proposer la sortie", () => {
    const onPause = resolveEmployeePunchGuidance({
      currentState: "en_pause",
      pausePaid: false,
    });
    const atDinner = resolveEmployeePunchGuidance({ currentState: "en_diner" });

    expect(onPause.primary).toEqual({
      eventType: "break_end",
      label: "Reprendre le service",
    });
    expect(onPause.primary?.eventType).not.toBe("punch_out");
    expect(onPause.secondary.map((action) => action.eventType)).toContain("punch_out");

    expect(atDinner.primary).toEqual({
      eventType: "meal_end",
      label: "Terminer le dîner",
    });
    expect(atDinner.primary?.eventType).not.toBe("punch_out");
    expect(atDinner.secondary.map((action) => action.eventType)).toContain("punch_out");

    expect(resolveEmployeePunchGuidance({ currentState: "en_quart" }).primary?.eventType).toBe(
      "punch_out"
    );
    expect(resolveEmployeePunchGuidance({ currentState: "hors_quart" }).primary?.eventType).toBe(
      "punch_in"
    );
    expect(resolveEmployeePunchGuidance({ currentState: "termine" }).primary).toEqual({
      eventType: null,
      label: "Consulter le pointage",
    });
  });

  it("n'offre aucune action de pause quand une pause payée est encore affichée", () => {
    const stalePaidPause = resolveEmployeePunchGuidance({
      currentState: "en_pause",
      pausePaid: true,
    });
    const actions = [stalePaidPause.primary, ...stalePaidPause.secondary];

    expect(stalePaidPause.statusLabel).toBe("En pause");
    expect(stalePaidPause.guidance).toContain("incluse dans le quart");
    expect(stalePaidPause.guidance).toContain("n'avez pas à la pointer");
    expect(stalePaidPause.primary).toEqual({
      eventType: "punch_out",
      label: "Pointer ma sortie",
    });
    expect(actions.some((action) => action?.eventType === "break_end")).toBe(false);
    expect(actions.some((action) => action?.eventType === "break_start")).toBe(false);
    expect(actions.some((action) => action?.label === "Reprendre le service")).toBe(false);

    const clock = resolveEmployeeHorodateurClockView({
      nowMs: Date.parse("2026-10-23T16:00:00.000Z"),
      currentState: "en_pause",
      payableMinutes: 90,
      pausePaid: true,
    });
    expect(clock.primaryLabel).toBe("Pointer ma sortie");
    expect(clock.secondaryLabels).not.toContain("Reprendre le service");
    expect(clock.guidance).toContain("incluse dans le quart");

    const unpaidPause = resolveEmployeePunchGuidance({
      currentState: "en_pause",
      pausePaid: false,
    });
    expect(unpaidPause.primary).toEqual({
      eventType: "break_end",
      label: "Reprendre le service",
    });
  });

  it("n'offre pas le début d'une pause payée pendant le service", () => {
    const paidShift = resolveEmployeePunchGuidance({
      currentState: "en_quart",
      pausePaid: true,
      lunchPaid: false,
    });
    expect(paidShift.secondary.some((action) => action.eventType === "break_start")).toBe(
      false
    );
    expect(paidShift.secondary.some((action) => action.eventType === "meal_start")).toBe(
      true
    );

    const unpaidShift = resolveEmployeePunchGuidance({
      currentState: "en_quart",
      pausePaid: false,
    });
    expect(unpaidShift.secondary.some((action) => action.eventType === "break_start")).toBe(
      true
    );
    expect(unpaidShift.secondary.some((action) => action.eventType === "break_end")).toBe(
      false
    );

    const offShift = resolveEmployeePunchGuidance({ currentState: "hors_quart" });
    expect(
      offShift.secondary.some(
        (action) => action.eventType === "meal_start" || action.eventType === "meal_end"
      )
    ).toBe(false);

    const atDinner = resolveEmployeePunchGuidance({ currentState: "en_diner" });
    expect(atDinner.primary?.eventType).toBe("meal_end");
    expect(atDinner.secondary.some((action) => action.eventType === "meal_start")).toBe(
      false
    );

    expect(explainEmployeePunchError("Pause payee : aucun pointage")).toContain(
      "début ni la fin de pause"
    );
  });

  it("cache l'alerte de quart trop long quand l'employé n'est pas en service", () => {
    expect(
      resolveOpenShiftSafetyCapAlert({
        currentState: "hors_quart",
        openShiftSafetyCapReached: true,
      })
    ).toBeNull();
    expect(
      resolveOpenShiftSafetyCapAlert({
        currentState: "en_quart",
        openShiftSafetyCapReached: true,
      })
    ).toContain("14 h");
    expect(
      resolveOpenShiftSafetyCapAlert({
        currentState: "en_pause",
        openShiftSafetyCapReached: false,
      })
    ).toBeNull();
  });
});

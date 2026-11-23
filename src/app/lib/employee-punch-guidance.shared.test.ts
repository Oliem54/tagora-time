import { describe, expect, it } from "vitest";
import { HORODATEUR_EARLY_PUNCH_SILENT_MAX_MINUTES } from "@/app/lib/horodateur-v1/rules";
import {
  accrueOpenShiftDisplayMinutes,
  explainEmployeePunchError,
  isCompletedShiftArrivalAdmissible,
  resolveEmployeePunchGuidance,
} from "./employee-punch-guidance.shared";

describe("employee punch guidance", () => {
  it("shows one clear primary action for each live state", () => {
    expect(resolveEmployeePunchGuidance({ currentState: "hors_quart" }).primary).toEqual({
      eventType: "punch_in",
      label: "Pointer mon arrivée",
    });
    expect(resolveEmployeePunchGuidance({ currentState: "en_quart" }).primary?.label).toBe(
      "Pointer ma sortie"
    );
    expect(resolveEmployeePunchGuidance({ currentState: "en_pause" }).primary).toEqual({
      eventType: "break_end",
      label: "Reprendre le service",
    });
    expect(resolveEmployeePunchGuidance({ currentState: "en_diner" }).primary).toEqual({
      eventType: "meal_end",
      label: "Terminer le dîner",
    });
    expect(resolveEmployeePunchGuidance({ currentState: "en_diner" }).statusLabel).toBe(
      "Au dîner"
    );
    expect(resolveEmployeePunchGuidance({ currentState: "termine" }).primary).toEqual({
      eventType: null,
      label: "Consulter le pointage",
    });
  });

  it("offers one arrival after a finished shift only inside the existing schedule window", () => {
    const start = "2026-11-06T11:00:00.000Z";
    const inside = {
      canPunchNow: true,
      isWithinScheduleWindow: true,
      scheduledStartAt: start,
      currentAt: "2026-11-06T12:00:00.000Z",
    };
    const early = {
      canPunchNow: true,
      isWithinScheduleWindow: false,
      scheduledStartAt: start,
      currentAt: new Date(
        Date.parse(start) - (HORODATEUR_EARLY_PUNCH_SILENT_MAX_MINUTES - 1) * 60_000
      ).toISOString(),
    };
    const tooEarly = {
      canPunchNow: true,
      isWithinScheduleWindow: false,
      scheduledStartAt: start,
      currentAt: new Date(
        Date.parse(start) - (HORODATEUR_EARLY_PUNCH_SILENT_MAX_MINUTES + 5) * 60_000
      ).toISOString(),
    };
    const blockedDay = {
      canPunchNow: false,
      isWithinScheduleWindow: false,
      scheduledStartAt: start,
      currentAt: "2026-11-06T12:00:00.000Z",
    };

    expect(isCompletedShiftArrivalAdmissible(inside)).toBe(true);
    expect(isCompletedShiftArrivalAdmissible(early)).toBe(true);
    expect(isCompletedShiftArrivalAdmissible(tooEarly)).toBe(false);
    expect(isCompletedShiftArrivalAdmissible(blockedDay)).toBe(false);
    expect(
      isCompletedShiftArrivalAdmissible({
        canPunchNow: true,
        isWithinScheduleWindow: true,
      })
    ).toBe(true);

    expect(
      resolveEmployeePunchGuidance({
        currentState: "termine",
        completedShiftArrival: inside,
      }).primary
    ).toEqual({ eventType: "punch_in", label: "Pointer mon arrivée" });
    expect(
      resolveEmployeePunchGuidance({
        currentState: "termine",
        completedShiftArrival: tooEarly,
      }).guidance
    ).toContain("Une nouvelle arrivée n'est pas proposée ici.");
    expect(
      resolveEmployeePunchGuidance({
        currentState: "termine",
        completedShiftArrival: blockedDay,
      }).primary?.eventType
    ).toBeNull();
    expect(
      resolveEmployeePunchGuidance({
        currentState: "en_quart",
        completedShiftArrival: inside,
      }).primary?.eventType
    ).toBe("punch_out");
    expect(
      resolveEmployeePunchGuidance({
        currentState: "en_pause",
        completedShiftArrival: inside,
      }).arrivalBlocked
    ).toBe(true);
  });

  it("hides pause and paid dinner buttons that a beginner must not press", () => {
    const onShift = resolveEmployeePunchGuidance({
      currentState: "en_quart",
      pausePaid: true,
      lunchPaid: true,
    });
    expect(onShift.secondary.map((action) => action.eventType)).toEqual([]);

    const unpaid = resolveEmployeePunchGuidance({
      currentState: "en_quart",
      pausePaid: false,
      lunchPaid: false,
    });
    expect(unpaid.secondary.map((action) => action.label)).toEqual([
      "Commencer ma pause",
      "Commencer mon dîner",
    ]);
  });

  it("turns technical punch refusals into a next step", () => {
    expect(
      explainEmployeePunchError(
        "Sequence de pointage invalide (Etat courant: en_quart; action: break_end; Transition d etat invalide.)"
      )
    ).toContain("bouton principal");
    expect(explainEmployeePunchError("Pause payee : aucun pointage")).toContain(
      "pause est payée"
    );
    expect(explainEmployeePunchError("duplicate key value violates horodateur_events")).not.toContain(
      "horodateur_events"
    );
    expect(explainEmployeePunchError("Pointage enregistré.")).toBe("Pointage enregistré.");
  });

  it("adds at most five live minutes between server refreshes", () => {
    const computedAt = "2026-10-05T14:00:00.000Z";
    const nowMs = Date.parse("2026-10-05T14:03:10.000Z");
    expect(
      accrueOpenShiftDisplayMinutes({
        baseMinutes: 120,
        computedAt,
        nowMs,
        accrues: true,
      })
    ).toBe(123);
    expect(
      accrueOpenShiftDisplayMinutes({
        baseMinutes: 120,
        computedAt,
        nowMs: Date.parse("2026-10-05T14:20:00.000Z"),
        accrues: true,
      })
    ).toBe(125);
    expect(
      accrueOpenShiftDisplayMinutes({
        baseMinutes: 120,
        computedAt,
        nowMs,
        accrues: false,
      })
    ).toBe(120);
  });
});

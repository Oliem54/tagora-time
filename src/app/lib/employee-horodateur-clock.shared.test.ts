import { describe, expect, it } from "vitest";
import { resolveEmployeeHorodateurClockView } from "./employee-horodateur-clock.shared";

const NOW = Date.parse("2026-10-06T18:00:00.000Z");
const LAST_PUNCH = "2026-10-06T12:07:33.000Z";
const COMPUTED_AT = "2026-10-06T17:57:00.000Z";

function viewFor(
  currentState: string,
  extra: Partial<Parameters<typeof resolveEmployeeHorodateurClockView>[0]> = {}
) {
  return resolveEmployeeHorodateurClockView({
    nowMs: NOW,
    currentState,
    lastEventAt: LAST_PUNCH,
    payableMinutes: 120,
    computedAt: COMPUTED_AT,
    hasOpenShiftAccrual: true,
    pausePaid: false,
    lunchPaid: false,
    ...extra,
  });
}

describe("employee horodateur clock", () => {
  it("shows a Toronto clock that is not the confirmed punch", () => {
    const view = viewFor("hors_quart", { payableMinutes: 0, lastEventAt: null });
    expect(view.timezone).toBe("America/Toronto");
    expect(view.currentTimeLabel).toBe("14 h 00 min 00 s");
    expect(view.currentTimeNote).toMatch(/n'est pas un pointage/);
    expect(view.lastPunchLabel).toBe("Aucun pointage confirmé");
    expect(view.currentTimeLabel).not.toBe(view.lastPunchLabel);
  });

  it("keeps the five states consistent with a controlled clock", () => {
    const notPunched = viewFor("hors_quart", {
      payableMinutes: 0,
      openShiftSafetyCapReached: true,
      hasOpenShiftAccrual: false,
    });
    expect(notPunched.statusLabel).toBe("Non pointé");
    expect(notPunched.primaryLabel).toBe("Pointer mon arrivée");
    expect(notPunched.asksForPunchOut).toBe(false);
    expect(notPunched.safetyAlert).toBeNull();
    expect(notPunched.cumulativeMinutes).toBe(0);
    expect(notPunched.cumulativeLabel).toBe("Temps payé aujourd'hui");
    expect(notPunched.lastPunchLabel).toBe("2026-10-06, 08 h 07 min 33 s");

    const onShift = viewFor("en_quart");
    expect(onShift.statusLabel).toBe("En service");
    expect(onShift.primaryLabel).toBe("Pointer ma sortie");
    expect(onShift.secondaryLabels).toEqual(["Commencer ma pause", "Commencer mon dîner"]);
    expect(onShift.cumulativeMinutes).toBe(123);
    expect(onShift.cumulativeLabel).toBe("Temps payé en cours");
    expect(onShift.currentTimeLabel).not.toBe(onShift.lastPunchLabel);

    const onBreak = viewFor("en_pause");
    expect(onBreak.statusLabel).toBe("En pause");
    expect(onBreak.primaryLabel).toBe("Reprendre le service");
    expect(onBreak.cumulativeMinutes).toBe(120);
    expect(onBreak.cumulativeNote).toMatch(/pause/);

    const atDinner = viewFor("en_diner");
    expect(atDinner.statusLabel).toBe("Au dîner");
    expect(atDinner.primaryLabel).toBe("Terminer le dîner");
    expect(atDinner.secondaryLabels).toContain("Pointer ma sortie");
    expect(atDinner.cumulativeMinutes).toBe(120);
    expect(atDinner.cumulativeNote).toMatch(/dîner/);

    const finished = viewFor("termine", { payableMinutes: 480, hasOpenShiftAccrual: false });
    expect(finished.statusLabel).toBe("Quart terminé");
    expect(finished.primaryLabel).toBe("Consulter le pointage");
    expect(finished.asksForPunchOut).toBe(false);
    expect(finished.cumulativeMinutes).toBe(480);
    expect(finished.cumulativeLabel).toBe("Temps payé du quart");
  });
});

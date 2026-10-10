import { describe, expect, it } from "vitest";
import { accrueOpenShiftDisplayMinutes } from "../employee-punch-guidance.shared";
import { resolveEmployeePunchGuidance } from "../employee-punch-guidance.shared";
import {
  buildLocalPunchQaPayload,
  parseLocalPunchQaState,
  resolveLocalPunchQaState,
} from "./local-punch-qa-fixture.shared";

describe("local punch QA fixture", () => {
  it("stays off unless the local fixture gate and a known state are both present", () => {
    expect(parseLocalPunchQaState("en_quart")).toBe("en_quart");
    expect(parseLocalPunchQaState("staging")).toBeNull();
    expect(
      resolveLocalPunchQaState({ fixtureEnabled: false, cookie: "en_quart" })
    ).toBeNull();
    expect(resolveLocalPunchQaState({ fixtureEnabled: true, cookie: "en_diner" })).toBe(
      "en_diner"
    );
  });

  it("maps each in-memory state to one primary action", () => {
    const now = Date.parse("2026-10-05T14:00:00.000Z");
    const expected = {
      hors_quart: "Pointer mon arrivée",
      en_quart: "Pointer ma sortie",
      en_pause: "Reprendre le service",
      en_diner: "Terminer le dîner",
      termine: "Consulter le pointage",
    } as const;
    for (const [state, label] of Object.entries(expected)) {
      const payload = buildLocalPunchQaPayload(
        state as keyof typeof expected,
        now
      );
      expect(payload.me.localPunchQa).toBe(true);
      expect(
        resolveEmployeePunchGuidance({
          currentState: payload.me.currentState.current_state,
          pausePaid: payload.me.employee.pausePaid,
          lunchPaid: payload.me.employee.lunchPaid,
        }).primary?.label
      ).toBe(label);
    }
  });

  it("moves an open shift forward on a controlled clock without a database write", () => {
    const now = Date.parse("2026-10-05T14:00:00.000Z");
    const payload = buildLocalPunchQaPayload("en_quart", now);
    expect(payload.me.todayTimeDisplay.hasOpenShiftAccrual).toBe(true);
    expect(
      accrueOpenShiftDisplayMinutes({
        baseMinutes: payload.me.todayTimeDisplay.livePayableMinutes,
        computedAt: payload.me.todayTimeDisplay.computedAt,
        nowMs: now,
        accrues: true,
      })
    ).toBe(92);
    expect(
      accrueOpenShiftDisplayMinutes({
        baseMinutes: payload.me.todayTimeDisplay.livePayableMinutes,
        computedAt: payload.me.todayTimeDisplay.computedAt,
        nowMs: now + 20_000,
        accrues: true,
      })
    ).toBe(93);
  });
});

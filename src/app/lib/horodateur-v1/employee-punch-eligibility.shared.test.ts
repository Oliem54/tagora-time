import { describe, expect, it } from "vitest";
import { resolveEmployeePunchGuidance } from "../employee-punch-guidance.shared";
import {
  directionManualPunchOptions,
  paidOperationalPunchBlock,
  shouldIgnorePaidOperationalEvent,
} from "./employee-punch-eligibility.shared";
import { computeStateFromEventTimeline } from "./operational-state.shared";
import { toCanonicalEventType } from "./rules";
import type { HorodateurPhase1EventRecord } from "./types";

function event(
  partial: Partial<HorodateurPhase1EventRecord> &
    Pick<HorodateurPhase1EventRecord, "id" | "event_type" | "occurred_at">
): HorodateurPhase1EventRecord {
  return {
    employee_id: 21,
    status: "normal",
    work_date: "2026-10-23",
    week_start_date: "2026-10-19",
    ...partial,
  };
}

describe("paid pause punch guard", () => {
  const paidPause = { pausePaid: true, lunchPaid: false };
  const unpaidPause = { pausePaid: false, lunchPaid: false };
  const paidLunch = { pausePaid: false, lunchPaid: true };

  it("refuses a paid pause end and still refuses its start", () => {
    expect(paidOperationalPunchBlock(paidPause, "break_end")?.code).toBe(
      "paid_break_no_punch_required"
    );
    expect(paidOperationalPunchBlock(paidPause, "break_end")?.status).toBe(409);
    expect(
      paidOperationalPunchBlock(paidPause, toCanonicalEventType("pause_fin"))?.code
    ).toBe("paid_break_no_punch_required");
    expect(paidOperationalPunchBlock(paidPause, "break_start")?.code).toBe(
      "paid_break_no_punch_required"
    );
    expect(paidOperationalPunchBlock(paidPause, "break_start")?.status).toBe(409);
    expect(
      paidOperationalPunchBlock(paidPause, toCanonicalEventType("pause_debut"))?.code
    ).toBe("paid_break_no_punch_required");

    expect(shouldIgnorePaidOperationalEvent(paidPause, "break_end")).toBe(true);
    expect(shouldIgnorePaidOperationalEvent(paidPause, "break_start")).toBe(true);

    expect(paidOperationalPunchBlock(unpaidPause, "break_start")).toBeNull();
    expect(paidOperationalPunchBlock(unpaidPause, "break_end")).toBeNull();

    expect(paidOperationalPunchBlock(paidLunch, "meal_start")?.code).toBe(
      "paid_lunch_no_punch_required"
    );
    expect(paidOperationalPunchBlock(paidLunch, "meal_end")?.code).toBe(
      "paid_lunch_no_punch_required"
    );
    expect(paidOperationalPunchBlock(paidPause, "meal_end")).toBeNull();
    expect(shouldIgnorePaidOperationalEvent(paidLunch, "meal_end")).toBe(true);
  });

  it("shows the employee still in service when a paid pause start and end are replayed", () => {
    const arrival = "2026-10-23T11:00:00.000Z";
    const pauseStart = "2026-10-23T15:00:00.000Z";
    const pauseEnd = "2026-10-23T15:15:00.000Z";
    const timeline = [
      event({ id: "in", event_type: "quart_debut", occurred_at: arrival }),
      event({ id: "pause-start", event_type: "pause_debut", occurred_at: pauseStart }),
      event({ id: "pause-end", event_type: "pause_fin", occurred_at: pauseEnd }),
    ];
    const paidLive = computeStateFromEventTimeline(timeline, {
      ignorePaidBreakPunches: true,
    });
    expect(paidLive.currentState).toBe("en_quart");
    expect(paidLive.activePauseStartEventId).toBeNull();

    const duringUnpaidPause = computeStateFromEventTimeline(timeline.slice(0, 2), {
      ignorePaidBreakPunches: false,
    });
    expect(duringUnpaidPause.currentState).toBe("en_pause");
    const afterUnpaidEnd = computeStateFromEventTimeline(timeline, {
      ignorePaidBreakPunches: false,
    });
    expect(afterUnpaidEnd.currentState).toBe("en_quart");
    expect(afterUnpaidEnd.activePauseStartEventId).toBeNull();

    const shown = resolveEmployeePunchGuidance({
      currentState: paidLive.currentState,
      pausePaid: true,
    });
    expect(shown.statusLabel).toBe("En service");
    expect(shown.primary?.eventType).toBe("punch_out");
    expect(shown.secondary.some((action) => action.eventType === "break_end")).toBe(false);
    expect(shown.secondary.some((action) => action.eventType === "break_start")).toBe(false);
  });

  it("hides a paid dinner from Direction and keeps an unpaid dinner punchable", () => {
    const paidDinner = { pausePaid: false, lunchPaid: true };
    const unpaidDinner = { pausePaid: false, lunchPaid: false };
    const paidOptions = directionManualPunchOptions({
      pausePaid: false,
      lunchPaid: true,
    });
    const unpaidOptions = directionManualPunchOptions({
      pausePaid: false,
      lunchPaid: false,
    });

    expect(paidOptions).toEqual([
      "punch_in",
      "break_start",
      "break_end",
      "punch_out",
    ]);
    expect(paidOptions).not.toContain("meal_start");
    expect(paidOptions).not.toContain("meal_end");
    for (const eventType of paidOptions) {
      expect(
        paidOperationalPunchBlock(paidDinner, toCanonicalEventType(eventType))
      ).toBeNull();
    }
    for (const hidden of ["meal_start", "meal_end"] as const) {
      const refusal = paidOperationalPunchBlock(
        paidDinner,
        toCanonicalEventType(hidden)
      );
      expect(refusal?.code).toBe("paid_lunch_no_punch_required");
      expect(refusal?.status).toBe(409);
      expect(refusal?.message).toContain("Repas paye");
    }

    expect(unpaidOptions).toContain("meal_start");
    expect(unpaidOptions).toContain("meal_end");
    expect(unpaidOptions).toContain("break_start");
    expect(unpaidOptions).toContain("break_end");
    expect(paidOperationalPunchBlock(unpaidDinner, "meal_start")).toBeNull();
    expect(paidOperationalPunchBlock(unpaidDinner, "meal_end")).toBeNull();
    for (const eventType of unpaidOptions) {
      expect(
        paidOperationalPunchBlock(unpaidDinner, toCanonicalEventType(eventType))
      ).toBeNull();
    }

  });

  it("hides a paid pause from Direction and keeps an unpaid pause punchable", () => {
    const paidPause = { pausePaid: true, lunchPaid: false };
    const unpaidPause = { pausePaid: false, lunchPaid: true };
    const paidOptions = directionManualPunchOptions(paidPause);
    const unpaidOptions = directionManualPunchOptions(unpaidPause);

    expect(paidOptions).toEqual(["punch_in", "meal_start", "meal_end", "punch_out"]);
    expect(paidOptions).not.toContain("break_start");
    expect(paidOptions).not.toContain("break_end");
    for (const eventType of paidOptions) {
      expect(
        paidOperationalPunchBlock(paidPause, toCanonicalEventType(eventType))
      ).toBeNull();
    }
    for (const hidden of ["break_start", "break_end"] as const) {
      const refusal = paidOperationalPunchBlock(
        paidPause,
        toCanonicalEventType(hidden)
      );
      expect(refusal?.code).toBe("paid_break_no_punch_required");
      expect(refusal?.status).toBe(409);
      expect(refusal?.message).toContain("Pause payee");
    }

    expect(unpaidOptions).toContain("break_start");
    expect(unpaidOptions).toContain("break_end");
    expect(unpaidOptions).not.toContain("meal_start");
    expect(unpaidOptions).not.toContain("meal_end");
    expect(paidOperationalPunchBlock(unpaidPause, "break_start")).toBeNull();
    expect(paidOperationalPunchBlock(unpaidPause, "break_end")).toBeNull();
    for (const eventType of unpaidOptions) {
      expect(
        paidOperationalPunchBlock(unpaidPause, toCanonicalEventType(eventType))
      ).toBeNull();
    }
  });

  it("offers only Direction actions the server accepts for each paid flag", () => {
    const cases = [
      { pausePaid: false, lunchPaid: false },
      { pausePaid: true, lunchPaid: false },
      { pausePaid: false, lunchPaid: true },
      { pausePaid: true, lunchPaid: true },
    ];

    for (const employee of cases) {
      const options = directionManualPunchOptions(employee);
      for (const eventType of options) {
        expect(
          paidOperationalPunchBlock(employee, toCanonicalEventType(eventType))
        ).toBeNull();
      }
      for (const hidden of ["break_start", "break_end", "meal_start", "meal_end"] as const) {
        const refusal = paidOperationalPunchBlock(employee, hidden);
        if (refusal) {
          expect(options).not.toContain(hidden);
        } else {
          expect(options).toContain(hidden);
        }
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { resolveEmployeePunchGuidance } from "../employee-punch-guidance.shared";
import {
  paidOperationalPunchBlock,
  shouldIgnorePaidOperationalEvent,
} from "./employee-punch-eligibility.shared";
import { computeStateFromEventTimeline } from "./operational-state.shared";
import { resolveRecomputeCurrentState } from "./recompute-current-state.shared";
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
    const events = [
      { eventType: "quart_debut", status: "normal" as const, eventTime: arrival },
      { eventType: "pause_debut", status: "approuve" as const, eventTime: pauseStart },
      { eventType: "pause_fin", status: "approuve" as const, eventTime: pauseEnd },
    ];

    const paidMirror = resolveRecomputeCurrentState(events, { pausePaid: true });
    expect(paidMirror.currentState).toBe("en_quart");
    expect(paidMirror.currentState).not.toBe("en_pause");
    expect(paidMirror.lastEventType).toBe("quart_debut");

    const unpaidClosed = resolveRecomputeCurrentState(events, { pausePaid: false });
    expect(unpaidClosed.currentState).toBe("en_quart");
    expect(unpaidClosed.lastEventType).toBe("pause_fin");

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
});

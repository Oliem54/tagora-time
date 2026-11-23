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

const ARRIVAL = "2026-10-23T11:00:00.000Z";
const PAUSE_START = "2026-10-23T15:00:00.000Z";
const PAUSE_END = "2026-10-23T15:15:00.000Z";
const PAID_STARTS = ["break_start", "pause_start", "pause_debut"] as const;
const PAID_ENDS = ["break_end", "pause_end", "pause_fin"] as const;

function event(
  partial: Partial<HorodateurPhase1EventRecord> &
    Pick<HorodateurPhase1EventRecord, "id" | "event_type" | "occurred_at">
): HorodateurPhase1EventRecord {
  return {
    employee_id: 21,
    status: "approuve",
    work_date: "2026-10-23",
    week_start_date: "2026-10-19",
    ...partial,
  };
}

function openPause(startType: string) {
  return [
    { eventType: "quart_debut", status: "normal" as const, eventTime: ARRIVAL },
    { eventType: startType, status: "approuve" as const, eventTime: PAUSE_START },
  ];
}

describe("paid pause en_pause reachability", () => {
  const paidPause = { pausePaid: true, lunchPaid: false };

  it("does not enter en_pause from a paid pause start, so no end event has to close it", () => {
    for (const startType of PAID_STARTS) {
      const unpaidOpen = resolveRecomputeCurrentState(openPause(startType), {
        pausePaid: false,
      });
      expect(unpaidOpen.currentState).toBe("en_pause");
      expect(unpaidOpen.lastEventType).toBe(startType);

      const paidOpen = resolveRecomputeCurrentState(openPause(startType), {
        pausePaid: true,
      });
      expect(paidOpen.currentState).toBe("en_quart");
      expect(paidOpen.currentState).not.toBe("en_pause");
      expect(paidOpen.lastEventType).toBe("quart_debut");

      const paidByDefault = resolveRecomputeCurrentState(openPause(startType));
      expect(paidByDefault).toEqual(paidOpen);

      for (const endType of PAID_ENDS) {
        const withEnd = resolveRecomputeCurrentState(
          [
            ...openPause(startType),
            {
              eventType: endType,
              status: "approuve",
              eventTime: PAUSE_END,
            },
          ],
          { pausePaid: true }
        );
        expect(withEnd).toEqual(paidOpen);
      }
    }
  });

  it("leaves an unpaid open pause when the pause becomes paid, without break_end, pause_end, or pause_fin", () => {
    const events = openPause("pause_debut");
    expect(
      resolveRecomputeCurrentState(events, { pausePaid: false }).currentState
    ).toBe("en_pause");

    const afterPaidFlag = resolveRecomputeCurrentState(events, { pausePaid: true });
    expect(afterPaidFlag.currentState).toBe("en_quart");
    expect(afterPaidFlag.lastEventType).toBe("quart_debut");
  });

  it("keeps the live timeline out of en_pause when paid break punches are ignored", () => {
    const startOnly = [
      event({ id: "in", event_type: "quart_debut", occurred_at: ARRIVAL }),
      event({ id: "pause-start", event_type: "pause_debut", occurred_at: PAUSE_START }),
    ];
    const paidLive = computeStateFromEventTimeline(startOnly, {
      ignorePaidBreakPunches: true,
    });
    expect(paidLive.currentState).toBe("en_quart");
    expect(paidLive.activePauseStartEventId).toBeNull();

    const unpaidLive = computeStateFromEventTimeline(startOnly, {
      ignorePaidBreakPunches: false,
    });
    expect(unpaidLive.currentState).toBe("en_pause");
    expect(unpaidLive.activePauseStartEventId).toBe("pause-start");

    const withEnd = computeStateFromEventTimeline(
      [
        ...startOnly,
        event({ id: "pause-end", event_type: "pause_fin", occurred_at: PAUSE_END }),
      ],
      { ignorePaidBreakPunches: true }
    );
    expect(withEnd.currentState).toBe("en_quart");
    expect(withEnd.activePauseStartEventId).toBeNull();
  });

  it("refuses a paid pause start and every stored end alias before insert", () => {
    for (const stored of ["break_start", "pause_debut", "break_end", "pause_fin"] as const) {
      const canonical = toCanonicalEventType(stored);
      expect(canonical === "break_start" || canonical === "break_end").toBe(true);
      expect(paidOperationalPunchBlock(paidPause, canonical)?.code).toBe(
        "paid_break_no_punch_required"
      );
      expect(paidOperationalPunchBlock(paidPause, canonical)?.status).toBe(409);
      expect(shouldIgnorePaidOperationalEvent(paidPause, canonical)).toBe(true);
    }
  });

  it("does not ask for a pause end when a stale en_pause row is read for a paid pause", () => {
    const guidance = resolveEmployeePunchGuidance({
      currentState: "en_pause",
      pausePaid: true,
    });
    expect(guidance.primary?.eventType).toBe("punch_out");
    expect(guidance.secondary).toEqual([]);
  });
});

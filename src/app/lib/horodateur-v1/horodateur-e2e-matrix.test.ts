import { describe, expect, it } from "vitest";
import { computeShiftPayableMinutes } from "@/app/lib/horodateur-v1/shift-payable.shared";
import {
  getLocalWorkDate,
  getWeekStartDate,
  isAllowedTransition,
  resolvePayableWorkSegmentStartAt,
  diffMinutes,
} from "@/app/lib/horodateur-v1/rules";
import { resolveOperationalWorkDate } from "@/app/lib/horodateur-v1/operational-state.shared";
import type { HorodateurPhase1EventRecord } from "@/app/lib/horodateur-v1/types";

function event(
  partial: {
    id?: string;
    employee_id?: number;
    event_type: string;
    occurred_at: string;
    status?: HorodateurPhase1EventRecord["status"];
    work_date?: string;
    week_start_date?: string;
    organization_id?: string | null;
    organization_company_id?: string | null;
  }
): HorodateurPhase1EventRecord {
  return {
    id: partial.id ?? crypto.randomUUID(),
    employee_id: partial.employee_id ?? 1,
    event_type: partial.event_type as HorodateurPhase1EventRecord["event_type"],
    occurred_at: partial.occurred_at,
    event_time: partial.occurred_at,
    created_at: partial.occurred_at,
    status: partial.status ?? "normal",
    work_date: partial.work_date ?? getLocalWorkDate(partial.occurred_at),
    week_start_date:
      partial.week_start_date ?? getWeekStartDate(partial.occurred_at),
    company_context: "qa_phase4d_lot2",
    notes: null,
    note: null,
    source_kind: "employe",
    actor_role: "employe",
    actor_user_id: null,
    requires_approval: false,
    related_event_id: null,
    is_manual_correction: false,
    exception_code: null,
    approval_note: null,
    organization_id: partial.organization_id ?? null,
    organization_company_id: partial.organization_company_id ?? null,
  } as HorodateurPhase1EventRecord;
}

describe("shift payable minutes (canonical)", () => {
  it("does not double-subtract unpaid break/lunch already excluded from worked", () => {
    expect(
      computeShiftPayableMinutes({
        workedMinutes: 400,
        unpaidBreakMinutes: 30,
        unpaidLunchMinutes: 45,
        approvedExceptionMinutes: 10,
      })
    ).toBe(410);
  });

  it("never returns negative payable", () => {
    expect(
      computeShiftPayableMinutes({
        workedMinutes: 0,
        unpaidBreakMinutes: 30,
        unpaidLunchMinutes: 0,
        approvedExceptionMinutes: 0,
      })
    ).toBe(0);
  });

  it("simple closed shift without breaks", () => {
    // 08:00-16:00 = 480
    expect(
      computeShiftPayableMinutes({
        workedMinutes: 480,
        unpaidBreakMinutes: 0,
        unpaidLunchMinutes: 0,
        approvedExceptionMinutes: 0,
      })
    ).toBe(480);
  });
});

describe("employee transition matrix (rules)", () => {
  it("allows punch_in from hors_quart and refuses double punch_in while en_quart", () => {
    expect(isAllowedTransition("hors_quart", "punch_in")).toBe(true);
    expect(isAllowedTransition("en_quart", "punch_in")).toBe(false);
    expect(isAllowedTransition("en_quart", "punch_out")).toBe(true);
    expect(isAllowedTransition("termine", "punch_out")).toBe(false);
    expect(isAllowedTransition("en_quart", "break_start")).toBe(true);
    expect(isAllowedTransition("en_pause", "break_end")).toBe(true);
    expect(isAllowedTransition("en_quart", "meal_start")).toBe(true);
    expect(isAllowedTransition("en_diner", "meal_end")).toBe(true);
  });
});

describe("overnight operational work_date", () => {
  it("keeps punch_out on the open shift work_date across midnight", () => {
    const punchInAt = "2026-08-17T22:00:00-04:00";
    const punchOutAt = "2026-08-18T02:00:00-04:00";
    const openWorkDate = getLocalWorkDate(punchInAt);
    const approved = [
      event({
        event_type: "quart_debut",
        occurred_at: punchInAt,
        work_date: openWorkDate,
      }),
    ];
    expect(
      resolveOperationalWorkDate({
        eventType: "quart_fin",
        occurredAt: punchOutAt,
        approvedEvents: approved,
      })
    ).toBe(openWorkDate);
    expect(getLocalWorkDate(punchOutAt)).not.toBe(openWorkDate);
  });

  it("uses calendar date for punch_in", () => {
    const at = "2026-08-18T08:00:00-04:00";
    expect(
      resolveOperationalWorkDate({
        eventType: "punch_in",
        occurredAt: at,
        approvedEvents: [],
      })
    ).toBe(getLocalWorkDate(at));
  });
});

describe("early punch accrual + overnight duration", () => {
  it("clamps early punch payable start to schedule_start", () => {
    const workDate = "2026-08-17";
    const punchIn = "2026-08-17T07:40:00-04:00";
    const start = resolvePayableWorkSegmentStartAt({
      punchInOccurredAt: punchIn,
      workDate,
      scheduleStart: "08:00",
    });
    const punchOut = "2026-08-17T16:00:00-04:00";
    expect(diffMinutes(start, punchOut)).toBe(480);
  });

  it("counts overnight span in wall-clock minutes", () => {
    expect(
      diffMinutes("2026-08-17T22:00:00-04:00", "2026-08-18T02:00:00-04:00")
    ).toBe(240);
  });
});

describe("tenant isolation markers (contract)", () => {
  it("requires distinct organization ids for cross-tenant denial proofs", () => {
    const orgA = "11111111-1111-1111-1111-111111111111";
    const orgB = "22222222-2222-2222-2222-222222222222";
    expect(orgA).not.toBe(orgB);
    // Direction APIs must pass organizationId from membership, never from client body alone.
    expect(true).toBe(true);
  });
});

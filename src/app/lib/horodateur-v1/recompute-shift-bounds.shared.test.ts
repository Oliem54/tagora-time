import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeRecomputeShiftBounds } from "./recompute-shift-bounds.shared";

const MIGRATION = readdirSync(join(process.cwd(), "supabase", "migrations")).find((name) =>
  name.endsWith("_recompute_horodateur_shift_quart_bounds.sql")
);

const sql = MIGRATION
  ? readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8")
  : "";

describe("recompute shift bounds for quart_debut and quart_fin", () => {
  it("ships a local replacement that recognizes approved quart bounds", () => {
    expect(MIGRATION).toBeTruthy();
    expect(sql).toContain("'quart_debut', 'punch_in'");
    expect(sql).toContain("'quart_fin', 'punch_out'");
    expect(sql).toContain("'clock_in', 'shift_start'");
    expect(sql).toContain("'clock_out', 'shift_end'");
    expect(sql).toContain("'dinner_start'");
    expect(sql).toContain("'dinner_end'");
    expect(sql).toContain("'dinner_debut'");
    expect(sql).toContain("'dinner_fin'");
    expect(sql).toContain("'pause_debut'");
    expect(sql).toContain("'pause_fin'");
    expect(sql).toContain("'normal'::public.horodateur_event_status");
    expect(sql).toContain("'approuve'::public.horodateur_event_status");
    expect(sql).toContain("coalesce(occurred_at, event_time)");
    expect(sql).toContain("event_type = 'pause_debut'");
    expect(sql).toContain("event_type = 'pause_fin'");
    expect(sql).toContain("event_type = 'dinner_debut'");
    expect(sql).toContain("event_type = 'dinner_fin'");
    expect(sql).toContain("- s.unpaid_break_minutes");
    expect(sql).toContain("coalesce(c.break_1_paid, true)");
    expect(sql).toContain("coalesce(c.lunch_paid, false)");
    expect(sql).toContain("c.schedule_start");
    expect(sql).toContain("payable_start_at");
    expect(sql).toContain("America/Toronto");
    expect(sql).toContain("p.shift_end_at - p.shift_start_at");
    expect(sql).toContain("closed_payable_minutes");
    expect(sql).toContain("p.closed_payable_minutes");
    expect(sql).toContain("when o.bound_kind = 'start' and w.shift_end_at is not null then null");
    expect(sql).toContain("when v_pause_paid then 0");
    expect(sql).toContain("when v_lunch_paid then 0");
    const pairClause = sql.slice(
      sql.indexOf("as unpaid_lunch_minutes"),
      sql.indexOf("as pair_anomalies")
    );
    expect(pairClause).toContain(
      "abs((select count(*) from break_starts) - (select count(*) from break_ends))"
    );
    expect(pairClause).toContain(
      "abs((select count(*) from lunch_starts) - (select count(*) from lunch_ends))"
    );
    expect(pairClause).not.toContain("v_pause_paid");
    expect(pairClause).not.toContain("v_lunch_paid");
    expect(sql).not.toMatch(/\bupdate\s+public\.horodateur_events\b/i);
    expect(sql).not.toMatch(/\binsert\s+into\s+public\.horodateur_events\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.horodateur_exceptions\b/i);
  });

  it("keeps the English types on event_time, including a pending clock_in", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "clock_in",
        status: "en_attente",
        occurredAt: "2026-09-29T14:00:00.000Z",
        eventTime: "2026-09-29T10:00:00.000Z",
      },
      {
        eventType: "clock_out",
        status: "normal",
        occurredAt: "2026-09-29T22:00:00.000Z",
        eventTime: "2026-09-29T18:00:00.000Z",
      },
    ]);

    expect(summary.shiftStartAt).toBe("2026-09-29T10:00:00.000Z");
    expect(summary.shiftEndAt).toBe("2026-09-29T18:00:00.000Z");
    expect(summary.workedMinutes).toBe(480);
    expect(summary.status).toBe("ferme");
  });

  it("treats an approved quart_fin as the shift end", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "quart_debut",
        status: "normal",
        occurredAt: "2026-09-29T10:30:12.000Z",
        eventTime: null,
      },
      {
        eventType: "quart_fin",
        status: "approuve",
        occurredAt: "2026-09-29T19:00:00.000Z",
        eventTime: "2026-09-29T19:10:00.000Z",
      },
    ]);

    expect(summary.shiftStartAt).toBe("2026-09-29T10:30:12.000Z");
    expect(summary.shiftEndAt).toBe("2026-09-29T19:00:00.000Z");
    expect(summary.workedMinutes).toBe(509);
    expect(summary.status).toBe("ferme");
  });

  it("recognizes Patrick's 29 September 06:30 arrival and does not invent an employee exit", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "quart_debut",
        status: "normal",
        occurredAt: "2026-09-29T10:30:12.000Z",
        eventTime: "2026-09-29T10:30:12.000Z",
      },
      {
        eventType: "dinner_debut",
        status: "en_attente",
        occurredAt: "2026-09-29T16:00:00.000Z",
        eventTime: "2026-09-29T16:10:31.000Z",
      },
      {
        eventType: "dinner_fin",
        status: "en_attente",
        occurredAt: "2026-09-29T16:30:00.000Z",
        eventTime: "2026-09-29T16:40:28.000Z",
      },
      {
        eventType: "quart_fin",
        status: "en_attente",
        occurredAt: "2026-09-29T19:00:00.000Z",
        eventTime: "2026-09-29T19:10:23.000Z",
      },
    ]);

    expect(summary.shiftStartAt).toBe("2026-09-29T10:30:12.000Z");
    expect(summary.shiftEndAt).toBeNull();
    expect(summary.workedMinutes).toBe(0);
    expect(summary.unpaidLunchMinutes).toBe(0);
    expect(summary.status).toBe("ouvert");
    expect(summary.unpaidBreakMinutes).toBe(0);
    expect(summary).not.toEqual({
      shiftStartAt: null,
      shiftEndAt: null,
      workedMinutes: 0,
      unpaidBreakMinutes: 0,
      unpaidLunchMinutes: 0,
      status: "ferme",
    });

    const onSchedule = summarizeRecomputeShiftBounds(
      [
        {
          eventType: "quart_debut",
          status: "normal",
          occurredAt: "2026-09-29T10:30:12.000Z",
          eventTime: "2026-09-29T10:30:12.000Z",
        },
        {
          eventType: "quart_fin",
          status: "en_attente",
          occurredAt: "2026-09-29T19:00:00.000Z",
          eventTime: "2026-09-29T19:10:23.000Z",
        },
      ],
      { scheduleStart: "06:30:00", workDate: "2026-09-29" }
    );
    expect(onSchedule.shiftStartAt).toBe("2026-09-29T10:30:12.000Z");
    expect(onSchedule.payableStartAt).toBe("2026-09-29T10:30:12.000Z");
    expect(onSchedule.shiftEndAt).toBeNull();
    expect(onSchedule.workedMinutes).toBe(0);
    expect(onSchedule.payableMinutes).toBe(0);
    expect(onSchedule.status).toBe("ouvert");
  });

  it("pairs approved dinner_debut and dinner_fin without treating them as a shift end", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "quart_debut",
        status: "normal",
        occurredAt: "2026-09-29T10:30:00.000Z",
        eventTime: "2026-09-29T10:30:00.000Z",
      },
      {
        eventType: "dinner_debut",
        status: "normal",
        occurredAt: "2026-09-29T16:00:00.000Z",
        eventTime: "2026-09-29T16:05:00.000Z",
      },
      {
        eventType: "dinner_fin",
        status: "approuve",
        occurredAt: "2026-09-29T16:30:00.000Z",
        eventTime: "2026-09-29T16:40:00.000Z",
      },
      {
        eventType: "quart_fin",
        status: "approuve",
        occurredAt: "2026-09-29T19:00:00.000Z",
        eventTime: "2026-09-29T19:00:00.000Z",
      },
    ]);

    expect(summary.shiftStartAt).toBe("2026-09-29T10:30:00.000Z");
    expect(summary.shiftEndAt).toBe("2026-09-29T19:00:00.000Z");
    expect(summary.unpaidLunchMinutes).toBe(30);
    expect(summary.workedMinutes).toBe(480);
    expect(summary.status).toBe("ferme");
  });

  it("keeps English dinner_start and dinner_end on event_time", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "shift_start",
        status: "normal",
        eventTime: "2026-09-29T10:00:00.000Z",
      },
      {
        eventType: "dinner_start",
        status: "en_attente",
        occurredAt: "2026-09-29T16:00:00.000Z",
        eventTime: "2026-09-29T15:00:00.000Z",
      },
      {
        eventType: "dinner_end",
        status: "normal",
        occurredAt: "2026-09-29T16:45:00.000Z",
        eventTime: "2026-09-29T15:20:00.000Z",
      },
      {
        eventType: "shift_end",
        status: "normal",
        eventTime: "2026-09-29T18:00:00.000Z",
      },
    ]);

    expect(summary.shiftStartAt).toBe("2026-09-29T10:00:00.000Z");
    expect(summary.shiftEndAt).toBe("2026-09-29T18:00:00.000Z");
    expect(summary.unpaidLunchMinutes).toBe(20);
    expect(summary.status).toBe("ferme");
  });

  it("subtracts an approved pause_debut and pause_fin pair from worked minutes", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "quart_debut",
        status: "normal",
        occurredAt: "2026-09-29T10:30:00.000Z",
        eventTime: "2026-09-29T10:30:00.000Z",
      },
      {
        eventType: "pause_debut",
        status: "normal",
        occurredAt: "2026-09-29T16:00:00.000Z",
        eventTime: "2026-09-29T16:05:00.000Z",
      },
      {
        eventType: "pause_fin",
        status: "approuve",
        occurredAt: "2026-09-29T16:30:00.000Z",
        eventTime: "2026-09-29T16:40:00.000Z",
      },
      {
        eventType: "quart_fin",
        status: "approuve",
        occurredAt: "2026-09-29T19:00:00.000Z",
        eventTime: "2026-09-29T19:00:00.000Z",
      },
    ], { pausePaid: false });

    expect(summary.unpaidBreakMinutes).toBe(30);
    expect(summary.workedMinutes).toBe(480);
    expect(summary.status).toBe("ferme");
  });

  it("does not subtract a paid pause or a paid dinner", () => {
    const events = [
      {
        eventType: "quart_debut",
        status: "normal" as const,
        occurredAt: "2026-09-29T10:30:00.000Z",
        eventTime: "2026-09-29T10:30:00.000Z",
      },
      {
        eventType: "pause_debut",
        status: "normal" as const,
        occurredAt: "2026-09-29T16:00:00.000Z",
        eventTime: "2026-09-29T16:00:00.000Z",
      },
      {
        eventType: "pause_fin",
        status: "approuve" as const,
        occurredAt: "2026-09-29T16:15:00.000Z",
        eventTime: "2026-09-29T16:15:00.000Z",
      },
      {
        eventType: "dinner_debut",
        status: "normal" as const,
        occurredAt: "2026-09-29T17:00:00.000Z",
        eventTime: "2026-09-29T17:00:00.000Z",
      },
      {
        eventType: "dinner_fin",
        status: "approuve" as const,
        occurredAt: "2026-09-29T17:30:00.000Z",
        eventTime: "2026-09-29T17:30:00.000Z",
      },
      {
        eventType: "quart_fin",
        status: "approuve" as const,
        occurredAt: "2026-09-29T19:00:00.000Z",
        eventTime: "2026-09-29T19:00:00.000Z",
      },
    ];
    const paid = summarizeRecomputeShiftBounds(events, {
      pausePaid: true,
      lunchPaid: true,
    });
    const unpaid = summarizeRecomputeShiftBounds(events, {
      pausePaid: false,
      lunchPaid: false,
    });

    expect(unpaid.unpaidBreakMinutes).toBe(15);
    expect(unpaid.unpaidLunchMinutes).toBe(30);
    expect(unpaid.workedMinutes).toBe(465);
    expect(paid.unpaidBreakMinutes).toBe(0);
    expect(paid.unpaidLunchMinutes).toBe(0);
    expect(paid.workedMinutes).toBe(510);
    expect(paid.pairAnomalies).toBe(0);
    expect(unpaid.pairAnomalies).toBe(0);
  });

  it("counts an incomplete paid pause and an incomplete paid dinner as pair anomalies", () => {
    const pauseOnly = summarizeRecomputeShiftBounds(
      [
        {
          eventType: "quart_debut",
          status: "normal",
          occurredAt: "2026-09-29T10:30:00.000Z",
          eventTime: "2026-09-29T10:30:00.000Z",
        },
        {
          eventType: "pause_debut",
          status: "approuve",
          occurredAt: "2026-09-29T16:00:00.000Z",
          eventTime: "2026-09-29T16:00:00.000Z",
        },
        {
          eventType: "quart_fin",
          status: "approuve",
          occurredAt: "2026-09-29T19:00:00.000Z",
          eventTime: "2026-09-29T19:00:00.000Z",
        },
      ],
      { pausePaid: true, lunchPaid: false }
    );
    const dinnerOnly = summarizeRecomputeShiftBounds(
      [
        {
          eventType: "quart_debut",
          status: "normal",
          occurredAt: "2026-09-29T10:30:00.000Z",
          eventTime: "2026-09-29T10:30:00.000Z",
        },
        {
          eventType: "dinner_debut",
          status: "approuve",
          occurredAt: "2026-09-29T17:00:00.000Z",
          eventTime: "2026-09-29T17:00:00.000Z",
        },
        {
          eventType: "quart_fin",
          status: "approuve",
          occurredAt: "2026-09-29T19:00:00.000Z",
          eventTime: "2026-09-29T19:00:00.000Z",
        },
      ],
      { pausePaid: false, lunchPaid: true }
    );

    expect(pauseOnly.unpaidBreakMinutes).toBe(0);
    expect(pauseOnly.workedMinutes).toBe(510);
    expect(pauseOnly.pairAnomalies).toBe(1);
    expect(dinnerOnly.unpaidLunchMinutes).toBe(0);
    expect(dinnerOnly.workedMinutes).toBe(510);
    expect(dinnerOnly.pairAnomalies).toBe(1);
  });

  it("ignores a pending pause pair and a refused pause", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "quart_debut",
        status: "normal",
        occurredAt: "2026-09-29T10:30:00.000Z",
        eventTime: "2026-09-29T10:30:00.000Z",
      },
      {
        eventType: "pause_debut",
        status: "en_attente",
        occurredAt: "2026-09-29T16:00:00.000Z",
        eventTime: "2026-09-29T16:00:00.000Z",
      },
      {
        eventType: "pause_fin",
        status: "en_attente",
        occurredAt: "2026-09-29T16:30:00.000Z",
        eventTime: "2026-09-29T16:30:00.000Z",
      },
      {
        eventType: "pause_debut",
        status: "refuse",
        occurredAt: "2026-09-29T17:00:00.000Z",
        eventTime: "2026-09-29T17:00:00.000Z",
      },
      {
        eventType: "pause_fin",
        status: "refuse",
        occurredAt: "2026-09-29T17:20:00.000Z",
        eventTime: "2026-09-29T17:20:00.000Z",
      },
      {
        eventType: "quart_fin",
        status: "approuve",
        occurredAt: "2026-09-29T19:00:00.000Z",
        eventTime: "2026-09-29T19:00:00.000Z",
      },
    ]);

    expect(summary.unpaidBreakMinutes).toBe(0);
    expect(summary.workedMinutes).toBe(510);
  });

  it("keeps English break_start and break_end on event_time", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "shift_start",
        status: "normal",
        eventTime: "2026-09-29T10:00:00.000Z",
      },
      {
        eventType: "break_start",
        status: "normal",
        occurredAt: "2026-09-29T16:00:00.000Z",
        eventTime: "2026-09-29T15:00:00.000Z",
      },
      {
        eventType: "break_end",
        status: "normal",
        occurredAt: "2026-09-29T16:40:00.000Z",
        eventTime: "2026-09-29T15:20:00.000Z",
      },
      {
        eventType: "shift_end",
        status: "normal",
        eventTime: "2026-09-29T18:00:00.000Z",
      },
    ]);

    expect(summary.unpaidBreakMinutes).toBe(20);
    expect(summary.workedMinutes).toBe(460);
  });

  it("ignores a pending quart_debut and a refused quart_fin", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "quart_debut",
        status: "en_attente",
        occurredAt: "2026-09-30T10:30:00.000Z",
        eventTime: "2026-09-30T11:00:22.000Z",
      },
      {
        eventType: "quart_fin",
        status: "refuse",
        occurredAt: "2026-09-30T19:00:00.000Z",
        eventTime: "2026-09-30T19:00:00.000Z",
      },
    ]);

    expect(summary.shiftStartAt).toBeNull();
    expect(summary.shiftEndAt).toBeNull();
    expect(summary.workedMinutes).toBe(0);
    expect(summary.status).toBe("ferme");
  });

  it("keeps the real quart_debut and clamps payable minutes to scheduleStart", () => {
    const punchAt = "2026-06-08T10:35:00.000Z";
    const endAt = "2026-06-08T19:00:00.000Z";
    const summary = summarizeRecomputeShiftBounds(
      [
        {
          eventType: "quart_debut",
          status: "normal",
          occurredAt: punchAt,
          eventTime: punchAt,
        },
        {
          eventType: "quart_fin",
          status: "approuve",
          occurredAt: endAt,
          eventTime: endAt,
        },
      ],
      { scheduleStart: "07:00:00", workDate: "2026-06-08" }
    );

    expect(summary.shiftStartAt).toBe(punchAt);
    expect(summary.payableStartAt).toBe("2026-06-08T07:00:00-04:00");
    expect(summary.workedMinutes).toBe(480);
    expect(summary.payableMinutes).toBe(480);
    expect(summary.payableMinutes).toBeLessThan(505);
  });

  it("does not overestimate payable minutes when an early punch has an unpaid pause", () => {
    const punchAt = "2026-06-08T10:35:00.000Z";
    const summary = summarizeRecomputeShiftBounds(
      [
        {
          eventType: "quart_debut",
          status: "normal",
          occurredAt: punchAt,
          eventTime: punchAt,
        },
        {
          eventType: "pause_debut",
          status: "approuve",
          occurredAt: "2026-06-08T13:00:00.000Z",
          eventTime: "2026-06-08T13:00:00.000Z",
        },
        {
          eventType: "pause_fin",
          status: "approuve",
          occurredAt: "2026-06-08T13:15:00.000Z",
          eventTime: "2026-06-08T13:15:00.000Z",
        },
        {
          eventType: "quart_fin",
          status: "approuve",
          occurredAt: "2026-06-08T19:00:00.000Z",
          eventTime: "2026-06-08T19:00:00.000Z",
        },
      ],
      {
        pausePaid: false,
        scheduleStart: "07:00:00",
        workDate: "2026-06-08",
      }
    );

    expect(summary.shiftStartAt).toBe(punchAt);
    expect(summary.unpaidBreakMinutes).toBe(15);
    expect(summary.workedMinutes).toBe(465);
    expect(summary.payableMinutes).toBe(465);
  });

  it("does not clamp a quart_debut at or after scheduleStart", () => {
    const punchAt = "2026-06-08T11:00:00.000Z";
    const summary = summarizeRecomputeShiftBounds(
      [
        {
          eventType: "quart_debut",
          status: "normal",
          occurredAt: punchAt,
          eventTime: punchAt,
        },
        {
          eventType: "quart_fin",
          status: "approuve",
          occurredAt: "2026-06-08T19:00:00.000Z",
          eventTime: "2026-06-08T19:00:00.000Z",
        },
      ],
      { scheduleStart: "07:00:00", workDate: "2026-06-08" }
    );

    expect(summary.shiftStartAt).toBe(punchAt);
    expect(summary.payableStartAt).toBe(punchAt);
    expect(summary.workedMinutes).toBe(480);
    expect(summary.payableMinutes).toBe(480);
  });

  it("does not apply a manual correction when clamping payable minutes", () => {
    const punchAt = "2026-06-08T10:35:00.000Z";
    const summary = summarizeRecomputeShiftBounds(
      [
        {
          eventType: "quart_debut",
          status: "normal",
          occurredAt: punchAt,
          eventTime: punchAt,
        },
        {
          eventType: "correction",
          status: "approuve",
          occurredAt: "2026-06-08T10:00:00.000Z",
          eventTime: "2026-06-08T10:00:00.000Z",
        },
        {
          eventType: "quart_fin",
          status: "approuve",
          occurredAt: "2026-06-08T19:00:00.000Z",
          eventTime: "2026-06-08T19:00:00.000Z",
        },
      ],
      { scheduleStart: "07:00:00", workDate: "2026-06-08" }
    );

    expect(summary.shiftStartAt).toBe(punchAt);
    expect(summary.payableStartAt).toBe("2026-06-08T07:00:00-04:00");
    expect(summary.payableMinutes).toBe(480);
  });

  it("sums two same-day shifts without paying the gap between them", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "quart_debut",
        status: "approuve",
        occurredAt: "2026-09-29T14:00:00.000Z",
        eventTime: "2026-09-29T14:00:00.000Z",
      },
      {
        eventType: "quart_fin",
        status: "approuve",
        occurredAt: "2026-09-29T18:00:00.000Z",
        eventTime: "2026-09-29T18:00:00.000Z",
      },
      {
        eventType: "quart_debut",
        status: "approuve",
        occurredAt: "2026-09-29T19:00:00.000Z",
        eventTime: "2026-09-29T19:00:00.000Z",
      },
      {
        eventType: "quart_fin",
        status: "approuve",
        occurredAt: "2026-09-29T22:00:00.000Z",
        eventTime: "2026-09-29T22:00:00.000Z",
      },
    ]);

    expect(summary.shiftStartAt).toBe("2026-09-29T14:00:00.000Z");
    expect(summary.shiftEndAt).toBe("2026-09-29T22:00:00.000Z");
    expect(summary.workedMinutes).toBe(420);
    expect(summary.payableMinutes).toBe(420);
    expect(summary.workedMinutes).toBeLessThan(480);
    expect(summary.status).toBe("ferme");
  });

  it("reopens the shift after a later same-day arrival and keeps the first segment", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "quart_debut",
        status: "normal",
        occurredAt: "2026-09-29T14:00:00.000Z",
        eventTime: "2026-09-29T14:00:00.000Z",
      },
      {
        eventType: "quart_fin",
        status: "approuve",
        occurredAt: "2026-09-29T18:00:00.000Z",
        eventTime: "2026-09-29T18:00:00.000Z",
      },
      {
        eventType: "quart_debut",
        status: "approuve",
        occurredAt: "2026-09-29T19:00:00.000Z",
        eventTime: "2026-09-29T19:00:00.000Z",
      },
    ]);

    expect(summary.shiftStartAt).toBe("2026-09-29T14:00:00.000Z");
    expect(summary.shiftEndAt).toBeNull();
    expect(summary.status).toBe("ouvert");
    expect(summary.workedMinutes).toBe(240);
    expect(summary.payableMinutes).toBe(240);
  });

  it("does not reopen a closed shift for a pending later arrival", () => {
    const summary = summarizeRecomputeShiftBounds([
      {
        eventType: "quart_debut",
        status: "approuve",
        occurredAt: "2026-09-29T14:00:00.000Z",
        eventTime: "2026-09-29T14:00:00.000Z",
      },
      {
        eventType: "quart_fin",
        status: "approuve",
        occurredAt: "2026-09-29T18:00:00.000Z",
        eventTime: "2026-09-29T18:00:00.000Z",
      },
      {
        eventType: "quart_debut",
        status: "en_attente",
        occurredAt: "2026-09-29T19:00:00.000Z",
        eventTime: "2026-09-29T19:00:00.000Z",
      },
    ]);

    expect(summary.shiftEndAt).toBe("2026-09-29T18:00:00.000Z");
    expect(summary.workedMinutes).toBe(240);
    expect(summary.payableMinutes).toBe(240);
    expect(summary.status).toBe("ferme");
  });
});

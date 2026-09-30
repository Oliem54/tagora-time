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
    expect(sql).toContain("'normal'::public.horodateur_event_status");
    expect(sql).toContain("'approuve'::public.horodateur_event_status");
    expect(sql).toContain("coalesce(occurred_at, event_time)");
    expect(sql).not.toMatch(/\bupdate\s+public\.horodateur_events\b/i);
    expect(sql).not.toMatch(/\binsert\s+into\s+public\.horodateur_events\b/i);
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

  it("does not turn Patrick's pending automatic end into an approved punch", () => {
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
    expect(summary.status).toBe("ouvert");
    expect(summary).not.toEqual({
      shiftStartAt: null,
      shiftEndAt: null,
      workedMinutes: 0,
      status: "ferme",
    });
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
});

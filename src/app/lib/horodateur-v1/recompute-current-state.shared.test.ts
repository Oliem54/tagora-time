import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEmployeePunchGuidance } from "../employee-punch-guidance.shared";
import { resolveRecomputeCurrentState } from "./recompute-current-state.shared";

const MIGRATION = readdirSync(join(process.cwd(), "supabase", "migrations")).find((name) =>
  name.endsWith("_recompute_horodateur_current_state_event_types.sql")
);

const sql = MIGRATION
  ? readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8")
  : "";

const PATRICK_ARRIVAL_AT = "2026-09-29T10:30:00.000Z";

describe("recompute current state for stored horodateur event types", () => {
  it("ships a local replacement that recognizes approved quart and dinner types", () => {
    expect(MIGRATION).toBeTruthy();
    expect(sql).toContain("'quart_debut', 'punch_in'");
    expect(sql).toContain("'dinner_debut'");
    expect(sql).toContain("'dinner_fin'");
    expect(sql).toContain("'quart_fin', 'punch_out'");
    expect(sql).toContain("'pause_debut'");
    expect(sql).toContain("'pause_fin'");
    expect(sql).toContain("'automatique'::public.horodateur_source_kind");
    expect(sql).toContain("'systeme'::public.horodateur_actor_role");
    expect(sql).toContain("'clock_in', 'shift_start'");
    expect(sql).toContain("'clock_out', 'shift_end'");
    expect(sql).toContain("'dinner_start'");
    expect(sql).toContain("'dinner_end'");
    expect(sql).toContain("'en_quart'::public.horodateur_state_kind");
    expect(sql).toContain("'en_diner'::public.horodateur_state_kind");
    expect(sql).toContain("'termine'::public.horodateur_state_kind");
    expect(sql).toContain("'normal'::public.horodateur_event_status");
    expect(sql).toContain("'approuve'::public.horodateur_event_status");
    expect(sql).toContain("x.status = 'en_attente'::public.horodateur_exception_status");
    const stateFilter = sql.slice(
      sql.indexOf("and not ("),
      sql.indexOf("order by coalesce(e.occurred_at, e.event_time)")
    );
    expect(stateFilter).toContain("'dinner_debut', 'dinner_fin', 'pause_debut', 'pause_fin'");
    expect(stateFilter).toContain("e.event_type in ('quart_fin', 'punch_out')");
    expect(stateFilter).toContain("e.status = 'en_attente'::public.horodateur_event_status");
    expect(stateFilter).not.toContain("'quart_debut'");
    expect(stateFilter).not.toContain("'punch_in'");
    expect(sql).not.toMatch(
      /event_type in \(\s*'quart_debut',\s*'punch_in',\s*'quart_fin',\s*'punch_out'/
    );
    expect(sql).toContain("coalesce(e.occurred_at, e.event_time)");
    expect(sql).toContain("e.event_type not in ('manual_correction', 'correction')");
    expect(sql).toContain("e.is_manual_correction = false");
    expect(sql).not.toMatch(/\bupdate\s+public\.horodateur_events\b/i);
    expect(sql).not.toMatch(/\binsert\s+into\s+public\.horodateur_events\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.horodateur_exceptions\b/i);
  });

  it("recognizes an approved quart_debut as en_quart", () => {
    const summary = resolveRecomputeCurrentState([
      {
        eventType: "quart_debut",
        status: "normal",
        eventTime: PATRICK_ARRIVAL_AT,
      },
    ]);

    expect(summary.currentState).toBe("en_quart");
    expect(summary.lastEventType).toBe("quart_debut");
    expect(
      resolveEmployeePunchGuidance({ currentState: summary.currentState }).primary?.label
    ).toBe("Pointer ma sortie");
  });

  it("recognizes an approved quart_fin as termine", () => {
    const summary = resolveRecomputeCurrentState([
      {
        eventType: "quart_debut",
        status: "normal",
        eventTime: PATRICK_ARRIVAL_AT,
      },
      {
        eventType: "quart_fin",
        status: "approuve",
        eventTime: "2026-09-29T19:00:00.000Z",
      },
    ]);

    expect(summary.currentState).toBe("termine");
    expect(summary.lastEventType).toBe("quart_fin");
  });

  it("recognizes dinner_debut as en_diner and dinner_fin as en_quart", () => {
    const onDinner = resolveRecomputeCurrentState([
      {
        eventType: "quart_debut",
        status: "normal",
        eventTime: PATRICK_ARRIVAL_AT,
      },
      {
        eventType: "dinner_debut",
        status: "normal",
        eventTime: "2026-09-29T16:00:00.000Z",
      },
    ]);
    const afterDinner = resolveRecomputeCurrentState([
      {
        eventType: "quart_debut",
        status: "normal",
        eventTime: PATRICK_ARRIVAL_AT,
      },
      {
        eventType: "dinner_debut",
        status: "normal",
        eventTime: "2026-09-29T16:00:00.000Z",
      },
      {
        eventType: "dinner_fin",
        status: "approuve",
        eventTime: "2026-09-29T16:30:00.000Z",
      },
    ]);

    expect(onDinner.currentState).toBe("en_diner");
    expect(onDinner.lastEventType).toBe("dinner_debut");
    expect(
      resolveEmployeePunchGuidance({ currentState: onDinner.currentState }).primary?.label
    ).toBe("Terminer le dîner");
    expect(afterDinner.currentState).toBe("en_quart");
    expect(afterDinner.lastEventType).toBe("dinner_fin");
  });

  it("keeps the English types, including a pending clock_out", () => {
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "clock_in",
          status: "en_attente",
          eventTime: "2026-09-29T10:00:00.000Z",
        },
      ]).currentState
    ).toBe("en_quart");
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "shift_start",
          status: "normal",
          eventTime: "2026-09-29T10:00:00.000Z",
        },
        {
          eventType: "dinner_start",
          status: "normal",
          eventTime: "2026-09-29T15:00:00.000Z",
        },
      ]).currentState
    ).toBe("en_diner");
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "dinner_end",
          status: "normal",
          eventTime: "2026-09-29T15:30:00.000Z",
        },
      ]).currentState
    ).toBe("en_quart");
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "clock_in",
          status: "normal",
          eventTime: "2026-09-29T10:00:00.000Z",
        },
        {
          eventType: "clock_out",
          status: "en_attente",
          eventTime: "2026-09-29T18:00:00.000Z",
        },
      ]).currentState
    ).toBe("termine");
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "shift_end",
          status: "approuve",
          eventTime: "2026-09-29T18:00:00.000Z",
        },
      ]).currentState
    ).toBe("termine");
  });

  it("ignores a pending dinner and an automatic pending exit, and keeps an employee pending exit", () => {
    const withPendingDinner = resolveRecomputeCurrentState([
      {
        eventType: "quart_debut",
        status: "normal",
        eventTime: PATRICK_ARRIVAL_AT,
      },
      {
        eventType: "dinner_debut",
        status: "en_attente",
        eventTime: "2026-09-29T16:00:00.000Z",
      },
      {
        eventType: "dinner_fin",
        status: "en_attente",
        eventTime: "2026-09-29T16:30:00.000Z",
      },
    ]);
    const withAutomaticExit = resolveRecomputeCurrentState([
      {
        eventType: "quart_debut",
        status: "normal",
        eventTime: PATRICK_ARRIVAL_AT,
        sourceKind: "employe",
        actorRole: "employe",
      },
      {
        eventType: "quart_fin",
        status: "en_attente",
        eventTime: "2026-09-29T19:10:23.000Z",
        sourceKind: "automatique",
        actorRole: "systeme",
      },
    ]);
    const withEmployeeExit = resolveRecomputeCurrentState([
      {
        eventType: "quart_debut",
        status: "normal",
        eventTime: PATRICK_ARRIVAL_AT,
        sourceKind: "employe",
        actorRole: "employe",
      },
      {
        eventType: "quart_fin",
        status: "en_attente",
        eventTime: "2026-09-29T21:00:00.000Z",
        sourceKind: "employe",
        actorRole: "employe",
      },
    ]);

    expect(withPendingDinner).toEqual({
      currentState: "en_quart",
      lastEventType: "quart_debut",
    });
    expect(withAutomaticExit).toEqual({
      currentState: "en_quart",
      lastEventType: "quart_debut",
    });
    expect(withEmployeeExit).toEqual({
      currentState: "termine",
      lastEventType: "quart_fin",
    });
    expect(
      resolveEmployeePunchGuidance({ currentState: withEmployeeExit.currentState }).primary
    ).toEqual({ eventType: null, label: "Consulter le pointage" });
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "quart_debut",
          status: "normal",
          eventTime: PATRICK_ARRIVAL_AT,
          sourceKind: "employe",
          actorRole: "employe",
        },
        {
          eventType: "punch_out",
          status: "en_attente",
          eventTime: "2026-09-29T21:05:00.000Z",
          sourceKind: "employe",
          actorRole: "employe",
        },
      ])
    ).toEqual({
      currentState: "termine",
      lastEventType: "punch_out",
    });
  });

  it("maps an approved pause_debut to en_pause and ignores a pending pause", () => {
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "quart_debut",
          status: "normal",
          eventTime: PATRICK_ARRIVAL_AT,
        },
        {
          eventType: "pause_debut",
          status: "approuve",
          eventTime: "2026-09-29T16:00:00.000Z",
        },
      ])
    ).toEqual({
      currentState: "en_pause",
      lastEventType: "pause_debut",
    });
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "quart_debut",
          status: "normal",
          eventTime: PATRICK_ARRIVAL_AT,
        },
        {
          eventType: "pause_debut",
          status: "en_attente",
          eventTime: "2026-09-29T16:00:00.000Z",
        },
      ]).currentState
    ).toBe("en_quart");
  });

  it("keeps Patrick on 29 September in service after his 06:30 arrival and invents no exit", () => {
    const summary = resolveRecomputeCurrentState([
      {
        id: "arrival",
        eventType: "quart_debut",
        status: "normal",
        eventTime: PATRICK_ARRIVAL_AT,
      },
      {
        id: "automatic-end",
        eventType: "quart_fin",
        status: "en_attente",
        eventTime: "2026-09-29T19:10:23.000Z",
        sourceKind: "automatique",
        actorRole: "systeme",
      },
    ]);

    expect(summary).toEqual({
      currentState: "en_quart",
      lastEventType: "quart_debut",
    });
    expect(
      resolveEmployeePunchGuidance({ currentState: summary.currentState }).primary
    ).toEqual({ eventType: "punch_out", label: "Pointer ma sortie" });
  });

  it("keeps a pending employee arrival and ignores a refused exit", () => {
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "quart_fin",
          status: "approuve",
          eventTime: "2026-09-29T19:00:00.000Z",
          sourceKind: "employe",
          actorRole: "employe",
        },
        {
          eventType: "quart_debut",
          status: "en_attente",
          eventTime: "2026-09-30T10:30:00.000Z",
          sourceKind: "employe",
          actorRole: "employe",
        },
        {
          eventType: "quart_fin",
          status: "refuse",
          eventTime: "2026-09-30T19:00:00.000Z",
          sourceKind: "employe",
          actorRole: "employe",
        },
      ])
    ).toEqual({
      currentState: "en_quart",
      lastEventType: "quart_debut",
    });
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "quart_fin",
          status: "refuse",
          eventTime: "2026-09-30T19:00:00.000Z",
        },
      ])
    ).toEqual({
      currentState: "hors_quart",
      lastEventType: null,
    });
  });

  it("orders current state by coalesce(occurred_at, event_time)", () => {
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "quart_debut",
          status: "normal",
          occurredAt: "2026-09-29T10:30:00.000Z",
          eventTime: "2026-09-30T02:00:00.000Z",
        },
        {
          eventType: "quart_fin",
          status: "approuve",
          occurredAt: "2026-09-29T19:00:00.000Z",
          eventTime: "2026-09-29T19:00:00.000Z",
        },
      ])
    ).toEqual({
      currentState: "termine",
      lastEventType: "quart_fin",
    });
  });

  it("keeps Patrick in service and ignores a later manual correction", () => {
    expect(
      resolveRecomputeCurrentState([
        {
          id: "arrival",
          eventType: "quart_debut",
          status: "normal",
          occurredAt: PATRICK_ARRIVAL_AT,
          eventTime: "2026-09-30T02:00:00.000Z",
        },
        {
          id: "automatic-end",
          eventType: "quart_fin",
          status: "en_attente",
          occurredAt: "2026-09-29T19:10:23.000Z",
          eventTime: "2026-09-29T19:10:23.000Z",
          sourceKind: "automatique",
          actorRole: "systeme",
        },
        {
          id: "manual",
          eventType: "correction",
          status: "approuve",
          occurredAt: "2026-09-29T22:00:00.000Z",
          eventTime: "2026-09-29T22:00:00.000Z",
          isManualCorrection: true,
        },
      ])
    ).toEqual({
      currentState: "en_quart",
      lastEventType: "quart_debut",
    });
    expect(
      resolveRecomputeCurrentState([
        {
          eventType: "correction",
          status: "approuve",
          occurredAt: "2026-09-29T22:00:00.000Z",
          isManualCorrection: true,
        },
      ])
    ).toEqual({
      currentState: "hors_quart",
      lastEventType: null,
    });
  });
});

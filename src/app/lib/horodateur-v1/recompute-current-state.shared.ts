/**
 * État courant du recalcul SQL `recompute_horodateur_current_state`.
 * Le dernier événement non refusé fixe l'état. `quart_debut`, `quart_fin`,
 * `dinner_debut` et `dinner_fin` ne comptent que s'ils sont normal ou
 * approuve. Un `quart_fin` en attente ne devient pas une sortie. Les types
 * anglais gardent la règle précédente, y compris un `clock_out` en attente.
 */

import type { RecomputeShiftBoundStatus } from "./recompute-shift-bounds.shared";

export type RecomputeCurrentStateKind =
  | "hors_quart"
  | "en_quart"
  | "en_pause"
  | "en_diner"
  | "termine";

export type RecomputeCurrentStateEvent = {
  eventType: string;
  status: RecomputeShiftBoundStatus;
  eventTime?: string | null;
  createdAt?: string | null;
  id?: string | null;
};

export type RecomputeCurrentStateSummary = {
  currentState: RecomputeCurrentStateKind;
  lastEventType: string | null;
};

const APPROVED_STATUSES = new Set<RecomputeShiftBoundStatus>(["normal", "approuve"]);
const REAL_EVENT_TYPES = new Set([
  "quart_debut",
  "punch_in",
  "quart_fin",
  "punch_out",
  "dinner_debut",
  "dinner_fin",
]);

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isStateBearing(event: RecomputeCurrentStateEvent) {
  if (event.status === "refuse") return false;
  if (REAL_EVENT_TYPES.has(event.eventType) && !APPROVED_STATUSES.has(event.status)) {
    return false;
  }
  return true;
}

function stateFromEventType(eventType: string): RecomputeCurrentStateKind {
  if (
    eventType === "clock_in" ||
    eventType === "shift_start" ||
    eventType === "quart_debut" ||
    eventType === "punch_in" ||
    eventType === "break_end" ||
    eventType === "pause_end" ||
    eventType === "lunch_end" ||
    eventType === "diner_end" ||
    eventType === "dinner_end" ||
    eventType === "dinner_fin"
  ) {
    return "en_quart";
  }
  if (eventType === "break_start" || eventType === "pause_start") {
    return "en_pause";
  }
  if (
    eventType === "lunch_start" ||
    eventType === "diner_start" ||
    eventType === "dinner_start" ||
    eventType === "dinner_debut"
  ) {
    return "en_diner";
  }
  if (
    eventType === "clock_out" ||
    eventType === "shift_end" ||
    eventType === "quart_fin" ||
    eventType === "punch_out"
  ) {
    return "termine";
  }
  return "hors_quart";
}

function compareLatest(left: RecomputeCurrentStateEvent, right: RecomputeCurrentStateEvent) {
  const leftTime = timestampMs(left.eventTime);
  const rightTime = timestampMs(right.eventTime);
  if (leftTime == null && rightTime != null) return 1;
  if (leftTime != null && rightTime == null) return -1;
  if (leftTime != null && rightTime != null && leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  const leftCreated = timestampMs(left.createdAt);
  const rightCreated = timestampMs(right.createdAt);
  if (leftCreated == null && rightCreated != null) return 1;
  if (leftCreated != null && rightCreated == null) return -1;
  if (leftCreated != null && rightCreated != null && leftCreated !== rightCreated) {
    return rightCreated - leftCreated;
  }

  return String(right.id ?? "").localeCompare(String(left.id ?? ""));
}

export function resolveRecomputeCurrentState(
  events: RecomputeCurrentStateEvent[]
): RecomputeCurrentStateSummary {
  const latest = events.filter(isStateBearing).sort(compareLatest)[0] ?? null;
  if (!latest) {
    return { currentState: "hors_quart", lastEventType: null };
  }
  return {
    currentState: stateFromEventType(latest.eventType),
    lastEventType: latest.eventType,
  };
}

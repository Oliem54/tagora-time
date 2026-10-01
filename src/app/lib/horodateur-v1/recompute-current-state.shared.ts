/**
 * État courant du recalcul SQL `recompute_horodateur_current_state`.
 * Le dernier événement retenu fixe l'état. Une fin automatique en attente
 * (`source_kind` automatique ou `actor_role` systeme) est ignorée. Une sortie
 * employé encore en attente ferme le quart. Une arrivée employé en attente
 * reste un événement d'état. Dîner et pause stockés ne comptent que s'ils
 * sont normal ou approuve. Un refus est ignoré. L'ordre suit
 * coalesce(occurred_at, event_time). Une correction manuelle ne devient pas
 * l'état. Les types anglais gardent la règle précédente, y compris un
 * `clock_out` en attente.
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
  occurredAt?: string | null;
  eventTime?: string | null;
  createdAt?: string | null;
  id?: string | null;
  sourceKind?: string | null;
  actorRole?: string | null;
};

export type RecomputeCurrentStateSummary = {
  currentState: RecomputeCurrentStateKind;
  lastEventType: string | null;
};

const APPROVED_STATUSES = new Set<RecomputeShiftBoundStatus>(["normal", "approuve"]);
const APPROVED_ONLY_EVENT_TYPES = new Set([
  "dinner_debut",
  "dinner_fin",
  "pause_debut",
  "pause_fin",
]);

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function canonicalOccurredAt(event: RecomputeCurrentStateEvent) {
  return event.occurredAt ?? event.eventTime ?? null;
}

function isStateBearing(event: RecomputeCurrentStateEvent) {
  if (event.status === "refuse") return false;
  if (event.eventType === "manual_correction") return false;
  if (
    APPROVED_ONLY_EVENT_TYPES.has(event.eventType) &&
    !APPROVED_STATUSES.has(event.status)
  ) {
    return false;
  }
  if (isAutomaticMissingPendingPunchOut(event)) return false;
  return true;
}

/**
 * Fin créée par l'escalade des punchs manquants. Elle reste en attente et ne
 * doit pas fermer l'état opérationnel, contrairement à une sortie employé
 * déjà soumise (par exemple quart trop long).
 */
export function isAutomaticMissingPendingPunchOut(event: {
  eventType?: string | null;
  event_type?: string | null;
  status?: string | null;
  sourceKind?: string | null;
  source_kind?: string | null;
  actorRole?: string | null;
  actor_role?: string | null;
}) {
  const eventType = event.eventType ?? event.event_type ?? "";
  const isPunchOut = eventType === "quart_fin" || eventType === "punch_out";
  if (!isPunchOut || event.status !== "en_attente") return false;
  const sourceKind = event.sourceKind ?? event.source_kind ?? "";
  const actorRole = event.actorRole ?? event.actor_role ?? "";
  return sourceKind === "automatique" || actorRole === "systeme";
}

function stateFromEventType(eventType: string): RecomputeCurrentStateKind {
  if (
    eventType === "clock_in" ||
    eventType === "shift_start" ||
    eventType === "quart_debut" ||
    eventType === "punch_in" ||
    eventType === "break_end" ||
    eventType === "pause_end" ||
    eventType === "pause_fin" ||
    eventType === "lunch_end" ||
    eventType === "diner_end" ||
    eventType === "dinner_end" ||
    eventType === "dinner_fin"
  ) {
    return "en_quart";
  }
  if (
    eventType === "break_start" ||
    eventType === "pause_start" ||
    eventType === "pause_debut"
  ) {
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
  const leftTime = timestampMs(canonicalOccurredAt(left));
  const rightTime = timestampMs(canonicalOccurredAt(right));
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

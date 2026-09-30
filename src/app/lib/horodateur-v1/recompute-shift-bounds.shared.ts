/**
 * Bornes de quart du recalcul SQL `recompute_horodateur_shift`.
 * Les types anglais gardent `event_time`. `quart_debut` / `punch_in` et
 * `quart_fin` / `punch_out` ne comptent que s'ils sont normal ou approuve,
 * à l'horodatage `occurred_at`, sinon `event_time`.
 * Un événement en attente, y compris une fin automatique, ne devient pas
 * une borne approuvée.
 */

export type RecomputeShiftBoundStatus =
  | "normal"
  | "en_attente"
  | "approuve"
  | "refuse";

export type RecomputeShiftBoundEvent = {
  eventType: string;
  status: RecomputeShiftBoundStatus;
  occurredAt?: string | null;
  eventTime?: string | null;
};

export type RecomputeShiftBoundSummary = {
  shiftStartAt: string | null;
  shiftEndAt: string | null;
  workedMinutes: number;
  status: "ouvert" | "ferme";
};

const APPROVED_STATUSES = new Set<RecomputeShiftBoundStatus>(["normal", "approuve"]);
const LEGACY_START_TYPES = new Set(["clock_in", "shift_start"]);
const LEGACY_END_TYPES = new Set(["clock_out", "shift_end"]);
const QUART_START_TYPES = new Set(["quart_debut", "punch_in"]);
const QUART_END_TYPES = new Set(["quart_fin", "punch_out"]);

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function earlier(current: string | null, candidate: string | null) {
  const candidateMs = timestampMs(candidate);
  if (candidateMs == null) return current;
  const currentMs = timestampMs(current);
  if (currentMs == null || candidateMs < currentMs) return candidate;
  return current;
}

function later(current: string | null, candidate: string | null) {
  const candidateMs = timestampMs(candidate);
  if (candidateMs == null) return current;
  const currentMs = timestampMs(current);
  if (currentMs == null || candidateMs > currentMs) return candidate;
  return current;
}

function startCandidate(event: RecomputeShiftBoundEvent) {
  if (LEGACY_START_TYPES.has(event.eventType)) {
    return event.eventTime ?? null;
  }
  if (QUART_START_TYPES.has(event.eventType) && APPROVED_STATUSES.has(event.status)) {
    return event.occurredAt ?? event.eventTime ?? null;
  }
  return null;
}

function endCandidate(event: RecomputeShiftBoundEvent) {
  if (LEGACY_END_TYPES.has(event.eventType)) {
    return event.eventTime ?? null;
  }
  if (QUART_END_TYPES.has(event.eventType) && APPROVED_STATUSES.has(event.status)) {
    return event.occurredAt ?? event.eventTime ?? null;
  }
  return null;
}

export function summarizeRecomputeShiftBounds(
  events: RecomputeShiftBoundEvent[]
): RecomputeShiftBoundSummary {
  let shiftStartAt: string | null = null;
  let shiftEndAt: string | null = null;

  for (const event of events) {
    if (event.status === "refuse") continue;
    shiftStartAt = earlier(shiftStartAt, startCandidate(event));
    shiftEndAt = later(shiftEndAt, endCandidate(event));
  }

  const startMs = timestampMs(shiftStartAt);
  const endMs = timestampMs(shiftEndAt);
  const workedMinutes =
    startMs != null && endMs != null && endMs >= startMs
      ? Math.floor((endMs - startMs) / 60000)
      : 0;

  return {
    shiftStartAt,
    shiftEndAt,
    workedMinutes,
    status: shiftStartAt && !shiftEndAt ? "ouvert" : "ferme",
  };
}

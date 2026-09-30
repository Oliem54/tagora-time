/**
 * Bornes du recalcul SQL `recompute_horodateur_shift`.
 * Les types anglais gardent `event_time`. `quart_debut` / `punch_in`,
 * `quart_fin` / `punch_out`, `dinner_debut` et `dinner_fin` ne comptent
 * que s'ils sont normal ou approuve, à `occurred_at`, sinon `event_time`.
 * Un événement en attente, y compris une fin automatique, ne devient pas
 * une borne approuvée. Les minutes de dîner approuvé sont soustraites du
 * temps travaillé, comme `worked_minutes` dans la migration SQL.
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
  unpaidLunchMinutes: number;
  status: "ouvert" | "ferme";
};

const APPROVED_STATUSES = new Set<RecomputeShiftBoundStatus>(["normal", "approuve"]);
const LEGACY_START_TYPES = new Set(["clock_in", "shift_start"]);
const LEGACY_END_TYPES = new Set(["clock_out", "shift_end"]);
const QUART_START_TYPES = new Set(["quart_debut", "punch_in"]);
const QUART_END_TYPES = new Set(["quart_fin", "punch_out"]);
const LEGACY_DINNER_START_TYPES = new Set([
  "lunch_start",
  "diner_start",
  "dinner_start",
]);
const LEGACY_DINNER_END_TYPES = new Set(["lunch_end", "diner_end", "dinner_end"]);
const DINNER_START_TYPES = new Set(["dinner_debut"]);
const DINNER_END_TYPES = new Set(["dinner_fin"]);

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

function dinnerStartCandidate(event: RecomputeShiftBoundEvent) {
  if (LEGACY_DINNER_START_TYPES.has(event.eventType)) {
    return event.eventTime ?? null;
  }
  if (DINNER_START_TYPES.has(event.eventType) && APPROVED_STATUSES.has(event.status)) {
    return event.occurredAt ?? event.eventTime ?? null;
  }
  return null;
}

function dinnerEndCandidate(event: RecomputeShiftBoundEvent) {
  if (LEGACY_DINNER_END_TYPES.has(event.eventType)) {
    return event.eventTime ?? null;
  }
  if (DINNER_END_TYPES.has(event.eventType) && APPROVED_STATUSES.has(event.status)) {
    return event.occurredAt ?? event.eventTime ?? null;
  }
  return null;
}

function pairedMinutes(starts: string[], ends: string[]) {
  const orderedStarts = [...starts].sort(
    (left, right) => (timestampMs(left) ?? 0) - (timestampMs(right) ?? 0)
  );
  const orderedEnds = [...ends].sort(
    (left, right) => (timestampMs(left) ?? 0) - (timestampMs(right) ?? 0)
  );
  let total = 0;
  const count = Math.min(orderedStarts.length, orderedEnds.length);
  for (let index = 0; index < count; index += 1) {
    const startMs = timestampMs(orderedStarts[index]);
    const endMs = timestampMs(orderedEnds[index]);
    if (startMs == null || endMs == null || endMs <= startMs) continue;
    total += Math.floor((endMs - startMs) / 60000);
  }
  return total;
}

export function summarizeRecomputeShiftBounds(
  events: RecomputeShiftBoundEvent[]
): RecomputeShiftBoundSummary {
  let shiftStartAt: string | null = null;
  let shiftEndAt: string | null = null;
  const dinnerStarts: string[] = [];
  const dinnerEnds: string[] = [];

  for (const event of events) {
    if (event.status === "refuse") continue;
    shiftStartAt = earlier(shiftStartAt, startCandidate(event));
    shiftEndAt = later(shiftEndAt, endCandidate(event));
    const dinnerStartAt = dinnerStartCandidate(event);
    const dinnerEndAt = dinnerEndCandidate(event);
    if (dinnerStartAt) dinnerStarts.push(dinnerStartAt);
    if (dinnerEndAt) dinnerEnds.push(dinnerEndAt);
  }

  const startMs = timestampMs(shiftStartAt);
  const endMs = timestampMs(shiftEndAt);
  const unpaidLunchMinutes = pairedMinutes(dinnerStarts, dinnerEnds);
  const grossMinutes =
    startMs != null && endMs != null && endMs >= startMs
      ? Math.floor((endMs - startMs) / 60000)
      : 0;
  const workedMinutes = Math.max(0, grossMinutes - unpaidLunchMinutes);

  return {
    shiftStartAt,
    shiftEndAt,
    workedMinutes,
    unpaidLunchMinutes,
    status: shiftStartAt && !shiftEndAt ? "ouvert" : "ferme",
  };
}

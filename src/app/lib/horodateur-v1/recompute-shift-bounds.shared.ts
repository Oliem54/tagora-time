/**
 * Bornes du recalcul SQL `recompute_horodateur_shift`.
 * `clock_in` / `shift_start` approuvés ou normaux gardent `event_time`.
 * Une arrivée anglaise en attente n'ouvre pas de segment et ne remet pas
 * `shiftEndAt` à vide. `quart_debut` / `punch_in`, `quart_fin` / `punch_out`,
 * `dinner_debut` et `dinner_fin` ne comptent que s'ils sont normal ou
 * approuve, à `occurred_at`, sinon `event_time`. Un événement en attente,
 * y compris une fin automatique, ne devient pas une borne approuvée.
 * `pause_debut` et `pause_fin` approuvés sont soustraits comme les pauses
 * anglaises, seulement sur leur intersection avec un segment payable fermé.
 * Une pause ou un dîner dans le trou entre deux quarts ne réduit pas les
 * minutes. Les minutes de dîner et de pause approuvés sont soustraites du
 * temps travaillé seulement s'ils ne sont pas payés,
 * comme `worked_minutes` dans la migration SQL. `pausePaid` suit
 * `break_1_paid`. `lunchPaid` suit `lunch_paid`. Les minutes payées ne sont
 * pas soustraites. Un couple incomplet reste compté dans `pairAnomalies`.
 * `shiftStartAt` reste la première arrivée réelle. Une arrivée approuvée
 * plus tard le même jour remet `shiftEndAt` à vide tant que ce segment n'a
 * pas sa propre sortie, donc le quart courant reste ouvert. Les minutes
 * travaillées et payables additionnent les segments fermés. Chaque segment
 * est clampé par `resolvePayableWorkSegmentStartAt` quand `scheduleStart` et
 * `workDate` sont fournis. Le trou hors service entre deux quarts n'est pas
 * payé. Sans horaire, aucun clamp.
 */

import { resolvePayableWorkSegmentStartAt } from "./rules";

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
  payableStartAt: string | null;
  workedMinutes: number;
  payableMinutes: number;
  unpaidBreakMinutes: number;
  unpaidLunchMinutes: number;
  pairAnomalies: number;
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
const LEGACY_BREAK_START_TYPES = new Set(["break_start", "pause_start"]);
const LEGACY_BREAK_END_TYPES = new Set(["break_end", "pause_end"]);
const STORED_BREAK_START_TYPES = new Set(["pause_debut"]);
const STORED_BREAK_END_TYPES = new Set(["pause_fin"]);

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function later(current: string | null, candidate: string | null) {
  const candidateMs = timestampMs(candidate);
  if (candidateMs == null) return current;
  const currentMs = timestampMs(current);
  if (currentMs == null || candidateMs > currentMs) return candidate;
  return current;
}

function payableSegmentStart(
  segmentStartAt: string,
  flags?: { scheduleStart?: string | null; workDate?: string | null }
) {
  if (!flags?.scheduleStart || !flags.workDate) return segmentStartAt;
  return resolvePayableWorkSegmentStartAt({
    punchInOccurredAt: segmentStartAt,
    workDate: flags.workDate,
    scheduleStart: flags.scheduleStart,
  });
}

function payableSegmentMinutes(segmentPayableStartAt: string, untilAt: string) {
  const startMs = timestampMs(segmentPayableStartAt);
  const untilMs = timestampMs(untilAt);
  if (startMs == null || untilMs == null || untilMs <= startMs) return 0;
  return Math.floor((untilMs - startMs) / 60000);
}

function startCandidate(event: RecomputeShiftBoundEvent) {
  if (!APPROVED_STATUSES.has(event.status)) return null;
  if (LEGACY_START_TYPES.has(event.eventType)) {
    return event.eventTime ?? null;
  }
  if (QUART_START_TYPES.has(event.eventType)) {
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

function breakStartCandidate(event: RecomputeShiftBoundEvent) {
  if (LEGACY_BREAK_START_TYPES.has(event.eventType)) {
    return event.eventTime ?? null;
  }
  if (STORED_BREAK_START_TYPES.has(event.eventType) && APPROVED_STATUSES.has(event.status)) {
    return event.occurredAt ?? event.eventTime ?? null;
  }
  return null;
}

function breakEndCandidate(event: RecomputeShiftBoundEvent) {
  if (LEGACY_BREAK_END_TYPES.has(event.eventType)) {
    return event.eventTime ?? null;
  }
  if (STORED_BREAK_END_TYPES.has(event.eventType) && APPROVED_STATUSES.has(event.status)) {
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

function overlapMinutes(
  pairStartAt: string,
  pairEndAt: string,
  segments: Array<{ payableStartAt: string; endAt: string }>
) {
  const pairStartMs = timestampMs(pairStartAt);
  const pairEndMs = timestampMs(pairEndAt);
  if (pairStartMs == null || pairEndMs == null || pairEndMs <= pairStartMs) return 0;
  let total = 0;
  for (const segment of segments) {
    const segmentStartMs = timestampMs(segment.payableStartAt);
    const segmentEndMs = timestampMs(segment.endAt);
    if (segmentStartMs == null || segmentEndMs == null) continue;
    const overlapStartMs = Math.max(pairStartMs, segmentStartMs);
    const overlapEndMs = Math.min(pairEndMs, segmentEndMs);
    if (overlapEndMs <= overlapStartMs) continue;
    total += Math.floor((overlapEndMs - overlapStartMs) / 60000);
  }
  return total;
}

function pairedOverlapMinutes(
  starts: string[],
  ends: string[],
  segments: Array<{ payableStartAt: string; endAt: string }>
) {
  const orderedStarts = [...starts].sort(
    (left, right) => (timestampMs(left) ?? 0) - (timestampMs(right) ?? 0)
  );
  const orderedEnds = [...ends].sort(
    (left, right) => (timestampMs(left) ?? 0) - (timestampMs(right) ?? 0)
  );
  let total = 0;
  const count = Math.min(orderedStarts.length, orderedEnds.length);
  for (let index = 0; index < count; index += 1) {
    const startAt = orderedStarts[index];
    const endAt = orderedEnds[index];
    if (!startAt || !endAt) continue;
    total += overlapMinutes(startAt, endAt, segments);
  }
  return total;
}

export function summarizeRecomputeShiftBounds(
  events: RecomputeShiftBoundEvent[],
  flags?: {
    pausePaid?: boolean;
    lunchPaid?: boolean;
    scheduleStart?: string | null;
    workDate?: string | null;
  }
): RecomputeShiftBoundSummary {
  const pausePaid = flags?.pausePaid === true;
  const lunchPaid = flags?.lunchPaid === true;
  const dinnerStarts: string[] = [];
  const dinnerEnds: string[] = [];
  const breakStarts: string[] = [];
  const breakEnds: string[] = [];
  const bounds: Array<{ at: string; kind: "start" | "end" }> = [];

  for (const event of events) {
    if (event.status === "refuse") continue;
    const startAt = startCandidate(event);
    const endAt = endCandidate(event);
    if (startAt) bounds.push({ at: startAt, kind: "start" });
    if (endAt) bounds.push({ at: endAt, kind: "end" });
    const dinnerStartAt = dinnerStartCandidate(event);
    const dinnerEndAt = dinnerEndCandidate(event);
    const breakStartAt = breakStartCandidate(event);
    const breakEndAt = breakEndCandidate(event);
    if (dinnerStartAt) dinnerStarts.push(dinnerStartAt);
    if (dinnerEndAt) dinnerEnds.push(dinnerEndAt);
    if (breakStartAt) breakStarts.push(breakStartAt);
    if (breakEndAt) breakEnds.push(breakEndAt);
  }

  bounds.sort((left, right) => {
    const delta = (timestampMs(left.at) ?? 0) - (timestampMs(right.at) ?? 0);
    if (delta !== 0) return delta;
    if (left.kind === right.kind) return 0;
    return left.kind === "start" ? -1 : 1;
  });

  let shiftStartAt: string | null = null;
  let shiftEndAt: string | null = null;
  let segmentStartAt: string | null = null;
  let closedPayableMinutes = 0;
  const closedSegments: Array<{ payableStartAt: string; endAt: string }> = [];

  for (const bound of bounds) {
    if (bound.kind === "start") {
      if (!shiftStartAt || shiftEndAt) {
        if (!shiftStartAt) shiftStartAt = bound.at;
        shiftEndAt = null;
        segmentStartAt = bound.at;
      }
      continue;
    }

    if (!segmentStartAt) {
      shiftEndAt = later(shiftEndAt, bound.at);
      continue;
    }

    const segmentStartMs = timestampMs(segmentStartAt);
    const endMs = timestampMs(bound.at);
    if (segmentStartMs == null || endMs == null || endMs < segmentStartMs) continue;
    const previousEndMs = timestampMs(shiftEndAt);
    if (previousEndMs != null && endMs <= previousEndMs) continue;

    const segmentPayableAt = payableSegmentStart(segmentStartAt, flags);
    const previousCounted =
      shiftEndAt == null ? 0 : payableSegmentMinutes(segmentPayableAt, shiftEndAt);
    closedPayableMinutes +=
      payableSegmentMinutes(segmentPayableAt, bound.at) - previousCounted;
    if (shiftEndAt == null) {
      closedSegments.push({ payableStartAt: segmentPayableAt, endAt: bound.at });
    } else {
      const currentSegment = closedSegments[closedSegments.length - 1];
      if (currentSegment) currentSegment.endAt = bound.at;
    }
    shiftEndAt = bound.at;
  }

  const payableStartAt = shiftStartAt
    ? payableSegmentStart(shiftStartAt, flags)
    : null;
  const unpaidLunchMinutes = lunchPaid
    ? 0
    : pairedOverlapMinutes(dinnerStarts, dinnerEnds, closedSegments);
  const unpaidBreakMinutes = pausePaid
    ? 0
    : pairedOverlapMinutes(breakStarts, breakEnds, closedSegments);
  const pairAnomalies =
    Math.abs(breakStarts.length - breakEnds.length) +
    Math.abs(dinnerStarts.length - dinnerEnds.length);
  const workedMinutes = Math.max(
    0,
    closedPayableMinutes - unpaidBreakMinutes - unpaidLunchMinutes
  );

  return {
    shiftStartAt,
    shiftEndAt,
    payableStartAt,
    workedMinutes,
    payableMinutes: workedMinutes,
    unpaidBreakMinutes,
    unpaidLunchMinutes,
    pairAnomalies,
    status: shiftStartAt && !shiftEndAt ? "ouvert" : "ferme",
  };
}

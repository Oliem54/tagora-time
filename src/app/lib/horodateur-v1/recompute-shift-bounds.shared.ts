/**
 * Bornes du recalcul SQL `recompute_horodateur_shift`.
 * `clock_in` / `shift_start` approuvés ou normaux gardent `event_time`.
 * Une arrivée anglaise en attente n'ouvre pas de segment et ne remet pas
 * `shiftEndAt` à vide. Une sortie anglaise ne ferme qu'un segment encore
 * ouvert par une arrivée valide : elle ne prolonge pas un segment déjà fermé
 * et n'étend pas le quart à travers le trou hors service. `quart_debut` /
 * `punch_in`, `quart_fin` / `punch_out`,
 * `dinner_debut` et `dinner_fin` ne comptent que s'ils sont normal ou
 * approuve, à `occurred_at`, sinon `event_time`. Un événement en attente,
 * y compris une fin automatique, ne devient pas une borne approuvée.
 * `pause_debut` et `pause_fin` approuvés sont soustraits comme les pauses
 * anglaises, seulement sur leur intersection avec un segment payable fermé.
 * Une pause ou un dîner dans le trou entre deux quarts ne réduit pas les
 * minutes. Une pause ou un dîner orphelin, y compris dans le trou hors
 * service, ne consomme pas une fin ultérieure. Les débuts et les fins se
 * jumellent seulement dans le même segment fermé, sur le vrai début du
 * segment. Un second début pendant une pause déjà ouverte est rejeté et ne
 * forme pas une paire imbriquée. Le clamp horaire limite seulement le
 * chevauchement payable.
 * Une fin dans le trou
 * avant le segment suivant peut encore fermer un début de ce segment.
 * Les minutes de dîner
 * et de pause approuvés sont soustraites du
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

function segmentIndexForPoint(
  at: string,
  segments: Array<{ segmentStartAt: string; endAt: string }>,
  kind: "start" | "end"
) {
  const atMs = timestampMs(at);
  if (atMs == null) return null;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    const startMs = timestampMs(segment.segmentStartAt);
    const endMs = timestampMs(segment.endAt);
    if (startMs == null || endMs == null) continue;
    if (kind === "start" && atMs >= startMs && atMs < endMs) return index;
    if (kind === "end" && atMs > startMs && atMs <= endMs) return index;
  }
  if (kind === "start") return null;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const next = segments[index + 1];
    if (!segment) continue;
    const endMs = timestampMs(segment.endAt);
    const nextStartMs = next ? timestampMs(next.segmentStartAt) : null;
    if (endMs == null) continue;
    if (atMs > endMs && (nextStartMs == null || atMs < nextStartMs)) return index;
  }
  return null;
}

function pairedOverlapMinutes(
  starts: string[],
  ends: string[],
  segments: Array<{ segmentStartAt: string; payableStartAt: string; endAt: string }>
) {
  const located = [
    ...starts.map((at, index) => ({
      at,
      kind: "start" as const,
      index,
      segmentIndex: segmentIndexForPoint(at, segments, "start"),
    })),
    ...ends.map((at, index) => ({
      at,
      kind: "end" as const,
      index,
      segmentIndex: segmentIndexForPoint(at, segments, "end"),
    })),
  ].filter(
    (mark) => timestampMs(mark.at) != null && mark.segmentIndex != null
  );
  const segmentIndexes = [
    ...new Set(located.map((mark) => mark.segmentIndex as number)),
  ];
  let total = 0;
  for (const segmentIndex of segmentIndexes) {
    const marks = located
      .filter((mark) => mark.segmentIndex === segmentIndex)
      .sort((left, right) => {
        const delta = (timestampMs(left.at) ?? 0) - (timestampMs(right.at) ?? 0);
        if (delta !== 0) return delta;
        if (left.kind !== right.kind) return left.kind === "start" ? -1 : 1;
        return left.index - right.index;
      });
    let open = false;
    const accepted = marks.map((mark) => {
      if (mark.kind === "start") {
        if (!open) {
          open = true;
          return { ...mark, accepted: true };
        }
        return { ...mark, accepted: false };
      }
      if (open) {
        open = false;
        return { ...mark, accepted: true };
      }
      return { ...mark, accepted: false };
    });
    const usedStartIndexes = new Set<number>();
    for (const endMark of accepted) {
      if (endMark.kind !== "end" || !endMark.accepted) continue;
      const startMark = accepted
        .filter(
          (mark) =>
            mark.kind === "start" &&
            mark.accepted &&
            !usedStartIndexes.has(mark.index) &&
            (timestampMs(mark.at) ?? 0) < (timestampMs(endMark.at) ?? 0)
        )
        .sort(
          (left, right) => (timestampMs(right.at) ?? 0) - (timestampMs(left.at) ?? 0)
        )[0];
      if (!startMark) continue;
      usedStartIndexes.add(startMark.index);
      total += overlapMinutes(startMark.at, endMark.at, segments);
    }
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
    approvedExceptionMinutes?: number | null;
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
  const closedSegments: Array<{
    segmentStartAt: string;
    payableStartAt: string;
    endAt: string;
  }> = [];

  for (const bound of bounds) {
    if (bound.kind === "start") {
      if (!shiftStartAt || shiftEndAt) {
        if (!shiftStartAt) shiftStartAt = bound.at;
        shiftEndAt = null;
        segmentStartAt = bound.at;
      }
      continue;
    }

    if (!segmentStartAt || shiftEndAt) continue;

    const segmentStartMs = timestampMs(segmentStartAt);
    const endMs = timestampMs(bound.at);
    if (segmentStartMs == null || endMs == null || endMs < segmentStartMs) continue;

    const segmentPayableAt = payableSegmentStart(segmentStartAt, flags);
    closedPayableMinutes += payableSegmentMinutes(segmentPayableAt, bound.at);
    closedSegments.push({
      segmentStartAt,
      payableStartAt: segmentPayableAt,
      endAt: bound.at,
    });
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
  const approvedExceptionMinutes = Math.max(
    0,
    Math.floor(flags?.approvedExceptionMinutes ?? 0)
  );

  return {
    shiftStartAt,
    shiftEndAt,
    payableStartAt,
    workedMinutes,
    payableMinutes: Math.max(0, workedMinutes + approvedExceptionMinutes),
    unpaidBreakMinutes,
    unpaidLunchMinutes,
    pairAnomalies,
    status: shiftStartAt && !shiftEndAt ? "ouvert" : "ferme",
  };
}

import {
  getEventOccurredAt,
  getLocalWorkDate,
  isApprovedHorodateurEventStatus,
  shouldTreatApprovedEventAsShiftStart,
  toCanonicalEventType,
} from "./rules";
import type {
  HorodateurPhase1EventRecord,
  HorodateurPhase1StateKind,
} from "./types";

export function sortHorodateurEventsByOccurredAt(
  events: HorodateurPhase1EventRecord[]
): HorodateurPhase1EventRecord[] {
  return [...events].sort((left, right) => {
    const leftAt = getEventOccurredAt(left);
    const rightAt = getEventOccurredAt(right);
    if (!leftAt && !rightAt) {
      return String(left.id).localeCompare(String(right.id));
    }
    if (!leftAt) {
      return -1;
    }
    if (!rightAt) {
      return 1;
    }
    const delta = new Date(leftAt).getTime() - new Date(rightAt).getTime();
    if (delta !== 0) {
      return delta;
    }
    if (left.status !== right.status) {
      return left.status === "en_attente" ? 1 : -1;
    }
    return String(left.id).localeCompare(String(right.id));
  });
}

export function buildOperationalStateEvents(
  approvedEvents: HorodateurPhase1EventRecord[],
  pendingPunchOutEvents: HorodateurPhase1EventRecord[]
): HorodateurPhase1EventRecord[] {
  const pendingPunchOuts = pendingPunchOutEvents.filter(
    (event) =>
      event.status === "en_attente" &&
      toCanonicalEventType(event.event_type) === "punch_out"
  );
  return sortHorodateurEventsByOccurredAt([
    ...approvedEvents,
    ...pendingPunchOuts,
  ]);
}

export type HorodateurOperationalStateResult = {
  currentState: HorodateurPhase1StateKind;
  activeShiftStartEventId: string | null;
  activePauseStartEventId: string | null;
  activeDinnerStartEventId: string | null;
  hasSequenceAnomaly: boolean;
};

export function computeStateFromEventTimeline(
  events: HorodateurPhase1EventRecord[],
  options?: { ignorePaidBreakPunches?: boolean }
): HorodateurOperationalStateResult {
  const ignorePaidBreakPunches = options?.ignorePaidBreakPunches ?? false;
  const orderedEvents = sortHorodateurEventsByOccurredAt(events);

  let currentState: HorodateurPhase1StateKind = "hors_quart";
  let activeShiftStartEventId: string | null = null;
  let activePauseStartEventId: string | null = null;
  let activeDinnerStartEventId: string | null = null;
  let hasSequenceAnomaly = false;

  for (const event of orderedEvents) {
    const canonicalEventType = toCanonicalEventType(event.event_type);

    if (!canonicalEventType) {
      hasSequenceAnomaly = true;
      continue;
    }

    if (
      ignorePaidBreakPunches &&
      (canonicalEventType === "break_start" || canonicalEventType === "break_end")
    ) {
      continue;
    }

    if (
      canonicalEventType === "punch_in" ||
      (canonicalEventType === "retroactive_entry" &&
        shouldTreatApprovedEventAsShiftStart(event, orderedEvents))
    ) {
      currentState = "en_quart";
      activeShiftStartEventId = event.id;
      activePauseStartEventId = null;
      activeDinnerStartEventId = null;
      continue;
    }

    if (canonicalEventType === "break_start") {
      if (currentState === "en_quart") {
        currentState = "en_pause";
        activePauseStartEventId = event.id;
      } else {
        hasSequenceAnomaly = true;
      }
      continue;
    }

    if (canonicalEventType === "break_end") {
      if (currentState === "en_pause") {
        currentState = "en_quart";
        activePauseStartEventId = null;
      } else {
        hasSequenceAnomaly = true;
      }
      continue;
    }

    if (canonicalEventType === "meal_start") {
      if (currentState === "en_quart") {
        currentState = "en_diner";
        activeDinnerStartEventId = event.id;
      } else {
        hasSequenceAnomaly = true;
      }
      continue;
    }

    if (canonicalEventType === "meal_end") {
      if (currentState === "en_diner") {
        currentState = "en_quart";
        activeDinnerStartEventId = null;
      } else {
        hasSequenceAnomaly = true;
      }
      continue;
    }

    if (canonicalEventType === "punch_out") {
      if (
        currentState !== "en_quart" &&
        currentState !== "en_pause" &&
        currentState !== "en_diner"
      ) {
        hasSequenceAnomaly = true;
      }
      currentState = "termine";
      activeShiftStartEventId = null;
      activePauseStartEventId = null;
      activeDinnerStartEventId = null;
    }
  }

  return {
    currentState,
    activeShiftStartEventId,
    activePauseStartEventId,
    activeDinnerStartEventId,
    hasSequenceAnomaly,
  };
}

export function findActivePendingPunchOutFromEvents(
  pendingPunchOutEvents: HorodateurPhase1EventRecord[],
  approvedEvents: HorodateurPhase1EventRecord[]
): HorodateurPhase1EventRecord | null {
  const pendingPunchOuts = pendingPunchOutEvents.filter(
    (event) =>
      event.status === "en_attente" &&
      toCanonicalEventType(event.event_type) === "punch_out"
  );

  if (pendingPunchOuts.length === 0) {
    return null;
  }

  const sortedPending = sortHorodateurEventsByOccurredAt(pendingPunchOuts).reverse();

  for (const pending of sortedPending) {
    const pendingAt = getEventOccurredAt(pending);
    if (!pendingAt) {
      continue;
    }

    const pendingWorkDate =
      pending.work_date?.trim() || getLocalWorkDate(pendingAt);
    const pendingMs = new Date(pendingAt).getTime();

    const hasApprovedCloseOnSameDay = approvedEvents.some((event) => {
      if (toCanonicalEventType(event.event_type) !== "punch_out") {
        return false;
      }
      if (!isApprovedHorodateurEventStatus(event.status)) {
        return false;
      }
      const approvedAt = getEventOccurredAt(event);
      if (!approvedAt) {
        return false;
      }
      const approvedWorkDate =
        event.work_date?.trim() || getLocalWorkDate(approvedAt);
      if (approvedWorkDate !== pendingWorkDate) {
        return false;
      }
      return new Date(approvedAt).getTime() >= pendingMs;
    });

    if (!hasApprovedCloseOnSameDay) {
      return pending;
    }
  }

  return null;
}

export function filterEventsForPayrollRecompute(
  events: HorodateurPhase1EventRecord[]
): HorodateurPhase1EventRecord[] {
  return events.filter((event) => isApprovedHorodateurEventStatus(event.status));
}

export function formatPendingPunchOutSubmittedMessage(_occurredAt: string): string {
  return "Votre sortie a ete soumise a validation. Vous pouvez continuer a utiliser l'horodateur normalement.";
}

export function compareHorodateurExceptionReviewPriority(
  left: { exception_type: string; event_type?: string | null },
  right: { exception_type: string; event_type?: string | null }
): number {
  const rank = (item: { exception_type: string; event_type?: string | null }) => {
    if (item.exception_type === "shift_too_long") {
      return 0;
    }
    const canonical = item.event_type
      ? toCanonicalEventType(
          item.event_type as HorodateurPhase1EventRecord["event_type"]
        )
      : null;
    if (canonical === "punch_out") {
      return 1;
    }
    return 2;
  };

  const leftRank = rank(left);
  const rightRank = rank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return 0;
}

import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  HORODATEUR_CANONICAL_EVENT_TYPES,
  HORODATEUR_PHASE1_EXCEPTION_TYPES,
  type HorodateurCanonicalEventType,
  type HorodateurPhase1Classification,
  type HorodateurPhase1ClassifyInput,
  type HorodateurPhase1CurrentStateRecord,
  type HorodateurPhase1EmployeeProfile,
  type HorodateurPhase1EventRecord,
  type HorodateurPhase1EventType,
  type HorodateurPhase1ExceptionType,
  type HorodateurPhase1StateKind,
} from "./types";

export const HORODATEUR_PHASE1_TIMEZONE = "America/Toronto";
export const HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS = 40;
/** Entree jusqu'a N minutes avant schedule_start : auto-acceptee si GPS OK (Phase A hotfix). */
export const HORODATEUR_EARLY_PUNCH_IN_GRACE_MINUTES = 10;
/** Duree maximale d un quart ouvert (horloge murale depuis le debut) avant plafond live et sortie a approuver. */
export const HORODATEUR_OPEN_SHIFT_SAFETY_MAX_ELAPSED_MINUTES = 840;
const PHASE1_DEFAULT_MAX_BREAK_MINUTES = 120;
const PHASE1_DEFAULT_MAX_MEAL_MINUTES = 180;

const WORKDAY_LABEL_TO_INDEX: Record<string, number> = {
  sunday: 0,
  dimanche: 0,
  monday: 1,
  lundi: 1,
  tuesday: 2,
  mardi: 2,
  wednesday: 3,
  mercredi: 3,
  thursday: 4,
  jeudi: 4,
  friday: 5,
  vendredi: 5,
  saturday: 6,
  samedi: 6,
};

const PHASE1_REQUIRED_EXCEPTIONS = new Set<HorodateurPhase1ExceptionType>(
  HORODATEUR_PHASE1_EXCEPTION_TYPES
);

function getDatePartsInTimeZone(
  value: string | Date,
  timeZone = HORODATEUR_PHASE1_TIMEZONE
) {
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(valueByType.year);
  const month = Number(valueByType.month);
  const day = Number(valueByType.day);
  const hour = Number(valueByType.hour);
  const minute = Number(valueByType.minute);
  const weekdayLabel = String(valueByType.weekday ?? "").toLowerCase();
  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };

  return {
    year,
    month,
    day,
    hour,
    minute,
    date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`,
    weekday: weekdayMap[weekdayLabel] ?? 0,
  };
}

export function getLocalWorkDate(value: string | Date) {
  return getDatePartsInTimeZone(value).date;
}

export function getWeekStartDate(value: string | Date) {
  const localDate = getLocalWorkDate(value);
  const probe = new Date(`${localDate}T12:00:00Z`);
  const weekday = probe.getUTCDay();
  const distanceToMonday = (weekday + 6) % 7;
  probe.setUTCDate(probe.getUTCDate() - distanceToMonday);
  return probe.toISOString().slice(0, 10);
}

export function getMinutesSinceLocalMidnight(value: string | Date) {
  const parts = getDatePartsInTimeZone(value);
  return parts.hour * 60 + parts.minute;
}

export function diffMinutes(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

function parseTimeToMinutes(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeScheduledWorkDays(values: string[] | null | undefined) {
  if (!values || values.length === 0) {
    return null;
  }

  return values
    .map((value) => WORKDAY_LABEL_TO_INDEX[String(value).trim().toLowerCase()])
    .filter((value): value is number => Number.isInteger(value));
}

export function resolveInitialCurrentState(
  currentState: HorodateurPhase1CurrentStateRecord | null
) {
  return currentState?.current_state ?? "hors_quart";
}

export function getLastApprovedEvent(
  events: HorodateurPhase1EventRecord[]
): HorodateurPhase1EventRecord | null {
  return events.length > 0 ? events[events.length - 1] ?? null : null;
}

export function getEventOccurredAt(
  event:
    | Pick<HorodateurPhase1EventRecord, "occurred_at" | "event_time" | "created_at">
    | null
    | undefined
) {
  return event?.occurred_at ?? event?.event_time ?? event?.created_at ?? null;
}

export function isWithinScheduledWindowForEmployee(
  employee: HorodateurPhase1EmployeeProfile,
  occurredAt: string
) {
  return isWithinScheduledWindow(employee, occurredAt);
}

function isWithinScheduledWindow(
  employee: HorodateurPhase1EmployeeProfile,
  occurredAt: string
) {
  const scheduleStartMinutes = parseTimeToMinutes(employee.scheduleStart);
  const scheduleEndMinutes = parseTimeToMinutes(employee.scheduleEnd);

  if (scheduleStartMinutes == null || scheduleEndMinutes == null) {
    return true;
  }

  const currentMinutes = getMinutesSinceLocalMidnight(occurredAt);
  const windowStart =
    scheduleStartMinutes - employee.toleranceBeforeStartMinutes;
  const windowEnd = scheduleEndMinutes + employee.toleranceAfterEndMinutes;

  return currentMinutes >= windowStart && currentMinutes <= windowEnd;
}

export function isWithinEarlyPunchInGraceWindow(
  employee: HorodateurPhase1EmployeeProfile,
  occurredAt: string,
  graceMinutes = HORODATEUR_EARLY_PUNCH_IN_GRACE_MINUTES
) {
  if (!employee.scheduleStart?.trim()) {
    return false;
  }

  if (!isValidScheduledWorkDay(employee, occurredAt)) {
    return false;
  }

  const scheduleStartMinutes = parseTimeToMinutes(employee.scheduleStart);
  if (scheduleStartMinutes == null) {
    return false;
  }

  const currentMinutes = getMinutesSinceLocalMidnight(occurredAt);
  const graceStartMinutes = scheduleStartMinutes - Math.max(0, graceMinutes);
  const windowStart =
    scheduleStartMinutes - employee.toleranceBeforeStartMinutes;

  return (
    currentMinutes >= graceStartMinutes && currentMinutes < windowStart
  );
}

export function isValidScheduledWorkDayForEmployee(
  employee: HorodateurPhase1EmployeeProfile,
  occurredAt: string
) {
  return isValidScheduledWorkDay(employee, occurredAt);
}

function isValidScheduledWorkDay(
  employee: HorodateurPhase1EmployeeProfile,
  occurredAt: string
) {
  const workDays = normalizeScheduledWorkDays(employee.scheduledWorkDays);

  if (!workDays || workDays.length === 0) {
    return true;
  }

  return workDays.includes(getDatePartsInTimeZone(occurredAt).weekday);
}

/** Retard au début de quart : après l'heure prévue + tolérance avant début. */
export function isEmployeeLateForScheduledShiftStart(
  employee: HorodateurPhase1EmployeeProfile,
  occurredAt: string,
  defaultToleranceMinutes = 5
) {
  if (!employee.scheduleStart?.trim()) {
    return false;
  }

  if (!isValidScheduledWorkDay(employee, occurredAt)) {
    return false;
  }

  const scheduledStartMinutes = parseTimeToMinutes(employee.scheduleStart);
  if (scheduledStartMinutes == null) {
    return false;
  }

  const toleranceMinutes = Math.max(
    0,
    employee.toleranceBeforeStartMinutes ?? defaultToleranceMinutes
  );
  const lateThresholdMinutes = scheduledStartMinutes + toleranceMinutes;
  const currentMinutes = getMinutesSinceLocalMidnight(occurredAt);

  return currentMinutes > lateThresholdMinutes;
}

const LEGACY_TO_CANONICAL_EVENT_TYPE: Record<
  HorodateurPhase1EventType,
  HorodateurCanonicalEventType
> = {
  quart_debut: "punch_in",
  quart_fin: "punch_out",
  pause_debut: "break_start",
  pause_fin: "break_end",
  dinner_debut: "meal_start",
  dinner_fin: "meal_end",
  sortie_depart: "terrain_start",
  sortie_retour: "terrain_end",
  correction: "manual_correction",
  exception: "retroactive_entry",
  anomalie: "retroactive_entry",
};

function isCanonicalEventType(value: string): value is HorodateurCanonicalEventType {
  return (HORODATEUR_CANONICAL_EVENT_TYPES as readonly string[]).includes(value);
}

export function toCanonicalEventType(
  eventType: HorodateurPhase1EventType | HorodateurCanonicalEventType | null | undefined
): HorodateurCanonicalEventType | null {
  if (!eventType) {
    return null;
  }

  const value = String(eventType).trim();

  if (!value) {
    return null;
  }

  if (isCanonicalEventType(value)) {
    return value;
  }

  return LEGACY_TO_CANONICAL_EVENT_TYPE[value as HorodateurPhase1EventType] ?? null;
}

function mapCanonicalInvalidSequenceException(
  canonicalEventType: HorodateurCanonicalEventType
): HorodateurPhase1ExceptionType {
  if (canonicalEventType === "break_start" || canonicalEventType === "break_end") {
    return "incoherent_pause";
  }

  if (canonicalEventType === "meal_start" || canonicalEventType === "meal_end") {
    return "incoherent_dinner";
  }

  if (canonicalEventType === "punch_in" || canonicalEventType === "punch_out") {
    return "missing_punch_adjustment";
  }

  return "invalid_sequence";
}

function isAllowedTransition(
  state: HorodateurPhase1StateKind,
  canonicalEventType: HorodateurCanonicalEventType
) {
  if (canonicalEventType === "punch_in") {
    return state === "hors_quart" || state === "termine";
  }

  if (canonicalEventType === "punch_out") {
    return state === "en_quart" || state === "en_pause" || state === "en_diner";
  }

  if (canonicalEventType === "break_start") {
    return state === "en_quart";
  }

  if (canonicalEventType === "break_end") {
    return state === "en_pause";
  }

  if (canonicalEventType === "meal_start") {
    return state === "en_quart";
  }

  if (canonicalEventType === "meal_end") {
    return state === "en_diner";
  }

  if (canonicalEventType === "terrain_start" || canonicalEventType === "terrain_end") {
    return state === "en_quart" || state === "en_pause" || state === "en_diner";
  }

  return true;
}

function buildPendingClassification(
  exceptionType: HorodateurPhase1ExceptionType,
  reasonLabel: string,
  details?: string | null
): HorodateurPhase1Classification {
  return {
    status: "en_attente",
    requiresApproval: true,
    exceptionType,
    reasonLabel,
    details: details ?? null,
  };
}

function buildApprovedClassification(): HorodateurPhase1Classification {
  return {
    status: "normal",
    requiresApproval: false,
    exceptionType: null,
    reasonLabel: null,
    details: null,
  };
}

function sortApprovedEventsByOccurredAt(events: HorodateurPhase1EventRecord[]) {
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
    return String(left.id).localeCompare(String(right.id));
  });
}

/** Debut de quart ouvert approuve (punch_in explicite ou entree retroactive approuvee). */
export function resolveOpenShiftStartEvent(
  approvedEvents: HorodateurPhase1EventRecord[]
): HorodateurPhase1EventRecord | null {
  const sorted = sortApprovedEventsByOccurredAt(approvedEvents);
  let activeStart: HorodateurPhase1EventRecord | null = null;

  for (const event of sorted) {
    if (shouldTreatApprovedEventAsShiftStart(event, sorted)) {
      activeStart = event;
      continue;
    }
    if (toCanonicalEventType(event.event_type) === "punch_out") {
      activeStart = null;
    }
  }

  return activeStart;
}

export function resolveOpenShiftStartAt(
  approvedEvents: HorodateurPhase1EventRecord[]
): string | null {
  const activeStart = resolveOpenShiftStartEvent(approvedEvents);
  return activeStart ? getEventOccurredAt(activeStart) : null;
}

export function computeOpenShiftSafetyCapAt(openShiftStartAt: string): string {
  const capMs =
    new Date(openShiftStartAt).getTime() +
    HORODATEUR_OPEN_SHIFT_SAFETY_MAX_ELAPSED_MINUTES * 60_000;
  return new Date(capMs).toISOString();
}

export function computeOpenShiftElapsedMinutes(
  openShiftStartAt: string,
  atIso: string
): number {
  return diffMinutes(openShiftStartAt, atIso);
}

export function isOpenShiftBeyondSafetyLimit(
  openShiftStartAt: string,
  atIso: string
): boolean {
  return (
    computeOpenShiftElapsedMinutes(openShiftStartAt, atIso) >=
    HORODATEUR_OPEN_SHIFT_SAFETY_MAX_ELAPSED_MINUTES
  );
}

export function resolveLiveAccrualEndIso(options: {
  nowIso: string;
  openShiftStartAt: string | null;
  pendingCapAt?: string | null;
}): string {
  let endMs = new Date(options.nowIso).getTime();
  if (options.pendingCapAt) {
    endMs = Math.min(endMs, new Date(options.pendingCapAt).getTime());
  }
  if (options.openShiftStartAt) {
    endMs = Math.min(
      endMs,
      new Date(computeOpenShiftSafetyCapAt(options.openShiftStartAt)).getTime()
    );
  }
  return new Date(endMs).toISOString();
}

function hasRequiredExceptionType(
  value: HorodateurPhase1ExceptionType | null | undefined
): value is HorodateurPhase1ExceptionType {
  return Boolean(value && PHASE1_REQUIRED_EXCEPTIONS.has(value));
}

function getOpenSegmentStartEvent(
  events: HorodateurPhase1EventRecord[],
  startType: HorodateurCanonicalEventType,
  endType: HorodateurCanonicalEventType
) {
  let activeStart: HorodateurPhase1EventRecord | null = null;

  for (const event of events) {
    const canonicalEventType = toCanonicalEventType(event.event_type);
    if (!canonicalEventType) {
      continue;
    }

    if (canonicalEventType === startType) {
      activeStart = event;
      continue;
    }

    if (canonicalEventType === endType) {
      activeStart = null;
    }
  }

  return activeStart;
}

function resolveBreakLimitMinutes(employee: HorodateurPhase1EmployeeProfile) {
  return Math.max(
    PHASE1_DEFAULT_MAX_BREAK_MINUTES,
    Math.max(1, employee.pauseMinutes || 0) * 3
  );
}

function resolveMealLimitMinutes(employee: HorodateurPhase1EmployeeProfile) {
  return Math.max(
    PHASE1_DEFAULT_MAX_MEAL_MINUTES,
    Math.max(1, employee.lunchMinutes || 0) * 3
  );
}

function classifyPunchOutAfterOpenShiftSafetyLimit(options: {
  canonicalEventType: HorodateurCanonicalEventType;
  occurredAt: string;
  note?: string | null;
  allApprovedEvents: HorodateurPhase1EventRecord[];
  pendingPunchOutEvents?: HorodateurPhase1EventRecord[];
}): HorodateurPhase1Classification | null {
  if (options.canonicalEventType !== "punch_out") {
    return null;
  }

  const openShiftTimeline = [
    ...options.allApprovedEvents,
    ...(options.pendingPunchOutEvents ?? []).filter(
      (event) =>
        event.status === "en_attente" &&
        toCanonicalEventType(event.event_type) === "punch_out"
    ),
  ];
  const activeShiftStart = resolveOpenShiftStartEvent(openShiftTimeline);
  if (!activeShiftStart) {
    return null;
  }

  const activeShiftStartAt = getEventOccurredAt(activeShiftStart);
  if (!activeShiftStartAt) {
    return null;
  }

  const elapsedMinutes = diffMinutes(activeShiftStartAt, options.occurredAt);
  if (elapsedMinutes < HORODATEUR_OPEN_SHIFT_SAFETY_MAX_ELAPSED_MINUTES) {
    return null;
  }

  return buildPendingClassification(
    "shift_too_long",
    "Quart ouvert plus de 14 h — fermeture a approuver",
    options.note ??
      "Le quart depasse 14 heures depuis le debut. La sortie requiert une approbation direction."
  );
}

export function classifyEventPhase1(
  input: HorodateurPhase1ClassifyInput
): HorodateurPhase1Classification {
  const {
    employee,
    currentState,
    latestApprovedEvents,
    allApprovedEvents,
    pendingPunchOutEvents,
    eventType,
    occurredAt,
    actorRole,
    note,
    forcedExceptionType,
  } = input;
  const canonicalEventType = toCanonicalEventType(eventType);

  if (!canonicalEventType) {
    return buildPendingClassification(
      "invalid_sequence",
      "Type d evenement non reconnu",
      `Impossible de normaliser l evenement: ${String(eventType)}.`
    );
  }

  if (canonicalEventType === "retroactive_entry") {
    return buildPendingClassification(
      "missing_punch_adjustment",
      "Entree retroactive en attente",
      note ?? "L action retroactive requiert une approbation."
    );
  }

  if (canonicalEventType === "manual_correction") {
    return buildPendingClassification(
      "direction_manual_correction",
      "Correction manuelle en attente",
      note ?? "La correction manuelle requiert une approbation."
    );
  }

  if (actorRole === "direction") {
    return buildApprovedClassification();
  }

  if (hasRequiredExceptionType(forcedExceptionType)) {
    const reasonLabel =
      forcedExceptionType === "missing_punch_adjustment"
        ? "Ajustement d oubli de punch en attente"
        : "Correction manuelle en attente";

    return buildPendingClassification(
      forcedExceptionType,
      reasonLabel,
      note ?? null
    );
  }

  const resolvedState = resolveInitialCurrentState(currentState);
  const lastApprovedEvent = getLastApprovedEvent(latestApprovedEvents);
  const lastApprovedOccurredAt = getEventOccurredAt(lastApprovedEvent);

  if (lastApprovedOccurredAt) {
    const occurredAtTime = new Date(occurredAt).getTime();
    const lastOccurredAtTime = new Date(lastApprovedOccurredAt).getTime();
    if (
      Number.isFinite(occurredAtTime) &&
      Number.isFinite(lastOccurredAtTime) &&
      occurredAtTime < lastOccurredAtTime
    ) {
      return buildPendingClassification(
        "invalid_sequence",
        "Chevauchement temporel detecte",
        "L evenement est anterieur au dernier evenement approuve."
      );
    }
  }

  if (!isAllowedTransition(resolvedState, canonicalEventType)) {
    const invalidExceptionType = mapCanonicalInvalidSequenceException(
      canonicalEventType
    );
    const canonicalReason =
      canonicalEventType === "punch_in"
        ? "Quart precedent non ferme (missing_punch_out)."
        : canonicalEventType === "terrain_end"
          ? "Retour terrain sans depart actif."
          : "Transition d etat invalide.";

    return buildPendingClassification(
      invalidExceptionType,
      "Sequence de pointage invalide",
      `Etat courant: ${resolvedState}; action: ${canonicalEventType}; ${canonicalReason}`
    );
  }

  const openShiftApprovedEvents = allApprovedEvents ?? latestApprovedEvents;
  const punchOutSafetyClassification = classifyPunchOutAfterOpenShiftSafetyLimit({
    canonicalEventType,
    occurredAt,
    note,
    allApprovedEvents: openShiftApprovedEvents,
    pendingPunchOutEvents,
  });
  if (punchOutSafetyClassification) {
    return punchOutSafetyClassification;
  }

  const withinScheduleOrEarlyGrace =
    isWithinScheduledWindow(employee, occurredAt) ||
    (canonicalEventType === "punch_in" &&
      isWithinEarlyPunchInGraceWindow(employee, occurredAt));

  if (!isValidScheduledWorkDay(employee, occurredAt) || !withinScheduleOrEarlyGrace) {
    return buildPendingClassification(
      "outside_schedule",
      "Pointage hors horaire prevu",
      "Le pointage est en dehors des jours ou de la fenetre horaire autorisee."
    );
  }

  const activeShiftStart = resolveOpenShiftStartEvent(openShiftApprovedEvents);

  if (activeShiftStart) {
    const activeShiftStartAt = getEventOccurredAt(activeShiftStart);

    if (!activeShiftStartAt) {
      return buildPendingClassification(
        "invalid_sequence",
        "Sequence de pointage invalide",
        "Impossible de determiner l heure du debut de quart actif."
      );
    }

    const elapsedMinutes = diffMinutes(activeShiftStartAt, occurredAt);

    if (elapsedMinutes > employee.maxShiftMinutes) {
      return buildPendingClassification(
        "shift_too_long",
        "Quart trop long (excessive_shift_duration)",
        `Le quart depasse ${employee.maxShiftMinutes} minutes.`
      );
    }
  }

  if (canonicalEventType === "break_end") {
    const pauseStartEvent = getOpenSegmentStartEvent(
      latestApprovedEvents,
      "break_start",
      "break_end"
    );
    const pauseStartAt = getEventOccurredAt(pauseStartEvent);
    if (pauseStartAt) {
      const pauseDurationMinutes = diffMinutes(pauseStartAt, occurredAt);
      if (pauseDurationMinutes > resolveBreakLimitMinutes(employee)) {
        return buildPendingClassification(
          "incoherent_pause",
          "Pause excessive",
          `Pause de ${pauseDurationMinutes} minutes (limite ${resolveBreakLimitMinutes(employee)}).`
        );
      }
    }
  }

  if (canonicalEventType === "meal_end") {
    const mealStartEvent = getOpenSegmentStartEvent(
      latestApprovedEvents,
      "meal_start",
      "meal_end"
    );
    const mealStartAt = getEventOccurredAt(mealStartEvent);
    if (mealStartAt) {
      const mealDurationMinutes = diffMinutes(mealStartAt, occurredAt);
      if (mealDurationMinutes > resolveMealLimitMinutes(employee)) {
        return buildPendingClassification(
          "incoherent_dinner",
          "Diner excessif",
          `Diner de ${mealDurationMinutes} minutes (limite ${resolveMealLimitMinutes(employee)}).`
        );
      }
    }
  }

  return buildApprovedClassification();
}

export function isApprovedHorodateurEventStatus(
  status: HorodateurPhase1EventRecord["status"] | string | null | undefined
): boolean {
  return status === "normal" || status === "approuve";
}

export function isExplicitApprovedPunchInEvent(
  event: Pick<HorodateurPhase1EventRecord, "event_type" | "status">
): boolean {
  return (
    isApprovedHorodateurEventStatus(event.status) &&
    toCanonicalEventType(event.event_type) === "punch_in"
  );
}

/** Entree retroactive approuvee (correction employe) — pas une sortie ni manual_correction. */
export function isApprovedRetroactiveShiftStartEvent(
  event: Pick<
    HorodateurPhase1EventRecord,
    "event_type" | "status" | "exception_code"
  >
): boolean {
  if (!isApprovedHorodateurEventStatus(event.status)) {
    return false;
  }
  if (toCanonicalEventType(event.event_type) !== "retroactive_entry") {
    return false;
  }
  if (
    event.exception_code &&
    event.exception_code !== "missing_punch_adjustment"
  ) {
    return false;
  }
  return true;
}

function resolveEventWorkDate(event: HorodateurPhase1EventRecord): string | null {
  const workDate = event.work_date?.trim();
  if (workDate) {
    return workDate;
  }
  const occurredAt = getEventOccurredAt(event);
  return occurredAt ? getLocalWorkDate(occurredAt) : null;
}

/** punch_in explicite approuve le meme jour de travail, avant l'evenement cible. */
export function hasExplicitApprovedPunchInBeforeEvent(
  orderedApprovedEvents: HorodateurPhase1EventRecord[],
  targetEventId: string
): boolean {
  let targetWorkDate: string | null = null;

  for (const event of orderedApprovedEvents) {
    if (event.id === targetEventId) {
      targetWorkDate = resolveEventWorkDate(event);
      break;
    }
  }

  if (!targetWorkDate) {
    return false;
  }

  for (const event of orderedApprovedEvents) {
    if (event.id === targetEventId) {
      return false;
    }
    if (resolveEventWorkDate(event) !== targetWorkDate) {
      continue;
    }
    if (isExplicitApprovedPunchInEvent(event)) {
      return true;
    }
  }
  return false;
}

/** punch_in explicite ou entree retroactive approuvee sans punch_in anterieur. */
export function shouldTreatApprovedEventAsShiftStart(
  event: HorodateurPhase1EventRecord,
  orderedApprovedEvents: HorodateurPhase1EventRecord[]
): boolean {
  if (isExplicitApprovedPunchInEvent(event)) {
    return true;
  }
  if (!isApprovedRetroactiveShiftStartEvent(event)) {
    return false;
  }
  return !hasExplicitApprovedPunchInBeforeEvent(orderedApprovedEvents, event.id);
}

export function resolveShiftStatus(options: {
  hasPendingExceptions: boolean;
  isOpen: boolean;
  anomaliesCount: number;
}) {
  if (options.hasPendingExceptions) {
    return "en_attente" as const;
  }

  if (options.isOpen) {
    return "ouvert" as const;
  }

  if (options.anomaliesCount > 0) {
    return "ferme" as const;
  }

  return "valide" as const;
}

export function resolveCompanyContextForShift(
  events: HorodateurPhase1EventRecord[],
  fallbackCompany: AccountRequestCompany | null
) {
  const matchedStartEvent =
    events.find((event) => toCanonicalEventType(event.event_type) === "punch_in") ??
    events[0] ??
    null;
  return matchedStartEvent ? fallbackCompany : fallbackCompany;
}

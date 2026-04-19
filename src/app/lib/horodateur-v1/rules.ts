import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  HORODATEUR_PHASE1_EXCEPTION_TYPES,
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
    | Pick<HorodateurPhase1EventRecord, "event_time" | "created_at">
    | null
    | undefined
) {
  return event?.event_time ?? event?.created_at ?? null;
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

function mapPauseDinnerException(
  eventType: HorodateurPhase1EventType
): HorodateurPhase1ExceptionType | null {
  if (eventType === "pause_debut" || eventType === "pause_fin") {
    return "incoherent_pause";
  }

  if (eventType === "dinner_debut" || eventType === "dinner_fin") {
    return "incoherent_dinner";
  }

  return null;
}

function getExpectedNextStates(
  state: HorodateurPhase1StateKind,
  eventType: HorodateurPhase1EventType
) {
  if (eventType === "quart_debut") {
    return state === "hors_quart" || state === "termine";
  }

  if (eventType === "quart_fin") {
    return state === "en_quart";
  }

  if (eventType === "pause_debut") {
    return state === "en_quart";
  }

  if (eventType === "pause_fin") {
    return state === "en_pause";
  }

  if (eventType === "dinner_debut") {
    return state === "en_quart";
  }

  if (eventType === "dinner_fin") {
    return state === "en_diner";
  }

  if (eventType === "sortie_depart" || eventType === "sortie_retour") {
    return true;
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

function getActiveShiftStartEvent(
  events: HorodateurPhase1EventRecord[]
): HorodateurPhase1EventRecord | null {
  let activeStart: HorodateurPhase1EventRecord | null = null;

  for (const event of events) {
    if (event.event_type === "quart_debut") {
      activeStart = event;
      continue;
    }

    if (event.event_type === "quart_fin") {
      activeStart = null;
    }
  }

  return activeStart;
}

function hasRequiredExceptionType(
  value: HorodateurPhase1ExceptionType | null | undefined
): value is HorodateurPhase1ExceptionType {
  return Boolean(value && PHASE1_REQUIRED_EXCEPTIONS.has(value));
}

export function classifyEventPhase1(
  input: HorodateurPhase1ClassifyInput
): HorodateurPhase1Classification {
  const {
    employee,
    currentState,
    latestApprovedEvents,
    eventType,
    occurredAt,
    actorRole,
    note,
    forcedExceptionType,
  } = input;

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

  if (!getExpectedNextStates(resolvedState, eventType)) {
    return buildPendingClassification(
      mapPauseDinnerException(eventType) ?? "invalid_sequence",
      "Sequence de pointage invalide",
      `Etat courant: ${resolvedState}; action: ${eventType}`
    );
  }

  if (
    !isValidScheduledWorkDay(employee, occurredAt) ||
    !isWithinScheduledWindow(employee, occurredAt)
  ) {
    return buildPendingClassification(
      "outside_schedule",
      "Pointage hors horaire prevu",
      "Le pointage est en dehors des jours ou de la fenetre horaire autorisee."
    );
  }

  const activeShiftStart = getActiveShiftStartEvent(latestApprovedEvents);

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
        "Quart trop long en attente",
        `Le quart depasse ${employee.maxShiftMinutes} minutes.`
      );
    }
  }

  return buildApprovedClassification();
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
    events.find((event) => event.event_type === "quart_debut") ?? events[0] ?? null;
  return matchedStartEvent ? fallbackCompany : fallbackCompany;
}

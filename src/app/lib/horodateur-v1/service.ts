import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  dualWriteHorodateurExceptionCreated,
  findOpenAppAlertIdByDedupeKey,
  getChauffeurCompanyKey,
  logNotificationFailureAppAlert,
  markHorodateurExceptionAppAlertHandled,
  recordDeliveriesFromHorodateurDirectionNotify,
} from "@/app/lib/app-alerts-dual-write.server";
import { getCompanyLabel, type AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  notifyDirectionOfHorodateurException,
  notifyDirectionHorodateurPunchSms,
  notifyEmployeeExpectedPunchSms,
  notifyEmployeeHorodateurExceptionDecision,
  notifyEmployeeHorodateurPunchSms,
  notifyHorodateurLateness,
} from "@/app/lib/notifications";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { normalizePhoneToTwilioE164 } from "@/app/lib/timeclock-api.shared";
import {
  attachShiftToException,
  countPendingExceptionsForEmployee,
  getCurrentStateByEmployeeId,
  getDirectionAlertConfig,
  getEmployeeByAuthUserId,
  getEmployeeById,
  getEventById,
  getExceptionById,
  getLatenessNotification,
  getShiftByEmployeeAndWorkDate,
  insertEvent,
  insertException,
  listActiveEmployees,
  listDirectionAlertRecipients,
  listEventsForEmployee,
  listExceptionsForEmployeeWorkDate,
  listExceptionsForShift,
  listPendingExceptions,
  listShiftsForEmployeeWeek,
  hasExpectedPunchSmsNotificationLog,
  updateEventOccurredAt,
  updateEventReviewStatus,
  updateExceptionNotificationStatus,
  updateExceptionReview,
  upsertDirectionAlertConfig,
  upsertCurrentState,
  upsertLatenessNotification,
  upsertShift,
  insertHorodateurSmsAlertLog,
} from "./repository";
import {
  classifyEventPhase1,
  diffMinutes,
  getEventOccurredAt,
  getLastApprovedEvent,
  getLocalWorkDate,
  getWeekStartDate,
  HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS,
  resolveCompanyContextForShift,
  resolveShiftStatus,
  toCanonicalEventType,
} from "./rules";
import {
  HorodateurPhase1Error,
} from "./types";
import type {
  HorodateurDirectionAlertConfigRecord,
  HorodateurPhase1CreatePunchResult,
  HorodateurPhase1CurrentStateRecord,
  HorodateurPhase1DirectionLiveRow,
  HorodateurPhase1DirectionPendingExceptionAlert,
  HorodateurPhase1EmployeeDashboardSnapshot,
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1ExceptionType,
  HorodateurPhase1InsertEventInput,
  HorodateurPhase1ShiftRecord,
  HorodateurPhase1StateKind,
  HorodateurPhase1EventType,
} from "./types";

const HORODATEUR_DEFAULT_LATENESS_TOLERANCE_MINUTES = 5;

const HORODATEUR_PUNCH_SMS_SKIP_EVENT_TYPES = new Set<HorodateurPhase1EventType>([
  "correction",
  "exception",
  "anomalie",
]);

const HORODATEUR_PUNCH_SMS_LABELS: Partial<
  Record<HorodateurPhase1EventType, string>
> = {
  quart_debut: "Debut de quart",
  quart_fin: "Fin de quart",
  pause_debut: "Debut de pause",
  pause_fin: "Fin de pause",
  dinner_debut: "Debut de diner",
  dinner_fin: "Fin de diner",
  sortie_depart: "Depart terrain",
  sortie_retour: "Retour terrain",
};

/** Preferences Alertes SMS (chauffeurs.sms_alert_*) : direction et SMS personnel utilisent les memes cases. */
function employeeWantsPunchSmsForEvent(
  employee: HorodateurPhase1EmployeeProfile,
  eventType: HorodateurPhase1EventType
) {
  switch (eventType) {
    case "quart_debut":
      return employee.smsAlertQuartDebut;
    case "quart_fin":
      return employee.smsAlertQuartFin;
    case "pause_debut":
      return employee.smsAlertPauseDebut;
    case "pause_fin":
      return employee.smsAlertPauseFin;
    case "dinner_debut":
      return employee.smsAlertDinnerDebut;
    case "dinner_fin":
      return employee.smsAlertDinnerFin;
    case "sortie_depart":
      return employee.smsAlertDepartTerrain || employee.smsAlertSortie;
    case "sortie_retour":
      return employee.smsAlertArriveeTerrain || employee.smsAlertRetour;
    default:
      return false;
  }
}

async function maybeNotifyDirectionOfHorodateurPunch(options: {
  employee: HorodateurPhase1EmployeeProfile;
  event: HorodateurPhase1EventRecord;
  exception: HorodateurPhase1ExceptionRecord | null;
  actorUserId: string;
}) {
  const eventType = options.event.event_type;
  const canonicalType = toCanonicalEventType(eventType);
  const logBase = {
    eventId: options.event.id,
    eventType,
    canonicalType,
    employeeId: options.employee.employeeId,
  };

  console.info("[horodateur-punch-direction-debug] event_received", logBase);

  if (options.exception) {
    console.info("[horodateur-punch-direction-debug] blocked", {
      ...logBase,
      blockedBy: "pending_exception_duplicate",
      directionAlertEnabled: false,
      resendAttempted: false,
      resendResult: "not_applicable_for_punch_event",
      smsAttempted: false,
      smsResult: "skipped",
    });
    return;
  }

  if (HORODATEUR_PUNCH_SMS_SKIP_EVENT_TYPES.has(eventType)) {
    console.info("[horodateur-punch-direction-debug] blocked", {
      ...logBase,
      blockedBy: "skip_event_category",
      directionAlertEnabled: false,
      resendAttempted: false,
      resendResult: "not_applicable_for_punch_event",
      smsAttempted: false,
      smsResult: "skipped",
    });
    return;
  }

  if (!options.employee.alertSmsEnabled) {
    console.info("[horodateur-punch-direction-debug] blocked", {
      ...logBase,
      blockedBy: "employee_alert_sms_disabled",
      directionAlertEnabled: false,
      resendAttempted: false,
      resendResult: "not_applicable_for_punch_event",
      smsAttempted: false,
      smsResult: "skipped",
    });
    return;
  }

  if (!employeeWantsPunchSmsForEvent(options.employee, eventType)) {
    console.info("[horodateur-punch-direction-debug] blocked", {
      ...logBase,
      blockedBy: "per_event_sms_disabled",
      directionAlertEnabled: false,
      resendAttempted: false,
      resendResult: "not_applicable_for_punch_event",
      smsAttempted: false,
      smsResult: "skipped",
    });
    return;
  }

  const label = HORODATEUR_PUNCH_SMS_LABELS[eventType];
  if (!label) {
    console.info("[horodateur-punch-direction-debug] blocked", {
      ...logBase,
      blockedBy: "missing_event_label",
      directionAlertEnabled: false,
      resendAttempted: false,
      resendResult: "not_applicable_for_punch_event",
      smsAttempted: false,
      smsResult: "skipped",
    });
    return;
  }

  const config = await getHorodateurDirectionAlertConfig();
  const recipients = await resolveDirectionRecipients(config);
  const directionAlertEnabled = Boolean(config.sms_enabled);

  console.info("[horodateur-punch-direction-debug] recipients_resolved", {
    ...logBase,
    directionAlertEnabled,
    directionEmailRecipientsFound: recipients.directionEmails.length,
    directionSmsRecipientsFound: recipients.directionSmsNumbers.length,
    resendAttempted: false,
    resendResult: "not_applicable_for_punch_event",
  });

  if (!config.sms_enabled) {
    console.warn("[horodateur-punch-direction-debug] blocked", {
      ...logBase,
      blockedBy: "direction_config_sms_disabled",
      directionAlertEnabled,
      directionSmsRecipientsFound: recipients.directionSmsNumbers.length,
      resendAttempted: false,
      resendResult: "not_applicable_for_punch_event",
      smsAttempted: false,
      smsResult: "skipped",
    });
    return;
  }

  console.info("[horodateur-punch-sms] dispatch", {
    sms_target_type: "direction",
    eventType,
    eventId: options.event.id,
    recipientCount: recipients.directionSmsNumbers.length,
  });

  try {
    console.info("[horodateur-punch-direction-debug] sms_attempt", {
      ...logBase,
      smsAttempted: true,
      directionSmsRecipientsFound: recipients.directionSmsNumbers.length,
    });
    const smsResult = await notifyDirectionHorodateurPunchSms({
      employeeName: options.employee.fullName,
      eventLabelFr: label,
      occurredAt: getEventOccurredAt(options.event),
      company: options.employee.primaryCompany,
      smsEnabled: true,
      recipientSmsNumbers: recipients.directionSmsNumbers,
    });

    console.info("[horodateur-punch-direction-debug] sms_result", {
      ...logBase,
      smsAttempted: true,
      smsSent: smsResult.sent,
      smsSkipped: smsResult.skipped,
      smsResult: smsResult.reason ?? (smsResult.sent ? "sent" : "failed"),
    });

    const sentAt = new Date().toISOString();
    await insertHorodateurSmsAlertLog({
      userId: options.actorUserId,
      chauffeurId: options.employee.employeeId,
      companyContext: options.employee.primaryCompany,
      alertType: `horodateur_punch:${eventType}`,
      message: label,
      status: smsResult.sent ? "sent" : "failed",
      relatedTable: "horodateur_events",
      relatedId: options.event.id,
      metadata: {
        sms_target_type: "direction",
        sms_skipped: smsResult.skipped,
        sms_reason: smsResult.reason,
        recipient_count: recipients.directionSmsNumbers.length,
      },
      sentAt: smsResult.sent ? sentAt : null,
    });
  } catch (error) {
    console.error("[horodateur-punch-direction-debug] sms_failure", {
      ...logBase,
      smsAttempted: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

/** SMS personnel : telephone de la fiche employe uniquement, independant de horodateur_direction_alert_config.sms_enabled. */
async function maybeNotifyEmployeeOfHorodateurPunch(options: {
  employee: HorodateurPhase1EmployeeProfile;
  event: HorodateurPhase1EventRecord;
  exception: HorodateurPhase1ExceptionRecord | null;
  actorUserId: string;
}) {
  if (options.exception) {
    console.info("[horodateur-employee-sms] skip_pending_exception", {
      eventId: options.event.id,
    });
    return;
  }

  const eventType = options.event.event_type;

  if (HORODATEUR_PUNCH_SMS_SKIP_EVENT_TYPES.has(eventType)) {
    return;
  }

  if (
    options.employee.pausePaid &&
    (eventType === "pause_debut" || eventType === "pause_fin")
  ) {
    console.info("[horodateur-employee-sms] skip_paid_break", {
      eventId: options.event.id,
      eventType,
      employeeId: options.employee.employeeId,
    });
    return;
  }

  const label = HORODATEUR_PUNCH_SMS_LABELS[eventType];
  if (!label) {
    return;
  }

  const preferenceEnabled =
    options.employee.alertSmsEnabled !== false &&
    employeeWantsPunchSmsForEvent(options.employee, eventType);

  const phonePresent = Boolean(
    normalizePhoneToTwilioE164(options.employee.phoneNumber)
  );

  try {
    const smsResult = await notifyEmployeeHorodateurPunchSms({
      employeeId: options.employee.employeeId,
      employeeName: options.employee.fullName,
      phoneRaw: options.employee.phoneNumber,
      eventType,
      eventLabelFr: label,
      occurredAt: getEventOccurredAt(options.event),
      company: options.employee.primaryCompany,
      preferenceEnabled,
    });

    const sentAt = new Date().toISOString();
    await insertHorodateurSmsAlertLog({
      userId: options.actorUserId,
      chauffeurId: options.employee.employeeId,
      companyContext: options.employee.primaryCompany,
      alertType: `horodateur_punch_employee:${eventType}`,
      message: label,
      status: smsResult.sent ? "sent" : "failed",
      relatedTable: "horodateur_events",
      relatedId: options.event.id,
      metadata: {
        sms_target_type: "employee",
        employee_id: options.employee.employeeId,
        event_type: eventType,
        phone_present: phonePresent,
        preference_enabled: preferenceEnabled,
        sms_sent: smsResult.sent,
        sms_skipped: smsResult.skipped,
        reason: smsResult.reason,
      },
      sentAt: smsResult.sent ? sentAt : null,
    });
  } catch (error) {
    console.error("[horodateur-employee-sms] unexpected_failure", {
      employee_id: options.employee.employeeId,
      eventId: options.event.id,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
const TORONTO_TIMEZONE = "America/Toronto";
const SHIFT_RECOMPUTE_DEFAULT_MAX_BREAK_MINUTES = 120;
const SHIFT_RECOMPUTE_DEFAULT_MAX_MEAL_MINUTES = 180;

function ensureEmployeeActive(employee: HorodateurPhase1EmployeeProfile) {
  if (!employee.active) {
    throw new HorodateurPhase1Error("La fiche employe est inactive.", {
      code: "employee_inactive",
      status: 409,
    });
  }
}

function requireCompanyContext(
  companyContext: AccountRequestCompany | null | undefined,
  employee: HorodateurPhase1EmployeeProfile
) {
  const resolved = companyContext ?? employee.primaryCompany;

  if (!resolved) {
    throw new HorodateurPhase1Error(
      "Aucune compagnie principale n est definie pour cet employe.",
      {
        code: "missing_company_context",
        status: 409,
      }
    );
  }

  return resolved;
}

function requireEmployeeAuthUserId(employee: HorodateurPhase1EmployeeProfile) {
  if (!employee.authUserId) {
    throw new HorodateurPhase1Error(
      "Le chauffeur selectionne n a pas de compte lie (auth_user_id manquant).",
      {
        code: "employee_auth_user_missing",
        status: 409,
      }
    );
  }

  return employee.authUserId;
}

function normalizeConfigList(values: string[] | null | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    )
  );
}

function parseEnvList(rawValue: string | undefined) {
  return normalizeConfigList((rawValue ?? "").split(","));
}

async function resolveDirectionRecipients(config: HorodateurDirectionAlertConfigRecord) {
  const employeeRecipients = await listDirectionAlertRecipients();
  const directionEmails = normalizeConfigList([
    ...config.direction_emails,
    ...employeeRecipients
      .filter((item) => item.alertEmailEnabled)
      .map((item) => item.email ?? ""),
  ]);
  const directionSmsNumbers = normalizeConfigList([
    ...config.direction_sms_numbers,
    ...employeeRecipients
      .filter((item) => item.alertSmsEnabled)
      .map((item) => item.phoneNumber ?? ""),
  ]);

  return {
    directionEmails,
    directionSmsNumbers,
  };
}

/** shortOffset peut donner "GMT-4" → "-4" ; `Date` exige un décalage ±HH:mm. */
function normalizeIsoTimezoneOffset(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!m) {
    return "-04:00";
  }
  const sign = m[1];
  const hh = m[2].padStart(2, "0");
  const mm = (m[3] ?? "00").padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

function formatDatePartsInToronto(value: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  });

  const parts = formatter.formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
    offset: normalizeIsoTimezoneOffset(
      map.timeZoneName?.replace("GMT", "").trim() || "-04:00"
    ),
  };
}

function getTorontoCurrentMinutes(now = new Date()) {
  const parts = formatDatePartsInToronto(now);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function buildTorontoTimestamp(workDate: string, timeValue: string, now = new Date()) {
  const normalizedTime = timeValue.length === 5 ? `${timeValue}:00` : timeValue;
  const { offset } = formatDatePartsInToronto(now);
  return `${workDate}T${normalizedTime}${offset}`;
}

function getTodayWorkDateAndDay(now = new Date()) {
  const parts = formatDatePartsInToronto(now);
  const workDate = `${parts.year}-${parts.month}-${parts.day}`;
  const weekday = new Intl.DateTimeFormat("fr-CA", {
    timeZone: TORONTO_TIMEZONE,
    weekday: "long",
  }).format(now);

  return {
    workDate,
    weekday: weekday.toLowerCase(),
  };
}

function getScheduledStartMinutes(scheduleStart: string) {
  const [hours, minutes] = scheduleStart.split(":").map((item) => Number.parseInt(item, 10));

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

type ExpectedPunchEventType =
  | "quart_debut"
  | "pause_debut"
  | "pause_fin"
  | "dinner_debut"
  | "dinner_fin"
  | "quart_fin";

type ExpectedPunchScheduleItem = {
  eventType: ExpectedPunchEventType;
  scheduledMinutes: number;
  scheduledLabel: string;
};

function formatMinutesLabel(minutes: number) {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor(minutes % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}`;
}

function weekdayFrToWeeklyDayKey(
  weekday: string
): keyof NonNullable<HorodateurPhase1EmployeeProfile["weeklyScheduleConfig"]>["days"] | null {
  switch (weekday) {
    case "lundi":
      return "monday";
    case "mardi":
      return "tuesday";
    case "mercredi":
      return "wednesday";
    case "jeudi":
      return "thursday";
    case "vendredi":
      return "friday";
    case "samedi":
      return "saturday";
    case "dimanche":
      return "sunday";
    default:
      return null;
  }
}

function resolveExpectedPunchScheduleItems(options: {
  employee: HorodateurPhase1EmployeeProfile;
  weekdayFr: string;
}) {
  const expected: ExpectedPunchScheduleItem[] = [];
  const weekly = options.employee.weeklyScheduleConfig;
  const weekdayKey = weekdayFrToWeeklyDayKey(options.weekdayFr);

  if (weekly && weekdayKey) {
    const day = weekly.days[weekdayKey];
    if (!day?.active) {
      return expected;
    }

    const shiftStart = getScheduledStartMinutes(day.start);
    if (shiftStart != null) {
      expected.push({
        eventType: "quart_debut",
        scheduledMinutes: shiftStart,
        scheduledLabel: formatMinutesLabel(shiftStart),
      });
    }

    // Pause payée : pas de créneaux « pause_debut / pause_fin » pour les rappels SMS
    // (les pointages pause restent possibles côté métier si besoin).
    if (day.breakAm.enabled && !options.employee.pausePaid) {
      const pauseStart = getScheduledStartMinutes(day.breakAm.time);
      if (pauseStart != null) {
        expected.push({
          eventType: "pause_debut",
          scheduledMinutes: pauseStart,
          scheduledLabel: formatMinutesLabel(pauseStart),
        });
        const pauseEnd = pauseStart + Math.max(0, day.breakAm.minutes);
        expected.push({
          eventType: "pause_fin",
          scheduledMinutes: pauseEnd,
          scheduledLabel: formatMinutesLabel(pauseEnd),
        });
      }
    }

    if (day.lunch.enabled) {
      const dinnerStart = getScheduledStartMinutes(day.lunch.time);
      if (dinnerStart != null) {
        expected.push({
          eventType: "dinner_debut",
          scheduledMinutes: dinnerStart,
          scheduledLabel: formatMinutesLabel(dinnerStart),
        });
        // Pas de rappel « dinner_fin » : évite tout relance automatique de type punch
        // après la plage dîner (le retour se fait par pointage manuel meal_end).
      }
    }

    const shiftEnd = getScheduledStartMinutes(day.end);
    if (shiftEnd != null) {
      expected.push({
        eventType: "quart_fin",
        scheduledMinutes: shiftEnd,
        scheduledLabel: formatMinutesLabel(shiftEnd),
      });
    }

    return expected;
  }

  const shiftStart = options.employee.scheduleStart
    ? getScheduledStartMinutes(options.employee.scheduleStart)
    : null;
  const shiftEnd = options.employee.scheduleEnd
    ? getScheduledStartMinutes(options.employee.scheduleEnd)
    : null;

  if (shiftStart != null) {
    expected.push({
      eventType: "quart_debut",
      scheduledMinutes: shiftStart,
      scheduledLabel: formatMinutesLabel(shiftStart),
    });
  }

  if (shiftEnd != null) {
    expected.push({
      eventType: "quart_fin",
      scheduledMinutes: shiftEnd,
      scheduledLabel: formatMinutesLabel(shiftEnd),
    });
  }

  return expected;
}

export async function getHorodateurDirectionAlertConfig(): Promise<HorodateurDirectionAlertConfigRecord> {
  const storedConfig = await getDirectionAlertConfig();

  if (storedConfig) {
    return {
      ...storedConfig,
      direction_emails: normalizeConfigList(storedConfig.direction_emails),
      direction_sms_numbers: normalizeConfigList(storedConfig.direction_sms_numbers),
    };
  }

  return {
    config_key: "default",
    email_enabled: true,
    sms_enabled: true,
    reminder_delay_minutes: 60,
    direction_emails: parseEnvList(process.env.DIRECTION_ALERT_EMAILS),
    direction_sms_numbers: parseEnvList(
      process.env.DIRECTION_ALERT_SMS_NUMBERS ?? process.env.DIRECTION_ALERT_PHONES
    ),
  };
}

export async function saveHorodateurDirectionAlertConfig(input: {
  emailEnabled: boolean;
  smsEnabled: boolean;
  reminderDelayMinutes: number;
  directionEmails: string[];
  directionSmsNumbers: string[];
}) {
  return upsertDirectionAlertConfig({
    email_enabled: input.emailEnabled,
    sms_enabled: input.smsEnabled,
    reminder_delay_minutes: Math.max(5, Math.floor(input.reminderDelayMinutes || 0)),
    direction_emails: normalizeConfigList(input.directionEmails),
    direction_sms_numbers: normalizeConfigList(input.directionSmsNumbers),
  });
}

export async function resolveEmployeeByAuthUserId(authUserId: string) {
  const employee = await getEmployeeByAuthUserId(authUserId);

  if (!employee) {
    throw new HorodateurPhase1Error(
      "Aucune fiche employe n est liee a ce compte Auth.",
      {
        code: "employee_not_found_for_auth_user",
        status: 404,
      }
    );
  }

  ensureEmployeeActive(employee);
  return employee;
}

async function resolveEmployeeById(employeeId: number) {
  const employee = await getEmployeeById(employeeId);

  if (!employee) {
    throw new HorodateurPhase1Error("Employe introuvable.", {
      code: "employee_not_found",
      status: 404,
    });
  }

  ensureEmployeeActive(employee);
  return employee;
}

/**
 * Pause payée : aucun mouvement break_start / break_end (employé ni direction, flux normal).
 * Refus avant insert — pas d’exception, pas d’alerte, pas de recompute.
 */
function assertNoPaidBreakOperationalPunch(
  employee: HorodateurPhase1EmployeeProfile,
  eventType: HorodateurPhase1InsertEventInput["eventType"]
) {
  if (!employee.pausePaid) {
    return;
  }
  const canonical = toCanonicalEventType(eventType);
  if (canonical !== "break_start" && canonical !== "break_end") {
    return;
  }
  throw new HorodateurPhase1Error(
    "Pause payee : aucun pointage debut ou fin de pause n est requis (employe ni direction). La pause est incluse dans le quart.",
    { code: "paid_break_no_punch_required", status: 409 }
  );
}

function resolveEventDates(occurredAt: string) {
  return {
    workDate: getLocalWorkDate(occurredAt),
    weekStartDate: getWeekStartDate(occurredAt),
  };
}

export async function insertHorodateurEvent(input: HorodateurPhase1InsertEventInput) {
  return insertEvent({
    ...input,
    ...resolveEventDates(input.occurredAt),
  });
}

function shouldBypassExceptionWorkflow(event: Pick<
  HorodateurPhase1EventRecord,
  "actor_role" | "source_kind"
>) {
  return event.actor_role === "direction" || event.source_kind === "direction";
}

export async function createPendingExceptionForEvent(options: {
  employeeId: number;
  event: HorodateurPhase1EventRecord;
  requestedByUserId: string | null;
  reasonLabel: string;
  /** Note libre employé / direction — stockée dans horodateur_exceptions.details (distinct du motif système reason_label). */
  employeeNote?: string | null;
  impactMinutes?: number;
}) {
  if (shouldBypassExceptionWorkflow(options.event)) {
    return null;
  }

  if (!options.event.exception_code) {
    throw new HorodateurPhase1Error(
      "Impossible de creer une exception sans exception_code.",
      {
        code: "missing_exception_code",
        status: 500,
      }
    );
  }

  const existingShift = await getShiftByEmployeeAndWorkDate(
    options.employeeId,
    options.event.work_date ??
      getLocalWorkDate(getEventOccurredAt(options.event) ?? new Date().toISOString())
  );

  return insertException({
    employeeId: options.employeeId,
    shiftId: existingShift?.id ?? null,
    sourceEventId: options.event.id,
    exceptionType: options.event.exception_code,
    reasonLabel: options.reasonLabel,
    details: options.employeeNote?.trim() ? options.employeeNote.trim() : null,
    impactMinutes: options.impactMinutes ?? 0,
    requestedByUserId: options.requestedByUserId,
  });
}

function tryCreateAdminClient(): SupabaseClient | null {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

async function notifyDirectionOfPendingException(options: {
  employee: HorodateurPhase1EmployeeProfile;
  exception: HorodateurPhase1ExceptionRecord;
  event: HorodateurPhase1EventRecord;
}) {
  const config = await getHorodateurDirectionAlertConfig();
  const recipients = await resolveDirectionRecipients(config);

  if (
    options.exception.status !== "en_attente" ||
    ((!config.email_enabled || options.exception.direction_email_notified_at) &&
      (!config.sms_enabled || options.exception.direction_sms_notified_at))
  ) {
    return options.exception;
  }

  const admin = tryCreateAdminClient();
  let alertId: string | null = null;

  try {
    if (admin) {
      const companyKey = await getChauffeurCompanyKey(admin, options.employee.employeeId);
      const ins = await dualWriteHorodateurExceptionCreated({
        supabase: admin,
        exceptionId: options.exception.id,
        employeeId: options.employee.employeeId,
        companyKey,
        employeeName: options.employee.fullName,
        reasonLabel: options.exception.reason_label,
        employeeNote: options.exception.details,
        exceptionType: options.exception.exception_type,
        occurredAt: getEventOccurredAt(options.event),
      });
      alertId = ins.id;
      if (!alertId && ins.skippedDuplicate) {
        alertId = await findOpenAppAlertIdByDedupeKey(
          admin,
          `horodateur_exception:${options.exception.id}`
        );
      }
    }

    const notificationResult = await notifyDirectionOfHorodateurException({
      exceptionId: options.exception.id,
      employeeName: options.employee.fullName,
      employeeEmail: options.employee.email,
      employeePhone: options.employee.phoneNumber,
      company: options.employee.primaryCompany,
      exceptionType: options.exception.exception_type,
      reasonLabel: options.exception.reason_label,
      employeeNote: options.exception.details,
      occurredAt: getEventOccurredAt(options.event),
      requestedAt: options.exception.requested_at,
      managementUrl: "/direction/horodateur",
      emailEnabled: config.email_enabled,
      smsEnabled: config.sms_enabled,
      recipientEmails: recipients.directionEmails,
      recipientSmsNumbers: recipients.directionSmsNumbers,
    });

    if (admin) {
      if (alertId) {
        await recordDeliveriesFromHorodateurDirectionNotify(admin, alertId, {
          email: {
            ok: notificationResult.email.ok,
            skipped: Boolean(notificationResult.email.skipped),
            reason: notificationResult.email.reason ?? null,
            recipients: notificationResult.email.recipients ?? [],
          },
          sms: {
            sent: notificationResult.sms.sent,
            skipped: Boolean(notificationResult.sms.skipped),
            reason: notificationResult.sms.reason ?? null,
            recipients: notificationResult.sms.recipients ?? [],
          },
        });
      }
      if (!notificationResult.email.ok && !notificationResult.email.skipped) {
        await logNotificationFailureAppAlert({
          supabase: admin,
          sourceModule: "horodateur",
          sourceId: options.exception.id,
          channel: "email",
          errorMessage: notificationResult.email.reason ?? "direction_email_failed",
          recipient: notificationResult.email.recipients?.[0] ?? null,
        });
      }
      if (!notificationResult.sms.sent && !notificationResult.sms.skipped) {
        await logNotificationFailureAppAlert({
          supabase: admin,
          sourceModule: "horodateur",
          sourceId: options.exception.id,
          channel: "sms",
          errorMessage: notificationResult.sms.reason ?? "direction_sms_failed",
          recipient: notificationResult.sms.recipients?.[0] ?? null,
        });
      }
    }

    const nowIso = new Date().toISOString();
    const shouldPersistEmail =
      notificationResult.email.ok && !options.exception.direction_email_notified_at;
    const shouldPersistSms =
      notificationResult.sms.sent && !options.exception.direction_sms_notified_at;

    if (!shouldPersistEmail && !shouldPersistSms) {
      return options.exception;
    }

    return updateExceptionNotificationStatus({
      exceptionId: options.exception.id,
      directionEmailNotifiedAt: shouldPersistEmail ? nowIso : undefined,
      directionSmsNotifiedAt: shouldPersistSms ? nowIso : undefined,
    });
  } catch (error) {
    console.error("[horodateur-service] pending exception notification failed", {
      exceptionId: options.exception.id,
      employeeId: options.employee.employeeId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return options.exception;
  }
}

function getReminderReferenceTime(exception: HorodateurPhase1ExceptionRecord) {
  const values = [
    exception.direction_email_notified_at,
    exception.direction_sms_notified_at,
    exception.requested_at,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  return values.length > 0 ? Math.max(...values) : Date.now();
}

export async function processPendingExceptionReminders() {
  const config = await getHorodateurDirectionAlertConfig();
  const recipients = await resolveDirectionRecipients(config);
  const pendingExceptions = await listPendingExceptionsForDirection();
  const now = Date.now();
  const admin = tryCreateAdminClient();
  const processed: Array<{
    exceptionId: string;
    emailSent: boolean;
    smsSent: boolean;
  }> = [];

  for (const item of pendingExceptions) {
    const emailAlreadyReminded = Boolean(item.direction_reminder_email_notified_at);
    const smsAlreadyReminded = Boolean(item.direction_reminder_sms_notified_at);

    if (
      (!config.email_enabled || emailAlreadyReminded) &&
      (!config.sms_enabled || smsAlreadyReminded)
    ) {
      continue;
    }

    if (item.status !== "en_attente") {
      continue;
    }

    const reminderAt =
      getReminderReferenceTime(item) + config.reminder_delay_minutes * 60 * 1000;

    if (now < reminderAt) {
      continue;
    }

    if (!item.employee || !item.event) {
      continue;
    }

    let alertId: string | null = null;
    if (admin) {
      const companyKey = await getChauffeurCompanyKey(admin, item.employee.employeeId);
      const ins = await dualWriteHorodateurExceptionCreated({
        supabase: admin,
        exceptionId: item.id,
        employeeId: item.employee.employeeId,
        companyKey,
        employeeName: item.employee.fullName,
        reasonLabel: item.reason_label,
        employeeNote: item.details,
        exceptionType: item.exception_type,
        occurredAt: item.event.occurredAt,
      });
      alertId = ins.id;
      if (!alertId && ins.skippedDuplicate) {
        alertId = await findOpenAppAlertIdByDedupeKey(
          admin,
          `horodateur_exception:${item.id}`
        );
      }
    }

    const notificationResult = await notifyDirectionOfHorodateurException({
      exceptionId: item.id,
      employeeName: item.employee.fullName,
      employeeEmail: item.employee.email,
      employeePhone: item.employee.phoneNumber,
      company: item.employee.primaryCompany,
      exceptionType: item.exception_type,
      reasonLabel: item.reason_label,
      employeeNote: item.details,
      occurredAt: item.event.occurredAt,
      requestedAt: item.requested_at,
      managementUrl: "/direction/horodateur",
      emailEnabled: config.email_enabled && !emailAlreadyReminded,
      smsEnabled: config.sms_enabled && !smsAlreadyReminded,
      recipientEmails: recipients.directionEmails,
      recipientSmsNumbers: recipients.directionSmsNumbers,
      isReminder: true,
    });

    if (admin) {
      if (alertId) {
        await recordDeliveriesFromHorodateurDirectionNotify(admin, alertId, {
          email: {
            ok: notificationResult.email.ok,
            skipped: Boolean(notificationResult.email.skipped),
            reason: notificationResult.email.reason ?? null,
            recipients: notificationResult.email.recipients ?? [],
          },
          sms: {
            sent: notificationResult.sms.sent,
            skipped: Boolean(notificationResult.sms.skipped),
            reason: notificationResult.sms.reason ?? null,
            recipients: notificationResult.sms.recipients ?? [],
          },
        });
      }
      if (!notificationResult.email.ok && !notificationResult.email.skipped) {
        await logNotificationFailureAppAlert({
          supabase: admin,
          sourceModule: "horodateur",
          sourceId: item.id,
          channel: "email",
          errorMessage: notificationResult.email.reason ?? "direction_email_failed",
          recipient: notificationResult.email.recipients?.[0] ?? null,
        });
      }
      if (!notificationResult.sms.sent && !notificationResult.sms.skipped) {
        await logNotificationFailureAppAlert({
          supabase: admin,
          sourceModule: "horodateur",
          sourceId: item.id,
          channel: "sms",
          errorMessage: notificationResult.sms.reason ?? "direction_sms_failed",
          recipient: notificationResult.sms.recipients?.[0] ?? null,
        });
      }
    }

    const nowIso = new Date().toISOString();
    const shouldPersistEmail =
      notificationResult.email.ok &&
      config.email_enabled &&
      !emailAlreadyReminded;
    const shouldPersistSms =
      notificationResult.sms.sent &&
      config.sms_enabled &&
      !smsAlreadyReminded;

    if (shouldPersistEmail || shouldPersistSms) {
      await updateExceptionNotificationStatus({
        exceptionId: item.id,
        directionReminderEmailNotifiedAt: shouldPersistEmail ? nowIso : undefined,
        directionReminderSmsNotifiedAt: shouldPersistSms ? nowIso : undefined,
      });
    }

    processed.push({
      exceptionId: item.id,
      emailSent: shouldPersistEmail,
      smsSent: shouldPersistSms,
    });
  }

  return {
    processedCount: processed.length,
    processed,
    reminderDelayMinutes: config.reminder_delay_minutes,
  };
}

function hasStartedShiftToday(
  events: HorodateurPhase1EventRecord[],
  currentState: HorodateurPhase1CurrentStateRecord | null
) {
  const hasQuarterStart = events.some((event) => event.event_type === "quart_debut");
  const stateIndicatesStarted =
    currentState?.current_state === "en_quart" ||
    currentState?.current_state === "en_pause" ||
    currentState?.current_state === "en_diner" ||
    currentState?.current_state === "termine";

  return hasQuarterStart || stateIndicatesStarted;
}

async function shouldSkipLatenessNotification(options: {
  employee: HorodateurPhase1EmployeeProfile;
  workDate: string;
  events: HorodateurPhase1EventRecord[];
}) {
  const approvedOrReviewedExceptions = await listExceptionsForEmployeeWorkDate({
    employeeId: options.employee.employeeId,
    workDate: options.workDate,
    statuses: ["approuve", "modifie"],
  });

  return approvedOrReviewedExceptions.length > 0;
}

export async function processLateEmployeeNotifications() {
  const now = new Date();
  const { workDate, weekday } = getTodayWorkDateAndDay(now);
  const currentMinutes = getTorontoCurrentMinutes(now);
  const config = await getHorodateurDirectionAlertConfig();
  const recipients = await resolveDirectionRecipients(config);
  const employees = await listActiveEmployees();
  const processed: Array<{
    employeeId: number;
    workDate: string;
    directionEmailSent: boolean;
    directionSmsSent: boolean;
    employeeSmsSent: boolean;
  }> = [];
  let detectedCount = 0;

  for (const employee of employees) {
    if (!employee.active) {
      continue;
    }

    if (!employee.scheduleStart) {
      continue;
    }

    if (
      Array.isArray(employee.scheduledWorkDays) &&
      employee.scheduledWorkDays.length > 0 &&
      !employee.scheduledWorkDays.map((item) => item.toLowerCase()).includes(weekday)
    ) {
      continue;
    }

    const scheduledStartMinutes = getScheduledStartMinutes(employee.scheduleStart);

    if (scheduledStartMinutes == null) {
      continue;
    }

    const toleranceMinutes =
      employee.toleranceBeforeStartMinutes ??
      HORODATEUR_DEFAULT_LATENESS_TOLERANCE_MINUTES;
    const lateThresholdMinutes = scheduledStartMinutes + Math.max(0, toleranceMinutes);

    if (currentMinutes <= lateThresholdMinutes) {
      continue;
    }

    const [events, currentState, existingNotification] = await Promise.all([
      listEventsForEmployee({
        employeeId: employee.employeeId,
        workDate,
      }),
      getCurrentStateByEmployeeId(employee.employeeId),
      getLatenessNotification(employee.employeeId, workDate),
    ]);

    if (hasStartedShiftToday(events, currentState)) {
      continue;
    }

    if (
      await shouldSkipLatenessNotification({
        employee,
        workDate,
        events,
      })
    ) {
      if (!existingNotification?.resolution_reason) {
        await upsertLatenessNotification({
          employeeId: employee.employeeId,
          workDate,
          scheduledStartAt: buildTorontoTimestamp(workDate, employee.scheduleStart, now),
          resolutionReason: "approved_exception_or_absence",
        });
      }
      continue;
    }

    const scheduledStartAt = buildTorontoTimestamp(workDate, employee.scheduleStart, now);
    const lateDetectedAt = now.toISOString();
    const notification =
      existingNotification ??
      (await upsertLatenessNotification({
        employeeId: employee.employeeId,
        workDate,
        scheduledStartAt,
        lateDetectedAt,
      }));

    detectedCount += 1;

    const shouldSendDirectionEmail =
      config.email_enabled && !notification.late_direction_email_notified_at;
    const shouldSendDirectionSms =
      config.sms_enabled && !notification.late_direction_sms_notified_at;
    const shouldSendEmployeeSms =
      employee.alertSmsEnabled !== false &&
      employee.smsAlertQuartDebut !== false &&
      !notification.late_employee_sms_notified_at;

    if (
      !shouldSendDirectionEmail &&
      !shouldSendDirectionSms &&
      !shouldSendEmployeeSms
    ) {
      continue;
    }

    const result = await notifyHorodateurLateness({
      employeeName: employee.fullName,
      employeePhone: employee.phoneNumber,
      scheduledStartAt,
      detectedAt: lateDetectedAt,
      managementUrl: "/direction/horodateur",
      emailEnabled: shouldSendDirectionEmail,
      smsEnabled: shouldSendDirectionSms,
      employeeSmsEnabled: shouldSendEmployeeSms,
      recipientEmails: recipients.directionEmails,
      recipientSmsNumbers: recipients.directionSmsNumbers,
    });

    const nowIso = new Date().toISOString();
    const directionEmailSent = shouldSendDirectionEmail && result.email.ok;
    const directionSmsSent = shouldSendDirectionSms && result.directionSms.sent;
    const employeeSmsSent = shouldSendEmployeeSms && result.employeeSms.sent;

    if (directionEmailSent || directionSmsSent || employeeSmsSent) {
      await upsertLatenessNotification({
        employeeId: employee.employeeId,
        workDate,
        scheduledStartAt,
        lateDirectionEmailNotifiedAt: directionEmailSent ? nowIso : undefined,
        lateDirectionSmsNotifiedAt: directionSmsSent ? nowIso : undefined,
        lateEmployeeSmsNotifiedAt: employeeSmsSent ? nowIso : undefined,
      });
    }

    processed.push({
      employeeId: employee.employeeId,
      workDate,
      directionEmailSent,
      directionSmsSent,
      employeeSmsSent,
    });
  }

  return {
    processedCount: processed.length,
    detectedCount,
    workDate,
    processed,
  };
}

export async function processExpectedPunchSmsNotifications(options?: {
  toleranceMinutes?: number;
}) {
  const now = new Date();
  const { workDate, weekday } = getTodayWorkDateAndDay(now);
  const currentMinutes = getTorontoCurrentMinutes(now);
  const toleranceMinutes = Math.max(
    0,
    Math.floor(options?.toleranceMinutes ?? HORODATEUR_DEFAULT_LATENESS_TOLERANCE_MINUTES)
  );
  const employees = await listActiveEmployees();

  const processed: Array<{
    employeeId: number;
    eventType: ExpectedPunchEventType;
    status:
      | "employee_sms_disabled"
      | "event_preference_disabled"
      | "phone_missing"
      | "already_punched"
      | "already_notified"
      | "sms_sent"
      | "sms_failed";
  }> = [];

  for (const employee of employees) {
    if (!employee.active) continue;

    if (
      Array.isArray(employee.scheduledWorkDays) &&
      employee.scheduledWorkDays.length > 0 &&
      !employee.scheduledWorkDays.map((item) => item.toLowerCase()).includes(weekday)
    ) {
      continue;
    }

    const expectedItems = resolveExpectedPunchScheduleItems({
      employee,
      weekdayFr: weekday,
    });
    if (expectedItems.length === 0) continue;

    const existingEvents = await listEventsForEmployee({
      employeeId: employee.employeeId,
      workDate,
      statuses: ["normal", "approuve", "en_attente"],
    });

    for (const expected of expectedItems) {
      if (currentMinutes < expected.scheduledMinutes + toleranceMinutes) {
        continue;
      }

      const logBase = {
        employeeId: employee.employeeId,
        workDate,
        eventType: expected.eventType,
        scheduledAt: expected.scheduledLabel,
        currentMinutes,
        toleranceMinutes,
      };

      if (employee.alertSmsEnabled === false) {
        console.info("[horodateur-expected-punch-sms] skip", {
          ...logBase,
          reason: "employee_sms_disabled",
        });
        processed.push({
          employeeId: employee.employeeId,
          eventType: expected.eventType,
          status: "employee_sms_disabled",
        });
        continue;
      }

      if (!employeeWantsPunchSmsForEvent(employee, expected.eventType)) {
        console.info("[horodateur-expected-punch-sms] skip", {
          ...logBase,
          reason: "event_preference_disabled",
        });
        processed.push({
          employeeId: employee.employeeId,
          eventType: expected.eventType,
          status: "event_preference_disabled",
        });
        continue;
      }

      const phoneE164 = normalizePhoneToTwilioE164(employee.phoneNumber);
      if (!phoneE164) {
        console.warn("[horodateur-expected-punch-sms] skip", {
          ...logBase,
          reason: "phone_missing",
        });
        processed.push({
          employeeId: employee.employeeId,
          eventType: expected.eventType,
          status: "phone_missing",
        });
        continue;
      }

      if (existingEvents.some((item) => item.event_type === expected.eventType)) {
        console.info("[horodateur-expected-punch-sms] skip", {
          ...logBase,
          reason: "already_punched",
        });
        processed.push({
          employeeId: employee.employeeId,
          eventType: expected.eventType,
          status: "already_punched",
        });
        continue;
      }

      const alreadyNotified = await hasExpectedPunchSmsNotificationLog({
        employeeId: employee.employeeId,
        workDate,
        eventType: expected.eventType,
      });
      if (alreadyNotified) {
        console.info("[horodateur-expected-punch-sms] skip", {
          ...logBase,
          reason: "already_notified",
        });
        processed.push({
          employeeId: employee.employeeId,
          eventType: expected.eventType,
          status: "already_notified",
        });
        continue;
      }

      const sms = await notifyEmployeeExpectedPunchSms({
        employeeId: employee.employeeId,
        phoneRaw: employee.phoneNumber,
        eventType: expected.eventType,
        scheduledTimeLabel: expected.scheduledLabel,
        preferenceEnabled: true,
      });

      if (sms.sent) {
        const sentAt = new Date().toISOString();
        await insertHorodateurSmsAlertLog({
          userId: employee.authUserId,
          chauffeurId: employee.employeeId,
          companyContext: employee.primaryCompany,
          alertType: `horodateur_expected_punch:${expected.eventType}`,
          message: expected.scheduledLabel,
          status: "sent",
          relatedTable: "horodateur_events",
          relatedId: null,
          metadata: {
            sms_target_type: "employee_expected_punch",
            work_date: workDate,
            event_type: expected.eventType,
            scheduled_at: expected.scheduledLabel,
            tolerance_minutes: toleranceMinutes,
            phone_present: true,
            sms_skipped: false,
            sms_reason: null,
          },
          sentAt,
        });
        console.info("[horodateur-expected-punch-sms] result", {
          ...logBase,
          reason: "sms_sent",
        });
      } else {
        console.error("[horodateur-expected-punch-sms] result", {
          ...logBase,
          reason: "sms_failed",
          sms_skipped: sms.skipped,
          sms_reason: sms.reason,
        });
      }

      processed.push({
        employeeId: employee.employeeId,
        eventType: expected.eventType,
        status: sms.sent ? "sms_sent" : "sms_failed",
      });
    }
  }

  return {
    processedCount: processed.length,
    workDate,
    toleranceMinutes,
    processed,
  };
}

export async function recomputeCurrentState(employeeId: number) {
  const approvedEvents = await listEventsForEmployee({
    employeeId,
    statuses: ["normal", "approuve"],
  });
  const employeeForState = await getEmployeeById(employeeId);
  const ignorePaidBreakPunches = Boolean(employeeForState?.pausePaid);
  const pendingOperationalEvents = (
    await listEventsForEmployee({
      employeeId,
      statuses: ["en_attente"],
    })
  ).filter((event) => {
    if (!isOperationalPendingEvent(event)) {
      return false;
    }
    if (ignorePaidBreakPunches) {
      const c = toCanonicalEventType(event.event_type);
      if (c === "break_start" || c === "break_end") {
        return false;
      }
    }
    return true;
  });

  const sortEventsForState = (events: HorodateurPhase1EventRecord[]) =>
    [...events].sort((left, right) => {
      const leftAt = getEventOccurredAt(left);
      const rightAt = getEventOccurredAt(right);
      if (!leftAt && !rightAt) {
        return String(left.id).localeCompare(String(right.id));
      }
      if (!leftAt) return -1;
      if (!rightAt) return 1;
      const delta = new Date(leftAt).getTime() - new Date(rightAt).getTime();
      if (delta !== 0) return delta;
      if (left.status !== right.status) {
        return left.status === "en_attente" ? 1 : -1;
      }
      return String(left.id).localeCompare(String(right.id));
    });

  /** Flux complet (approuvé + en attente) — pour last_event_* et métadonnées. */
  const effectiveEvents = sortEventsForState([
    ...approvedEvents,
    ...pendingOperationalEvents,
  ]);
  /**
   * Machine d'état uniquement sur les événements déjà approuvés / normal.
   * Sinon un break_end ou punch_out encore « en_attente » faisait passer l'état
   * hors pause payée ou hors quart avant validation direction — effet « dépunch auto ».
   */
  const approvedEffectiveEvents = sortEventsForState(approvedEvents);
  const lastEvent =
    effectiveEvents.length > 0
      ? effectiveEvents[effectiveEvents.length - 1]
      : getLastApprovedEvent(approvedEvents);
  const pendingExceptionsCount = await countPendingExceptionsForEmployee(employeeId);

  let currentState: HorodateurPhase1StateKind = "hors_quart";
  let activeShiftStartEventId: string | null = null;
  let activePauseStartEventId: string | null = null;
  let activeDinnerStartEventId: string | null = null;
  let hasSequenceAnomaly = false;

  for (const event of approvedEffectiveEvents) {
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

    if (canonicalEventType === "punch_in") {
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

  const activeShift =
    (lastEvent?.work_date ?? getEventOccurredAt(lastEvent))
      ? await getShiftByEmployeeAndWorkDate(
          employeeId,
          lastEvent?.work_date ??
            getLocalWorkDate(getEventOccurredAt(lastEvent) ?? new Date().toISOString())
        )
      : null;

  if (
    pendingOperationalEvents.length > 0 &&
    lastEvent?.status === "en_attente" &&
    isQuarterActiveState(currentState)
  ) {
    console.info("[horodateur-live]", "live_status_from_pending_exception", {
      employeeId,
      state: currentState,
      eventType: lastEvent.event_type,
      pendingCount: pendingOperationalEvents.length,
    });
  }

  return upsertCurrentState({
    employee_id: employeeId,
    current_state: currentState,
    active_shift_id:
      currentState === "en_quart" ||
      currentState === "en_pause" ||
      currentState === "en_diner"
        ? activeShift?.id ?? null
        : null,
    active_shift_start_event_id: activeShiftStartEventId,
    active_pause_start_event_id: activePauseStartEventId,
    active_dinner_start_event_id: activeDinnerStartEventId,
    last_event_id: lastEvent?.id ?? null,
    last_event_type: lastEvent?.event_type ?? null,
    last_event_at: getEventOccurredAt(lastEvent),
    company_context: activeShift?.company_context ?? null,
    has_open_exception: pendingExceptionsCount > 0 || hasSequenceAnomaly,
  });
}

function isQuarterActiveState(state: HorodateurPhase1StateKind) {
  return state === "en_quart" || state === "en_pause" || state === "en_diner";
}

function isOperationalPendingEvent(event: HorodateurPhase1EventRecord) {
  if (event.status !== "en_attente") {
    return false;
  }
  const canonical = toCanonicalEventType(event.event_type);
  return (
    canonical === "punch_in" ||
    canonical === "punch_out" ||
    canonical === "break_start" ||
    canonical === "break_end" ||
    canonical === "meal_start" ||
    canonical === "meal_end" ||
    canonical === "terrain_start" ||
    canonical === "terrain_end"
  );
}

function resolveBreakLimitMinutes(employee: HorodateurPhase1EmployeeProfile) {
  return Math.max(
    SHIFT_RECOMPUTE_DEFAULT_MAX_BREAK_MINUTES,
    Math.max(1, employee.pauseMinutes || 0) * 3
  );
}

function resolveMealLimitMinutes(employee: HorodateurPhase1EmployeeProfile) {
  return Math.max(
    SHIFT_RECOMPUTE_DEFAULT_MAX_MEAL_MINUTES,
    Math.max(1, employee.lunchMinutes || 0) * 3
  );
}

export async function recomputeShiftForDate(
  employeeId: number,
  workDate: string
) {
  const employee = await resolveEmployeeById(employeeId);
  const approvedEvents = await listEventsForEmployee({
    employeeId,
    workDate,
    statuses: ["normal", "approuve"],
  });
  const allExceptions = await listExceptionsForShift({ employeeId, workDate });
  const existingShift = await getShiftByEmployeeAndWorkDate(employeeId, workDate);

  const orderedEvents = approvedEvents
    .slice()
    .sort((left, right) => {
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
  const lastOccurredAt =
    getEventOccurredAt(orderedEvents[orderedEvents.length - 1]) ?? null;

  let shiftStartAt: string | null = null;
  let shiftEndAt: string | null = null;
  let workSegmentStartAt: string | null = null;
  let pauseStartAt: string | null = null;
  let dinnerStartAt: string | null = null;
  let terrainStartAt: string | null = null;
  let paidBreakMinutes = 0;
  let unpaidBreakMinutes = 0;
  let unpaidLunchMinutes = 0;
  let workedMinutes = 0;
  const anomalies: string[] = [];
  let state: HorodateurPhase1StateKind = "hors_quart";

  for (const event of orderedEvents) {
    const eventOccurredAt = getEventOccurredAt(event);
    const canonicalEventType = toCanonicalEventType(event.event_type);

    if (!eventOccurredAt) {
      anomalies.push(`Evenement ${event.event_type} sans horodatage exploitable.`);
      continue;
    }

    if (!canonicalEventType) {
      anomalies.push(`Evenement ${event.event_type} non reconnu.`);
      continue;
    }

    if (
      employee.pausePaid &&
      (canonicalEventType === "break_start" || canonicalEventType === "break_end")
    ) {
      continue;
    }

    if (canonicalEventType === "punch_in") {
      // Plusieurs entrées/sorties le même jour (employé ou direction) : après un quart
      // terminé (punch_out), un nouveau punch_in ouvre un segment suivant — sans quoi le
      // 2e bloc était ignoré (« double punch_in » alors que shiftStartAt restait celui du matin).
      if (shiftStartAt && shiftEndAt && state === "termine") {
        shiftEndAt = null;
        workSegmentStartAt = eventOccurredAt;
        state = "en_quart";
        continue;
      }

      if (!shiftStartAt) {
        shiftStartAt = eventOccurredAt;
        workSegmentStartAt = eventOccurredAt;
        state = "en_quart";
      } else if (!shiftEndAt) {
        anomalies.push("Double punch_in detecte (overlap / missing_punch_out).");
      } else {
        anomalies.push("Double punch_in detecte (sequence inattendue).");
      }
      continue;
    }

    if (canonicalEventType === "break_start") {
      if (state !== "en_quart" || !workSegmentStartAt) {
        anomalies.push("break_start sans quart actif.");
      } else {
        workedMinutes += diffMinutes(workSegmentStartAt, eventOccurredAt);
        workSegmentStartAt = null;
        pauseStartAt = eventOccurredAt;
        state = "en_pause";
      }
      continue;
    }

    if (canonicalEventType === "break_end") {
      if (state !== "en_pause" || !pauseStartAt) {
        anomalies.push("break_end sans break_start.");
      } else {
        const duration = diffMinutes(pauseStartAt, eventOccurredAt);
        if (employee.pausePaid) {
          paidBreakMinutes += duration;
        } else {
          unpaidBreakMinutes += duration;
        }
        if (duration > resolveBreakLimitMinutes(employee)) {
          anomalies.push("Pause excessive detectee.");
        }
        workSegmentStartAt = eventOccurredAt;
        pauseStartAt = null;
        state = "en_quart";
      }
      continue;
    }

    if (canonicalEventType === "meal_start") {
      if (state !== "en_quart" || !workSegmentStartAt) {
        anomalies.push("meal_start sans quart actif.");
      } else {
        workedMinutes += diffMinutes(workSegmentStartAt, eventOccurredAt);
        workSegmentStartAt = null;
        dinnerStartAt = eventOccurredAt;
        state = "en_diner";
      }
      continue;
    }

    if (canonicalEventType === "meal_end") {
      if (state !== "en_diner" || !dinnerStartAt) {
        anomalies.push("meal_end sans meal_start.");
      } else {
        const duration = diffMinutes(dinnerStartAt, eventOccurredAt);
        if (!employee.lunchPaid) {
          unpaidLunchMinutes += duration;
        }
        if (duration > resolveMealLimitMinutes(employee)) {
          anomalies.push("Pause repas excessive detectee.");
        }
        workSegmentStartAt = eventOccurredAt;
        dinnerStartAt = null;
        state = "en_quart";
      }
      continue;
    }

    if (canonicalEventType === "terrain_start") {
      if (!isQuarterActiveState(state)) {
        anomalies.push("terrain_start hors quart actif.");
      }
      if (terrainStartAt) {
        anomalies.push("terrain_start en chevauchement.");
      } else {
        terrainStartAt = eventOccurredAt;
      }
      continue;
    }

    if (canonicalEventType === "terrain_end") {
      if (!terrainStartAt) {
        anomalies.push("terrain_end sans terrain_start.");
      } else {
        terrainStartAt = null;
      }
      continue;
    }

    if (canonicalEventType === "manual_correction") {
      if (process.env.NODE_ENV === "development") {
        console.info("[horodateur-calc-skipped-event]", {
          eventId: event.id,
          eventType: event.event_type,
          source: event.source_kind ?? null,
          reason: "manual_correction_not_counted_in_shift_math",
        });
      }
      anomalies.push("Correction manuelle detectee (review recommandee).");
      continue;
    }

    if (canonicalEventType === "retroactive_entry") {
      anomalies.push("Entree retroactive detectee (review recommandee).");
      continue;
    }

    if (canonicalEventType === "punch_out") {
      if (!shiftStartAt) {
        anomalies.push("punch_out sans punch_in.");
        state = "termine";
        continue;
      }
      shiftEndAt = eventOccurredAt;

      if (state === "en_quart" && workSegmentStartAt) {
        workedMinutes += diffMinutes(workSegmentStartAt, eventOccurredAt);
      } else if (state === "en_pause") {
        const duration = pauseStartAt ? diffMinutes(pauseStartAt, eventOccurredAt) : 0;
        if (employee.pausePaid) {
          paidBreakMinutes += duration;
        } else {
          unpaidBreakMinutes += duration;
        }
        anomalies.push("punch_out pendant pause active (missing break_end).");
      } else if (state === "en_diner") {
        const duration = dinnerStartAt ? diffMinutes(dinnerStartAt, eventOccurredAt) : 0;
        if (!employee.lunchPaid) {
          unpaidLunchMinutes += duration;
        }
        anomalies.push("punch_out pendant diner actif (missing meal_end).");
      }

      workSegmentStartAt = null;
      pauseStartAt = null;
      dinnerStartAt = null;
      terrainStartAt = null;
      state = "termine";
      continue;
    }
  }

  if (!shiftStartAt && orderedEvents.length > 0) {
    anomalies.push("Aucun debut de quart approuve n a ete trouve.");
  }

  if (pauseStartAt) {
    anomalies.push("Pause ouverte non terminee.");
  }

  if (dinnerStartAt) {
    anomalies.push("Diner ouvert non termine.");
  }

  if (terrainStartAt) {
    anomalies.push("Incoherence terrain: terrain_start sans terrain_end.");
  }

  if (shiftStartAt && !shiftEndAt) {
    anomalies.push("Quart incomplet: missing_punch_out.");
  }

  const pendingExceptions = allExceptions.filter(
    (item) => item.status === "en_attente"
  );
  const approvedExceptions = allExceptions.filter(
    (item) => item.status === "approuve" || item.status === "modifie"
  );
  const pendingExceptionMinutes = pendingExceptions.reduce(
    (sum, item) => sum + Math.max(0, item.impact_minutes ?? 0),
    0
  );
  const approvedExceptionMinutes = approvedExceptions.reduce(
    (sum, item) =>
      sum + Math.max(0, item.approved_minutes ?? item.impact_minutes ?? 0),
    0
  );
  const grossMinutes =
    shiftStartAt && (shiftEndAt ?? lastOccurredAt)
      ? diffMinutes(shiftStartAt, shiftEndAt ?? (lastOccurredAt as string))
      : 0;
  const payableMinutes = Math.max(
    0,
    workedMinutes - unpaidBreakMinutes - unpaidLunchMinutes + approvedExceptionMinutes
  );
  const companyContext = resolveCompanyContextForShift(
    approvedEvents,
    existingShift?.company_context ?? employee.primaryCompany
  );

  if (!companyContext) {
    throw new HorodateurPhase1Error(
      "Impossible de determiner la compagnie du quart.",
      {
        code: "missing_shift_company_context",
        status: 500,
      }
    );
  }

  const shift = await upsertShift({
    id: existingShift?.id ?? crypto.randomUUID(),
    employee_id: employeeId,
    work_date: workDate,
    week_start_date: getWeekStartDate(`${workDate}T12:00:00Z`),
    company_context: companyContext,
    shift_start_at: shiftStartAt,
    shift_end_at: shiftEndAt,
    gross_minutes: grossMinutes,
    paid_break_minutes: paidBreakMinutes,
    unpaid_break_minutes: unpaidBreakMinutes,
    unpaid_lunch_minutes: unpaidLunchMinutes,
    worked_minutes: workedMinutes,
    payable_minutes: payableMinutes,
    approved_exception_minutes: approvedExceptionMinutes,
    pending_exception_minutes: pendingExceptionMinutes,
    anomalies_count: anomalies.length,
    status: resolveShiftStatus({
      hasPendingExceptions: pendingExceptions.length > 0,
      isOpen: !shiftEndAt,
      anomaliesCount: anomalies.length,
    }),
    last_recomputed_at: new Date().toISOString(),
  });

  await Promise.all(
    pendingExceptions.map((item) => attachShiftToException(item.id, shift.id))
  );

  if (pendingExceptionMinutes > 0) {
    console.info("[horodateur-shift]", "pending_total_calculated", {
      employeeId,
      workDate,
      pendingExceptionMinutes,
      approvedExceptionMinutes,
      workedMinutes,
      payableMinutes,
      shiftStatus: shift.status,
    });
    console.info("[horodateur-shift]", "payable_total_excludes_pending", {
      employeeId,
      workDate,
      payableMinutes,
      pendingExceptionMinutes,
      formula: "payable = worked - unpaid_break - unpaid_lunch + approved_exception",
    });
  }

  return shift;
}

export async function createEmployeePunch(options: {
  actorUserId: string;
  eventType: HorodateurPhase1InsertEventInput["eventType"];
  occurredAt?: string;
  note?: string | null;
  companyContext?: AccountRequestCompany | null;
  relatedEventId?: string | null;
  /** Par défaut `employe` ; utiliser `qr` pour un scan QR. */
  sourceKind?: HorodateurPhase1InsertEventInput["sourceKind"];
  /** Traçabilité zone / GPS (punch QR). */
  punchTrace?: {
    punchSource: string;
    punchZoneKey: string | null;
    punchZoneId: string | null;
    zoneValidated: boolean;
    gpsLatitude: number | null;
    gpsLongitude: number | null;
    workCompanyKey: string | null;
    employerCompanyKey: string | null;
  };
}) : Promise<HorodateurPhase1CreatePunchResult> {
  const occurredAt = options.occurredAt ?? new Date().toISOString();
  const canonicalType = toCanonicalEventType(options.eventType);
  console.info("[horodateur-punch-direction-debug] punch_received", {
    actorUserId: options.actorUserId,
    eventType: options.eventType,
    canonicalType,
    occurredAt,
    sourceKind: options.sourceKind ?? "employe",
  });
  const employee = await resolveEmployeeByAuthUserId(options.actorUserId);
  assertNoPaidBreakOperationalPunch(employee, options.eventType);
  const currentState = await getCurrentStateByEmployeeId(employee.employeeId);
  const latestApprovedEvents = await listEventsForEmployee({
    employeeId: employee.employeeId,
    workDate: getLocalWorkDate(occurredAt),
    statuses: ["normal", "approuve"],
  });
  const classification = classifyEventPhase1({
    employee,
    currentState,
    latestApprovedEvents,
    eventType: options.eventType,
    occurredAt,
    actorRole: "employe",
    note: options.note,
  });
  const companyContext = requireCompanyContext(
    options.companyContext,
    employee
  );

  const sourceKind = options.sourceKind ?? "employe";
  const pt = options.punchTrace;

  const event = await insertHorodateurEvent({
    userId: requireEmployeeAuthUserId(employee),
    employeeId: employee.employeeId,
    occurredAt,
    ...resolveEventDates(occurredAt),
    eventType: options.eventType,
    actorUserId: options.actorUserId,
    actorRole: "employe",
    sourceKind,
    companyContext,
    note: options.note,
    relatedEventId: options.relatedEventId,
    isManualCorrection: false,
    status: classification.status,
    requiresApproval: classification.requiresApproval,
    exceptionCode: classification.exceptionType,
    approvalNote: classification.details,
    ...(pt
      ? {
          punchSource: pt.punchSource,
          punchZoneKey: pt.punchZoneKey,
          punchZoneId: pt.punchZoneId,
          zoneValidated: pt.zoneValidated,
          gpsLatitude: pt.gpsLatitude,
          gpsLongitude: pt.gpsLongitude,
          workCompanyKey: pt.workCompanyKey,
          employerCompanyKey: pt.employerCompanyKey,
        }
      : {}),
  });

  let exception: HorodateurPhase1ExceptionRecord | null = null;

  if (classification.requiresApproval && classification.exceptionType) {
    console.info("[horodateur-exception]", "punch_exception_created", {
      employeeId: employee.employeeId,
      eventType: event.event_type,
      eventStatus: event.status,
      exceptionType: classification.exceptionType,
    });
    exception = await createPendingExceptionForEvent({
      employeeId: employee.employeeId,
      event,
      requestedByUserId: options.actorUserId,
      reasonLabel: classification.reasonLabel ?? "Exception horodateur en attente",
      employeeNote: options.note,
    });

    if (exception) {
      exception = await notifyDirectionOfPendingException({
        employee,
        exception,
        event,
      });
      const requestedCanonical = toCanonicalEventType(event.event_type);
      if (requestedCanonical === "punch_in") {
        console.info("[horodateur-exception]", "provisional_shift_started", {
          employeeId: employee.employeeId,
          eventId: event.id,
          occurredAt: getEventOccurredAt(event),
          exceptionId: exception.id,
        });
      } else if (requestedCanonical === "punch_out") {
        console.info("[horodateur-exception]", "provisional_shift_closed", {
          employeeId: employee.employeeId,
          eventId: event.id,
          occurredAt: getEventOccurredAt(event),
          exceptionId: exception.id,
        });
      }
    }
  }

  const shift = await recomputeShiftForDate(
    employee.employeeId,
    event.work_date ?? getLocalWorkDate(occurredAt)
  );
  const refreshedState = await recomputeCurrentState(employee.employeeId);

  await maybeNotifyDirectionOfHorodateurPunch({
    employee,
    event,
    exception,
    actorUserId: options.actorUserId,
  });

  await maybeNotifyEmployeeOfHorodateurPunch({
    employee,
    event,
    exception,
    actorUserId: options.actorUserId,
  });

  return {
    event,
    exception,
    currentState: refreshedState,
    shift,
  };
}

export async function createDirectionPunch(options: {
  actorUserId: string;
  employeeId: number;
  eventType: HorodateurPhase1InsertEventInput["eventType"];
  occurredAt?: string;
  note: string;
  companyContext?: AccountRequestCompany | null;
  relatedEventId?: string | null;
  forcedExceptionType?: HorodateurPhase1ExceptionType | null;
}) : Promise<HorodateurPhase1CreatePunchResult> {
  const normalizedNote = String(options.note ?? "").trim();

  if (!normalizedNote) {
    throw new HorodateurPhase1Error(
      "Une note est obligatoire pour une action direction dans l horodateur.",
      {
        code: "direction_note_required",
        status: 400,
      }
    );
  }

  const occurredAt = options.occurredAt ?? new Date().toISOString();
  const employee = await resolveEmployeeById(options.employeeId);
  assertNoPaidBreakOperationalPunch(employee, options.eventType);
  const workDateForRecompute = getLocalWorkDate(occurredAt);
  const shiftBeforeDirectionAction =
    process.env.NODE_ENV === "development"
      ? await getShiftByEmployeeAndWorkDate(employee.employeeId, workDateForRecompute)
      : null;
  const currentState = await getCurrentStateByEmployeeId(employee.employeeId);
  const latestApprovedEvents = await listEventsForEmployee({
    employeeId: employee.employeeId,
    workDate: getLocalWorkDate(occurredAt),
    statuses: ["normal", "approuve"],
  });
  const classification = classifyEventPhase1({
    employee,
    currentState,
    latestApprovedEvents,
    eventType: options.eventType,
    occurredAt,
    actorRole: "direction",
    note: normalizedNote,
    forcedExceptionType: options.forcedExceptionType ?? null,
  });
  const companyContext = requireCompanyContext(
    options.companyContext,
    employee
  );

  /** Même logique métier qu'un punch employé : seules les entrées « correction / rétroactif » sont des corrections manuelles. */
  const canonicalDirectionType = toCanonicalEventType(options.eventType);
  const isManualCorrectionEvent =
    canonicalDirectionType === "manual_correction" ||
    canonicalDirectionType === "retroactive_entry";

  const event = await insertHorodateurEvent({
    userId: requireEmployeeAuthUserId(employee),
    employeeId: employee.employeeId,
    occurredAt,
    ...resolveEventDates(occurredAt),
    eventType: options.eventType,
    actorUserId: options.actorUserId,
    actorRole: "direction",
    sourceKind: "direction",
    companyContext,
    note: normalizedNote,
    relatedEventId: options.relatedEventId,
    isManualCorrection: isManualCorrectionEvent,
    status: classification.status,
    requiresApproval: classification.requiresApproval,
    exceptionCode: classification.exceptionType,
    approvalNote: classification.details,
  });

  let exception: HorodateurPhase1ExceptionRecord | null = null;

  if (classification.requiresApproval && classification.exceptionType) {
    exception = await createPendingExceptionForEvent({
      employeeId: employee.employeeId,
      event,
      requestedByUserId: options.actorUserId,
      reasonLabel:
        classification.reasonLabel ??
        `Correction direction pour ${employee.fullName ?? `#${employee.employeeId}`}`,
      employeeNote: normalizedNote,
    });

    if (exception) {
      exception = await notifyDirectionOfPendingException({
        employee,
        exception,
        event,
      });
    }
  }

  const shift = await recomputeShiftForDate(employee.employeeId, workDateForRecompute);
  const refreshedState = await recomputeCurrentState(employee.employeeId);

  if (process.env.NODE_ENV === "development") {
    console.info("[direction-horodateur-action]", {
      employeeId: employee.employeeId,
      eventType: options.eventType,
      source: "direction",
      occurredAt,
      createdEventId: event.id,
      dayWorkedMinutesBefore: shiftBeforeDirectionAction?.worked_minutes ?? null,
      dayPayableMinutesBefore: shiftBeforeDirectionAction?.payable_minutes ?? null,
      dayWorkedMinutesAfter: shift.worked_minutes,
      dayPayableMinutesAfter: shift.payable_minutes,
    });
  }

  return {
    event,
    exception,
    currentState: refreshedState,
    shift,
  };
}

export async function getWeeklyProjection(employeeId: number, weekStartDate?: string) {
  const employee = await resolveEmployeeById(employeeId);
  const resolvedWeekStartDate =
    weekStartDate ?? getWeekStartDate(new Date().toISOString());
  const effectiveShifts = await listShiftsForEmployeeWeek(employeeId, resolvedWeekStartDate);
  const workedMinutes = effectiveShifts.reduce(
    (sum, item) => sum + item.payable_minutes,
    0
  );
  const targetMinutes =
    Math.round(
      (employee.plannedWeeklyHours ?? HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS) * 60
    ) || HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS * 60;

  return {
    employeeId,
    weekStartDate: resolvedWeekStartDate,
    workedMinutes,
    targetMinutes,
    remainingMinutes: Math.max(0, targetMinutes - workedMinutes),
    projectedOverflowMinutes: Math.max(0, workedMinutes - targetMinutes),
    shiftCount: effectiveShifts.length,
    primaryCompanyLabel: getCompanyLabel(employee.primaryCompany),
  };
}

function buildEmptyCurrentState(employee: HorodateurPhase1EmployeeProfile): HorodateurPhase1CurrentStateRecord {
  return {
    employee_id: employee.employeeId,
    current_state: "hors_quart",
    active_shift_id: null,
    active_shift_start_event_id: null,
    active_pause_start_event_id: null,
    active_dinner_start_event_id: null,
    last_event_id: null,
    last_event_type: null,
    last_event_at: null,
    company_context: employee.primaryCompany,
    has_open_exception: false,
  };
}

export async function getEmployeeDashboardSnapshotByAuthUserId(
  authUserId: string
): Promise<HorodateurPhase1EmployeeDashboardSnapshot> {
  const employee = await resolveEmployeeByAuthUserId(authUserId);
  const today = getLocalWorkDate(new Date().toISOString());
  const [currentState, todayShift, weeklyProjection, pendingExceptions] = await Promise.all([
    getCurrentStateByEmployeeId(employee.employeeId),
    getShiftByEmployeeAndWorkDate(employee.employeeId, today),
    getWeeklyProjection(employee.employeeId),
    listPendingExceptions({ employeeId: employee.employeeId }),
  ]);

  return {
    employee,
    currentState: currentState ?? buildEmptyCurrentState(employee),
    todayShift:
      todayShift ??
      ({
        id: "",
        employee_id: employee.employeeId,
        work_date: today,
        week_start_date: getWeekStartDate(today),
        company_context: employee.primaryCompany,
        shift_start_at: null,
        shift_end_at: null,
        gross_minutes: 0,
        paid_break_minutes: 0,
        unpaid_break_minutes: 0,
        unpaid_lunch_minutes: 0,
        worked_minutes: 0,
        payable_minutes: 0,
        approved_exception_minutes: 0,
        pending_exception_minutes: 0,
        anomalies_count: 0,
        status: "ouvert",
        last_recomputed_at: new Date().toISOString(),
      } satisfies HorodateurPhase1ShiftRecord),
    weeklyProjection,
    pendingExceptions,
  };
}

export async function getEmployeeHistoryByAuthUserId(options: {
  authUserId: string;
  workDate?: string;
}) {
  const employee = await resolveEmployeeByAuthUserId(options.authUserId);
  const workDate = options.workDate ?? getLocalWorkDate(new Date().toISOString());
  const [events, exceptions, shift] = await Promise.all([
    listEventsForEmployee({ employeeId: employee.employeeId, workDate }),
    listExceptionsForShift({ employeeId: employee.employeeId, workDate }),
    getShiftByEmployeeAndWorkDate(employee.employeeId, workDate),
  ]);

  return {
    employee,
    workDate,
    shift,
    events: events.map((event) => ({
      id: event.id,
      employee_id: event.employee_id,
      event_type: event.event_type,
      occurredAt: getEventOccurredAt(event),
      source_module: null,
      company_context:
        shift?.company_context ??
        employee.primaryCompany ??
        null,
      actor_user_id: event.actor_user_id,
      actor_role: event.actor_role,
      source_kind: event.source_kind,
      status: event.status,
      requires_approval: event.requires_approval,
      exception_code: event.exception_code,
      approved_by: event.approved_by,
      approved_at: event.approved_at,
      rejected_by: event.rejected_by,
      rejected_at: event.rejected_at,
      approval_note: event.approval_note,
      related_event_id: event.related_event_id,
      work_date: event.work_date,
      week_start_date: event.week_start_date,
      is_manual_correction: event.is_manual_correction,
      notes: event.notes ?? event.note ?? null,
      metadata: {},
      livraison_id: null,
      dossier_id: null,
      sortie_id: null,
      created_at: event.created_at,
    })),
    exceptions: exceptions.map((item) => ({
      id: item.id,
      employee_id: item.employee_id,
      shift_id: item.shift_id,
      source_event_id: item.source_event_id,
      exception_type: item.exception_type,
      reason_label: item.reason_label,
      details: item.details,
      impact_minutes: item.impact_minutes,
      status: item.status,
      requested_at: item.requested_at,
      requested_by_user_id: item.requested_by_user_id,
      reviewed_at: item.reviewed_at,
      reviewed_by_user_id: item.reviewed_by_user_id,
      review_note: item.review_note,
      approved_minutes: item.approved_minutes,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
  };
}

export async function listDirectionLiveBoard(): Promise<HorodateurPhase1DirectionLiveRow[]> {
  const employees = await listActiveEmployees();

  const rows = await Promise.all(
    employees.map(async (employee) => {
      const [currentState, weeklyProjection, todayShift] = await Promise.all([
        getCurrentStateByEmployeeId(employee.employeeId),
        getWeeklyProjection(employee.employeeId),
        getShiftByEmployeeAndWorkDate(employee.employeeId, getLocalWorkDate(new Date().toISOString())),
      ]);

      return {
        employeeId: employee.employeeId,
        fullName: employee.fullName,
        email: employee.email,
        primaryCompany: employee.primaryCompany,
        currentState: currentState?.current_state ?? "hors_quart",
        lastEventAt: currentState?.last_event_at ?? null,
        lastEventType: currentState?.last_event_type ?? null,
        todayShift,
        weekWorkedMinutes: weeklyProjection.workedMinutes,
        weekTargetMinutes: weeklyProjection.targetMinutes,
        weekRemainingMinutes: weeklyProjection.remainingMinutes,
        projectedOverflowMinutes: weeklyProjection.projectedOverflowMinutes,
        hasOpenException: currentState?.has_open_exception ?? false,
      };
    })
  );

  return rows;
}

export async function listPendingExceptionsForDirection() {
  const exceptions = await listPendingExceptions();
  const events = await Promise.all(
    exceptions.map((item) => getEventById(item.source_event_id))
  );
  const employeeIds = Array.from(new Set(exceptions.map((item) => item.employee_id)));
  const employees = await Promise.all(employeeIds.map((employeeId) => resolveEmployeeById(employeeId)));
  const employeeMap = new Map(employees.map((item) => [item.employeeId, item]));
  const eventMap = new Map(
    events.filter((item): item is HorodateurPhase1EventRecord => Boolean(item)).map((item) => [item.id, item])
  );

  return exceptions.map((item) => ({
    ...item,
    event:
      eventMap.get(item.source_event_id) != null
        ? {
            id: eventMap.get(item.source_event_id)!.id,
            employee_id: eventMap.get(item.source_event_id)!.employee_id,
            event_type: eventMap.get(item.source_event_id)!.event_type,
            occurredAt: getEventOccurredAt(eventMap.get(item.source_event_id)!),
            status: eventMap.get(item.source_event_id)!.status,
            notes:
              eventMap.get(item.source_event_id)!.notes ??
              eventMap.get(item.source_event_id)!.note ??
              null,
          }
        : null,
    employee: employeeMap.get(item.employee_id) ?? null,
  }));
}

export async function getDirectionDashboardHorodateurAlerts(): Promise<{
  pendingCount: number;
  items: HorodateurPhase1DirectionPendingExceptionAlert[];
}> {
  await processPendingExceptionReminders();
  const exceptions = await listPendingExceptionsForDirection();

  const items = exceptions
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.requested_at).getTime();
      const rightTime = new Date(right.requested_at).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      employeeId: item.employee_id,
      employeeName: item.employee?.fullName ?? null,
      employeeEmail: item.employee?.email ?? null,
      exceptionType: item.exception_type,
      reasonLabel: item.reason_label,
      occurredAt: item.event?.occurredAt ?? null,
      requestedAt: item.requested_at,
    }));

  return {
    pendingCount: exceptions.length,
    items,
  };
}

export async function approveHorodateurException(options: {
  actorUserId: string;
  exceptionId: string;
  reviewNote?: string | null;
  approvedMinutes?: number | null;
  correctedOccurredAt?: string | null;
  correctedRelatedOccurredAt?: string | null;
}) {
  const exception = await getExceptionById(options.exceptionId);

  if (!exception) {
    throw new HorodateurPhase1Error("Exception introuvable.", {
      code: "exception_not_found",
      status: 404,
    });
  }

  if (exception.status !== "en_attente") {
    throw new HorodateurPhase1Error("Cette exception a deja ete traitee.", {
      code: "exception_already_reviewed",
      status: 409,
    });
  }

  const reviewedException = await updateExceptionReview({
    exceptionId: exception.id,
    status:
      typeof options.approvedMinutes === "number" &&
      options.approvedMinutes >= 0 &&
      options.approvedMinutes !== exception.impact_minutes
        ? "modifie"
        : "approuve",
    reviewedByUserId: options.actorUserId,
    reviewNote: options.reviewNote ?? null,
    approvedMinutes: options.approvedMinutes ?? null,
  });

  let sourceEvent = await getEventById(exception.source_event_id);
  if (!sourceEvent) {
    throw new HorodateurPhase1Error("Evenement source introuvable.", {
      code: "source_event_not_found",
      status: 404,
    });
  }

  if (options.correctedOccurredAt) {
    sourceEvent = await updateEventOccurredAt({
      eventId: sourceEvent.id,
      occurredAt: options.correctedOccurredAt,
      updatedByUserId: options.actorUserId,
    });
  }

  if (options.correctedRelatedOccurredAt && sourceEvent.related_event_id) {
    await updateEventOccurredAt({
      eventId: sourceEvent.related_event_id,
      occurredAt: options.correctedRelatedOccurredAt,
      updatedByUserId: options.actorUserId,
    });
  }

  const event = await updateEventReviewStatus({
    eventId: sourceEvent.id,
    status: "approuve",
    reviewedByUserId: options.actorUserId,
    reviewNote: options.reviewNote ?? null,
  });

  const shift = await recomputeShiftForDate(
    exception.employee_id,
    event.work_date ??
      getLocalWorkDate(getEventOccurredAt(event) ?? new Date().toISOString())
  );
  const currentState = await recomputeCurrentState(exception.employee_id);
  console.info("[horodateur-exception]", "exception_approved_with_adjusted_time", {
    employeeId: exception.employee_id,
    exceptionId: exception.id,
    sourceEventId: sourceEvent.id,
    sourceTimeAdjusted: Boolean(options.correctedOccurredAt),
    relatedTimeAdjusted: Boolean(options.correctedRelatedOccurredAt && sourceEvent.related_event_id),
  });

  let employeeNotify: Awaited<
    ReturnType<typeof notifyEmployeeHorodateurExceptionDecision>
  > | null = null;
  try {
    const employee = await getEmployeeById(exception.employee_id);
    if (employee) {
      employeeNotify = await notifyEmployeeHorodateurExceptionDecision({
        employee,
        outcome: "approved",
        exceptionId: exception.id,
      });
    }
  } catch (error) {
    console.error("[horodateur-exception-employee-notify]", {
      exceptionId: exception.id,
      employeeId: exception.employee_id,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const admin = tryCreateAdminClient();
  if (admin) {
    await markHorodateurExceptionAppAlertHandled(
      admin,
      exception.id,
      options.actorUserId,
      "approved"
    );
  }

  return {
    exception: reviewedException,
    event,
    shift,
    currentState,
    employeeNotify,
  };
}

export async function refuseHorodateurException(options: {
  actorUserId: string;
  exceptionId: string;
  reviewNote: string;
}) {
  const normalizedReviewNote = String(options.reviewNote ?? "").trim();

  if (!normalizedReviewNote) {
    throw new HorodateurPhase1Error("Une note est obligatoire pour refuser une exception.", {
      code: "review_note_required",
      status: 400,
    });
  }

  const exception = await getExceptionById(options.exceptionId);

  if (!exception) {
    throw new HorodateurPhase1Error("Exception introuvable.", {
      code: "exception_not_found",
      status: 404,
    });
  }

  if (exception.status !== "en_attente") {
    throw new HorodateurPhase1Error("Cette exception a deja ete traitee.", {
      code: "exception_already_reviewed",
      status: 409,
    });
  }

  const reviewedException = await updateExceptionReview({
    exceptionId: exception.id,
    status: "refuse",
    reviewedByUserId: options.actorUserId,
    reviewNote: normalizedReviewNote,
    approvedMinutes: null,
  });

  const event = await updateEventReviewStatus({
    eventId: exception.source_event_id,
    status: "refuse",
    reviewedByUserId: options.actorUserId,
    reviewNote: normalizedReviewNote,
  });

  const shift = await recomputeShiftForDate(
    exception.employee_id,
    event.work_date ??
      getLocalWorkDate(getEventOccurredAt(event) ?? new Date().toISOString())
  );
  const currentState = await recomputeCurrentState(exception.employee_id);
  console.info("[horodateur-exception]", "exception_refused_pending_removed", {
    employeeId: exception.employee_id,
    exceptionId: exception.id,
    eventId: exception.source_event_id,
    currentState: currentState.current_state,
  });

  let employeeNotify: Awaited<
    ReturnType<typeof notifyEmployeeHorodateurExceptionDecision>
  > | null = null;
  try {
    const employee = await getEmployeeById(exception.employee_id);
    if (employee) {
      employeeNotify = await notifyEmployeeHorodateurExceptionDecision({
        employee,
        outcome: "rejected",
        exceptionId: exception.id,
      });
    }
  } catch (error) {
    console.error("[horodateur-exception-employee-notify]", {
      exceptionId: exception.id,
      employeeId: exception.employee_id,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const adminRefuse = tryCreateAdminClient();
  if (adminRefuse) {
    await markHorodateurExceptionAppAlertHandled(
      adminRefuse,
      exception.id,
      options.actorUserId,
      "rejected"
    );
  }

  return {
    exception: reviewedException,
    event,
    shift,
    currentState,
    employeeNotify,
  };
}

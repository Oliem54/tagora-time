export const HORODATEUR_ALERT_MAX_SMS_PER_RECIPIENT_PER_DAY = 3;
export const HORODATEUR_ALERT_MAX_EMAIL_PER_RECIPIENT_PER_DAY = 8;

export type HorodateurAlertChannel = "email" | "sms";

export type HorodateurAlertIncidentType =
  | "absence_or_late"
  | "missing_expected_punch"
  | "exception_pending"
  | "exception_reminder";

export function buildHorodateurAlertDedupeKey(input: {
  organizationId?: string | null;
  employeeId: number;
  workDate: string;
  incidentType: HorodateurAlertIncidentType;
  channel: HorodateurAlertChannel;
}): string {
  const org = input.organizationId?.trim() || "org";
  return [
    "horodateur_alert",
    org,
    String(input.employeeId),
    input.workDate,
    input.incidentType,
    input.channel,
  ].join(":");
}

export function isUrgentHorodateurIncident(input: {
  incidentType: HorodateurAlertIncidentType;
  exceptionType?: string | null;
  minutesLate?: number | null;
  urgentAfterMinutes?: number | null;
}): boolean {
  if (input.incidentType === "exception_reminder") {
    return false;
  }
  if (input.incidentType === "missing_expected_punch") {
    return false;
  }
  if (input.incidentType === "exception_pending") {
    return (
      input.exceptionType === "missing_punch_adjustment" ||
      input.exceptionType === "shift_too_long"
    );
  }
  const minutesLate = input.minutesLate ?? 0;
  const urgentAfter = input.urgentAfterMinutes ?? 60;
  return minutesLate >= urgentAfter;
}

export function shouldGrandfatherHistoricalAlert(input: {
  incidentWorkDate: string | null;
  todayWorkDate: string;
}): boolean {
  const incident = input.incidentWorkDate?.trim() || null;
  if (!incident) {
    return true;
  }
  return incident < input.todayWorkDate;
}

export function shouldSkipPreCutoverMonitoring(input: {
  incidentWorkDate: string | null;
  incidentAtIso?: string | null;
  cutoverAtIso: string | null;
  cutoverWorkDate: string | null;
}): boolean {
  const cutoverAt = input.cutoverAtIso?.trim() || null;
  const cutoverWorkDate = input.cutoverWorkDate?.trim() || null;
  if (!cutoverAt || !cutoverWorkDate) {
    return false;
  }
  const incidentDate = input.incidentWorkDate?.trim() || null;
  if (!incidentDate) {
    return true;
  }
  if (incidentDate < cutoverWorkDate) {
    return true;
  }
  if (incidentDate > cutoverWorkDate) {
    return false;
  }
  const incidentAt = input.incidentAtIso?.trim() || null;
  if (!incidentAt) {
    return true;
  }
  const incidentMs = Date.parse(incidentAt);
  const cutoverMs = Date.parse(cutoverAt);
  if (!Number.isFinite(incidentMs) || !Number.isFinite(cutoverMs)) {
    return true;
  }
  return incidentMs < cutoverMs;
}

export function shouldSendHorodateurChannel(input: {
  channel: HorodateurAlertChannel;
  urgent: boolean;
  alreadySent: boolean;
  recipientCountToday: number;
}): boolean {
  if (input.alreadySent) {
    return false;
  }
  const max =
    input.channel === "sms"
      ? HORODATEUR_ALERT_MAX_SMS_PER_RECIPIENT_PER_DAY
      : HORODATEUR_ALERT_MAX_EMAIL_PER_RECIPIENT_PER_DAY;
  if (input.recipientCountToday >= max) {
    return false;
  }
  if (input.channel === "sms") {
    return input.urgent;
  }
  return true;
}

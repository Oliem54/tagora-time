import "server-only";

import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  sanitizeWeeklyScheduleConfig,
  type WeeklyScheduleConfig,
} from "@/app/lib/weekly-schedule";
import type {
  HorodateurCanonicalEventType,
  HorodateurDirectionAlertConfigRecord,
  HorodateurPhase1CurrentStateRecord,
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1InsertEventInput,
  HorodateurLatenessNotificationRecord,
  HorodateurPhase1ShiftRecord,
} from "./types";
import { HORODATEUR_CANONICAL_TO_LEGACY_EVENT_TYPE } from "./types";

type ChauffeurProfileRow = {
  id: number;
  auth_user_id: string | null;
  nom: string | null;
  courriel: string | null;
  telephone?: string | null;
  phone_number?: string | null;
  actif: boolean | null;
  primary_company: HorodateurPhase1EmployeeProfile["primaryCompany"];
  can_work_for_oliem_solutions?: boolean | null;
  can_work_for_titan_produits_industriels?: boolean | null;
  schedule_start: string | null;
  schedule_end: string | null;
  scheduled_work_days: string[] | null;
  planned_weekly_hours: number | null;
  pause_minutes: number | null;
  break_1_minutes: number | null;
  break_1_paid: boolean | null;
  lunch_paid: boolean | null;
  lunch_minutes: number | null;
  expected_breaks_count: number | null;
  horodateur_tolerance_before_start_minutes?: number | null;
  horodateur_tolerance_after_end_minutes?: number | null;
  horodateur_max_shift_minutes?: number | null;
  sms_alert_quart_debut: boolean | null;
  alert_email_enabled?: boolean | null;
  alert_sms_enabled?: boolean | null;
  is_direction_alert_recipient?: boolean | null;
  weekly_schedule_config?: unknown | null;
};

type EventRow = Record<string, unknown>;

const CHAUFFEUR_PHASE1_SELECT_CANONICAL = `
  id,
  auth_user_id,
  nom,
  courriel,
  telephone,
  actif,
  primary_company,
  can_work_for_oliem_solutions,
  can_work_for_titan_produits_industriels,
  schedule_start,
  schedule_end,
  scheduled_work_days,
  planned_weekly_hours,
  pause_minutes,
  break_1_minutes,
  break_1_paid,
  lunch_paid,
  lunch_minutes,
  expected_breaks_count,
  sms_alert_quart_debut,
  alert_email_enabled,
  alert_sms_enabled,
  is_direction_alert_recipient,
  weekly_schedule_config
`;

const CHAUFFEUR_PHASE1_SELECT_LEGACY_PHONE = `
  id,
  auth_user_id,
  nom,
  courriel,
  phone_number,
  actif,
  primary_company,
  can_work_for_oliem_solutions,
  can_work_for_titan_produits_industriels,
  schedule_start,
  schedule_end,
  scheduled_work_days,
  planned_weekly_hours,
  pause_minutes,
  break_1_minutes,
  break_1_paid,
  lunch_paid,
  lunch_minutes,
  expected_breaks_count,
  sms_alert_quart_debut,
  alert_email_enabled,
  alert_sms_enabled,
  is_direction_alert_recipient,
  weekly_schedule_config
`;

function readErrorText(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  const message =
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  const details =
    typeof (error as { details?: unknown }).details === "string"
      ? (error as { details: string }).details
      : "";
  const hint =
    typeof (error as { hint?: unknown }).hint === "string"
      ? (error as { hint: string }).hint
      : "";

  return `${message} ${details} ${hint}`.toLowerCase();
}

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code =
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  const text = readErrorText(error);

  return code === "42703" && text.includes(columnName.toLowerCase());
}

function isCanonicalEventType(value: string): value is HorodateurCanonicalEventType {
  return value in HORODATEUR_CANONICAL_TO_LEGACY_EVENT_TYPE;
}

function toStoredLegacyEventType(
  value: HorodateurPhase1InsertEventInput["eventType"]
): HorodateurPhase1EventRecord["event_type"] {
  const eventType = String(value);
  return isCanonicalEventType(eventType)
    ? HORODATEUR_CANONICAL_TO_LEGACY_EVENT_TYPE[eventType]
    : (eventType as HorodateurPhase1EventRecord["event_type"]);
}

function normalizeEventRow(
  row: EventRow,
  fallbackEmployeeId?: number
): HorodateurPhase1EventRecord {
  const rawOccurredAt =
    typeof row.occurred_at === "string"
      ? row.occurred_at
      : typeof row.event_time === "string"
        ? row.event_time
        : null;
  const rawNotes =
    typeof row.notes === "string"
      ? row.notes
      : typeof row.note === "string"
        ? row.note
        : null;
  const employeeIdValue =
    typeof row.employee_id === "number"
      ? row.employee_id
      : typeof fallbackEmployeeId === "number"
        ? fallbackEmployeeId
        : 0;

  return {
    ...(row as unknown as HorodateurPhase1EventRecord),
    employee_id: employeeIdValue,
    event_type: String(row.event_type ?? "") as HorodateurPhase1EventRecord["event_type"],
    occurred_at: rawOccurredAt,
    event_time: rawOccurredAt,
    notes: rawNotes,
    note: rawNotes,
  };
}

function mapProfile(row: ChauffeurProfileRow): HorodateurPhase1EmployeeProfile {
  const weeklyScheduleConfig: WeeklyScheduleConfig | null =
    sanitizeWeeklyScheduleConfig(row.weekly_schedule_config);
  return {
    employeeId: row.id,
    authUserId: row.auth_user_id,
    fullName: row.nom,
    email: row.courriel,
    phoneNumber: row.telephone ?? row.phone_number ?? null,
    active: row.actif !== false,
    primaryCompany: row.primary_company,
    canWorkForOliemSolutions: row.can_work_for_oliem_solutions !== false,
    canWorkForTitanProduitsIndustriels:
      row.can_work_for_titan_produits_industriels === true,
    scheduleStart: row.schedule_start,
    scheduleEnd: row.schedule_end,
    scheduledWorkDays: row.scheduled_work_days,
    plannedWeeklyHours:
      typeof row.planned_weekly_hours === "number" ? row.planned_weekly_hours : null,
    pausePaid: row.break_1_paid !== false,
    pauseMinutes: row.break_1_minutes ?? row.pause_minutes ?? 15,
    lunchPaid: row.lunch_paid === true,
    lunchMinutes: row.lunch_minutes ?? 30,
    expectedBreaksCount: row.expected_breaks_count,
    toleranceBeforeStartMinutes: row.horodateur_tolerance_before_start_minutes ?? 0,
    toleranceAfterEndMinutes: row.horodateur_tolerance_after_end_minutes ?? 0,
    maxShiftMinutes: row.horodateur_max_shift_minutes ?? 720,
    smsAlertQuartDebut: row.sms_alert_quart_debut !== false,
    alertEmailEnabled: row.alert_email_enabled !== false,
    alertSmsEnabled: row.alert_sms_enabled !== false,
    isDirectionAlertRecipient: row.is_direction_alert_recipient === true,
    weeklyScheduleConfig,
  };
}

export async function listDirectionAlertRecipients() {
  const supabase = createAdminSupabaseClient();
  let { data, error } = await supabase
    .from("chauffeurs")
    .select(CHAUFFEUR_PHASE1_SELECT_CANONICAL)
    .eq("actif", true)
    .eq("is_direction_alert_recipient", true)
    .order("nom", { ascending: true })
    .returns<ChauffeurProfileRow[]>();

  if (error && isMissingColumnError(error, "telephone")) {
    const fallback = await supabase
      .from("chauffeurs")
      .select(CHAUFFEUR_PHASE1_SELECT_LEGACY_PHONE)
      .eq("actif", true)
      .eq("is_direction_alert_recipient", true)
      .order("nom", { ascending: true })
      .returns<ChauffeurProfileRow[]>();
    data = fallback.data ?? null;
    error = fallback.error ?? null;
  }

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapProfile);
}

async function getEmployeeAuthUserIdByEmployeeId(employeeId: number) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("chauffeurs")
    .select("auth_user_id")
    .eq("id", employeeId)
    .maybeSingle<{ auth_user_id: string | null }>();

  if (error) {
    throw error;
  }

  return data?.auth_user_id ?? null;
}

export async function getEmployeeByAuthUserId(authUserId: string) {
  const supabase = createAdminSupabaseClient();
  let { data, error } = await supabase
    .from("chauffeurs")
    .select(CHAUFFEUR_PHASE1_SELECT_CANONICAL)
    .eq("auth_user_id", authUserId)
    .maybeSingle<ChauffeurProfileRow>();

  if (error && isMissingColumnError(error, "telephone")) {
    const fallback = await supabase
      .from("chauffeurs")
      .select(CHAUFFEUR_PHASE1_SELECT_LEGACY_PHONE)
      .eq("auth_user_id", authUserId)
      .maybeSingle<ChauffeurProfileRow>();
    data = fallback.data ?? null;
    error = fallback.error ?? null;
  }

  if (error) {
    throw error;
  }

  return data ? mapProfile(data) : null;
}

export async function getEmployeeById(employeeId: number) {
  const supabase = createAdminSupabaseClient();
  let { data, error } = await supabase
    .from("chauffeurs")
    .select(CHAUFFEUR_PHASE1_SELECT_CANONICAL)
    .eq("id", employeeId)
    .maybeSingle<ChauffeurProfileRow>();

  if (error && isMissingColumnError(error, "telephone")) {
    const fallback = await supabase
      .from("chauffeurs")
      .select(CHAUFFEUR_PHASE1_SELECT_LEGACY_PHONE)
      .eq("id", employeeId)
      .maybeSingle<ChauffeurProfileRow>();
    data = fallback.data ?? null;
    error = fallback.error ?? null;
  }

  if (error) {
    throw error;
  }

  return data ? mapProfile(data) : null;
}

export async function listActiveEmployees() {
  const supabase = createAdminSupabaseClient();
  let { data, error } = await supabase
    .from("chauffeurs")
    .select(CHAUFFEUR_PHASE1_SELECT_CANONICAL)
    .eq("actif", true)
    .order("nom", { ascending: true })
    .returns<ChauffeurProfileRow[]>();

  if (error && isMissingColumnError(error, "telephone")) {
    const fallback = await supabase
      .from("chauffeurs")
      .select(CHAUFFEUR_PHASE1_SELECT_LEGACY_PHONE)
      .eq("actif", true)
      .order("nom", { ascending: true })
      .returns<ChauffeurProfileRow[]>();
    data = fallback.data ?? null;
    error = fallback.error ?? null;
  }

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapProfile);
}

export async function getCurrentStateByEmployeeId(employeeId: number) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_current_state")
    .select("*")
    .eq("employee_id", employeeId)
    .maybeSingle<HorodateurPhase1CurrentStateRecord>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function listEventsForEmployee(options: {
  employeeId: number;
  workDate?: string;
  statuses?: string[];
}) {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("horodateur_events")
    .select("*")
    .eq("employee_id", options.employeeId);

  if (options.workDate) {
    query = query.eq("work_date", options.workDate);
  }

  if (options.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }

  let { data, error } = await query
    .order("occurred_at", { ascending: true })
    .returns<EventRow[]>();

  if (error && isMissingColumnError(error, "occurred_at")) {
    const fallback = await query
      .order("event_time", { ascending: true })
      .returns<EventRow[]>();
    data = fallback.data ?? null;
    error = fallback.error ?? null;
  }

  if (error && isMissingColumnError(error, "employee_id")) {
    const authUserId = await getEmployeeAuthUserIdByEmployeeId(options.employeeId);

    if (!authUserId) {
      return [];
    }

    let legacyQuery = supabase
      .from("horodateur_events")
      .select("*")
      .eq("user_id", authUserId);

    if (options.workDate) {
      legacyQuery = legacyQuery.eq("work_date", options.workDate);
    }

    if (options.statuses && options.statuses.length > 0) {
      legacyQuery = legacyQuery.in("status", options.statuses);
    }

    let legacyResult = await legacyQuery
      .order("occurred_at", { ascending: true })
      .returns<EventRow[]>();
    if (legacyResult.error && isMissingColumnError(legacyResult.error, "occurred_at")) {
      legacyResult = await legacyQuery
        .order("event_time", { ascending: true })
        .returns<EventRow[]>();
    }
    data = legacyResult.data ?? null;
    error = legacyResult.error ?? null;
  }

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => normalizeEventRow(row, options.employeeId));
}

export async function getEventById(eventId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle<EventRow>();

  if (error) {
    throw error;
  }

  return data ? normalizeEventRow(data) : null;
}

export async function insertEvent(input: HorodateurPhase1InsertEventInput) {
  const supabase = createAdminSupabaseClient();
  const eventType = toStoredLegacyEventType(input.eventType);
  const payload: Record<string, unknown> = {
    user_id: input.userId,
    employee_id: input.employeeId,
    occurred_at: input.occurredAt,
    event_type: eventType,
    actor_user_id: input.actorUserId,
    actor_role: input.actorRole,
    source_kind: input.sourceKind,
    company_context: input.companyContext ?? null,
    notes: input.note ?? null,
    related_event_id: input.relatedEventId ?? null,
    is_manual_correction: input.isManualCorrection ?? false,
    status: input.status,
    requires_approval: input.requiresApproval,
    exception_code: input.exceptionCode ?? null,
    approval_note: input.approvalNote ?? null,
    work_date: input.workDate,
    week_start_date: input.weekStartDate,
  };

  if (input.punchSource !== undefined) payload.punch_source = input.punchSource;
  if (input.punchZoneKey !== undefined) payload.punch_zone_key = input.punchZoneKey;
  if (input.punchZoneId !== undefined) payload.punch_zone_id = input.punchZoneId;
  if (input.zoneValidated !== undefined && input.zoneValidated !== null) {
    payload.zone_validated = input.zoneValidated;
  }
  if (input.gpsLatitude !== undefined && input.gpsLatitude !== null) {
    payload.gps_latitude = input.gpsLatitude;
  }
  if (input.gpsLongitude !== undefined && input.gpsLongitude !== null) {
    payload.gps_longitude = input.gpsLongitude;
  }
  if (input.workCompanyKey !== undefined) payload.work_company_key = input.workCompanyKey;
  if (input.employerCompanyKey !== undefined) {
    payload.employer_company_key = input.employerCompanyKey;
  }

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const { data, error } = await supabase
      .from("horodateur_events")
      .insert(payload)
      .select("*")
      .single<EventRow>();

    if (!error) {
      return normalizeEventRow(data, input.employeeId);
    }

    if (isMissingColumnError(error, "occurred_at") && "occurred_at" in payload) {
      payload.event_time = payload.occurred_at;
      delete payload.occurred_at;
      continue;
    }

    if (isMissingColumnError(error, "event_time") && "event_time" in payload) {
      payload.occurred_at = payload.event_time;
      delete payload.event_time;
      continue;
    }

    if (isMissingColumnError(error, "notes") && "notes" in payload) {
      payload.note = payload.notes;
      delete payload.notes;
      continue;
    }

    if (isMissingColumnError(error, "note") && "note" in payload) {
      payload.notes = payload.note;
      delete payload.note;
      continue;
    }

    if (isMissingColumnError(error, "employee_id") && "employee_id" in payload) {
      delete payload.employee_id;
      continue;
    }

    if (isMissingColumnError(error, "user_id") && "user_id" in payload) {
      delete payload.user_id;
      continue;
    }

    throw error;
  }

  throw new Error("Impossible d inserer l evenement horodateur.");
}

export async function insertException(input: {
  employeeId: number;
  shiftId?: string | null;
  sourceEventId: string;
  exceptionType: HorodateurPhase1ExceptionRecord["exception_type"];
  reasonLabel: string;
  details?: string | null;
  impactMinutes?: number;
  requestedByUserId?: string | null;
}) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_exceptions")
    .insert({
      employee_id: input.employeeId,
      shift_id: input.shiftId ?? null,
      source_event_id: input.sourceEventId,
      exception_type: input.exceptionType,
      reason_label: input.reasonLabel,
      details: input.details ?? null,
      impact_minutes: input.impactMinutes ?? 0,
      requested_by_user_id: input.requestedByUserId ?? null,
      status: "en_attente",
    })
    .select("*")
    .single<HorodateurPhase1ExceptionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function getExceptionById(exceptionId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_exceptions")
    .select("*")
    .eq("id", exceptionId)
    .maybeSingle<HorodateurPhase1ExceptionRecord>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function getDirectionAlertConfig() {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_direction_alert_config")
    .select("*")
    .eq("config_key", "default")
    .maybeSingle<HorodateurDirectionAlertConfigRecord>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function upsertDirectionAlertConfig(
  input: Omit<
    HorodateurDirectionAlertConfigRecord,
    "config_key" | "created_at" | "updated_at"
  >
) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_direction_alert_config")
    .upsert(
      {
        config_key: "default",
        email_enabled: input.email_enabled,
        sms_enabled: input.sms_enabled,
        reminder_delay_minutes: input.reminder_delay_minutes,
        direction_emails: input.direction_emails,
        direction_sms_numbers: input.direction_sms_numbers,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "config_key" }
    )
    .select("*")
    .single<HorodateurDirectionAlertConfigRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function countPendingExceptionsForEmployee(employeeId: number) {
  const supabase = createAdminSupabaseClient();
  const { count, error } = await supabase
    .from("horodateur_exceptions")
    .select("*", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("status", "en_attente");

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function listExceptionsForShift(options: {
  employeeId: number;
  workDate: string;
}) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_exceptions")
    .select(`
      *,
      source_event:source_event_id (
        id,
        work_date
      )
    `)
    .eq("employee_id", options.employeeId);

  if (error) {
    throw error;
  }

  return (data ?? []).filter((item) => {
    const sourceEvent = Array.isArray(item.source_event)
      ? item.source_event[0]
      : item.source_event;
    return sourceEvent?.work_date === options.workDate;
  }) as Array<HorodateurPhase1ExceptionRecord & { source_event?: { work_date?: string } }>;
}

export async function listPendingExceptions(options?: { employeeId?: number }) {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("horodateur_exceptions")
    .select("*")
    .eq("status", "en_attente")
    .order("requested_at", { ascending: true });

  if (options?.employeeId) {
    query = query.eq("employee_id", options.employeeId);
  }

  const { data, error } = await query.returns<HorodateurPhase1ExceptionRecord[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listExceptionsForEmployeeWorkDate(options: {
  employeeId: number;
  workDate: string;
  statuses?: Array<HorodateurPhase1ExceptionRecord["status"]>;
}) {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("horodateur_exceptions")
    .select(`
      *,
      source_event:source_event_id (
        id,
        work_date
      )
    `)
    .eq("employee_id", options.employeeId);

  if (options.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).filter((item) => {
    const sourceEvent = Array.isArray(item.source_event)
      ? item.source_event[0]
      : item.source_event;
    return sourceEvent?.work_date === options.workDate;
  }) as Array<HorodateurPhase1ExceptionRecord & { source_event?: { work_date?: string } }>;
}

export async function getLatenessNotification(employeeId: number, workDate: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_lateness_notifications")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .maybeSingle<HorodateurLatenessNotificationRecord>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function upsertLatenessNotification(input: {
  employeeId: number;
  workDate: string;
  scheduledStartAt: string;
  lateDetectedAt?: string;
  lateDirectionEmailNotifiedAt?: string | null;
  lateDirectionSmsNotifiedAt?: string | null;
  lateEmployeeSmsNotifiedAt?: string | null;
  resolutionReason?: string | null;
}) {
  const supabase = createAdminSupabaseClient();
  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    employee_id: input.employeeId,
    work_date: input.workDate,
    scheduled_start_at: input.scheduledStartAt,
    updated_at: nowIso,
  };

  if (input.lateDetectedAt) {
    payload.detected_at = input.lateDetectedAt;
    payload.late_detected_at = input.lateDetectedAt;
  }

  if (typeof input.lateDirectionEmailNotifiedAt === "string") {
    payload.late_direction_email_notified_at = input.lateDirectionEmailNotifiedAt;
  }

  if (typeof input.lateDirectionSmsNotifiedAt === "string") {
    payload.late_direction_sms_notified_at = input.lateDirectionSmsNotifiedAt;
  }

  if (typeof input.lateEmployeeSmsNotifiedAt === "string") {
    payload.late_employee_sms_notified_at = input.lateEmployeeSmsNotifiedAt;
  }

  if (typeof input.resolutionReason === "string") {
    payload.resolution_reason = input.resolutionReason;
  }

  const { data, error } = await supabase
    .from("horodateur_lateness_notifications")
    .upsert(payload, { onConflict: "employee_id,work_date" })
    .select("*")
    .single<HorodateurLatenessNotificationRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateExceptionReview(input: {
  exceptionId: string;
  status: HorodateurPhase1ExceptionRecord["status"];
  reviewedByUserId: string;
  reviewNote?: string | null;
  approvedMinutes?: number | null;
}) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_exceptions")
    .update({
      status: input.status,
      reviewed_by_user_id: input.reviewedByUserId,
      reviewed_at: new Date().toISOString(),
      review_note: input.reviewNote ?? null,
      approved_minutes: input.approvedMinutes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.exceptionId)
    .select("*")
    .single<HorodateurPhase1ExceptionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateExceptionNotificationStatus(input: {
  exceptionId: string;
  directionEmailNotifiedAt?: string | null;
  directionSmsNotifiedAt?: string | null;
  directionReminderEmailNotifiedAt?: string | null;
  directionReminderSmsNotifiedAt?: string | null;
}) {
  const supabase = createAdminSupabaseClient();
  const updatePayload: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof input.directionEmailNotifiedAt === "string") {
    updatePayload.direction_email_notified_at = input.directionEmailNotifiedAt;
  }

  if (typeof input.directionSmsNotifiedAt === "string") {
    updatePayload.direction_sms_notified_at = input.directionSmsNotifiedAt;
  }

  if (typeof input.directionReminderEmailNotifiedAt === "string") {
    updatePayload.direction_reminder_email_notified_at =
      input.directionReminderEmailNotifiedAt;
  }

  if (typeof input.directionReminderSmsNotifiedAt === "string") {
    updatePayload.direction_reminder_sms_notified_at =
      input.directionReminderSmsNotifiedAt;
  }

  const { data, error } = await supabase
    .from("horodateur_exceptions")
    .update(updatePayload)
    .eq("id", input.exceptionId)
    .select("*")
    .single<HorodateurPhase1ExceptionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateEventReviewStatus(input: {
  eventId: string;
  status: HorodateurPhase1EventRecord["status"];
  reviewedByUserId: string;
  reviewNote?: string | null;
}) {
  const supabase = createAdminSupabaseClient();
  const payload =
    input.status === "refuse"
      ? {
          status: input.status,
          rejected_by: input.reviewedByUserId,
          rejected_at: new Date().toISOString(),
          approval_note: input.reviewNote ?? null,
        }
      : {
          status: input.status,
          approved_by: input.reviewedByUserId,
          approved_at: new Date().toISOString(),
          approval_note: input.reviewNote ?? null,
        };

  const { data, error } = await supabase
    .from("horodateur_events")
    .update(payload)
    .eq("id", input.eventId)
    .select("*")
    .single<EventRow>();

  if (error) {
    throw error;
  }

  return normalizeEventRow(data);
}

export async function upsertCurrentState(
  state: Omit<HorodateurPhase1CurrentStateRecord, "created_at" | "updated_at">
) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_current_state")
    .upsert(
      {
        employee_id: state.employee_id,
        current_state: state.current_state,
        last_event_type: state.last_event_type,
        last_event_at: state.last_event_at,
        company_context: state.company_context,
        has_open_exception: state.has_open_exception,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id" }
    )
    .select("*")
    .single<HorodateurPhase1CurrentStateRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function getShiftByEmployeeAndWorkDate(
  employeeId: number,
  workDate: string
) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_shifts")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .maybeSingle<HorodateurPhase1ShiftRecord>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function listShiftsForEmployeeWeek(employeeId: number, weekStartDate: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_shifts")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("week_start_date", weekStartDate)
    .order("work_date", { ascending: true })
    .returns<HorodateurPhase1ShiftRecord[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function upsertShift(
  shift: Omit<HorodateurPhase1ShiftRecord, "created_at" | "updated_at">
) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_shifts")
    .upsert(
      {
        id: shift.id,
        employee_id: shift.employee_id,
        work_date: shift.work_date,
        week_start_date: shift.week_start_date,
        company_context: shift.company_context,
        shift_start_at: shift.shift_start_at,
        shift_end_at: shift.shift_end_at,
        gross_minutes: shift.gross_minutes,
        paid_break_minutes: shift.paid_break_minutes,
        unpaid_break_minutes: shift.unpaid_break_minutes,
        unpaid_lunch_minutes: shift.unpaid_lunch_minutes,
        worked_minutes: shift.worked_minutes,
        payable_minutes: shift.payable_minutes,
        approved_exception_minutes: shift.approved_exception_minutes ?? 0,
        pending_exception_minutes: shift.pending_exception_minutes ?? 0,
        anomalies_count: shift.anomalies_count,
        status: shift.status,
        updated_at: new Date().toISOString(),
        last_recomputed_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,work_date" }
    )
    .select("*")
    .single<HorodateurPhase1ShiftRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function attachShiftToException(
  exceptionId: string,
  shiftId: string | null
) {
  if (!shiftId) {
    return;
  }

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("horodateur_exceptions")
    .update({
      shift_id: shiftId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", exceptionId);

  if (error) {
    throw error;
  }
}

/** Shifts whose work_date falls in [startWorkDate, endWorkDate] (inclusive), server-side filter. */
export async function listShiftsInWorkDateRange(options: {
  startWorkDate: string;
  endWorkDate: string;
  employeeId?: number;
  companyContext?: HorodateurPhase1EmployeeProfile["primaryCompany"] | null;
}) {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("horodateur_shifts")
    .select("*")
    .gte("work_date", options.startWorkDate)
    .lte("work_date", options.endWorkDate)
    .order("work_date", { ascending: true });

  if (
    options.companyContext === "oliem_solutions" ||
    options.companyContext === "titan_produits_industriels"
  ) {
    query = query.eq("company_context", options.companyContext);
  }

  if (typeof options.employeeId === "number" && options.employeeId > 0) {
    query = query.eq("employee_id", options.employeeId);
  }

  const { data, error } = await query.returns<HorodateurPhase1ShiftRecord[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

type HorodateurEventRowRaw = EventRow & {
  livraison_id?: number | null;
  dossier_id?: number | null;
  sortie_id?: number | null;
  metadata?: Record<string, unknown> | null;
  company_context?: string | null;
};

/** Events in work_date range for the given employees (all event rows, any status). */
export async function listHorodateurEventsInWorkDateRange(options: {
  startWorkDate: string;
  endWorkDate: string;
  employeeIds: number[];
}) {
  if (!options.employeeIds.length) {
    return [];
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_events")
    .select("*")
    .gte("work_date", options.startWorkDate)
    .lte("work_date", options.endWorkDate)
    .in("employee_id", options.employeeIds)
    .order("occurred_at", { ascending: true })
    .returns<HorodateurEventRowRaw[]>();

  if (error && isMissingColumnError(error, "occurred_at")) {
    const legacy = await supabase
      .from("horodateur_events")
      .select("*")
      .gte("work_date", options.startWorkDate)
      .lte("work_date", options.endWorkDate)
      .in("employee_id", options.employeeIds)
      .order("event_time", { ascending: true })
      .returns<HorodateurEventRowRaw[]>();

    if (legacy.error) {
      throw legacy.error;
    }

    return (legacy.data ?? []).map((row) => normalizeEventRow(row));
  }

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => normalizeEventRow(row));
}

export async function getEmployeesByIdsForRegistre(ids: number[]) {
  if (!ids.length) {
    return [];
  }

  const supabase = createAdminSupabaseClient();
  let { data, error } = await supabase
    .from("chauffeurs")
    .select(CHAUFFEUR_PHASE1_SELECT_CANONICAL)
    .in("id", ids)
    .returns<ChauffeurProfileRow[]>();

  if (error && isMissingColumnError(error, "telephone")) {
    const fallback = await supabase
      .from("chauffeurs")
      .select(CHAUFFEUR_PHASE1_SELECT_LEGACY_PHONE)
      .in("id", ids)
      .returns<ChauffeurProfileRow[]>();
    data = fallback.data ?? null;
    error = fallback.error ?? null;
  }

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapProfile);
}

export async function listHorodateurExceptionsForEmployees(
  employeeIds: number[]
) {
  if (!employeeIds.length) {
    return [];
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_exceptions")
    .select(`
      *,
      source_event:source_event_id (
        id,
        work_date
      )
    `)
    .in("employee_id", employeeIds)
    .returns<
      Array<
        HorodateurPhase1ExceptionRecord & {
          source_event?: { work_date?: string } | Array<{ work_date?: string }>;
        }
      >
    >();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export type HorodateurExceptionActionTokenRow = {
  id: string;
  exception_id: string;
  action: "approve" | "reject";
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  used_by_email: string | null;
  created_at: string;
};

/** Supprime les jetons non utilisés pour une exception avant d’en émettre de nouveaux (nouvelle alerte). */
export async function deleteUnusedQuickActionTokensForException(exceptionId: string) {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("horodateur_exception_action_tokens")
    .delete()
    .eq("exception_id", exceptionId)
    .is("used_at", null);

  if (error) {
    throw error;
  }
}

export async function insertQuickActionToken(input: {
  exceptionId: string;
  action: "approve" | "reject";
  tokenHash: string;
  expiresAt: string;
}) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_exception_action_tokens")
    .insert({
      exception_id: input.exceptionId,
      action: input.action,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  return data;
}

export async function findQuickActionTokenByHash(tokenHash: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_exception_action_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle<HorodateurExceptionActionTokenRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function markQuickActionTokenUsed(
  tokenId: string,
  usedByEmail?: string | null
) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_exception_action_tokens")
    .update({
      used_at: new Date().toISOString(),
      used_by_email: usedByEmail?.trim() || null,
    })
    .eq("id", tokenId)
    .is("used_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

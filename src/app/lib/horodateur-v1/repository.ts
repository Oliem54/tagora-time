import "server-only";

import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import type {
  HorodateurPhase1CurrentStateRecord,
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1InsertEventInput,
  HorodateurPhase1ShiftRecord,
} from "./types";

type ChauffeurProfileRow = {
  id: number;
  auth_user_id: string | null;
  nom: string | null;
  courriel: string | null;
  actif: boolean | null;
  primary_company: HorodateurPhase1EmployeeProfile["primaryCompany"];
  schedule_start: string | null;
  schedule_end: string | null;
  scheduled_work_days: string[] | null;
  planned_weekly_hours: number | null;
  pause_paid: boolean | null;
  pause_minutes: number | null;
  lunch_paid: boolean | null;
  lunch_minutes: number | null;
  expected_breaks_count: number | null;
  horodateur_tolerance_before_start_minutes: number | null;
  horodateur_tolerance_after_end_minutes: number | null;
  horodateur_max_shift_minutes: number | null;
};

const CHAUFFEUR_PHASE1_SELECT = `
  id,
  auth_user_id,
  nom,
  courriel,
  actif,
  primary_company,
  schedule_start,
  schedule_end,
  scheduled_work_days,
  planned_weekly_hours,
  pause_paid,
  pause_minutes,
  lunch_paid,
  lunch_minutes,
  expected_breaks_count,
  horodateur_tolerance_before_start_minutes,
  horodateur_tolerance_after_end_minutes,
  horodateur_max_shift_minutes
`;

function mapProfile(row: ChauffeurProfileRow): HorodateurPhase1EmployeeProfile {
  return {
    employeeId: row.id,
    authUserId: row.auth_user_id,
    fullName: row.nom,
    email: row.courriel,
    active: row.actif !== false,
    primaryCompany: row.primary_company,
    scheduleStart: row.schedule_start,
    scheduleEnd: row.schedule_end,
    scheduledWorkDays: row.scheduled_work_days,
    plannedWeeklyHours:
      typeof row.planned_weekly_hours === "number" ? row.planned_weekly_hours : null,
    pausePaid: row.pause_paid !== false,
    pauseMinutes: row.pause_minutes ?? 15,
    lunchPaid: row.lunch_paid === true,
    lunchMinutes: row.lunch_minutes ?? 30,
    expectedBreaksCount: row.expected_breaks_count,
    toleranceBeforeStartMinutes:
      row.horodateur_tolerance_before_start_minutes ?? 0,
    toleranceAfterEndMinutes:
      row.horodateur_tolerance_after_end_minutes ?? 0,
    maxShiftMinutes: row.horodateur_max_shift_minutes ?? 720,
  };
}

export async function getEmployeeByAuthUserId(authUserId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("chauffeurs")
    .select(CHAUFFEUR_PHASE1_SELECT)
    .eq("auth_user_id", authUserId)
    .maybeSingle<ChauffeurProfileRow>();

  if (error) {
    throw error;
  }

  return data ? mapProfile(data) : null;
}

export async function getEmployeeById(employeeId: number) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("chauffeurs")
    .select(CHAUFFEUR_PHASE1_SELECT)
    .eq("id", employeeId)
    .maybeSingle<ChauffeurProfileRow>();

  if (error) {
    throw error;
  }

  return data ? mapProfile(data) : null;
}

export async function listActiveEmployees() {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("chauffeurs")
    .select(CHAUFFEUR_PHASE1_SELECT)
    .eq("actif", true)
    .order("nom", { ascending: true })
    .returns<ChauffeurProfileRow[]>();

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
    .eq("employee_id", options.employeeId)
    .order("occurred_at", { ascending: true });

  if (options.workDate) {
    query = query.eq("work_date", options.workDate);
  }

  if (options.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }

  const { data, error } = await query.returns<HorodateurPhase1EventRecord[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getEventById(eventId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle<HorodateurPhase1EventRecord>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function insertEvent(input: HorodateurPhase1InsertEventInput) {
  const supabase = createAdminSupabaseClient();
  const payload = {
    employee_id: input.employeeId,
    occurred_at: input.occurredAt,
    event_type: input.eventType,
    actor_user_id: input.actorUserId,
    actor_role: input.actorRole,
    source_kind: input.sourceKind,
    source_module: input.sourceModule ?? "horodateur_v1",
    company_context: input.companyContext,
    notes: input.note ?? null,
    metadata: input.metadata ?? {},
    related_event_id: input.relatedEventId ?? null,
    livraison_id: input.livraisonId ?? null,
    dossier_id: input.dossierId ?? null,
    sortie_id: input.sortieId ?? null,
    is_manual_correction: input.isManualCorrection ?? false,
    status: input.status,
    requires_approval: input.requiresApproval,
    exception_code: input.exceptionCode ?? null,
    approval_note: input.approvalNote ?? null,
    work_date: input.metadata?.work_date ?? null,
    week_start_date: input.metadata?.week_start_date ?? null,
  };

  const { data, error } = await supabase
    .from("horodateur_events")
    .insert(payload)
    .select("*")
    .single<HorodateurPhase1EventRecord>();

  if (error) {
    throw error;
  }

  return data;
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
    .single<HorodateurPhase1EventRecord>();

  if (error) {
    throw error;
  }

  return data;
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
        active_shift_id: state.active_shift_id,
        active_shift_start_event_id: state.active_shift_start_event_id,
        active_pause_start_event_id: state.active_pause_start_event_id,
        active_dinner_start_event_id: state.active_dinner_start_event_id,
        last_event_id: state.last_event_id,
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
        ...shift,
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

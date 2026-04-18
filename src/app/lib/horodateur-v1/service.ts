import "server-only";

import { getCompanyLabel, type AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  attachShiftToException,
  countPendingExceptionsForEmployee,
  getCurrentStateByEmployeeId,
  getEmployeeByAuthUserId,
  getEmployeeById,
  getEventById,
  getExceptionById,
  getShiftByEmployeeAndWorkDate,
  insertEvent,
  insertException,
  listActiveEmployees,
  listEventsForEmployee,
  listExceptionsForShift,
  listPendingExceptions,
  listShiftsForEmployeeWeek,
  updateEventReviewStatus,
  updateExceptionReview,
  upsertCurrentState,
  upsertShift,
} from "./repository";
import {
  classifyEventPhase1,
  diffMinutes,
  getLastApprovedEvent,
  getLocalWorkDate,
  getWeekStartDate,
  HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS,
  resolveCompanyContextForShift,
  resolveShiftStatus,
} from "./rules";
import {
  HorodateurPhase1Error,
} from "./types";
import type {
  HorodateurPhase1CreatePunchResult,
  HorodateurPhase1CurrentStateRecord,
  HorodateurPhase1DirectionLiveRow,
  HorodateurPhase1EmployeeDashboardSnapshot,
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1EventType,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1ExceptionType,
  HorodateurPhase1InsertEventInput,
  HorodateurPhase1ShiftRecord,
  HorodateurPhase1StateKind,
} from "./types";

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

function buildEventMetadata(options: {
  workDate: string;
  weekStartDate: string;
  actorEmail?: string | null;
  extra?: Record<string, unknown>;
}) {
  return {
    work_date: options.workDate,
    week_start_date: options.weekStartDate,
    actor_email: options.actorEmail ?? null,
    ...(options.extra ?? {}),
  };
}

export async function insertHorodateurEvent(input: HorodateurPhase1InsertEventInput) {
  const workDate = getLocalWorkDate(input.occurredAt);
  const weekStartDate = getWeekStartDate(input.occurredAt);

  return insertEvent({
    ...input,
    metadata: buildEventMetadata({
      workDate,
      weekStartDate,
      extra: input.metadata,
    }),
  });
}

export async function createPendingExceptionForEvent(options: {
  employeeId: number;
  event: HorodateurPhase1EventRecord;
  requestedByUserId: string | null;
  reasonLabel: string;
  details?: string | null;
  impactMinutes?: number;
}) {
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
    options.event.work_date
  );

  return insertException({
    employeeId: options.employeeId,
    shiftId: existingShift?.id ?? null,
    sourceEventId: options.event.id,
    exceptionType: options.event.exception_code,
    reasonLabel: options.reasonLabel,
    details: options.details ?? null,
    impactMinutes: options.impactMinutes ?? 0,
    requestedByUserId: options.requestedByUserId,
  });
}

export async function recomputeCurrentState(employeeId: number) {
  const approvedEvents = await listEventsForEmployee({
    employeeId,
    statuses: ["normal", "approuve"],
  });
  const lastEvent = getLastApprovedEvent(approvedEvents);
  const pendingExceptionsCount = await countPendingExceptionsForEmployee(employeeId);

  let currentState: HorodateurPhase1StateKind = "hors_quart";
  let activeShiftStartEventId: string | null = null;
  let activePauseStartEventId: string | null = null;
  let activeDinnerStartEventId: string | null = null;

  for (const event of approvedEvents) {
    if (event.event_type === "quart_debut") {
      currentState = "en_quart";
      activeShiftStartEventId = event.id;
      activePauseStartEventId = null;
      activeDinnerStartEventId = null;
      continue;
    }

    if (event.event_type === "pause_debut" && currentState === "en_quart") {
      currentState = "en_pause";
      activePauseStartEventId = event.id;
      continue;
    }

    if (event.event_type === "pause_fin" && currentState === "en_pause") {
      currentState = "en_quart";
      activePauseStartEventId = null;
      continue;
    }

    if (event.event_type === "dinner_debut" && currentState === "en_quart") {
      currentState = "en_diner";
      activeDinnerStartEventId = event.id;
      continue;
    }

    if (event.event_type === "dinner_fin" && currentState === "en_diner") {
      currentState = "en_quart";
      activeDinnerStartEventId = null;
      continue;
    }

    if (event.event_type === "quart_fin") {
      currentState = "termine";
      activeShiftStartEventId = null;
      activePauseStartEventId = null;
      activeDinnerStartEventId = null;
    }
  }

  const activeShift =
    lastEvent?.work_date != null
      ? await getShiftByEmployeeAndWorkDate(employeeId, lastEvent.work_date)
      : null;

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
    last_event_at: lastEvent?.occurred_at ?? null,
    company_context: lastEvent?.company_context ?? null,
    has_open_exception: pendingExceptionsCount > 0,
  });
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

  let shiftStartAt: string | null = null;
  let shiftEndAt: string | null = null;
  let shiftStartEventId: string | null = null;
  let shiftEndEventId: string | null = null;
  let workSegmentStartAt: string | null = null;
  let pauseStartAt: string | null = null;
  let dinnerStartAt: string | null = null;
  let paidBreakMinutes = 0;
  let unpaidBreakMinutes = 0;
  let unpaidLunchMinutes = 0;
  let workedMinutes = 0;
  const anomalies: string[] = [];
  let state: HorodateurPhase1StateKind = "hors_quart";

  for (const event of approvedEvents) {
    if (event.event_type === "quart_debut") {
      if (!shiftStartAt) {
        shiftStartAt = event.occurred_at;
        shiftStartEventId = event.id;
        workSegmentStartAt = event.occurred_at;
        state = "en_quart";
      } else {
        anomalies.push("Deux debuts de quart approuves sur la meme journee.");
      }
      continue;
    }

    if (event.event_type === "pause_debut") {
      if (state !== "en_quart" || !workSegmentStartAt) {
        anomalies.push("Pause approuvee dans une sequence invalide.");
      } else {
        workedMinutes += diffMinutes(workSegmentStartAt, event.occurred_at);
        workSegmentStartAt = null;
        pauseStartAt = event.occurred_at;
        state = "en_pause";
      }
      continue;
    }

    if (event.event_type === "pause_fin") {
      if (state !== "en_pause" || !pauseStartAt) {
        anomalies.push("Fin de pause approuvee sans pause active.");
      } else {
        const duration = diffMinutes(pauseStartAt, event.occurred_at);
        if (employee.pausePaid) {
          paidBreakMinutes += duration;
        } else {
          unpaidBreakMinutes += duration;
        }
        workSegmentStartAt = event.occurred_at;
        pauseStartAt = null;
        state = "en_quart";
      }
      continue;
    }

    if (event.event_type === "dinner_debut") {
      if (state !== "en_quart" || !workSegmentStartAt) {
        anomalies.push("Diner approuve dans une sequence invalide.");
      } else {
        workedMinutes += diffMinutes(workSegmentStartAt, event.occurred_at);
        workSegmentStartAt = null;
        dinnerStartAt = event.occurred_at;
        state = "en_diner";
      }
      continue;
    }

    if (event.event_type === "dinner_fin") {
      if (state !== "en_diner" || !dinnerStartAt) {
        anomalies.push("Fin de diner approuvee sans diner actif.");
      } else {
        const duration = diffMinutes(dinnerStartAt, event.occurred_at);
        if (!employee.lunchPaid) {
          unpaidLunchMinutes += duration;
        }
        workSegmentStartAt = event.occurred_at;
        dinnerStartAt = null;
        state = "en_quart";
      }
      continue;
    }

    if (event.event_type === "quart_fin") {
      shiftEndAt = event.occurred_at;
      shiftEndEventId = event.id;

      if (state === "en_quart" && workSegmentStartAt) {
        workedMinutes += diffMinutes(workSegmentStartAt, event.occurred_at);
      } else if (state === "en_pause") {
        anomalies.push("Fin de quart approuvee pendant une pause.");
      } else if (state === "en_diner") {
        anomalies.push("Fin de quart approuvee pendant un diner.");
      }

      workSegmentStartAt = null;
      pauseStartAt = null;
      dinnerStartAt = null;
      state = "termine";
    }
  }

  if (!shiftStartAt && approvedEvents.length > 0) {
    anomalies.push("Aucun debut de quart approuve n a ete trouve.");
  }

  if (pauseStartAt) {
    anomalies.push("Pause ouverte non terminee.");
  }

  if (dinnerStartAt) {
    anomalies.push("Diner ouvert non termine.");
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
    shiftStartAt && shiftEndAt ? diffMinutes(shiftStartAt, shiftEndAt) : 0;
  const payableMinutes = Math.max(
    0,
    workedMinutes - unpaidBreakMinutes - unpaidLunchMinutes + approvedExceptionMinutes
  );
  const companyContext = resolveCompanyContextForShift(
    approvedEvents,
    employee.primaryCompany
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
    shift_start_event_id: shiftStartEventId,
    shift_end_event_id: shiftEndEventId,
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
    anomalies,
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

  return shift;
}

export async function createEmployeePunch(options: {
  actorUserId: string;
  actorEmail?: string | null;
  eventType: HorodateurPhase1EventType;
  occurredAt?: string;
  note?: string | null;
  companyContext?: AccountRequestCompany | null;
  metadata?: Record<string, unknown>;
  relatedEventId?: string | null;
}) : Promise<HorodateurPhase1CreatePunchResult> {
  const occurredAt = options.occurredAt ?? new Date().toISOString();
  const employee = await resolveEmployeeByAuthUserId(options.actorUserId);
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

  const event = await insertHorodateurEvent({
    employeeId: employee.employeeId,
    occurredAt,
    eventType: options.eventType,
    actorUserId: options.actorUserId,
    actorRole: "employe",
    sourceKind: "employe",
    companyContext,
    note: options.note,
    metadata: buildEventMetadata({
      workDate: getLocalWorkDate(occurredAt),
      weekStartDate: getWeekStartDate(occurredAt),
      actorEmail: options.actorEmail,
      extra: options.metadata,
    }),
    relatedEventId: options.relatedEventId,
    isManualCorrection: false,
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
      reasonLabel: classification.reasonLabel ?? "Exception horodateur en attente",
      details: classification.details,
    });
  }

  const shift = await recomputeShiftForDate(employee.employeeId, event.work_date);
  const refreshedState = await recomputeCurrentState(employee.employeeId);

  return {
    event,
    exception,
    currentState: refreshedState,
    shift,
  };
}

export async function createDirectionPunch(options: {
  actorUserId: string;
  actorEmail?: string | null;
  employeeId: number;
  eventType: HorodateurPhase1EventType;
  occurredAt?: string;
  note: string;
  companyContext?: AccountRequestCompany | null;
  metadata?: Record<string, unknown>;
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
    forcedExceptionType: options.forcedExceptionType ?? "direction_manual_correction",
  });
  const companyContext = requireCompanyContext(
    options.companyContext,
    employee
  );

  const event = await insertHorodateurEvent({
    employeeId: employee.employeeId,
    occurredAt,
    eventType: options.eventType,
    actorUserId: options.actorUserId,
    actorRole: "direction",
    sourceKind: "direction",
    companyContext,
    note: normalizedNote,
    metadata: buildEventMetadata({
      workDate: getLocalWorkDate(occurredAt),
      weekStartDate: getWeekStartDate(occurredAt),
      actorEmail: options.actorEmail,
      extra: options.metadata,
    }),
    relatedEventId: options.relatedEventId,
    isManualCorrection: true,
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
      details: classification.details ?? normalizedNote,
    });
  }

  const shift = await recomputeShiftForDate(employee.employeeId, event.work_date);
  const refreshedState = await recomputeCurrentState(employee.employeeId);

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
        shift_start_event_id: null,
        shift_end_event_id: null,
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
        anomalies: [],
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
    events,
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
    event: eventMap.get(item.source_event_id) ?? null,
    employee: employeeMap.get(item.employee_id) ?? null,
  }));
}

export async function approveHorodateurException(options: {
  actorUserId: string;
  exceptionId: string;
  reviewNote?: string | null;
  approvedMinutes?: number | null;
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

  const event = await updateEventReviewStatus({
    eventId: exception.source_event_id,
    status: "approuve",
    reviewedByUserId: options.actorUserId,
    reviewNote: options.reviewNote ?? null,
  });

  const shift = await recomputeShiftForDate(exception.employee_id, event.work_date);
  const currentState = await recomputeCurrentState(exception.employee_id);

  return {
    exception: reviewedException,
    event,
    shift,
    currentState,
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

  const shift = await recomputeShiftForDate(exception.employee_id, event.work_date);
  const currentState = await recomputeCurrentState(exception.employee_id);

  return {
    exception: reviewedException,
    event,
    shift,
    currentState,
  };
}

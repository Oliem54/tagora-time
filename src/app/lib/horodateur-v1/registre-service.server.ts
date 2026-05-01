import "server-only";

import { getCompanyLabel, type AccountRequestCompany } from "@/app/lib/account-requests.shared";
import type {
  HorodateurRegistreDailyRow,
  HorodateurRegistreEmployeeRow,
  HorodateurRegistreEventDetail,
  HorodateurRegistreExceptionDetail,
  HorodateurRegistrePayload,
  HorodateurRegistrePendingApproval,
  HorodateurRegistreSummary,
  RegistreCompanyParam,
  RegistreStatusFilter,
} from "./registre-types";
import {
  getEmployeeById,
  getEmployeesByIdsForRegistre,
  listActiveEmployees,
  listHorodateurEventsInWorkDateRange,
  listHorodateurExceptionsForEmployees,
  listShiftsInWorkDateRange,
} from "./repository";
import {
  HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS,
  getEventOccurredAt,
  getWeekStartDate,
  toCanonicalEventType,
} from "./rules";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1ShiftRecord,
} from "./types";

function safeDateOrder(a: string, b: string) {
  return a.localeCompare(b);
}

function exceptionWorkDate(
  ex: HorodateurPhase1ExceptionRecord & {
    source_event?: { work_date?: string } | Array<{ work_date?: string }>;
  }
) {
  const src = ex.source_event;
  if (Array.isArray(src)) {
    return src[0]?.work_date ?? null;
  }
  return src?.work_date ?? null;
}

function filterExceptionsInRange(
  items: HorodateurPhase1ExceptionRecord[],
  start: string,
  end: string
) {
  return items.filter((ex) => {
    const wd = exceptionWorkDate(
      ex as HorodateurPhase1ExceptionRecord & {
        source_event?: { work_date?: string };
      }
    );
    if (!wd) {
      return false;
    }
    return safeDateOrder(wd, start) >= 0 && safeDateOrder(wd, end) <= 0;
  });
}

function shiftBreakTotal(s: HorodateurPhase1ShiftRecord) {
  return (
    (s.paid_break_minutes ?? 0) +
    (s.unpaid_break_minutes ?? 0) +
    (s.unpaid_lunch_minutes ?? 0)
  );
}

function aggregateOvertimeForEmployee(
  shifts: HorodateurPhase1ShiftRecord[],
  profile: HorodateurPhase1EmployeeProfile | undefined
): { normal: number; overtime: number } {
  const targetHours = profile?.plannedWeeklyHours ?? HORODATEUR_PHASE1_WEEKLY_TARGET_HOURS;
  const targetMinutesPerWeek = Math.max(1, Math.round(targetHours * 60));

  const byWeek = new Map<string, number>();

  for (const s of shifts) {
    const wk =
      typeof s.week_start_date === "string" && s.week_start_date.trim()
        ? s.week_start_date
        : getWeekStartDate(`${s.work_date}T12:00:00`);
    const prev = byWeek.get(wk) ?? 0;
    byWeek.set(wk, prev + Math.max(0, s.payable_minutes ?? 0));
  }

  let normal = 0;
  let overtime = 0;
  for (const minutes of byWeek.values()) {
    normal += Math.min(minutes, targetMinutesPerWeek);
    overtime += Math.max(0, minutes - targetMinutesPerWeek);
  }

  return { normal, overtime };
}

function mapEventDetail(
  row: HorodateurPhase1EventRecord & Record<string, unknown>
): HorodateurRegistreEventDetail {
  const at = getEventOccurredAt(row) ?? row.occurred_at ?? row.event_time ?? null;
  return {
    id: row.id,
    workDate: row.work_date ?? null,
    eventType: row.event_type,
    canonicalType: toCanonicalEventType(row.event_type) ?? null,
    occurredAt: at,
    status: row.status,
    sourceKind:
      typeof row.source_kind === "string"
        ? row.source_kind
        : null,
    actorRole:
      typeof row.actor_role === "string"
        ? row.actor_role
        : null,
    companyContext:
      typeof row.company_context === "string" ? row.company_context : null,
    livraisonId: typeof row.livraison_id === "number" ? row.livraison_id : null,
    dossierId: typeof row.dossier_id === "number" ? row.dossier_id : null,
    sortieId: typeof row.sortie_id === "number" ? row.sortie_id : null,
    notes: row.notes ?? row.note ?? null,
    isManualCorrection: row.is_manual_correction === true,
    exceptionCode:
      typeof row.exception_code === "string" ? row.exception_code : null,
    approvalNote:
      typeof row.approval_note === "string" ? row.approval_note : null,
    approvedAt:
      typeof row.approved_at === "string" ? row.approved_at : null,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
  };
}

function computeRowFlags(input: {
  shifts: HorodateurPhase1ShiftRecord[];
  events: HorodateurPhase1EventRecord[];
  exceptions: HorodateurPhase1ExceptionRecord[];
}): HorodateurRegistreEmployeeRow["flags"] {
  const hasIncomplete = input.shifts.some(
    (s) => !s.shift_end_at || s.status === "ouvert"
  );
  const hasPendingEvent = input.events.some((e) => e.status === "en_attente");
  const hasPendingExc = input.exceptions.some((x) => x.status === "en_attente");
  const hasCorr = input.events.some(
    (e) => e.event_type === "correction" || e.is_manual_correction === true
  );
  const hasExc =
    input.exceptions.length > 0 ||
    input.shifts.some(
      (s) =>
        (s.anomalies_count ?? 0) > 0 ||
        (s.pending_exception_minutes ?? 0) > 0 ||
        (s.approved_exception_minutes ?? 0) > 0
    );

  const complet =
    !hasIncomplete &&
    !hasPendingEvent &&
    !hasPendingExc &&
    input.shifts.length > 0;

  return {
    complet,
    incomplet: hasIncomplete,
    en_attente: hasPendingEvent || hasPendingExc,
    corrige: hasCorr,
    exception: hasExc,
  };
}

function primaryStatusFromFlags(
  flags: HorodateurRegistreEmployeeRow["flags"]
): HorodateurRegistreEmployeeRow["statusKey"] {
  if (flags.incomplet) {
    return "incomplet";
  }
  if (flags.en_attente) {
    return "en_attente";
  }
  if (flags.exception) {
    return "exception";
  }
  if (flags.corrige) {
    return "corrige";
  }
  return "complet";
}

function statusLabel(key: HorodateurRegistreEmployeeRow["statusKey"]) {
  switch (key) {
    case "incomplet":
      return "Incomplet";
    case "en_attente":
      return "En attente d approbation";
    case "exception":
      return "Exception";
    case "corrige":
      return "Corrige";
    default:
      return "Complet";
  }
}

function matchesStatusFilter(
  flags: HorodateurRegistreEmployeeRow["flags"],
  filter: RegistreStatusFilter
) {
  if (filter === "all") {
    return true;
  }
  if (filter === "complet") {
    return !flags.incomplet && !flags.en_attente;
  }
  if (filter === "incomplet") {
    return flags.incomplet;
  }
  if (filter === "en_attente") {
    return flags.en_attente;
  }
  if (filter === "corrige") {
    return flags.corrige;
  }
  if (filter === "exception") {
    return flags.exception;
  }
  return true;
}

export async function buildHorodateurRegistre(options: {
  startDate: string;
  endDate: string;
  employeeId?: number | null;
  company: RegistreCompanyParam;
  status: RegistreStatusFilter;
}): Promise<HorodateurRegistrePayload> {
  const start = options.startDate;
  const end = options.endDate;
  if (safeDateOrder(start, end) > 0) {
    throw new Error("Periode invalide: date debut apres date fin.");
  }

  const companyContextForQuery: AccountRequestCompany | null =
    options.company === "all"
      ? null
      : options.company;

  let shifts = await listShiftsInWorkDateRange({
    startWorkDate: start,
    endWorkDate: end,
    employeeId: options.employeeId ?? undefined,
    companyContext: companyContextForQuery,
  });

  let employeeIds = Array.from(new Set(shifts.map((s) => s.employee_id)));
  if (typeof options.employeeId === "number" && options.employeeId > 0) {
    employeeIds = [options.employeeId];
    shifts = shifts.filter((s) => s.employee_id === options.employeeId);
  }

  const eventsAll =
    employeeIds.length > 0
      ? await listHorodateurEventsInWorkDateRange({
          startWorkDate: start,
          endWorkDate: end,
          employeeIds,
        })
      : [];

  const eventsByEmployee = new Map<number, HorodateurPhase1EventRecord[]>();
  for (const e of eventsAll) {
    const id = e.employee_id;
    const list = eventsByEmployee.get(id) ?? [];
    list.push(e);
    eventsByEmployee.set(id, list);
  }

  const profiles = await getEmployeesByIdsForRegistre(employeeIds);
  const profileById = new Map(profiles.map((p) => [p.employeeId, p]));

  const allExceptionsRaw =
    employeeIds.length > 0
      ? await listHorodateurExceptionsForEmployees(employeeIds)
      : [];
  const exceptionsInRange = filterExceptionsInRange(allExceptionsRaw, start, end);

  const exceptionsByEmployee = new Map<number, HorodateurPhase1ExceptionRecord[]>();
  for (const ex of exceptionsInRange) {
    const list = exceptionsByEmployee.get(ex.employee_id) ?? [];
    list.push(ex);
    exceptionsByEmployee.set(ex.employee_id, list);
  }

  const shiftsByEmployee = new Map<number, HorodateurPhase1ShiftRecord[]>();
  for (const s of shifts) {
    const list = shiftsByEmployee.get(s.employee_id) ?? [];
    list.push(s);
    shiftsByEmployee.set(s.employee_id, list);
  }

  const dailyDetails: HorodateurRegistrePayload["dailyDetails"] = {};

  let totalWorkedMinutes = 0;
  let totalApprovedPayableMinutes = 0;
  let totalPendingPayableMinutes = 0;
  let totalExceptionImpactMinutes = 0;
  let titanRefundablePayableMinutes = 0;
  let incompleteShiftCount = 0;

  const exceptionsOut: HorodateurRegistreExceptionDetail[] = exceptionsInRange.map(
    (x) => ({
      id: x.id,
      exceptionType: x.exception_type,
      reasonLabel: x.reason_label,
      details: x.details ?? null,
      impactMinutes: x.impact_minutes ?? 0,
      status: x.status,
      requestedAt: x.requested_at,
      reviewedAt: x.reviewed_at ?? null,
      reviewNote: x.review_note ?? null,
      approvedMinutes:
        typeof x.approved_minutes === "number" ? x.approved_minutes : null,
      sourceEventId: x.source_event_id,
    })
  );

  const pendingApprovals: HorodateurRegistrePendingApproval[] = [];

  const periodLabel =
    start === end ? start : `${start.substring(5)} au ${end.substring(5)}`;

  const rows: HorodateurRegistreEmployeeRow[] = [];

  for (const eid of employeeIds) {
    const empShifts = shiftsByEmployee.get(eid) ?? [];
    const empEvents = eventsByEmployee.get(eid) ?? [];
    const empExceptions = exceptionsByEmployee.get(eid) ?? [];

    if (empShifts.length === 0 && empEvents.length === 0) {
      continue;
    }

    const profile = profileById.get(eid);

    const worked = empShifts.reduce((a, s) => a + (s.worked_minutes ?? 0), 0);
    const breaks = empShifts.reduce((a, s) => a + shiftBreakTotal(s), 0);
    const pendingPay = empShifts
      .filter((s) => s.status === "en_attente")
      .reduce((a, s) => a + Math.max(0, s.payable_minutes ?? 0), 0);
    const approvedPay = empShifts
      .filter((s) => s.status === "valide" || s.status === "ferme")
      .reduce((a, s) => a + Math.max(0, s.payable_minutes ?? 0), 0);
    const titanPay = empShifts
      .filter((s) => s.company_context === "titan_produits_industriels")
      .reduce((a, s) => a + Math.max(0, s.payable_minutes ?? 0), 0);

    const { normal, overtime } = aggregateOvertimeForEmployee(empShifts, profile);

    const flags = computeRowFlags({
      shifts: empShifts,
      events: empEvents,
      exceptions: empExceptions,
    });

    const primary = primaryStatusFromFlags(flags);

    const lastTs = empShifts.reduce<string | null>((best, s) => {
      const cand = s.last_recomputed_at ?? s.updated_at ?? null;
      if (!cand) {
        return best;
      }
      if (!best || cand > best) {
        return cand;
      }
      return best;
    }, null);

    const row: HorodateurRegistreEmployeeRow = {
      employeeId: eid,
      employeeName: profile?.fullName ?? null,
      primaryCompany: profile?.primaryCompany ?? null,
      primaryCompanyLabel: getCompanyLabel(profile?.primaryCompany ?? null),
      periodLabel,
      normalMinutes: normal,
      overtimeMinutes: overtime,
      titanRefundableMinutes: titanPay,
      breakMinutes: breaks,
      exceptionCount: empExceptions.length,
      pendingExceptionMinutes: empShifts.reduce(
        (a, s) => a + (s.pending_exception_minutes ?? 0),
        0
      ),
      statusKey: primary,
      statusLabel: statusLabel(primary),
      flags,
      lastUpdatedAt: lastTs,
    };

    if (!matchesStatusFilter(flags, options.status)) {
      continue;
    }

    rows.push(row);

    totalWorkedMinutes += worked;
    totalApprovedPayableMinutes += approvedPay;
    totalPendingPayableMinutes += pendingPay;
    titanRefundablePayableMinutes += titanPay;

    for (const ex of empExceptions) {
      totalExceptionImpactMinutes += Math.max(0, ex.impact_minutes ?? 0);
    }

    for (const s of empShifts) {
      if (!s.shift_end_at || s.status === "ouvert") {
        incompleteShiftCount += 1;
      }
    }

    dailyDetails[String(eid)] = empShifts.map((s) => ({
      workDate: s.work_date,
      workedMinutes: s.worked_minutes ?? 0,
      payableMinutes: s.payable_minutes ?? 0,
      paidBreakMinutes: s.paid_break_minutes ?? 0,
      unpaidBreakMinutes: s.unpaid_break_minutes ?? 0,
      unpaidLunchMinutes: s.unpaid_lunch_minutes ?? 0,
      companyContext: s.company_context,
      shiftStatus: s.status,
      hasIncompletePunch: !s.shift_end_at || s.status === "ouvert",
    }));

    for (const e of empEvents) {
      if (e.status === "en_attente") {
        pendingApprovals.push({
          kind: "event",
          id: e.id,
          employeeId: eid,
          employeeName: profile?.fullName ?? null,
          label: `Evenement ${e.event_type}`,
          occurredOrRequestedAt: getEventOccurredAt(e) ?? e.created_at ?? null,
        });
      }
    }
    for (const x of empExceptions) {
      if (x.status === "en_attente") {
        pendingApprovals.push({
          kind: "exception",
          id: x.id,
          employeeId: eid,
          employeeName: profile?.fullName ?? null,
          label: x.reason_label,
          occurredOrRequestedAt: x.requested_at,
        });
      }
    }
  }

  rows.sort((a, b) =>
    String(a.employeeName ?? "").localeCompare(String(b.employeeName ?? ""), "fr-CA")
  );

  const activeEmployeesAll = await listActiveEmployees();

  const summary: HorodateurRegistreSummary = {
    totalWorkedMinutes,
    totalApprovedPayableMinutes,
    totalPendingPayableMinutes,
    totalExceptionImpactMinutes,
    titanRefundablePayableMinutes,
    activeEmployeesInPeriod: rows.length,
    incompleteShiftCount,
    periodStart: start,
    periodEnd: end,
  };

  return {
    summary,
    employees: rows,
    dailyDetails,
    exceptions: exceptionsOut,
    pendingApprovals,
    employeeOptions: activeEmployeesAll.map((e) => ({
      id: e.employeeId,
      name: e.fullName,
    })),
    companyOptions: [
      { value: "all", label: "Toutes les compagnies" },
      { value: "oliem_solutions", label: "Oliem Solutions" },
      { value: "titan_produits_industriels", label: "Titan Produits Industriels" },
    ],
    exportPlanned: {
      pdf: false,
      excel: false,
      payroll: false,
      byCompany: false,
      titanRefundable: false,
    },
  };
}

export async function buildHorodateurRegistreEmployeeDetail(options: {
  startDate: string;
  endDate: string;
  employeeId: number;
}): Promise<{
  employee: HorodateurPhase1EmployeeProfile | null;
  events: HorodateurRegistreEventDetail[];
  shifts: HorodateurRegistreDailyRow[];
  exceptions: HorodateurRegistreExceptionDetail[];
  calculationNotes: string[];
}> {
  const employee = await getEmployeeById(options.employeeId);

  const shifts = await listShiftsInWorkDateRange({
    startWorkDate: options.startDate,
    endWorkDate: options.endDate,
    employeeId: options.employeeId,
    companyContext: null,
  });

  const rawEvents = await listHorodateurEventsInWorkDateRange({
    startWorkDate: options.startDate,
    endWorkDate: options.endDate,
    employeeIds: [options.employeeId],
  });

  const exAll = filterExceptionsInRange(
    await listHorodateurExceptionsForEmployees([options.employeeId]),
    options.startDate,
    options.endDate
  );

  const notes: string[] = [
    "Les heures normales et sup sont reparties par semaine civile selon votre cible horaire hebdomadaire (fiche employe ou 40 h par defaut).",
    "Les minutes payables Titan refacturables correspondent aux quarts dont le contexte compagnie est Titan sur la journee.",
  ];

  return {
    employee,
    events: rawEvents.map((ev) =>
      mapEventDetail(ev as HorodateurPhase1EventRecord & Record<string, unknown>)
    ),
    shifts: shifts.map((s) => ({
      workDate: s.work_date,
      workedMinutes: s.worked_minutes ?? 0,
      payableMinutes: s.payable_minutes ?? 0,
      paidBreakMinutes: s.paid_break_minutes ?? 0,
      unpaidBreakMinutes: s.unpaid_break_minutes ?? 0,
      unpaidLunchMinutes: s.unpaid_lunch_minutes ?? 0,
      companyContext: s.company_context,
      shiftStatus: s.status,
      hasIncompletePunch: !s.shift_end_at || s.status === "ouvert",
    })),
    exceptions: exAll.map((x) => ({
      id: x.id,
      exceptionType: x.exception_type,
      reasonLabel: x.reason_label,
      details: x.details ?? null,
      impactMinutes: x.impact_minutes ?? 0,
      status: x.status,
      requestedAt: x.requested_at,
      reviewedAt: x.reviewed_at ?? null,
      reviewNote: x.review_note ?? null,
      approvedMinutes:
        typeof x.approved_minutes === "number" ? x.approved_minutes : null,
      sourceEventId: x.source_event_id,
    })),
    calculationNotes: notes,
  };
}

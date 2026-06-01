import "server-only";

import { getCompanyLabel, type AccountRequestCompany } from "@/app/lib/account-requests.shared";
import type {
  HorodateurPastShiftDetail,
  HorodateurPastShiftRow,
  HorodateurPastShiftsPayload,
  HorodateurPastShiftsSummary,
  HorodateurPastShiftStatusKey,
  PastShiftsStatusFilter,
} from "./past-shifts-types";
import type {
  HorodateurRegistreEventDetail,
  HorodateurRegistreExceptionDetail,
  RegistreCompanyParam,
} from "./registre-types";
import {
  getEmployeesByIdsForRegistre,
  listActiveEmployees,
  listHorodateurEventsInWorkDateRange,
  listHorodateurExceptionsForEmployees,
  listShiftsInWorkDateRange,
} from "./repository";
import { getEventOccurredAt, toCanonicalEventType } from "./rules";
import type {
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
    sourceKind: typeof row.source_kind === "string" ? row.source_kind : null,
    actorRole: typeof row.actor_role === "string" ? row.actor_role : null,
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
    approvedAt: typeof row.approved_at === "string" ? row.approved_at : null,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
  };
}

function mapExceptionDetail(
  x: HorodateurPhase1ExceptionRecord
): HorodateurRegistreExceptionDetail {
  return {
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
  };
}

type ShiftFlags = HorodateurPastShiftRow["flags"];

function computeShiftFlags(input: {
  shift: HorodateurPhase1ShiftRecord;
  events: HorodateurPhase1EventRecord[];
  exceptions: HorodateurPhase1ExceptionRecord[];
}): ShiftFlags {
  const hasIncomplete = !input.shift.shift_end_at || input.shift.status === "ouvert";
  const hasPendingEvent = input.events.some((e) => e.status === "en_attente");
  const hasPendingExc = input.exceptions.some((x) => x.status === "en_attente");
  const hasCorr = input.events.some(
    (e) => e.event_type === "correction" || e.is_manual_correction === true
  );
  const hasExc =
    input.exceptions.length > 0 ||
    (input.shift.anomalies_count ?? 0) > 0 ||
    (input.shift.pending_exception_minutes ?? 0) > 0 ||
    (input.shift.approved_exception_minutes ?? 0) > 0;

  const complet = !hasIncomplete && !hasPendingEvent && !hasPendingExc;

  return {
    complet,
    incomplet: hasIncomplete,
    en_attente: hasPendingEvent || hasPendingExc,
    corrige: hasCorr,
    exception: hasExc,
  };
}

function primaryStatusFromFlags(flags: ShiftFlags): HorodateurPastShiftStatusKey {
  if (flags.incomplet) return "incomplet";
  if (flags.en_attente) return "en_attente";
  if (flags.exception) return "exception";
  if (flags.corrige) return "corrige";
  return "complet";
}

function statusLabel(key: HorodateurPastShiftStatusKey) {
  switch (key) {
    case "incomplet":
      return "Incomplet";
    case "en_attente":
      return "En attente";
    case "exception":
      return "Exception";
    case "corrige":
      return "Corrige";
    default:
      return "Complet";
  }
}

function matchesStatusFilter(flags: ShiftFlags, filter: PastShiftsStatusFilter) {
  if (filter === "all") return true;
  if (filter === "complet") return !flags.incomplet && !flags.en_attente;
  if (filter === "incomplet") return flags.incomplet;
  if (filter === "en_attente") return flags.en_attente;
  if (filter === "corrige") return flags.corrige;
  if (filter === "exception") return flags.exception;
  return true;
}

export async function buildHorodateurPastShifts(options: {
  startDate: string;
  endDate: string;
  employeeId?: number | null;
  company: RegistreCompanyParam;
  status: PastShiftsStatusFilter;
}): Promise<HorodateurPastShiftsPayload> {
  const start = options.startDate;
  const end = options.endDate;
  if (safeDateOrder(start, end) > 0) {
    throw new Error("Periode invalide: date debut apres date fin.");
  }

  const companyContextForQuery: AccountRequestCompany | null =
    options.company === "all" ? null : options.company;

  const shifts = await listShiftsInWorkDateRange({
    startWorkDate: start,
    endWorkDate: end,
    employeeId: options.employeeId ?? undefined,
    companyContext: companyContextForQuery,
  });

  const employeeIds = [...new Set(shifts.map((s) => s.employee_id))];
  const profiles = await getEmployeesByIdsForRegistre(employeeIds);
  const profileById = new Map(profiles.map((p) => [p.employeeId, p]));

  const rawEvents = employeeIds.length
    ? await listHorodateurEventsInWorkDateRange({
        startWorkDate: start,
        endWorkDate: end,
        employeeIds,
      })
    : [];

  const rawExceptionsAll = employeeIds.length
    ? await listHorodateurExceptionsForEmployees(employeeIds)
    : [];

  const eventsByEmployeeDate = new Map<string, HorodateurPhase1EventRecord[]>();
  for (const ev of rawEvents) {
    const wd = ev.work_date ?? null;
    if (!wd) continue;
    const key = `${ev.employee_id}:${wd}`;
    const list = eventsByEmployeeDate.get(key) ?? [];
    list.push(ev);
    eventsByEmployeeDate.set(key, list);
  }

  const exceptionsByEmployeeDate = new Map<string, HorodateurPhase1ExceptionRecord[]>();
  for (const ex of rawExceptionsAll) {
    const wd = exceptionWorkDate(
      ex as HorodateurPhase1ExceptionRecord & {
        source_event?: { work_date?: string };
      }
    );
    if (!wd || safeDateOrder(wd, start) < 0 || safeDateOrder(wd, end) > 0) {
      continue;
    }
    const key = `${ex.employee_id}:${wd}`;
    const list = exceptionsByEmployeeDate.get(key) ?? [];
    list.push(ex);
    exceptionsByEmployeeDate.set(key, list);
  }

  const rows: HorodateurPastShiftRow[] = [];
  const detailsByShiftId: Record<string, HorodateurPastShiftDetail> = {};

  let incompleteShiftCount = 0;
  let pendingApprovalCount = 0;
  let totalWorkedMinutes = 0;
  let totalPayableMinutes = 0;

  for (const shift of shifts) {
    const key = `${shift.employee_id}:${shift.work_date}`;
    const dayEvents = eventsByEmployeeDate.get(key) ?? [];
    const dayExceptions = exceptionsByEmployeeDate.get(key) ?? [];
    const flags = computeShiftFlags({ shift, events: dayEvents, exceptions: dayExceptions });

    if (!matchesStatusFilter(flags, options.status)) {
      continue;
    }

    const profile = profileById.get(shift.employee_id);
    const statusKey = primaryStatusFromFlags(flags);
    const pendingCount =
      dayEvents.filter((e) => e.status === "en_attente").length +
      dayExceptions.filter((x) => x.status === "en_attente").length;

    if (flags.incomplet) incompleteShiftCount += 1;
    pendingApprovalCount += pendingCount;
    totalWorkedMinutes += shift.worked_minutes ?? 0;
    totalPayableMinutes += shift.payable_minutes ?? 0;

    const company = shift.company_context ?? profile?.primaryCompany ?? null;

    rows.push({
      shiftId: shift.id,
      employeeId: shift.employee_id,
      employeeName: profile?.fullName ?? null,
      primaryCompany: company,
      companyLabel: company ? getCompanyLabel(company) : "—",
      workDate: shift.work_date,
      shiftStatus: shift.status,
      statusKey,
      statusLabel: statusLabel(statusKey),
      shiftStartAt: shift.shift_start_at,
      shiftEndAt: shift.shift_end_at,
      workedMinutes: shift.worked_minutes ?? 0,
      payableMinutes: shift.payable_minutes ?? 0,
      pendingExceptionMinutes: shift.pending_exception_minutes ?? 0,
      anomaliesCount: shift.anomalies_count ?? 0,
      exceptionCount: dayExceptions.length,
      pendingApprovalCount: pendingCount,
      eventCount: dayEvents.length,
      flags,
    });

    detailsByShiftId[shift.id] = {
      events: dayEvents
        .map((ev) =>
          mapEventDetail(ev as HorodateurPhase1EventRecord & Record<string, unknown>)
        )
        .sort((a, b) =>
          String(a.occurredAt ?? "").localeCompare(String(b.occurredAt ?? ""))
        ),
      exceptions: dayExceptions.map(mapExceptionDetail).sort((a, b) =>
        b.requestedAt.localeCompare(a.requestedAt)
      ),
    };
  }

  rows.sort((a, b) => {
    const dateCmp = safeDateOrder(b.workDate, a.workDate);
    if (dateCmp !== 0) return dateCmp;
    return String(a.employeeName ?? "").localeCompare(String(b.employeeName ?? ""), "fr-CA");
  });

  const activeEmployeesAll = await listActiveEmployees();

  const summary: HorodateurPastShiftsSummary = {
    periodStart: start,
    periodEnd: end,
    totalShifts: rows.length,
    incompleteShiftCount,
    pendingApprovalCount,
    totalWorkedMinutes,
    totalPayableMinutes,
  };

  return {
    summary,
    shifts: rows,
    detailsByShiftId,
    employeeOptions: activeEmployeesAll.map((e) => ({
      id: e.employeeId,
      name: e.fullName,
    })),
    companyOptions: [
      { value: "all", label: "Toutes les compagnies" },
      { value: "oliem_solutions", label: "Oliem Solutions" },
      { value: "titan_produits_industriels", label: "Titan Produits Industriels" },
    ],
    phase: "read_only_v1",
  };
}

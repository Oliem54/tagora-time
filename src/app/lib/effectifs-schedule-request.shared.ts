import type { EffectifsDepartmentKey } from "./effectifs-departments.shared";
import { normalizeEffectifsDepartmentKey } from "./effectifs-departments.shared";

export const EFFECTIFS_SCHEDULE_REQUEST_TYPES = [
  "day_off",
  "vacation",
  "partial_absence",
  "late_arrival",
  "start_later",
  "leave_early",
  "change_shift",
  "swap_shift",
  "unavailable",
  "available_extra",
  "remote_work",
  "other",
] as const;

export type EffectifsScheduleRequestType =
  (typeof EFFECTIFS_SCHEDULE_REQUEST_TYPES)[number];

export const EFFECTIFS_SCHEDULE_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type EffectifsScheduleRequestStatus =
  (typeof EFFECTIFS_SCHEDULE_REQUEST_STATUSES)[number];

export type EffectifsScheduleRequest = {
  id: string;
  employeeId: number;
  employeeNom: string | null;
  requestType: EffectifsScheduleRequestType;
  requestedDate: string | null;
  requestedStartDate: string | null;
  requestedEndDate: string | null;
  isFullDay: boolean;
  startLocal: string | null;
  endLocal: string | null;
  targetDepartmentKey: EffectifsDepartmentKey | null;
  targetLocation: string | null;
  reason: string | null;
  status: EffectifsScheduleRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeDayOverride =
  | { kind: "exclude" }
  | { kind: "slice"; start: string; end: string };

function normalizeTime(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const t = value.trim().slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(t)) return t;
  return null;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const s = value.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

export function mapScheduleRequestRow(
  raw: Record<string, unknown>,
  employeeNom: string | null
): EffectifsScheduleRequest | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const employeeIdRaw = raw.employee_id ?? raw.employeeId;
  const employeeId =
    typeof employeeIdRaw === "number"
      ? employeeIdRaw
      : Number(employeeIdRaw ?? NaN);
  const requestedDate = normalizeDate(
    typeof raw.requested_date === "string"
      ? raw.requested_date
      : String(raw.requested_date ?? "")
  );
  const requestedStartDate = normalizeDate(
    typeof raw.requested_start_date === "string"
      ? raw.requested_start_date
      : String(raw.requested_start_date ?? "")
  );
  const requestedEndDate = normalizeDate(
    typeof raw.requested_end_date === "string"
      ? raw.requested_end_date
      : String(raw.requested_end_date ?? "")
  );
  const typeRaw =
    typeof raw.request_type === "string" ? raw.request_type.trim() : "";
  const statusRaw = typeof raw.status === "string" ? raw.status.trim() : "";
  if (
    !id ||
    !Number.isFinite(employeeId) ||
    (!requestedDate && !(requestedStartDate && requestedEndDate)) ||
    !EFFECTIFS_SCHEDULE_REQUEST_TYPES.includes(typeRaw as EffectifsScheduleRequestType) ||
    !EFFECTIFS_SCHEDULE_REQUEST_STATUSES.includes(statusRaw as EffectifsScheduleRequestStatus)
  ) {
    return null;
  }

  const tdept = raw.target_department_key;
  const targetDepartmentKey = normalizeEffectifsDepartmentKey(
    tdept == null ? null : String(tdept)
  );

  return {
    id,
    employeeId,
    employeeNom,
    requestType: typeRaw as EffectifsScheduleRequestType,
    requestedDate,
    requestedStartDate,
    requestedEndDate,
    isFullDay: raw.is_full_day === true,
    startLocal: normalizeTime(
      typeof raw.start_time === "string"
        ? raw.start_time
        : String(raw.start_time ?? "")
    ),
    endLocal: normalizeTime(
      typeof raw.end_time === "string" ? raw.end_time : String(raw.end_time ?? "")
    ),
    targetDepartmentKey,
    targetLocation:
      raw.target_location == null
        ? null
        : String(raw.target_location).trim() || null,
    reason:
      typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : null,
    status: statusRaw as EffectifsScheduleRequestStatus,
    reviewedBy:
      typeof raw.reviewed_by === "string" && raw.reviewed_by.trim()
        ? raw.reviewed_by.trim()
        : null,
    reviewedAt:
      typeof raw.reviewed_at === "string" && raw.reviewed_at.trim()
        ? raw.reviewed_at.trim()
        : null,
    reviewNote:
      typeof raw.review_note === "string" && raw.review_note.trim()
        ? raw.review_note.trim()
        : null,
    createdAt:
      typeof raw.created_at === "string"
        ? raw.created_at
        : new Date().toISOString(),
    updatedAt:
      typeof raw.updated_at === "string"
        ? raw.updated_at
        : new Date().toISOString(),
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return h * 60 + m;
}

function maxTime(a: string, b: string): string {
  return toMinutes(a) >= toMinutes(b) ? a : b;
}

function minTime(a: string, b: string): string {
  return toMinutes(a) <= toMinutes(b) ? a : b;
}

/** Construit une plage effective à partir de l’horaire habituel et d’une demande approuvée. */
export function overrideFromApprovedRequest(
  habitualStart: string,
  habitualEnd: string,
  req: EffectifsScheduleRequest
): EmployeeDayOverride | null {
  if (req.status !== "approved") return null;
  switch (req.requestType) {
    case "day_off":
    case "vacation":
    case "unavailable":
    case "partial_absence":
      return { kind: "exclude" };
    case "remote_work":
    case "available_extra":
      return null;
    case "swap_shift":
      return null;
    case "change_shift":
      if (req.startLocal && req.endLocal && req.endLocal > req.startLocal) {
        return { kind: "slice", start: req.startLocal, end: req.endLocal };
      }
      return { kind: "exclude" };
    case "start_later":
    case "late_arrival":
      if (req.startLocal) {
        const s = maxTime(habitualStart, req.startLocal);
        if (toMinutes(s) < toMinutes(habitualEnd)) {
          return { kind: "slice", start: s, end: habitualEnd };
        }
        return { kind: "exclude" };
      }
      return { kind: "exclude" };
    case "leave_early":
      if (req.endLocal) {
        const e = minTime(habitualEnd, req.endLocal);
        if (toMinutes(habitualStart) < toMinutes(e)) {
          return { kind: "slice", start: habitualStart, end: e };
        }
        return { kind: "exclude" };
      }
      return { kind: "exclude" };
    case "other":
      if (req.startLocal && req.endLocal && req.endLocal > req.startLocal) {
        const s = maxTime(habitualStart, req.startLocal);
        const e = minTime(habitualEnd, req.endLocal);
        if (toMinutes(s) < toMinutes(e)) {
          return { kind: "slice", start: s, end: e };
        }
      }
      return { kind: "exclude" };
    default:
      return null;
  }
}

export type DateEmployeeOverrideMap = Map<string, Map<number, EmployeeDayOverride>>;

export function listRequestDates(req: EffectifsScheduleRequest): string[] {
  if (req.requestedDate) return [req.requestedDate];
  if (!req.requestedStartDate || !req.requestedEndDate) return [];
  const out: string[] = [];
  let cur = req.requestedStartDate;
  while (cur <= req.requestedEndDate) {
    out.push(cur);
    const [y, m, d] = cur.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cur = next.toISOString().slice(0, 10);
  }
  return out;
}

export function requestOverlapsWindow(
  req: EffectifsScheduleRequest,
  dateMin: string,
  dateMax: string
): boolean {
  const start = req.requestedStartDate ?? req.requestedDate;
  const end = req.requestedEndDate ?? req.requestedDate;
  if (!start || !end) return false;
  return !(end < dateMin || start > dateMax);
}

export function buildApprovedOverrideMap(
  requests: EffectifsScheduleRequest[],
  getHabitualSlice: (
    employeeId: number,
    weekdayIndex: number
  ) => { active: boolean; start: string | null; end: string | null },
  weekdayIndexForDate: (isoDate: string) => number
): DateEmployeeOverrideMap {
  const out: DateEmployeeOverrideMap = new Map();
  for (const r of requests) {
    if (r.status !== "approved") continue;
    for (const date of listRequestDates(r)) {
      const wd = weekdayIndexForDate(date);
      const slice = getHabitualSlice(r.employeeId, wd);
      if (!slice.active || !slice.start || !slice.end) {
        const m = out.get(date) ?? new Map<number, EmployeeDayOverride>();
        if (
          r.requestType === "day_off" ||
          r.requestType === "vacation" ||
          r.requestType === "unavailable" ||
          r.requestType === "partial_absence" ||
          r.requestType === "change_shift" ||
          r.requestType === "start_later" ||
          r.requestType === "late_arrival" ||
          r.requestType === "leave_early" ||
          r.requestType === "other"
        ) {
          m.set(r.employeeId, { kind: "exclude" });
        }
        out.set(date, m);
        continue;
      }
      const ov = overrideFromApprovedRequest(slice.start, slice.end, r);
      if (!ov) continue;
      const m = out.get(date) ?? new Map<number, EmployeeDayOverride>();
      m.set(r.employeeId, ov);
      out.set(date, m);
    }
  }
  return out;
}

export function scheduleRequestTypeLabel(t: EffectifsScheduleRequestType): string {
  switch (t) {
    case "day_off":
      return "Congé / absence";
    case "vacation":
      return "Vacances";
    case "partial_absence":
      return "Absence partielle";
    case "late_arrival":
      return "Retard";
    case "start_later":
      return "Commencer plus tard";
    case "leave_early":
      return "Terminer plus tôt";
    case "change_shift":
      return "Changement de quart";
    case "swap_shift":
      return "Échange de quart";
    case "unavailable":
      return "Indisponibilité";
    case "available_extra":
      return "Disponibilité supplémentaire";
    case "remote_work":
      return "Télétravail";
    default:
      return "Autre";
  }
}

export function scheduleRequestStatusLabel(s: EffectifsScheduleRequestStatus): string {
  switch (s) {
    case "pending":
      return "En attente";
    case "approved":
      return "Approuvée";
    case "rejected":
      return "Refusée";
    case "cancelled":
      return "Annulée";
    default:
      return s;
  }
}

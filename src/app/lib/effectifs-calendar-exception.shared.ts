import type { EffectifsDepartmentKey } from "./effectifs-departments.shared";
import { normalizeEffectifsDepartmentKey } from "./effectifs-departments.shared";

/** Types de journées spéciales (calendrier effectifs / prévu). */
export const EFFECTIFS_CALENDAR_EXCEPTION_TYPES = [
  "open",
  "closed",
  "holiday",
  "exceptional_closure",
  "reduced_hours",
  "special_hours",
  "inventory",
  "internal_event",
  "other",
] as const;

export type EffectifsCalendarExceptionType =
  (typeof EFFECTIFS_CALENDAR_EXCEPTION_TYPES)[number];

export type EffectifsCalendarException = {
  id: string;
  date: string;
  title: string;
  type: EffectifsCalendarExceptionType;
  isClosed: boolean;
  departmentKey: EffectifsDepartmentKey | null;
  location: string | null;
  startLocal: string | null;
  endLocal: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

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

export function mapCalendarExceptionRow(raw: Record<string, unknown>): EffectifsCalendarException | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const date = normalizeDate(
    typeof raw.date === "string" ? raw.date : String(raw.date ?? "")
  );
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const typeRaw = typeof raw.type === "string" ? raw.type.trim() : "";
  if (!id || !date || !title || !typeRaw) return null;
  if (!EFFECTIFS_CALENDAR_EXCEPTION_TYPES.includes(typeRaw as EffectifsCalendarExceptionType)) {
    return null;
  }
  const type = typeRaw as EffectifsCalendarExceptionType;
  const deptRaw =
    raw.department_key === null || raw.department_key === undefined
      ? null
      : String(raw.department_key);
  const departmentKey = normalizeEffectifsDepartmentKey(deptRaw);
  const location =
    raw.location === null || raw.location === undefined
      ? null
      : String(raw.location).trim() || null;

  const startRaw = raw.start_time ?? raw.start_local;
  const endRaw = raw.end_time ?? raw.end_local;

  return {
    id,
    date,
    title,
    type,
    isClosed: raw.is_closed === true,
    departmentKey: deptRaw && departmentKey ? departmentKey : null,
    location,
    startLocal: normalizeTime(
      typeof startRaw === "string" ? startRaw : String(startRaw ?? "")
    ),
    endLocal: normalizeTime(typeof endRaw === "string" ? endRaw : String(endRaw ?? "")),
    notes:
      typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : null,
    createdBy:
      typeof raw.created_by === "string" && raw.created_by.trim()
        ? raw.created_by.trim()
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

/** Spécificité : plus haut = prioritaire (emplacement > département > entreprise). */
function exceptionSpecificity(ex: EffectifsCalendarException): number {
  let s = 0;
  if (ex.departmentKey) s += 2;
  if (ex.location) s += 1;
  return s;
}

export function resolveCalendarException(
  date: string,
  departmentKey: EffectifsDepartmentKey,
  locationKey: string,
  exceptions: EffectifsCalendarException[]
): EffectifsCalendarException | null {
  const loc = locationKey.trim().toLowerCase();
  const candidates = exceptions.filter((ex) => {
    if (ex.date !== date) return false;
    if (ex.departmentKey && ex.departmentKey !== departmentKey) return false;
    if (ex.location) {
      if (ex.location.trim().toLowerCase() !== loc) return false;
    }
    return true;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const d = exceptionSpecificity(b) - exceptionSpecificity(a);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
  return candidates[0] ?? null;
}

/** Journée sans exigence de couverture (fermé / férié sans plage spéciale). */
export function isCalendarNonWorkingDay(exc: EffectifsCalendarException | null): boolean {
  if (!exc) return false;
  if (exc.isClosed) return true;
  if (exc.type === "closed" || exc.type === "exceptional_closure") return true;
  if (exc.type === "holiday") {
    if (!exc.startLocal || !exc.endLocal) return true;
  }
  return false;
}

/** Utiliser start/end de l’exception comme plage horaire du jour (réduit / spécial / inventaire / autre avec heures). */
export function exceptionDefinesWorkingHours(exc: EffectifsCalendarException | null): boolean {
  if (!exc) return false;
  if (isCalendarNonWorkingDay(exc) && exc.type !== "holiday") return false;
  if (exc.type === "holiday" && exc.startLocal && exc.endLocal) return true;
  return Boolean(
    exc.startLocal &&
      exc.endLocal &&
      (exc.type === "reduced_hours" ||
        exc.type === "special_hours" ||
        exc.type === "inventory" ||
        exc.type === "internal_event" ||
        exc.type === "other" ||
        exc.type === "open")
  );
}

export function intersectTimeWindow(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): { start: string; end: string } | null {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map((x) => Number(x));
    return h * 60 + m;
  };
  const a1 = toMin(startA);
  const a2 = toMin(endA);
  const b1 = toMin(startB);
  const b2 = toMin(endB);
  if ([a1, a2, b1, b2].some((n) => Number.isNaN(n))) return null;
  if (a2 <= a1 || b2 <= b1) return null;
  const s = Math.max(a1, b1);
  const e = Math.min(a2, b2);
  if (e <= s) return null;
  const fmt = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  return { start: fmt(s), end: fmt(e) };
}

/**
 * Fenêtre effective pour une plage de couverture ce jour, après application d’une exception.
 */
export function effectiveCoverageWindowForException(
  windowStart: string,
  windowEnd: string,
  exc: EffectifsCalendarException | null
): { start: string; end: string } | null {
  if (!exc) return { start: windowStart, end: windowEnd };
  if (isCalendarNonWorkingDay(exc)) return null;
  if (exceptionDefinesWorkingHours(exc) && exc.startLocal && exc.endLocal) {
    return intersectTimeWindow(windowStart, windowEnd, exc.startLocal, exc.endLocal);
  }
  return { start: windowStart, end: windowEnd };
}

export function calendarExceptionBadgeLabel(exc: EffectifsCalendarException | null): string | null {
  if (!exc) return null;
  if (exc.isClosed || exc.type === "closed" || exc.type === "exceptional_closure") {
    return "Fermé";
  }
  if (exc.type === "holiday") {
    return "Férié";
  }
  if (exc.type === "reduced_hours") {
    return "Horaire réduit";
  }
  if (
    exc.type === "special_hours" ||
    exc.type === "inventory" ||
    exc.type === "internal_event"
  ) {
    return "Horaire spécial";
  }
  if (exc.type === "other" && exc.startLocal && exc.endLocal) {
    return "Spécial";
  }
  return exc.title.length > 18 ? `${exc.title.slice(0, 18)}…` : exc.title;
}

import "server-only";

import type {
  DirectionEffectifsPayload,
  DirectionEffectifsSummary,
  EffectifsAlert,
  EffectifsCoverageRow,
  EffectifsCoverageWindow,
  EffectifsDeliveryNeed,
  EffectifsDepartment,
  EffectifsEmployee,
  EffectifsEmployeeSchedule,
  EffectifsLocation,
  EffectifsLongTermAbsence,
  EffectifsRegularClosedDay,
  EffectifsScheduleDay,
  EffectifsDepartmentKey,
} from "@/app/lib/effectifs-payload.shared";
import {
  effectiveCoverageWindowForException,
  isCalendarNonWorkingDay,
  resolveCalendarException,
  type EffectifsCalendarException,
} from "@/app/lib/effectifs-calendar-exception.shared";
import {
  buildApprovedOverrideMap,
  type DateEmployeeOverrideMap,
  type EffectifsScheduleRequest,
} from "@/app/lib/effectifs-schedule-request.shared";
import {
  EFFECTIFS_DEPARTMENT_ENTRIES,
  departmentLabelFromKey,
  normalizeEffectifsDepartmentKey,
  sanitizeDepartmentKeyArray,
  sanitizeLocationKeyArray,
} from "@/app/lib/effectifs-departments.shared";
import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  WEEKLY_SCHEDULE_DAY_KEYS,
  type WeeklyScheduleDayKey,
  computeDayNetPlannedHours,
  createWeeklyScheduleFromLegacy,
  sanitizeWeeklyScheduleConfig,
} from "@/app/lib/weekly-schedule";

/** Référence partagée (ordre d’affichage couverture / cartes) — fallback TS. */
export const EFFECTIFS_DEPARTMENTS: EffectifsDepartment[] =
  EFFECTIFS_DEPARTMENT_ENTRIES.map((entry) => ({
    key: entry.key,
    label: entry.label,
    sortOrder: entry.sortOrder,
    companyKey: entry.companyKey,
    locationKey: entry.locationKey,
    active: entry.active,
  }));

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const WEEKDAY_LABELS_LONG = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

export function departmentLabel(key: EffectifsDepartmentKey): string {
  return departmentLabelFromKey(key);
}

function normalizeTime(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const t = value.trim().slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(t)) return t;
  return null;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

function formatMinutesAsTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const a1 = toMinutes(aStart);
  const a2 = toMinutes(aEnd);
  const b1 = toMinutes(bStart);
  const b2 = toMinutes(bEnd);
  if ([a1, a2, b1, b2].some((n) => Number.isNaN(n))) return false;
  if (a2 <= a1 || b2 <= b1) return false;
  return a1 < b2 && b1 < a2;
}

type Clip = { id: number; s: number; e: number };

type Segment = { s: number; e: number; count: number };

function buildSegments(ws: number, we: number, clips: Clip[]): Segment[] {
  const bps = new Set<number>([ws, we]);
  for (const c of clips) {
    if (c.s > ws && c.s < we) bps.add(c.s);
    if (c.e > ws && c.e < we) bps.add(c.e);
  }
  const sorted = [...bps].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (e <= s) continue;
    let count = 0;
    for (const c of clips) {
      if (c.s <= s && c.e >= e) count += 1;
    }
    out.push({ s, e, count });
  }
  return out;
}

function mergeUnderstaffedRanges(
  segments: Segment[],
  required: number
): { s: number; e: number; deficit: number }[] {
  const bad = segments
    .filter((seg) => seg.count < required)
    .map((seg) => ({
      s: seg.s,
      e: seg.e,
      deficit: required - seg.count,
    }));
  if (bad.length === 0) return [];
  bad.sort((a, b) => a.s - b.s);
  const merged: { s: number; e: number; deficit: number }[] = [];
  for (const b of bad) {
    const last = merged[merged.length - 1];
    if (!last || b.s > last.e) {
      merged.push({ ...b });
    } else {
      last.e = Math.max(last.e, b.e);
      last.deficit = Math.max(last.deficit, b.deficit);
    }
  }
  return merged;
}

function manquePhrase(n: number): string {
  if (n <= 0) return "";
  return n === 1 ? "Manque 1 personne" : `Manque ${n} personnes`;
}

function surplusPhrase(n: number): string {
  if (n <= 0) return "";
  return n === 1 ? "Surplus 1 personne" : `Surplus ${n} personnes`;
}

export type ChauffeurEffectifsRow = {
  id: number;
  nom: string | null;
  actif: boolean | null;
  effectifs_department_key?: string | null;
  effectifs_secondary_department_keys?: string[] | null;
  effectifs_primary_location?: string | null;
  effectifs_secondary_locations?: string[] | null;
  can_deliver?: boolean | null;
  default_weekly_hours?: number | string | null;
  schedule_active?: boolean | null;
  primary_company?: string | null;
  can_work_for_oliem_solutions?: boolean | null;
  can_work_for_titan_produits_industriels?: boolean | null;
  weekly_schedule_config?: unknown;
  schedule_start?: string | null;
  schedule_end?: string | null;
  scheduled_work_days?: string[] | null;
  planned_daily_hours?: number | null;
  planned_weekly_hours?: number | null;
  pause_minutes?: number | null;
  break_am_enabled?: boolean | null;
  break_am_time?: string | null;
  break_am_minutes?: number | null;
  break_am_paid?: boolean | null;
  lunch_enabled?: boolean | null;
  lunch_time?: string | null;
  lunch_minutes?: number | null;
  lunch_paid?: boolean | null;
  break_pm_enabled?: boolean | null;
  break_pm_time?: string | null;
  break_pm_minutes?: number | null;
  break_pm_paid?: boolean | null;
};

function dayKeyForWeekdayIndex(index: number): WeeklyScheduleDayKey | null {
  if (index < 0 || index > 6) return null;
  return WEEKLY_SCHEDULE_DAY_KEYS[index];
}

function getEmployeeDayPlannedHours(
  row: ChauffeurEffectifsRow,
  weekdayIndex: number
): number | null {
  const dayKey = dayKeyForWeekdayIndex(weekdayIndex);
  if (!dayKey) return null;
  const parsed = sanitizeWeeklyScheduleConfig(row.weekly_schedule_config);
  if (parsed) {
    const d = parsed.days[dayKey];
    if (!d.active) return null;
    const h = computeDayNetPlannedHours(d);
    return h > 0 ? h : null;
  }
  const legacy = createWeeklyScheduleFromLegacy(row);
  const ld = legacy.days[dayKey];
  if (!ld.active) return null;
  const h = computeDayNetPlannedHours(ld);
  return h > 0 ? h : null;
}

/** Exposé pour la vue employé « Mon horaire » (même logique que la grille direction). */
export function getChauffeurDaySlice(
  row: ChauffeurEffectifsRow,
  weekdayIndex: number
): { active: boolean; start: string | null; end: string | null } {
  const dayKey = dayKeyForWeekdayIndex(weekdayIndex);
  if (!dayKey) {
    return { active: false, start: null, end: null };
  }

  const parsed = sanitizeWeeklyScheduleConfig(row.weekly_schedule_config);
  if (parsed) {
    const d = parsed.days[dayKey];
    return {
      active: d.active,
      start: normalizeTime(d.start),
      end: normalizeTime(d.end),
    };
  }

  const legacy = createWeeklyScheduleFromLegacy(row);
  const ld = legacy.days[dayKey];
  return {
    active: ld.active,
    start: normalizeTime(ld.start),
    end: normalizeTime(ld.end),
  };
}

export function buildEmployeeSchedules(
  rows: ChauffeurEffectifsRow[]
): EffectifsEmployeeSchedule[] {
  return rows.map((row) => {
    const days: EffectifsScheduleDay[] = [];
    for (let w = 0; w < 7; w += 1) {
      const slice = getChauffeurDaySlice(row, w);
      days.push({
        weekday: w,
        weekdayLabel: WEEKDAY_LABELS[w] ?? `J${w}`,
        active: slice.active,
        startLocal: slice.start,
        endLocal: slice.end,
        plannedHours: getEmployeeDayPlannedHours(row, w),
      });
    }
    return { employeeId: row.id, days };
  });
}

function parseNumericNullable(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parsePgTextArray(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function employeeWorksInDepartment(
  emp: EffectifsEmployee,
  deptKey: EffectifsDepartmentKey
): boolean {
  if (emp.departmentKey === deptKey) return true;
  return emp.secondaryDepartmentKeys.includes(deptKey);
}

function readBooleanActive(raw: Record<string, unknown>): boolean {
  if (raw.active === false) return false;
  if (raw.active === true) return true;
  return true;
}

function readMinEmployees(raw: Record<string, unknown>): number {
  if (raw.min_employees !== undefined && raw.min_employees !== null) {
    const v = Number(raw.min_employees);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  if (raw.min_staff !== undefined && raw.min_staff !== null) {
    const v = Number(raw.min_staff);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return 1;
}

export function mapCoverageWindowsFromDb(
  rows: Record<string, unknown>[]
): EffectifsCoverageWindow[] {
  const out: EffectifsCoverageWindow[] = [];
  for (const raw of rows) {
    const id = typeof raw.id === "string" ? raw.id : String(raw.id ?? "");
    const deptRaw =
      (typeof raw.department_key === "string" && raw.department_key) ||
      (typeof raw.department === "string" && raw.department) ||
      null;
    const departmentKey = normalizeEffectifsDepartmentKey(deptRaw);
    if (!departmentKey || !id) continue;

    const weekdayRaw = raw.weekday ?? raw.day_of_week;
    const weekday =
      typeof weekdayRaw === "number" ? weekdayRaw : Number(weekdayRaw ?? NaN);
    if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) continue;

    const startRaw = raw.start_local ?? raw.start_time;
    const endRaw = raw.end_local ?? raw.end_time;
    const startLocal = normalizeTime(
      typeof startRaw === "string" ? startRaw : String(startRaw ?? "")
    );
    const endLocal = normalizeTime(
      typeof endRaw === "string" ? endRaw : String(endRaw ?? "")
    );
    if (!startLocal || !endLocal) continue;

    const minEmployees = readMinEmployees(raw);

    const locKey =
      typeof raw.location_key === "string" && raw.location_key.trim()
        ? raw.location_key.trim()
        : typeof raw.location === "string" && raw.location.trim()
          ? raw.location.trim()
          : "principal";

    const locLabelRaw =
      typeof raw.location_label === "string" && raw.location_label.trim()
        ? raw.location_label.trim()
        : typeof raw.location === "string" && raw.location.trim()
          ? raw.location.trim()
          : "";
    const companyKeyRaw =
      typeof raw.company_key === "string" ? raw.company_key.trim() : "all";
    const companyKey =
      companyKeyRaw === "oliem_solutions" || companyKeyRaw === "titan_produits_industriels"
        ? companyKeyRaw
        : "all";

    out.push({
      id,
      companyKey,
      departmentKey,
      locationKey: locKey,
      locationLabel: locLabelRaw,
      weekday,
      weekdayLabel: WEEKDAY_LABELS[weekday] ?? `J${weekday}`,
      weekdayLabelLong: WEEKDAY_LABELS_LONG[weekday] ?? `Jour ${weekday}`,
      startLocal,
      endLocal,
      minEmployees,
      active: readBooleanActive(raw),
    });
  }
  return out;
}

function uniqueLocations(windows: EffectifsCoverageWindow[]): EffectifsLocation[] {
  const seen = new Set<string>();
  const out: EffectifsLocation[] = [];
  for (const w of windows) {
    const compound = `${w.departmentKey}::${w.locationKey}`;
    if (seen.has(compound)) continue;
    seen.add(compound);
    const locLabel = w.locationLabel?.trim() || w.locationKey || "Emplacement";
    out.push({
      key: compound,
      label: `${departmentLabel(w.departmentKey)} — ${locLabel}`,
    });
  }
  return out;
}

function collectClipsForWindow(
  win: EffectifsCoverageWindow,
  employees: EffectifsEmployee[],
  scheduleById: Map<number, ChauffeurEffectifsRow>,
  options?: {
    referenceDateIso?: string;
    overrideMap?: DateEmployeeOverrideMap;
    /** Employés en congé prolongé actif ce jour — exclus de la couverture. */
    longLeaveExcludedIds?: Set<number>;
  }
): { clips: Clip[]; scheduledEmployees: { id: number; nom: string | null }[] } {
  const ws = toMinutes(win.startLocal);
  const we = toMinutes(win.endLocal);
  const clips: Clip[] = [];
  const seenId = new Set<number>();

  if (Number.isNaN(ws) || Number.isNaN(we) || we <= ws) {
    return { clips, scheduledEmployees: [] };
  }

  const dayOverrides =
    options?.referenceDateIso && options.overrideMap
      ? options.overrideMap.get(options.referenceDateIso)
      : undefined;

  for (const emp of employees) {
    if (options?.longLeaveExcludedIds?.has(emp.id)) continue;
    if (!employeeWorksInDepartment(emp, win.departmentKey)) continue;
    if (!emp.scheduleActive) continue;
    const row = scheduleById.get(emp.id);
    if (!row) continue;

    const ov = dayOverrides?.get(emp.id);
    if (ov?.kind === "exclude") continue;

    let slice = getChauffeurDaySlice(row, win.weekday);
    if (ov?.kind === "slice") {
      slice = {
        active: true,
        start: ov.start,
        end: ov.end,
      };
    }
    if (
      !slice.active ||
      !slice.start ||
      !slice.end ||
      !rangesOverlap(slice.start, slice.end, win.startLocal, win.endLocal)
    ) {
      continue;
    }
    const es = toMinutes(slice.start);
    const ee = toMinutes(slice.end);
    if (Number.isNaN(es) || Number.isNaN(ee) || ee <= es) continue;
    const a = Math.max(es, ws);
    const b = Math.min(ee, we);
    if (b > a) {
      clips.push({ id: emp.id, s: a, e: b });
      if (!seenId.has(emp.id)) {
        seenId.add(emp.id);
      }
    }
  }

  const scheduledEmployees = employees
    .filter((e) => seenId.has(e.id))
    .map((e) => ({ id: e.id, nom: e.nom }));

  return { clips, scheduledEmployees };
}

function habitualScheduleWarningsForWindow(
  win: EffectifsCoverageWindow,
  scheduledEmployees: { id: number; nom: string | null }[],
  scheduleById: Map<number, ChauffeurEffectifsRow>
): string[] {
  const messages: string[] = [];
  for (const e of scheduledEmployees) {
    const row = scheduleById.get(e.id);
    if (!row) continue;
    const slice = getChauffeurDaySlice(row, win.weekday);
    if (!slice.active || !slice.start || !slice.end) continue;
    const label = e.nom?.trim() || `#${e.id}`;
    if (win.startLocal < slice.start) {
      messages.push(
        `${label} : plage avant horaire habituel (${slice.start}).`
      );
    }
    if (win.endLocal > slice.end) {
      messages.push(
        `${label} : plage apres fin habituelle (${slice.end}).`
      );
    }
  }
  return messages;
}

function evaluateActiveWindow(
  win: EffectifsCoverageWindow,
  employees: EffectifsEmployee[],
  scheduleById: Map<number, ChauffeurEffectifsRow>,
  weekStart: Date,
  overrideMap?: DateEmployeeOverrideMap,
  longLeaveByDate?: Map<string, Set<number>>
): EffectifsCoverageRow {
  const referenceDate = formatIsoDateLocal(addDaysLocal(weekStart, win.weekday));
  const clipOpts = {
    referenceDateIso: referenceDate,
    overrideMap,
    longLeaveExcludedIds: longLeaveByDate?.get(referenceDate) ?? new Set<number>(),
  };
  const required = win.minEmployees;

  if (required === 0) {
    const { scheduledEmployees } = collectClipsForWindow(
      win,
      employees,
      scheduleById,
      clipOpts
    );
    return {
      windowId: win.id,
      departmentKey: win.departmentKey,
      departmentLabel: departmentLabel(win.departmentKey),
      locationKey: win.locationKey,
      locationLabel: win.locationLabel || win.locationKey,
      weekday: win.weekday,
      weekdayLabel: win.weekdayLabel,
      referenceDate,
      startLocal: win.startLocal,
      endLocal: win.endLocal,
      required,
      staffed: scheduledEmployees.length,
      minSegmentStaff: 0,
      coveragePrimary: "Aucune couverture requise",
      coverageSecondary: null,
      surplus: 0,
      coverageCategory: "aucune_requise",
      scheduledEmployees,
      habitualScheduleWarnings: habitualScheduleWarningsForWindow(
        win,
        scheduledEmployees,
        scheduleById
      ),
    };
  }

  const ws = toMinutes(win.startLocal);
  const we = toMinutes(win.endLocal);
  const { clips, scheduledEmployees } = collectClipsForWindow(
    win,
    employees,
    scheduleById,
    clipOpts
  );
  const staffed = scheduledEmployees.length;

  if (clips.length === 0) {
    return {
      windowId: win.id,
      departmentKey: win.departmentKey,
      departmentLabel: departmentLabel(win.departmentKey),
      locationKey: win.locationKey,
      locationLabel: win.locationLabel || win.locationKey,
      weekday: win.weekday,
      weekdayLabel: win.weekdayLabel,
      referenceDate,
      startLocal: win.startLocal,
      endLocal: win.endLocal,
      required,
      staffed: 0,
      minSegmentStaff: 0,
      coveragePrimary: manquePhrase(required),
      coverageSecondary: null,
      surplus: 0,
      coverageCategory: "manque",
      scheduledEmployees: [],
      habitualScheduleWarnings: [],
    };
  }

  const segments = buildSegments(ws, we, clips);
  const minSegmentStaff = segments.length
    ? Math.min(...segments.map((s) => s.count))
    : 0;
  const distinct = staffed;

  if (minSegmentStaff >= required) {
    if (distinct > required) {
      const sur = distinct - required;
      return {
        windowId: win.id,
        departmentKey: win.departmentKey,
        departmentLabel: departmentLabel(win.departmentKey),
        locationKey: win.locationKey,
        locationLabel: win.locationLabel || win.locationKey,
        weekday: win.weekday,
        weekdayLabel: win.weekdayLabel,
        referenceDate,
        startLocal: win.startLocal,
        endLocal: win.endLocal,
        required,
        staffed: distinct,
        minSegmentStaff,
        coveragePrimary: surplusPhrase(sur),
        coverageSecondary: null,
        surplus: sur,
        coverageCategory: "surplus",
        scheduledEmployees,
        habitualScheduleWarnings: habitualScheduleWarningsForWindow(
          win,
          scheduledEmployees,
          scheduleById
        ),
      };
    }
    return {
      windowId: win.id,
      departmentKey: win.departmentKey,
      departmentLabel: departmentLabel(win.departmentKey),
      locationKey: win.locationKey,
      locationLabel: win.locationLabel || win.locationKey,
      weekday: win.weekday,
      weekdayLabel: win.weekdayLabel,
      referenceDate,
      startLocal: win.startLocal,
      endLocal: win.endLocal,
      required,
      staffed: distinct,
      minSegmentStaff,
      coveragePrimary: "Couvert",
      coverageSecondary: null,
      surplus: 0,
      coverageCategory: "couvert",
      scheduledEmployees,
      habitualScheduleWarnings: habitualScheduleWarningsForWindow(
        win,
        scheduledEmployees,
        scheduleById
      ),
    };
  }

  if (minSegmentStaff === 0) {
    return {
      windowId: win.id,
      departmentKey: win.departmentKey,
      departmentLabel: departmentLabel(win.departmentKey),
      locationKey: win.locationKey,
      locationLabel: win.locationLabel || win.locationKey,
      weekday: win.weekday,
      weekdayLabel: win.weekdayLabel,
      referenceDate,
      startLocal: win.startLocal,
      endLocal: win.endLocal,
      required,
      staffed: distinct,
      minSegmentStaff,
      coveragePrimary: manquePhrase(required),
      coverageSecondary: null,
      surplus: 0,
      coverageCategory: "manque",
      scheduledEmployees,
      habitualScheduleWarnings: habitualScheduleWarningsForWindow(
        win,
        scheduledEmployees,
        scheduleById
      ),
    };
  }

  const merged = mergeUnderstaffedRanges(segments, required);
  const first = merged[0];
  let secondary: string | null = null;
  if (first) {
    secondary = `${manquePhrase(first.deficit)} de ${formatMinutesAsTime(first.s)} à ${formatMinutesAsTime(first.e)}`;
  }
  if (!secondary) {
    secondary = `Couverture partielle sur la plage ${win.startLocal}–${win.endLocal}`;
  }

  return {
    windowId: win.id,
    departmentKey: win.departmentKey,
    departmentLabel: departmentLabel(win.departmentKey),
    locationKey: win.locationKey,
    locationLabel: win.locationLabel || win.locationKey,
    weekday: win.weekday,
    weekdayLabel: win.weekdayLabel,
    referenceDate,
    startLocal: win.startLocal,
    endLocal: win.endLocal,
    required,
    staffed: distinct,
    minSegmentStaff,
    coveragePrimary: "Couverture partielle",
    coverageSecondary: secondary,
    surplus: 0,
    coverageCategory: "partielle",
    scheduledEmployees,
    habitualScheduleWarnings: habitualScheduleWarningsForWindow(
      win,
      scheduledEmployees,
      scheduleById
    ),
  };
}

function applyCalendarExceptionToCoverageRow(
  row: EffectifsCoverageRow,
  win: EffectifsCoverageWindow,
  employees: EffectifsEmployee[],
  scheduleById: Map<number, ChauffeurEffectifsRow>,
  weekStart: Date,
  exceptions: EffectifsCalendarException[],
  overrideMap?: DateEmployeeOverrideMap,
  longLeaveByDate?: Map<string, Set<number>>
): EffectifsCoverageRow {
  const exc = resolveCalendarException(
    row.referenceDate,
    win.departmentKey,
    win.locationKey,
    exceptions
  );
  if (exc && isCalendarNonWorkingDay(exc)) {
    return {
      ...row,
      required: 0,
      staffed: 0,
      minSegmentStaff: 0,
      coveragePrimary: exc.type === "holiday" ? "Férié" : "Fermé",
      coverageSecondary: exc.title,
      surplus: 0,
      coverageCategory: "aucune_requise",
      scheduledEmployees: [],
      habitualScheduleWarnings: [],
    };
  }
  if (!exc) return row;
  const eff = effectiveCoverageWindowForException(win.startLocal, win.endLocal, exc);
  if (!eff) {
    return {
      ...row,
      required: 0,
      staffed: 0,
      minSegmentStaff: 0,
      coveragePrimary: "Fermé",
      coverageSecondary: exc.title,
      surplus: 0,
      coverageCategory: "aucune_requise",
      scheduledEmployees: [],
      habitualScheduleWarnings: [],
    };
  }
  if (eff.start === win.startLocal && eff.end === win.endLocal) {
    return row;
  }
  const winAdj: EffectifsCoverageWindow = {
    ...win,
    startLocal: eff.start,
    endLocal: eff.end,
  };
  return evaluateActiveWindow(winAdj, employees, scheduleById, weekStart, overrideMap, longLeaveByDate);
}

export function computeCoverageAndAlerts(
  windows: EffectifsCoverageWindow[],
  employees: EffectifsEmployee[],
  chauffeurRows: ChauffeurEffectifsRow[],
  weekStart: Date,
  options?: {
    calendarExceptions?: EffectifsCalendarException[];
    scheduleRequests?: EffectifsScheduleRequest[];
    regularClosedDays?: EffectifsRegularClosedDay[];
    /** Par date ISO : IDs employés en congé prolongé (exclus du « staffed »). */
    longLeaveByDate?: Map<string, Set<number>>;
  }
): { coverage: EffectifsCoverageRow[]; alerts: EffectifsAlert[] } {
  const coverage: EffectifsCoverageRow[] = [];
  const alerts: EffectifsAlert[] = [];
  const scheduleById = new Map<number, ChauffeurEffectifsRow>();
  for (const c of chauffeurRows) {
    scheduleById.set(c.id, c);
  }

  const exceptions = options?.calendarExceptions ?? [];
  const scheduleRequests = options?.scheduleRequests ?? [];
  const regularClosedDays = options?.regularClosedDays ?? [];
  const getHabitualSlice = (employeeId: number, weekdayIndex: number) => {
    const row = scheduleById.get(employeeId);
    if (!row) return { active: false, start: null, end: null };
    return getChauffeurDaySlice(row, weekdayIndex);
  };
  const weekdayMon0FromIso = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    const js = d.getDay();
    return js === 0 ? 6 : js - 1;
  };
  const overrideMap = buildApprovedOverrideMap(
    scheduleRequests,
    getHabitualSlice,
    weekdayMon0FromIso
  );

  const longLeaveByDate = options?.longLeaveByDate;

  for (const win of windows) {
    const referenceIso = formatIsoDateLocal(addDaysLocal(weekStart, win.weekday));
    if (!win.active) {
      coverage.push({
        windowId: win.id,
        departmentKey: win.departmentKey,
        departmentLabel: departmentLabel(win.departmentKey),
        locationKey: win.locationKey,
        locationLabel: win.locationLabel || win.locationKey,
        weekday: win.weekday,
        weekdayLabel: win.weekdayLabel,
        referenceDate: referenceIso,
        startLocal: win.startLocal,
        endLocal: win.endLocal,
        required: win.minEmployees,
        staffed: 0,
        minSegmentStaff: 0,
        coveragePrimary: "Plage inactive",
        coverageSecondary: "Non prise en compte dans le calcul de couverture.",
        surplus: 0,
        coverageCategory: "inactive",
        scheduledEmployees: [],
        habitualScheduleWarnings: [],
      });
      continue;
    }

    let row = evaluateActiveWindow(win, employees, scheduleById, weekStart, overrideMap, longLeaveByDate);
    const hasCalendarException = Boolean(
      resolveCalendarException(
        row.referenceDate,
        win.departmentKey,
        win.locationKey,
        exceptions
      )
    );
    row = applyCalendarExceptionToCoverageRow(
      row,
      win,
      employees,
      scheduleById,
      weekStart,
      exceptions,
      overrideMap,
      longLeaveByDate
    );
    if (!hasCalendarException) {
      const regularClosed = resolveRegularClosedMatch(win.weekday, win, regularClosedDays);
      if (regularClosed) {
        const levelLabel =
          regularClosed.scope === "location"
            ? "Emplacement"
            : regularClosed.scope === "department"
              ? "Département"
              : regularClosed.companyKey === "all"
                ? "Toute l’entreprise"
                : "Compagnie";
        const companyLabel =
          regularClosed.companyKey === "all"
            ? "Toutes"
            : regularClosed.companyKey === "oliem_solutions"
              ? "Oliem"
              : "Titan";
        row = {
          ...row,
          required: 0,
          staffed: 0,
          minSegmentStaff: 0,
          coveragePrimary: "Fermé",
          coverageSecondary: `Fermé régulier · Niveau: ${levelLabel} · Compagnie: ${companyLabel}`,
          surplus: 0,
          coverageCategory: "aucune_requise",
          scheduledEmployees: [],
          habitualScheduleWarnings: [],
        };
      }
    }
    coverage.push(row);

    if (row.coverageCategory === "manque") {
      alerts.push({
        level: row.staffed === 0 ? "critical" : "warning",
        message: `${departmentLabel(win.departmentKey)} — ${win.weekdayLabelLong} ${win.startLocal}–${win.endLocal}: ${row.coveragePrimary}.`,
        departmentKey: win.departmentKey,
        windowId: win.id,
        weekday: win.weekday,
      });
    } else if (row.coverageCategory === "partielle") {
      alerts.push({
        level: "warning",
        message: `${departmentLabel(win.departmentKey)} — ${win.weekdayLabelLong} ${win.startLocal}–${win.endLocal}: ${row.coveragePrimary}${row.coverageSecondary ? ` ${row.coverageSecondary}` : ""}.`,
        departmentKey: win.departmentKey,
        windowId: win.id,
        weekday: win.weekday,
      });
    }
  }

  coverage.sort((a, b) => {
    const dk = a.departmentKey.localeCompare(b.departmentKey);
    if (dk !== 0) return dk;
    if (a.weekday !== b.weekday) return a.weekday - b.weekday;
    return a.startLocal.localeCompare(b.startLocal);
  });

  return { coverage, alerts };
}

function computePlanningMismatchDepartments(
  row: ChauffeurEffectifsRow,
  assigned: Set<EffectifsDepartmentKey>,
  windows: EffectifsCoverageWindow[]
): EffectifsDepartmentKey[] {
  const out: EffectifsDepartmentKey[] = [];
  const seen = new Set<string>();
  for (const win of windows) {
    if (!win.active) continue;
    if (assigned.has(win.departmentKey)) continue;
    const slice = getChauffeurDaySlice(row, win.weekday);
    if (!slice.active || !slice.start || !slice.end) continue;
    if (!rangesOverlap(slice.start, slice.end, win.startLocal, win.endLocal)) {
      continue;
    }
    if (!seen.has(win.departmentKey)) {
      seen.add(win.departmentKey);
      out.push(win.departmentKey);
    }
  }
  return out;
}

export function attachPlanningMismatches(
  employees: EffectifsEmployee[],
  chauffeurRows: ChauffeurEffectifsRow[],
  windows: EffectifsCoverageWindow[]
): EffectifsEmployee[] {
  const rowById = new Map(chauffeurRows.map((r) => [r.id, r]));
  return employees.map((emp) => {
    const row = rowById.get(emp.id);
    const assigned = new Set<EffectifsDepartmentKey>();
    if (emp.departmentKey) assigned.add(emp.departmentKey);
    for (const k of emp.secondaryDepartmentKeys) assigned.add(k);
    const planningMismatchDepartments =
      emp.scheduleActive && row
        ? computePlanningMismatchDepartments(row, assigned, windows)
        : [];
    return { ...emp, planningMismatchDepartments };
  });
}

function normalizePrimaryCompany(
  raw: unknown
): AccountRequestCompany | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (
    trimmed === "oliem_solutions" ||
    trimmed === "titan_produits_industriels"
  ) {
    return trimmed;
  }
  return null;
}

export function mapEmployees(rows: ChauffeurEffectifsRow[]): EffectifsEmployee[] {
  return rows
    .filter((r) => r.actif !== false)
    .map((r) => {
      const primary = normalizeEffectifsDepartmentKey(
        r.effectifs_department_key ?? null
      );
      const secondaryRaw = parsePgTextArray(r.effectifs_secondary_department_keys);
      const secondaryDepartmentKeys = sanitizeDepartmentKeyArray(
        secondaryRaw ?? []
      ).filter((k) => k !== primary);
      const locSecondaryRaw = parsePgTextArray(r.effectifs_secondary_locations);
      const canWorkForOliem = r.can_work_for_oliem_solutions === true;
      const canWorkForTitan = r.can_work_for_titan_produits_industriels === true;
      return {
        id: r.id,
        nom: r.nom,
        departmentKey: primary,
        secondaryDepartmentKeys,
        primaryLocationKey:
          typeof r.effectifs_primary_location === "string" &&
          r.effectifs_primary_location.trim()
            ? r.effectifs_primary_location.trim()
            : null,
        secondaryLocationKeys: sanitizeLocationKeyArray(locSecondaryRaw ?? []),
        canDeliver: r.can_deliver === true,
        defaultWeeklyHours: parseNumericNullable(r.default_weekly_hours),
        scheduleActive: r.schedule_active !== false,
        actif: r.actif !== false,
        planningMismatchDepartments: [],
        primaryCompany: normalizePrimaryCompany(r.primary_company ?? null),
        canWorkForOliem,
        canWorkForTitan,
        isMultiCompany: canWorkForOliem && canWorkForTitan,
      };
    });
}

export function startOfWeekMondayLocal(reference: Date): Date {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  const jsDay = d.getDay();
  const offset = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + offset);
  return d;
}

export function addDaysLocal(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildDeliveryNeedsFromRows(
  rows: { date_livraison: string | null }[],
  horizonDays: number
): EffectifsDeliveryNeed[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts = new Map<string, number>();
  const end = addDaysLocal(today, horizonDays);

  for (const r of rows) {
    if (!r.date_livraison) continue;
    const d = new Date(`${r.date_livraison}T12:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    if (d < today || d > end) continue;
    const key = r.date_livraison;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function isCompanyWideClosedDay(
  iso: string,
  exceptions: EffectifsCalendarException[]
): boolean {
  return exceptions.some(
    (e) =>
      e.date === iso &&
      e.departmentKey === null &&
      isCalendarNonWorkingDay(e)
  );
}

function regularClosedCompanyMatches(
  ruleCompany: EffectifsRegularClosedDay["companyKey"],
  windowCompany: EffectifsCoverageWindow["companyKey"]
): boolean {
  return ruleCompany === "all" || ruleCompany === windowCompany;
}

function resolveRegularClosedMatch(
  ruleDay: number,
  win: EffectifsCoverageWindow,
  rules: EffectifsRegularClosedDay[]
): EffectifsRegularClosedDay | null {
  const activeRules = rules.filter((r) => r.active && r.dayOfWeek === ruleDay);
  const matchByScope = (
    scope: EffectifsRegularClosedDay["scope"],
    predicate: (r: EffectifsRegularClosedDay) => boolean
  ) =>
    activeRules.find(
      (r) =>
        r.scope === scope &&
        regularClosedCompanyMatches(r.companyKey, win.companyKey) &&
        predicate(r)
    ) ?? null;

  const locationMatch =
    matchByScope(
      "location",
      (r) => Boolean(r.locationKey && r.locationKey === win.locationKey)
    ) ??
    matchByScope("location", (r) => Boolean(r.locationKey && r.locationKey === "all"));
  if (locationMatch) return locationMatch;

  const deptMatch = matchByScope(
    "department",
    (r) => Boolean(r.departmentKey && r.departmentKey === win.departmentKey)
  );
  if (deptMatch) return deptMatch;

  const companySpecificMatch = activeRules.find(
    (r) =>
      r.scope === "company" &&
      r.companyKey === win.companyKey &&
      r.departmentKey == null &&
      r.locationKey == null
  );
  if (companySpecificMatch) return companySpecificMatch;

  const companyGlobalMatch = activeRules.find(
    (r) =>
      r.scope === "company" &&
      r.companyKey === "all" &&
      r.departmentKey == null &&
      r.locationKey == null
  );
  return companyGlobalMatch ?? null;
}

export function computeDirectionEffectifsSummary(input: {
  calendarExceptions: EffectifsCalendarException[];
  scheduleRequests: EffectifsScheduleRequest[];
  regularClosedDays: EffectifsRegularClosedDay[];
  referenceDate: Date;
  coverage: EffectifsCoverageRow[];
  deliveryNeeds: EffectifsDeliveryNeed[];
}): DirectionEffectifsSummary {
  const y = input.referenceDate.getFullYear();
  const m = input.referenceDate.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  let closedDaysThisMonth = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dt = new Date(`${iso}T12:00:00`);
    const js = dt.getDay();
    const wd = js === 0 ? 6 : js - 1;
    const regularClosed = input.regularClosedDays.some(
      (d) =>
        d.active &&
        d.scope === "company" &&
        d.dayOfWeek === wd &&
        d.departmentKey == null &&
        d.locationKey == null
    );
    if (regularClosed || isCompanyWideClosedDay(iso, input.calendarExceptions)) {
      closedDaysThisMonth += 1;
    }
  }

  const pending = input.scheduleRequests.filter((r) => r.status === "pending");
  const pendingScheduleRequests = pending.length;
  const criticalPendingRequests = pending.filter((r) =>
    ["day_off", "unavailable", "leave_early", "start_later"].includes(r.requestType)
  ).length;

  const uncoveredWindowSlotsMonth = input.coverage.filter(
    (c) => c.coverageCategory === "manque"
  ).length;

  let deliveryWithoutDriverEstimate = 0;
  for (const d of input.deliveryNeeds) {
    if (d.count === 0) continue;
    const dDate = new Date(`${d.date}T12:00:00`);
    const js = dDate.getDay();
    const wd = js === 0 ? 6 : js - 1;
    const rows = input.coverage.filter(
      (c) =>
        c.departmentKey === "livreur" &&
        c.weekday === wd &&
        (c.coverageCategory === "manque" || c.coverageCategory === "partielle")
    );
    if (rows.length > 0) {
      deliveryWithoutDriverEstimate += d.count;
    }
  }

  const weekStart = startOfWeekMondayLocal(input.referenceDate);
  const weekStartIso = formatIsoDateLocal(weekStart);
  const weekEndIso = formatIsoDateLocal(addDaysLocal(weekStart, 6));
  const approvedChangesThisWeek = input.scheduleRequests.filter((r) => {
    if (r.status !== "approved" || !r.reviewedAt) return false;
    const day = r.reviewedAt.slice(0, 10);
    return day >= weekStartIso && day <= weekEndIso;
  }).length;

  return {
    closedDaysThisMonth,
    pendingScheduleRequests,
    criticalPendingRequests,
    uncoveredWindowSlotsMonth,
    deliveryWithoutDriverEstimate,
    approvedChangesThisWeek,
  };
}

export function buildDirectionEffectifsPayload(input: {
  coverageWindows: EffectifsCoverageWindow[];
  coverageWindowsConfigured: boolean;
  windowsLoadError: string | null;
  chauffeurRows: ChauffeurEffectifsRow[];
  deliveryRows: { date_livraison: string | null }[];
  referenceDate: Date;
  canEditCoverageWindows: boolean;
  calendarExceptions?: EffectifsCalendarException[];
  scheduleRequests?: EffectifsScheduleRequest[];
  regularClosedDays?: EffectifsRegularClosedDay[];
  linkedChauffeurId?: number | null;
  /** Répertoire des départements (depuis `effectifs_departments`) — fallback TS si absent/vide. */
  departments?: EffectifsDepartment[];
  longLeaveByDate?: Map<string, Set<number>>;
  longTermAbsences?: EffectifsLongTermAbsence[];
}): DirectionEffectifsPayload {
  const weekStart = startOfWeekMondayLocal(input.referenceDate);
  const employeesBase = mapEmployees(input.chauffeurRows);
  const employees = attachPlanningMismatches(
    employeesBase,
    input.chauffeurRows,
    input.coverageWindows
  );
  const schedules = buildEmployeeSchedules(input.chauffeurRows);
  const calendarExceptions = input.calendarExceptions ?? [];
  const scheduleRequests = input.scheduleRequests ?? [];
  const regularClosedDays = input.regularClosedDays ?? [];
  const { coverage, alerts } = computeCoverageAndAlerts(
    input.coverageWindows,
    employees,
    input.chauffeurRows,
    weekStart,
    {
      calendarExceptions,
      scheduleRequests,
      regularClosedDays,
      longLeaveByDate: input.longLeaveByDate,
    }
  );

  const locations = uniqueLocations(input.coverageWindows);
  const deliveryNeeds = buildDeliveryNeedsFromRows(input.deliveryRows, 14);

  const effectifsSummary = computeDirectionEffectifsSummary({
    calendarExceptions,
    scheduleRequests,
    regularClosedDays,
    referenceDate: input.referenceDate,
    coverage,
    deliveryNeeds,
  });

  const resolvedDepartments =
    input.departments && input.departments.length > 0
      ? [...input.departments]
      : [...EFFECTIFS_DEPARTMENTS];

  return {
    departments: resolvedDepartments.sort((a, b) => a.sortOrder - b.sortOrder),
    locations,
    coverageWindows: input.coverageWindows,
    coverage,
    alerts,
    employees,
    schedules,
    deliveryNeeds,
    calendarExceptions,
    scheduleRequests,
    regularClosedDays,
    effectifsSummary,
    longTermAbsences: input.longTermAbsences ?? [],
    meta: {
      coverageWindowsConfigured: input.coverageWindowsConfigured,
      referenceWeekStart: formatIsoDateLocal(weekStart),
      windowsLoadError: input.windowsLoadError,
      canEditCoverageWindows: input.canEditCoverageWindows,
      linkedChauffeurId: input.linkedChauffeurId ?? null,
      plannedTimeReferenceNote:
        "Calendrier effectifs = horaire prévu. Horodateur = temps réel. Registre = comparaison prévu / réel.",
    },
  };
}

import type {
  DeptDayCellDisplayVariant,
  DeptDayCellModel,
  EffectifsCoverageCategory,
  EffectifsCoverageWindow,
  EffectifsEmployee,
  EffectifsEmployeeSchedule,
} from "@/app/lib/effectifs-payload.shared";
import type { EffectifsDepartmentKey } from "@/app/lib/effectifs-departments.shared";
import {
  calendarExceptionBadgeLabel,
  effectiveCoverageWindowForException,
  isCalendarNonWorkingDay,
  resolveCalendarException,
  exceptionDefinesWorkingHours,
  type EffectifsCalendarException,
} from "@/app/lib/effectifs-calendar-exception.shared";
import type { DateEmployeeOverrideMap } from "@/app/lib/effectifs-schedule-request.shared";
function effectifsWeekdayIndexFromIso(iso: string): number {
  const d = new Date(`${iso}T12:00:00`);
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

type Clip = { id: number; s: number; e: number };
type Segment = { s: number; e: number; count: number };

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

function employeeWorksInDepartment(
  emp: EffectifsEmployee,
  deptKey: EffectifsDepartmentKey
): boolean {
  if (emp.departmentKey === deptKey) return true;
  return emp.secondaryDepartmentKeys.includes(deptKey);
}

function getScheduleSlice(
  schedules: EffectifsEmployeeSchedule[],
  employeeId: number,
  weekdayIndex: number
): { active: boolean; start: string | null; end: string | null } {
  const sched = schedules.find((s) => s.employeeId === employeeId);
  if (!sched) return { active: false, start: null, end: null };
  const d = sched.days.find((x) => x.weekday === weekdayIndex);
  if (!d) return { active: false, start: null, end: null };
  return {
    active: d.active,
    start: d.startLocal,
    end: d.endLocal,
  };
}

function collectPlannedClips(
  winStart: string,
  winEnd: string,
  weekdayIndex: number,
  dateIso: string,
  departmentKey: EffectifsDepartmentKey,
  employees: EffectifsEmployee[],
  schedules: EffectifsEmployeeSchedule[],
  overrideMap: DateEmployeeOverrideMap | undefined
): { clips: Clip[]; scheduledIds: Set<number> } {
  const ws = toMinutes(winStart);
  const we = toMinutes(winEnd);
  const clips: Clip[] = [];
  const scheduledIds = new Set<number>();
  if (Number.isNaN(ws) || Number.isNaN(we) || we <= ws) {
    return { clips, scheduledIds };
  }

  const dayOverrides = overrideMap?.get(dateIso);

  for (const emp of employees) {
    if (!employeeWorksInDepartment(emp, departmentKey)) continue;
    if (!emp.scheduleActive) continue;
    const o = dayOverrides?.get(emp.id);
    if (o?.kind === "exclude") continue;

    let slice = getScheduleSlice(schedules, emp.id, weekdayIndex);
    if (o?.kind === "slice") {
      slice = { active: true, start: o.start, end: o.end };
    }
    if (
      !slice.active ||
      !slice.start ||
      !slice.end ||
      !rangesOverlap(slice.start, slice.end, winStart, winEnd)
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
      scheduledIds.add(emp.id);
    }
  }

  return { clips, scheduledIds };
}

function evaluateWindowState(
  win: EffectifsCoverageWindow,
  effectiveStart: string,
  effectiveEnd: string,
  dateIso: string,
  weekdayIndex: number,
  employees: EffectifsEmployee[],
  schedules: EffectifsEmployeeSchedule[],
  overrideMap: DateEmployeeOverrideMap | undefined
): {
  category: EffectifsCoverageCategory;
  required: number;
  staffed: number;
  minSegmentStaff: number;
  coveragePrimary: string;
  coverageSecondary: string | null;
  surplus: number;
} {
  const required = win.minEmployees;
  if (required === 0) {
    return {
      category: "aucune_requise",
      required: 0,
      staffed: 0,
      minSegmentStaff: 0,
      coveragePrimary: "Aucune couverture requise",
      coverageSecondary: null,
      surplus: 0,
    };
  }

  const { clips, scheduledIds } = collectPlannedClips(
    effectiveStart,
    effectiveEnd,
    weekdayIndex,
    dateIso,
    win.departmentKey,
    employees,
    schedules,
    overrideMap
  );
  const staffed = scheduledIds.size;
  const ws = toMinutes(effectiveStart);
  const we = toMinutes(effectiveEnd);

  if (clips.length === 0) {
    return {
      category: "manque",
      required,
      staffed: 0,
      minSegmentStaff: 0,
      coveragePrimary: manquePhrase(required),
      coverageSecondary: null,
      surplus: 0,
    };
  }

  const segments = buildSegments(ws, we, clips);
  const minSegmentStaff = segments.length ? Math.min(...segments.map((s) => s.count)) : 0;

  if (minSegmentStaff >= required) {
    if (staffed > required) {
      const sur = staffed - required;
      return {
        category: "surplus",
        required,
        staffed,
        minSegmentStaff,
        coveragePrimary: surplusPhrase(sur),
        coverageSecondary: null,
        surplus: sur,
      };
    }
    return {
      category: "couvert",
      required,
      staffed,
      minSegmentStaff,
      coveragePrimary: "Couvert",
      coverageSecondary: null,
      surplus: 0,
    };
  }

  if (minSegmentStaff === 0) {
    return {
      category: "manque",
      required,
      staffed,
      minSegmentStaff,
      coveragePrimary: manquePhrase(required),
      coverageSecondary: null,
      surplus: 0,
    };
  }

  const merged = mergeUnderstaffedRanges(segments, required);
  const first = merged[0];
  let secondary: string | null = null;
  if (first) {
    secondary = `${manquePhrase(first.deficit)} de ${formatMinutesAsTime(first.s)} à ${formatMinutesAsTime(first.e)}`;
  }
  if (!secondary) {
    secondary = `Couverture partielle sur la plage ${effectiveStart}–${effectiveEnd}`;
  }

  return {
    category: "partielle",
    required,
    staffed,
    minSegmentStaff,
    coveragePrimary: "Couverture partielle",
    coverageSecondary: secondary,
    surplus: 0,
  };
}

function worstCategory(
  cats: EffectifsCoverageCategory[]
): EffectifsCoverageCategory {
  const rank = (c: EffectifsCoverageCategory) => {
    switch (c) {
      case "manque":
        return 5;
      case "partielle":
        return 4;
      case "surplus":
        return 3;
      case "couvert":
        return 2;
      case "inactive":
        return 1;
      default:
        return 0;
    }
  };
  if (cats.length === 0) return "aucune_requise";
  return cats.reduce((a, b) => (rank(a) >= rank(b) ? a : b));
}

function aggregateLabels(
  mini: {
    category: EffectifsCoverageCategory;
    required: number;
    staffed: number;
  }[]
): {
  aggregateCategory: EffectifsCoverageCategory;
  primaryLabel: string;
  secondaryLabel: string | null;
} {
  const active = mini.filter((m) => m.category !== "inactive");
  if (active.length === 0) {
    return {
      aggregateCategory: "inactive",
      primaryLabel: "—",
      secondaryLabel: "Inactif",
    };
  }
  const requiring = active.filter((m) => m.category !== "aucune_requise");
  if (requiring.length === 0) {
    return {
      aggregateCategory: "aucune_requise",
      primaryLabel: "—",
      secondaryLabel: "Aucune exigence",
    };
  }
  const agg = worstCategory(requiring.map((m) => m.category));
  const sumReq = requiring.reduce((s, m) => s + m.required, 0);
  const sumStaff = requiring.reduce((s, m) => s + m.staffed, 0);
  const ratio = `${sumStaff} / ${sumReq}`;
  let primaryLabel = ratio;
  let secondaryLabel: string | null = null;
  if (agg === "manque") {
    const gap = Math.max(0, sumReq - sumStaff);
    primaryLabel = gap > 0 ? `manque ${gap}` : ratio;
  } else if (agg === "partielle") {
    secondaryLabel = ratio;
    primaryLabel = "à surveiller";
  } else if (agg === "surplus") {
    const sur = Math.max(0, sumStaff - sumReq);
    primaryLabel = sur > 0 ? `surplus ${sur}` : ratio;
  } else {
    primaryLabel = ratio;
  }
  return { aggregateCategory: agg, primaryLabel, secondaryLabel };
}

/**
 * Cellule calendrier « prévu » : exceptions calendrier + demandes approuvées.
 * Ne modifie pas l’horaire habituel en base — recalcule la couverture pour cette date.
 */
export function buildPlannedDeptDayCell(input: {
  departmentKey: EffectifsDepartmentKey;
  date: string;
  windows: EffectifsCoverageWindow[];
  employees: EffectifsEmployee[];
  schedules: EffectifsEmployeeSchedule[];
  exceptions: EffectifsCalendarException[];
  approvedOverrides?: DateEmployeeOverrideMap;
  /** Lignes couverture semaine de référence (pour panneau détail / cohérence). */
  templateCoverageRows: import("@/app/lib/effectifs-payload.shared").EffectifsCoverageRow[];
}): DeptDayCellModel {
  const { departmentKey, date } = input;
  const wd = effectifsWeekdayIndexFromIso(date);

  const deptWindows = input.windows.filter(
    (w) => w.departmentKey === departmentKey && w.weekday === wd && w.active
  );

  const companyExc = resolveCalendarException(date, departmentKey, "", input.exceptions);
  if (companyExc && isCalendarNonWorkingDay(companyExc)) {
    const badge = calendarExceptionBadgeLabel(companyExc);
    return {
      departmentKey,
      date,
      rows: input.templateCoverageRows.filter(
        (r) => r.departmentKey === departmentKey && r.weekday === wd
      ),
      aggregateCategory: "aucune_requise",
      primaryLabel: badge ?? "Fermé",
      secondaryLabel: companyExc.title,
      displayVariant: companyExc.type === "holiday" ? "holiday" : "company_closed",
      calendarCaption: companyExc.title,
    };
  }

  let displayVariant: DeptDayCellDisplayVariant | undefined;
  let calendarCaption: string | null = null;
  if (companyExc) {
    calendarCaption = companyExc.title;
    if (companyExc.type === "reduced_hours") displayVariant = "reduced";
    else if (
      exceptionDefinesWorkingHours(companyExc) &&
      (companyExc.type === "special_hours" ||
        companyExc.type === "inventory" ||
        companyExc.type === "internal_event")
    ) {
      displayVariant = "special";
    } else if (companyExc.type === "holiday" && companyExc.startLocal) {
      displayVariant = "holiday";
    }
  }

  const mini: {
    category: EffectifsCoverageCategory;
    required: number;
    staffed: number;
  }[] = [];

  for (const win of deptWindows) {
    const exc = resolveCalendarException(
      date,
      departmentKey,
      win.locationKey,
      input.exceptions
    );
    if (exc && isCalendarNonWorkingDay(exc)) {
      continue;
    }
    const eff = effectiveCoverageWindowForException(
      win.startLocal,
      win.endLocal,
      exc
    );
    if (!eff) continue;

    const st = evaluateWindowState(
      win,
      eff.start,
      eff.end,
      date,
      wd,
      input.employees,
      input.schedules,
      input.approvedOverrides
    );
    mini.push({
      category: st.category,
      required: st.required,
      staffed: st.staffed,
    });
  }

  if (mini.length === 0) {
    return {
      departmentKey,
      date,
      rows: input.templateCoverageRows.filter(
        (r) => r.departmentKey === departmentKey && r.weekday === wd
      ),
      aggregateCategory: "aucune_requise",
      primaryLabel: "—",
      secondaryLabel: companyExc ? calendarExceptionBadgeLabel(companyExc) : null,
      displayVariant,
      calendarCaption,
    };
  }

  const { aggregateCategory, primaryLabel, secondaryLabel } = aggregateLabels(mini);
  return {
    departmentKey,
    date,
    rows: input.templateCoverageRows.filter(
      (r) => r.departmentKey === departmentKey && r.weekday === wd
    ),
    aggregateCategory,
    primaryLabel,
    secondaryLabel: secondaryLabel ?? (companyExc ? calendarExceptionBadgeLabel(companyExc) : null),
    displayVariant,
    calendarCaption,
  };
}

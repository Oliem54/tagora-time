import type {
  DeptDayCellDisplayVariant,
  DeptDayCellModel,
  EffectifsCoverageCategory,
  EffectifsCoverageRow,
  EffectifsDepartmentKey,
} from "@/app/lib/effectifs-payload.shared";
import {
  isCalendarNonWorkingDay,
  resolveCalendarException,
  type EffectifsCalendarException,
} from "@/app/lib/effectifs-calendar-exception.shared";

export type { DeptDayCellDisplayVariant, DeptDayCellModel };

/** Lundi = 0 … Dimanche = 6 (aligné API effectifs / department_coverage_windows). */
export function effectifsWeekdayIndexFromIso(iso: string): number {
  const d = new Date(`${iso}T12:00:00`);
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

export function addDaysIso(iso: string, delta: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, day) + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function monthBounds(
  year: number,
  monthIndex0: number
): { start: string; end: string } {
  const start = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
  const last = new Date(year, monthIndex0 + 1, 0).getDate();
  const end = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

export function enumerateMonthDates(year: number, monthIndex0: number): string[] {
  const { start, end } = monthBounds(year, monthIndex0);
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

export function enumerateWeekFromMonday(weekStartIso: string): string[] {
  const out: string[] = [];
  let cur = weekStartIso;
  for (let i = 0; i < 7; i += 1) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

function categorySeverity(c: EffectifsCoverageCategory): number {
  switch (c) {
    case "manque":
      return 5;
    case "partielle":
      return 4;
    case "inactive":
      return 1;
    case "aucune_requise":
      return 0;
    case "couvert":
      return 2;
    case "surplus":
      return 3;
    default:
      return 0;
  }
}

export function worstCoverageCategory(
  cats: EffectifsCoverageCategory[]
): EffectifsCoverageCategory {
  if (cats.length === 0) return "aucune_requise";
  return cats.reduce((a, b) => (categorySeverity(a) >= categorySeverity(b) ? a : b));
}

export function buildDeptDayCell(
  departmentKey: EffectifsDepartmentKey,
  date: string,
  allCoverage: EffectifsCoverageRow[]
): DeptDayCellModel {
  const wd = effectifsWeekdayIndexFromIso(date);
  const rows = allCoverage.filter(
    (r) => r.departmentKey === departmentKey && r.weekday === wd
  );

  if (rows.length === 0) {
    return {
      departmentKey,
      date,
      rows: [],
      aggregateCategory: "aucune_requise",
      primaryLabel: "—",
      secondaryLabel: null,
    };
  }

  const active = rows.filter((r) => r.coverageCategory !== "inactive");
  if (active.length === 0) {
    return {
      departmentKey,
      date,
      rows,
      aggregateCategory: "inactive",
      primaryLabel: "—",
      secondaryLabel: "Inactif",
    };
  }

  const requiring = active.filter((c) => c.coverageCategory !== "aucune_requise");
  if (requiring.length === 0) {
    return {
      departmentKey,
      date,
      rows,
      aggregateCategory: "aucune_requise",
      primaryLabel: "—",
      secondaryLabel: "Aucune exigence",
    };
  }

  const agg = worstCoverageCategory(requiring.map((r) => r.coverageCategory));
  const sumReq = requiring.reduce((s, r) => s + r.required, 0);
  const sumStaff = requiring.reduce((s, r) => s + r.staffed, 0);

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

  return {
    departmentKey,
    date,
    rows,
    aggregateCategory: agg,
    primaryLabel,
    secondaryLabel,
  };
}

export function exceptionDisplayVisual(
  variant: DeptDayCellDisplayVariant
): { bg: string; border: string; color: string } {
  switch (variant) {
    case "company_closed":
      return {
        bg: "rgba(71,85,105,0.2)",
        border: "rgba(51,65,85,0.55)",
        color: "#334155",
      };
    case "holiday":
      return {
        bg: "rgba(99,102,241,0.16)",
        border: "rgba(79,70,229,0.45)",
        color: "#4338ca",
      };
    case "reduced":
      return {
        bg: "rgba(245,158,11,0.2)",
        border: "rgba(217,119,6,0.5)",
        color: "#b45309",
      };
    case "special":
      return {
        bg: "rgba(59,130,246,0.16)",
        border: "rgba(37,99,235,0.45)",
        color: "#1d4ed8",
      };
    default:
      return {
        bg: "rgba(241,245,249,0.95)",
        border: "rgba(203,213,225,0.9)",
        color: "#64748b",
      };
  }
}

export function aggregateCellVisual(cat: EffectifsCoverageCategory): {
  bg: string;
  border: string;
  color: string;
} {
  switch (cat) {
    case "couvert":
      return {
        bg: "rgba(16,185,129,0.14)",
        border: "rgba(16,185,129,0.45)",
        color: "#047857",
      };
    case "surplus":
      return {
        bg: "rgba(59,130,246,0.14)",
        border: "rgba(59,130,246,0.45)",
        color: "#1d4ed8",
      };
    case "manque":
      return {
        bg: "rgba(239,68,68,0.14)",
        border: "rgba(239,68,68,0.5)",
        color: "#b91c1c",
      };
    case "partielle":
      return {
        bg: "rgba(245,158,11,0.18)",
        border: "rgba(245,158,11,0.55)",
        color: "#b45309",
      };
    case "inactive":
      return {
        bg: "rgba(100,116,139,0.12)",
        border: "rgba(100,116,139,0.35)",
        color: "#475569",
      };
    case "aucune_requise":
    default:
      return {
        bg: "rgba(241,245,249,0.95)",
        border: "rgba(203,213,225,0.9)",
        color: "#64748b",
      };
  }
}

export type PriorityGap = {
  departmentKey: EffectifsDepartmentKey;
  departmentLabel: string;
  date: string;
  startLocal: string;
  endLocal: string;
  summary: string;
  severity: number;
  windowId: string;
};

export function buildPriorityGaps(
  coverage: EffectifsCoverageRow[],
  dates: string[],
  exceptions?: EffectifsCalendarException[]
): PriorityGap[] {
  const out: PriorityGap[] = [];
  for (const date of dates) {
    const wd = effectifsWeekdayIndexFromIso(date);
    for (const row of coverage) {
      if (row.weekday !== wd) continue;
      if (exceptions?.length) {
        const exc = resolveCalendarException(
          date,
          row.departmentKey,
          row.locationKey,
          exceptions
        );
        if (exc && isCalendarNonWorkingDay(exc)) continue;
      }
      if (row.coverageCategory !== "manque" && row.coverageCategory !== "partielle") {
        continue;
      }
      const severity = row.coverageCategory === "manque" && row.staffed === 0 ? 10 : 7;
      out.push({
        departmentKey: row.departmentKey,
        departmentLabel: row.departmentLabel,
        date,
        startLocal: row.startLocal,
        endLocal: row.endLocal,
        summary:
          row.coverageCategory === "manque"
            ? row.staffed === 0
              ? "aucun assigné"
              : row.coveragePrimary
            : row.coveragePrimary,
        severity,
        windowId: row.windowId,
      });
    }
  }
  out.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return b.severity - a.severity;
  });
  return out;
}

export function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

"use client";

import { useCallback, useMemo } from "react";
import type {
  DirectionEffectifsPayload,
  EffectifsCompanyKey,
  EffectifsDepartmentKey,
} from "@/app/lib/effectifs-payload.shared";
import { buildPlannedDeptDayCell } from "@/app/lib/effectifs-planned-day.shared";
import {
  buildApprovedOverrideMap,
  listRequestDates,
} from "@/app/lib/effectifs-schedule-request.shared";
import { departmentMatchesCompany } from "@/app/lib/effectifs-departments.shared";
import {
  aggregateCellVisual,
  enumerateMonthDates,
  effectifsWeekdayIndexFromIso,
  exceptionDisplayVisual,
} from "./effectifs-calendar-shared";

type Props = {
  payload: DirectionEffectifsPayload;
  year: number;
  monthIndex0: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  todayIso: string;
  onCellClick: (departmentKey: EffectifsDepartmentKey, date: string) => void;
  /**
   * Filtre client par compagnie (phase 1 — vue Comparatif). `undefined` ou `"all"`
   * affiche tous les départements. `"oliem_solutions"` / `"titan_produits_industriels"`
   * restreint aux départements dont `companyKey === "all"` ou correspond.
   */
  companyFilter?: EffectifsCompanyKey;
  /** Titre affiché dans l'en-tête ; par défaut construit depuis le mois. */
  headerLabel?: string;
};

const DOW_HEADER = ["L", "M", "M", "J", "V", "S", "D"];

export default function DirectionEffectifsMonthCalendar({
  payload,
  year,
  monthIndex0,
  onPrevMonth,
  onNextMonth,
  todayIso,
  onCellClick,
  companyFilter,
  headerLabel,
}: Props) {
  const dates = enumerateMonthDates(year, monthIndex0);
  const rows = useMemo(() => {
    if (!companyFilter || companyFilter === "all") {
      return payload.departments;
    }
    return payload.departments.filter((d) =>
      departmentMatchesCompany(d, companyFilter)
    );
  }, [payload.departments, companyFilter]);

  const windowsForCompany = useMemo(() => {
    if (!companyFilter || companyFilter === "all") {
      return payload.coverageWindows;
    }
    return payload.coverageWindows.filter(
      (w) => w.companyKey === "all" || w.companyKey === companyFilter
    );
  }, [payload.coverageWindows, companyFilter]);

  const coverageForCompany = useMemo(() => {
    if (!companyFilter || companyFilter === "all") {
      return payload.coverage;
    }
    const ids = new Set(windowsForCompany.map((w) => w.id));
    return payload.coverage.filter((c) => ids.has(c.windowId));
  }, [payload.coverage, companyFilter, windowsForCompany]);

  const employeeById = useMemo(() => {
    const m = new Map<number, (typeof payload.employees)[number]>();
    for (const e of payload.employees) m.set(e.id, e);
    return m;
  }, [payload]);

  const hasRegularClosureForCell = useCallback(
    (departmentKey: EffectifsDepartmentKey, weekday: number) => {
      const rules = payload.regularClosedDays ?? [];
      const effectiveCompany: EffectifsCompanyKey = companyFilter ?? "all";
      const byDay = rules.filter((r) => {
        if (!r.active || r.dayOfWeek !== weekday) return false;
        if (effectiveCompany !== "all" && r.companyKey !== "all" && r.companyKey !== effectiveCompany) {
          return false;
        }
        return true;
      });
      if (
        byDay.some(
          (r) => r.scope === "location" && r.locationKey != null && r.locationKey.trim() !== ""
        )
      ) {
        return true;
      }
      if (byDay.some((r) => r.scope === "department" && r.departmentKey === departmentKey)) {
        return true;
      }
      return byDay.some(
        (r) => r.scope === "company" && r.departmentKey == null && r.locationKey == null
      );
    },
    [payload.regularClosedDays, companyFilter]
  );

  const approvedOverrides = useMemo(
    () =>
      buildApprovedOverrideMap(
        payload.scheduleRequests,
        (empId, wd) => {
          const s = payload.schedules.find((x) => x.employeeId === empId);
          const day = s?.days.find((x) => x.weekday === wd);
          return {
            active: day?.active ?? false,
            start: day?.startLocal ?? null,
            end: day?.endLocal ?? null,
          };
        },
        effectifsWeekdayIndexFromIso
      ),
    [payload.scheduleRequests, payload.schedules]
  );

  const baseTitle = new Intl.DateTimeFormat("fr-CA", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex0, 1));
  const title = headerLabel ?? baseTitle;

  return (
    <div
      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)] md:p-6"
      style={{ overflowX: "auto" }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "1.15rem",
            fontWeight: 800,
            color: "#0f172a",
            textTransform: "capitalize",
          }}
        >
          {title}
        </h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="ui-button ui-button-secondary"
            onClick={onPrevMonth}
          >
            Mois précédent
          </button>
          <button
            type="button"
            className="ui-button ui-button-secondary"
            onClick={onNextMonth}
          >
            Mois suivant
          </button>
        </div>
      </div>

      <div style={{ minWidth: 780 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `minmax(140px, 1.1fr) repeat(${dates.length}, minmax(40px, 1fr))`,
            gap: 5,
            alignItems: "stretch",
          }}
        >
          <div />
          {dates.map((d) => {
            const dayNum = d.slice(8, 10);
            const isToday = d === todayIso;
            const wd = effectifsWeekdayIndexFromIso(d);
            return (
              <div
                key={d}
                title={d}
                style={{
                  textAlign: "center",
                  fontSize: "0.65rem",
                  fontWeight: 800,
                  color: isToday ? "#1d4ed8" : "#64748b",
                  padding: "4px 0",
                  borderRadius: 8,
                  background: isToday ? "rgba(59,130,246,0.12)" : "transparent",
                }}
              >
                <div>{DOW_HEADER[wd]}</div>
                <div style={{ fontSize: "0.78rem" }}>{Number(dayNum)}</div>
              </div>
            );
          })}

          {rows.map((dept) => (
            <div
              key={dept.key}
              style={{
                display: "contents",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  color: "#0f172a",
                  padding: "6px 8px",
                  borderRadius: 10,
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                }}
              >
                {dept.label}
              </div>
              {dates.map((date) => {
                const cell = buildPlannedDeptDayCell({
                  departmentKey: dept.key,
                  date,
                  windows: windowsForCompany,
                  employees: payload.employees,
                  schedules: payload.schedules,
                  exceptions: payload.calendarExceptions,
                  approvedOverrides,
                  templateCoverageRows: coverageForCompany,
                });
                const vis =
                  cell.displayVariant && cell.displayVariant !== "default"
                    ? exceptionDisplayVisual(cell.displayVariant)
                    : aggregateCellVisual(cell.aggregateCategory);
                const isToday = date === todayIso;
                const wdForDate = effectifsWeekdayIndexFromIso(date);
                const companyClosed = hasRegularClosureForCell(dept.key, wdForDate);
                const match = /(\d+)\s*\/\s*(\d+)/.exec(cell.primaryLabel);
                const staffed = match ? Number(match[1]) : null;
                const required = match ? Number(match[2]) : null;
                const missing =
                  staffed != null && required != null ? Math.max(0, required - staffed) : 0;
                const extra =
                  staffed != null && required != null ? Math.max(0, staffed - required) : 0;
                const compactLabel =
                  companyClosed ||
                  cell.displayVariant === "company_closed" ||
                  cell.displayVariant === "holiday" ||
                  cell.aggregateCategory === "inactive"
                    ? "F"
                    : cell.aggregateCategory === "manque"
                      ? `-${Math.max(1, missing)}`
                      : cell.aggregateCategory === "surplus"
                        ? `+${Math.max(1, extra)}`
                        : cell.aggregateCategory === "partielle"
                          ? "!"
                          : cell.aggregateCategory === "couvert"
                            ? match
                              ? `${staffed}/${required}`
                              : "OK"
                            : "—";
                const reqs = payload.scheduleRequests.filter((r) => {
                  if (r.targetDepartmentKey && r.targetDepartmentKey !== dept.key) return false;
                  return listRequestDates(r).includes(date);
                });
                const hasPendingRisk = reqs.some((r) => r.status === "pending");
                const hasVacationApproved = reqs.some(
                  (r) => r.status === "approved" && r.requestType === "vacation"
                );
                const hasLeaveApproved = reqs.some(
                  (r) => r.status === "approved" && (r.requestType === "day_off" || r.requestType === "unavailable")
                );
                const tooltipStatus =
                  companyClosed
                    ? "Commerce fermé (régulier)"
                    : cell.aggregateCategory === "manque"
                    ? `Manque ${Math.max(1, missing)}`
                    : cell.aggregateCategory === "surplus"
                      ? `Surplus ${Math.max(1, extra)}`
                      : cell.aggregateCategory === "partielle"
                        ? "Couverture partielle"
                        : cell.aggregateCategory === "couvert"
                          ? "Couvert"
                          : cell.aggregateCategory === "inactive"
                            ? "Fermé"
                            : "Non requis";
                const hasMultiOnCell = cell.rows.some((row) =>
                  row.scheduledEmployees.some((e) => employeeById.get(e.id)?.isMultiCompany)
                );
                return (
                  <button
                    key={`${dept.key}-${date}`}
                    type="button"
                    onClick={() => onCellClick(dept.key, date)}
                    title={`${dept.label} · ${date} · ${tooltipStatus}${
                      hasMultiOnCell ? " · Employé(s) multi-compagnie" : ""
                    }`}
                    style={{
                      minHeight: 44,
                      minWidth: 42,
                      borderRadius: 11,
                      border: `1px solid ${
                        companyClosed ? "rgba(71,85,105,0.35)" : vis.border
                      }`,
                      background: companyClosed ? "rgba(241,245,249,0.95)" : vis.bg,
                      color: companyClosed ? "#475569" : vis.color,
                      cursor: "pointer",
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      padding: "4px",
                      fontSize: "0.74rem",
                      fontWeight: 900,
                      letterSpacing: "-0.01em",
                      outline: isToday ? "2px solid #2563eb" : undefined,
                      outlineOffset: isToday ? 1 : undefined,
                    }}
                  >
                    {hasPendingRisk || hasVacationApproved || hasLeaveApproved ? (
                      <span
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          width: 7,
                          height: 7,
                          borderRadius: 99,
                          background: hasPendingRisk
                            ? "#f59e0b"
                            : hasVacationApproved
                              ? "#2563eb"
                              : "#7c3aed",
                        }}
                      />
                    ) : null}
                    <span
                      style={{
                        lineHeight: 1,
                        textAlign: "center",
                        fontSize: "0.78rem",
                        fontWeight: 900,
                      }}
                    >
                      {compactLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          fontSize: "0.75rem",
          color: "#475569",
        }}
      >
        {(
          [
            ["ok", "OK = couvert", "rgba(16,185,129,0.35)"],
            ["minus", "-1 = manque 1 personne", "rgba(239,68,68,0.5)"],
            ["plus", "+1 = surplus 1 personne", "rgba(59,130,246,0.45)"],
            ["none", "— = non requis", "rgba(203,213,225,0.9)"],
            ["partial", "! = couverture partielle", "rgba(245,158,11,0.45)"],
            ["closed", "F = fermé", "rgba(51,65,85,0.55)"],
          ] as const
        ).map(([key, label, border]) => (
          <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 4,
                border: `2px solid ${border}`,
                background: "white",
              }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

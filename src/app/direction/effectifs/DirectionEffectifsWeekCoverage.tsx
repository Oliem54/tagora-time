"use client";

import { useMemo } from "react";
import type {
  DirectionEffectifsPayload,
  EffectifsDepartmentKey,
} from "@/app/lib/effectifs-payload.shared";
import { buildPlannedDeptDayCell } from "@/app/lib/effectifs-planned-day.shared";
import { buildApprovedOverrideMap } from "@/app/lib/effectifs-schedule-request.shared";
import {
  aggregateCellVisual,
  enumerateWeekFromMonday,
  effectifsWeekdayIndexFromIso,
  exceptionDisplayVisual,
} from "./effectifs-calendar-shared";

type Props = {
  payload: DirectionEffectifsPayload;
  weekStartIso: string;
  todayIso: string;
  onCellClick: (departmentKey: EffectifsDepartmentKey, date: string) => void;
};

export default function DirectionEffectifsWeekCoverage({
  payload,
  weekStartIso,
  todayIso,
  onCellClick,
}: Props) {
  const dates = enumerateWeekFromMonday(weekStartIso);
  const label = `Semaine du ${dates[0]} au ${dates[6]}`;

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

  return (
    <div
      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)] md:p-6"
      style={{ overflowX: "auto" }}
    >
      <h3
        style={{
          margin: "0 0 16px",
          fontSize: "1.05rem",
          fontWeight: 800,
          color: "#0f172a",
        }}
      >
        {label}
      </h3>
      <div style={{ minWidth: 640 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `140px repeat(7, minmax(72px, 1fr))`,
            gap: 6,
          }}
        >
          <div />
          {dates.map((d) => {
            const isToday = d === todayIso;
            return (
              <div
                key={d}
                style={{
                  textAlign: "center",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  color: isToday ? "#1d4ed8" : "#475569",
                  padding: 8,
                  borderRadius: 12,
                  background: isToday ? "rgba(59,130,246,0.1)" : "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div>{d.slice(8, 10)}</div>
                <div style={{ fontWeight: 600, color: "#94a3b8" }}>{d.slice(5, 7)}</div>
              </div>
            );
          })}

          {payload.departments.map((dept) => (
            <div key={dept.key} style={{ display: "contents" }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  padding: "8px 10px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  color: "#0f172a",
                }}
              >
                {dept.label}
              </div>
              {dates.map((date) => {
                const cell = buildPlannedDeptDayCell({
                  departmentKey: dept.key,
                  date,
                  windows: payload.coverageWindows,
                  employees: payload.employees,
                  schedules: payload.schedules,
                  exceptions: payload.calendarExceptions,
                  approvedOverrides,
                  templateCoverageRows: payload.coverage,
                });
                const vis =
                  cell.displayVariant && cell.displayVariant !== "default"
                    ? exceptionDisplayVisual(cell.displayVariant)
                    : aggregateCellVisual(cell.aggregateCategory);
                const isToday = date === todayIso;
                return (
                  <button
                    key={`${dept.key}-${date}`}
                    type="button"
                    onClick={() => onCellClick(dept.key, date)}
                    style={{
                      minHeight: 64,
                      borderRadius: 14,
                      border: `1px solid ${vis.border}`,
                      background: vis.bg,
                      color: vis.color,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      padding: 6,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      outline: isToday ? "2px solid #3b82f6" : undefined,
                    }}
                  >
                    <span>{cell.primaryLabel}</span>
                    {cell.secondaryLabel ? (
                      <span style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                        {cell.secondaryLabel}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

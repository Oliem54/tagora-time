"use client";

import {
  WEEKLY_SCHEDULE_DAY_KEYS,
  WEEKLY_SCHEDULE_DAY_LABELS_FR,
  computeDayNetPlannedHours,
  createEmptyWeeklyScheduleDay,
  createWeeklyScheduleFromLegacy,
  recalculateWeeklyScheduleConfig,
  type WeeklyScheduleConfig,
  type WeeklyScheduleDayConfig,
  type WeeklyScheduleDayKey,
} from "@/app/lib/weekly-schedule";
import type { EmployeFormState } from "./employee-profile-shared";

type EmployeeWeeklyScheduleGridProps = {
  form: EmployeFormState;
  setForm: React.Dispatch<React.SetStateAction<EmployeFormState>>;
  disabled: boolean;
};

function updateDay(
  config: WeeklyScheduleConfig,
  dayKey: WeeklyScheduleDayKey,
  patch: Partial<WeeklyScheduleDayConfig>
): WeeklyScheduleConfig {
  const merged: WeeklyScheduleDayConfig = {
    ...config.days[dayKey],
    ...patch,
  };
  return recalculateWeeklyScheduleConfig({
    ...config,
    days: { ...config.days, [dayKey]: merged },
  });
}

function cloneDay(source: WeeklyScheduleDayConfig): WeeklyScheduleDayConfig {
  return {
    ...source,
    breakAm: { ...source.breakAm },
    lunch: { ...source.lunch },
    breakPm: { ...source.breakPm },
  };
}

export default function EmployeeWeeklyScheduleGrid({
  form,
  setForm,
  disabled,
}: EmployeeWeeklyScheduleGridProps) {
  const ws = form.weeklySchedule;

  const setWeekly = (next: WeeklyScheduleConfig) => {
    setForm((f) => ({ ...f, weeklySchedule: recalculateWeeklyScheduleConfig(next) }));
  };

  const handleGenerateFromLegacy = () => {
    const legacy = createWeeklyScheduleFromLegacy({
      schedule_start: form.schedule_start || null,
      schedule_end: form.schedule_end || null,
      scheduled_work_days: form.scheduled_work_days,
      planned_daily_hours: form.planned_daily_hours
        ? Number(form.planned_daily_hours)
        : null,
      planned_weekly_hours: form.planned_weekly_hours
        ? Number(form.planned_weekly_hours)
        : null,
      pause_minutes: form.pause_minutes ? Number(form.pause_minutes) : null,
      break_am_enabled: form.break_am_enabled,
      break_am_time: form.break_am_time || null,
      break_am_minutes: form.break_am_minutes
        ? Number(form.break_am_minutes)
        : null,
      break_am_paid: form.break_am_paid,
      lunch_enabled: form.lunch_enabled,
      lunch_time: form.lunch_time || null,
      lunch_minutes: form.lunch_minutes ? Number(form.lunch_minutes) : null,
      lunch_paid: form.lunch_paid,
      break_pm_enabled: form.break_pm_enabled,
      break_pm_time: form.break_pm_time || null,
      break_pm_minutes: form.break_pm_minutes
        ? Number(form.break_pm_minutes)
        : null,
      break_pm_paid: form.break_pm_paid,
    });
    setWeekly(legacy);
  };

  const copyMondayToWeekdays = () => {
    const mon = cloneDay(ws.days.monday);
    let next = { ...ws, days: { ...ws.days } };
    for (const k of ["tuesday", "wednesday", "thursday", "friday"] as const) {
      next.days[k] = cloneDay(mon);
    }
    setWeekly(next);
  };

  const copyMondayToAllActive = () => {
    const mon = cloneDay(ws.days.monday);
    let next = { ...ws, days: { ...ws.days } };
    for (const k of WEEKLY_SCHEDULE_DAY_KEYS) {
      if (next.days[k].active) {
        next.days[k] = cloneDay(mon);
        next.days[k].active = true;
      }
    }
    setWeekly(next);
  };

  const resetDay = (dayKey: WeeklyScheduleDayKey) => {
    setWeekly({
      ...ws,
      days: { ...ws.days, [dayKey]: createEmptyWeeklyScheduleDay() },
    });
  };

  const markConge = (dayKey: WeeklyScheduleDayKey) => {
    setWeekly(
      updateDay(ws, dayKey, {
        active: false,
        start: "",
        end: "",
      })
    );
  };

  return (
    <div className="ui-stack-md">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className="tagora-dark-outline-action"
          disabled={disabled}
          onClick={handleGenerateFromLegacy}
          style={{ padding: "8px 14px", borderRadius: 12, fontSize: "0.85rem" }}
        >
          Générer l&apos;horaire détaillé à partir de l&apos;horaire actuel
        </button>
        <button
          type="button"
          className="tagora-dark-outline-action"
          disabled={disabled}
          onClick={copyMondayToWeekdays}
          style={{ padding: "8px 14px", borderRadius: 12, fontSize: "0.85rem" }}
        >
          Copier lundi → mardi–vendredi
        </button>
        <button
          type="button"
          className="tagora-dark-outline-action"
          disabled={disabled}
          onClick={copyMondayToAllActive}
          style={{ padding: "8px 14px", borderRadius: 12, fontSize: "0.85rem" }}
        >
          Copier lundi → tous les jours actifs
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gap: 14,
        }}
      >
        {WEEKLY_SCHEDULE_DAY_KEYS.map((dayKey) => {
          const day = ws.days[dayKey];
          const label = WEEKLY_SCHEDULE_DAY_LABELS_FR[dayKey];
          const planned = computeDayNetPlannedHours(day);

          return (
            <div
              key={dayKey}
              className="tagora-panel"
              style={{
                borderRadius: 18,
                padding: 18,
                border: "1px solid #e2e8f0",
                background: day.active ? "#fff" : "rgba(248,250,252,0.95)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <div className="ui-stack-xs">
                  <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a" }}>
                    {label}
                  </div>
                  {!day.active ? (
                    <span
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Congé
                    </span>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    className="tagora-dark-outline-action"
                    disabled={disabled}
                    onClick={() => resetDay(dayKey)}
                    style={{ padding: "6px 12px", borderRadius: 10, fontSize: "0.78rem" }}
                  >
                    Réinitialiser
                  </button>
                  <button
                    type="button"
                    className="tagora-dark-outline-action"
                    disabled={disabled}
                    onClick={() => markConge(dayKey)}
                    style={{ padding: "6px 12px", borderRadius: 10, fontSize: "0.78rem" }}
                  >
                    Marquer congé
                  </button>
                </div>
              </div>

              <label
                className="account-requests-permission-option"
                style={{ marginBottom: 12 }}
              >
                <input
                  type="checkbox"
                  checked={day.active}
                  disabled={disabled}
                  onChange={(e) =>
                    setWeekly(
                      updateDay(ws, dayKey, { active: e.target.checked })
                    )
                  }
                />
                <span>Jour travaillé (actif)</span>
              </label>

              {day.active ? (
                <div className="ui-stack-md">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <label className="tagora-field">
                      <span className="tagora-label">Début</span>
                      <input
                        className="tagora-input"
                        type="time"
                        value={day.start}
                        disabled={disabled}
                        onChange={(e) =>
                          setWeekly(updateDay(ws, dayKey, { start: e.target.value }))
                        }
                      />
                    </label>
                    <label className="tagora-field">
                      <span className="tagora-label">Fin</span>
                      <input
                        className="tagora-input"
                        type="time"
                        value={day.end}
                        disabled={disabled}
                        onChange={(e) =>
                          setWeekly(updateDay(ws, dayKey, { end: e.target.value }))
                        }
                      />
                    </label>
                    <div className="tagora-field">
                      <span className="tagora-label">Heures prévues (calc.)</span>
                      <div
                        className="tagora-panel-muted"
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          fontWeight: 700,
                          color: "#0f172a",
                        }}
                      >
                        {planned > 0 ? `${planned} h` : "—"}
                      </div>
                    </div>
                  </div>

                  {(
                    [
                      { key: "breakAm" as const, title: "Pause AM" },
                      { key: "lunch" as const, title: "Dîner" },
                      { key: "breakPm" as const, title: "Pause PM" },
                    ] as const
                  ).map(({ key, title }) => {
                    const br = day[key];
                    return (
                      <div
                        key={key}
                        className="tagora-panel-muted"
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "minmax(100px, 1fr) auto minmax(100px, 1fr) minmax(80px, 1fr) minmax(100px, 1fr)",
                          gap: 10,
                          alignItems: "center",
                          padding: 12,
                          borderRadius: 14,
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>{title}</span>
                        <label className="account-requests-permission-option">
                          <input
                            type="checkbox"
                            checked={br.enabled}
                            disabled={disabled}
                            onChange={(e) =>
                              setWeekly(
                                updateDay(ws, dayKey, {
                                  [key]: { ...br, enabled: e.target.checked },
                                })
                              )
                          }
                          />
                          <span>Actif</span>
                        </label>
                        <input
                          className="tagora-input"
                          type="time"
                          value={br.time}
                          disabled={disabled || !br.enabled}
                          onChange={(e) =>
                            setWeekly(
                              updateDay(ws, dayKey, {
                                [key]: { ...br, time: e.target.value },
                              })
                            )
                          }
                        />
                        <input
                          className="tagora-input"
                          type="number"
                          min={0}
                          step={1}
                          value={br.minutes || ""}
                          disabled={disabled || !br.enabled}
                          onChange={(e) =>
                            setWeekly(
                              updateDay(ws, dayKey, {
                                [key]: {
                                  ...br,
                                  minutes: Number(e.target.value) || 0,
                                },
                              })
                            )
                          }
                        />
                        <select
                          className="tagora-input"
                          value={br.paid ? "paid" : "unpaid"}
                          disabled={disabled || !br.enabled}
                          onChange={(e) =>
                            setWeekly(
                              updateDay(ws, dayKey, {
                                [key]: {
                                  ...br,
                                  paid: e.target.value === "paid",
                                },
                              })
                            )
                          }
                        >
                          <option value="paid">Payée</option>
                          <option value="unpaid">Non payée</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

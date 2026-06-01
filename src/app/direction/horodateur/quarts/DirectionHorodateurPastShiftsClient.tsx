"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Clock3,
  Lock,
  Plus,
  RefreshCw,
  Timer,
  UserRound,
} from "lucide-react";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import TagoraStatCard from "@/app/components/TagoraStatCard";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { getWeekStartDate } from "@/app/lib/horodateur-v1/rules";
import type {
  HorodateurPastShiftDetail,
  HorodateurPastShiftRow,
  HorodateurPastShiftsPayload,
} from "@/app/lib/horodateur-v1/past-shifts-types";
import type { RegistreCompanyParam, RegistreStatusFilter } from "@/app/lib/horodateur-v1/registre-types";
import { supabase } from "@/app/lib/supabase/client";

type PeriodPreset =
  | "week_current"
  | "week_prev"
  | "month_current"
  | "month_prev"
  | "custom";

function torontoYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(iso: string, delta: number) {
  const [y, m, day] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, day) + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

function monthBoundsToronto(ref: Date) {
  const ymd = torontoYmd(ref);
  const [y, m] = ymd.split("-").map(Number);
  const start = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

function presetRange(preset: PeriodPreset): { start: string; end: string } {
  const todayIso = torontoYmd(new Date());
  switch (preset) {
    case "week_current": {
      const ws = getWeekStartDate(`${todayIso}T12:00:00`);
      return { start: ws, end: addDays(ws, 6) };
    }
    case "week_prev": {
      const ws = getWeekStartDate(`${todayIso}T12:00:00`);
      const prevStart = addDays(ws, -7);
      return { start: prevStart, end: addDays(prevStart, 6) };
    }
    case "month_current":
      return monthBoundsToronto(new Date());
    case "month_prev": {
      const cur = presetRange("month_current");
      const [y, m] = cur.start.split("-").map(Number);
      const probe = new Date(Date.UTC(y, m - 2, 14));
      return monthBoundsToronto(probe);
    }
    default:
      return { start: todayIso, end: todayIso };
  }
}

function fmtHoursMinutes(totalMinutes: number) {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h ${String(r).padStart(2, "0")}`;
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-CA", { timeZone: "America/Toronto" });
}

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusTone(
  key: HorodateurPastShiftRow["statusKey"]
): "default" | "info" | "success" | "warning" | "danger" {
  switch (key) {
    case "incomplet":
    case "en_attente":
    case "exception":
      return "warning";
    case "corrige":
      return "info";
    default:
      return "success";
  }
}

function eventStatusTone(
  status: string
): "default" | "info" | "success" | "warning" | "danger" {
  if (status === "approuve" || status === "normal") return "success";
  if (status === "en_attente") return "warning";
  if (status === "refuse") return "danger";
  return "info";
}

export default function DirectionHorodateurPastShiftsClient() {
  const { user, hasPermission, loading: accessLoading } = useCurrentAccess();
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("week_current");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employeeId, setEmployeeId] = useState("all");
  const [company, setCompany] = useState<RegistreCompanyParam>("all");
  const [status, setStatus] = useState<RegistreStatusFilter>("all");
  const [data, setData] = useState<HorodateurPastShiftsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  const applyPreset = useCallback((preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset !== "custom") {
      const range = presetRange(preset);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  }, []);

  useEffect(() => {
    applyPreset("week_current");
  }, [applyPreset]);

  const loadData = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Session expirée. Reconnectez-vous.");
        setData(null);
        return;
      }

      const qs = new URLSearchParams({
        startDate,
        endDate,
        company,
        status,
      });
      if (employeeId !== "all") {
        qs.set("employeeId", employeeId);
      }

      const res = await fetch(`/api/direction/horodateur/shifts?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as HorodateurPastShiftsPayload & {
        success?: boolean;
        error?: string;
      };

      if (!res.ok || json.success === false) {
        setError(typeof json.error === "string" ? json.error : "Chargement impossible.");
        setData(null);
        return;
      }

      setData(json);
      setSelectedShiftId((prev) => {
        if (prev && json.shifts?.some((s) => s.shiftId === prev)) {
          return prev;
        }
        return json.shifts?.[0]?.shiftId ?? null;
      });
    } catch {
      setError("Erreur réseau lors du chargement des quarts.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [company, employeeId, endDate, startDate, status]);

  useEffect(() => {
    if (!accessLoading && user && hasPermission("terrain") && startDate && endDate) {
      void loadData();
    }
  }, [accessLoading, endDate, hasPermission, loadData, startDate, user]);

  const selectedRow = useMemo(
    () => data?.shifts.find((s) => s.shiftId === selectedShiftId) ?? null,
    [data?.shifts, selectedShiftId]
  );

  const selectedDetail: HorodateurPastShiftDetail | null = useMemo(() => {
    if (!selectedShiftId || !data?.detailsByShiftId) return null;
    return data.detailsByShiftId[selectedShiftId] ?? null;
  }, [data, selectedShiftId]);

  const inputClass =
    "w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-3 text-[15px] text-slate-900 shadow-inner shadow-slate-900/5 outline-none ring-slate-300/80 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200/70";

  if (accessLoading) {
    return (
      <TagoraLoadingScreen isLoading message="Vérification des accès..." fullScreen />
    );
  }

  if (!user) {
    return null;
  }

  if (!hasPermission("terrain")) {
    return (
      <main className="tagora-app-shell min-h-screen bg-[linear-gradient(180deg,#f1f5f9_0%,#eef4ff_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200/70 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-slate-900">Quarts passés</h1>
            <p className="mt-3 text-sm text-slate-600">
              La permission terrain est requise pour consulter les quarts passés.
            </p>
            <Link href="/direction/dashboard" className="mt-6 inline-block">
              <SecondaryButton>Retour au tableau de bord</SecondaryButton>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_45%,#f1f5f9_100%)]">
      <div className="mx-auto max-w-[1600px] px-4 pb-14 pt-8 sm:px-6 lg:px-10">
        <AuthenticatedPageHeader
          title="Quarts passés"
          subtitle="Consultation des quarts antérieurs — lecture seule (phase 1)."
          showNavigation={false}
          actions={
            <div className="flex flex-shrink-0 flex-wrap items-center gap-3 lg:justify-end">
              <Link href="/direction/horodateur" className="tagora-dark-outline-action">
                Horodateur live
              </Link>
              <Link href="/direction/horodateur/registre" className="tagora-dark-outline-action">
                Registre
              </Link>
              <Link href="/direction/dashboard" className="tagora-dark-action">
                Tableau de bord
              </Link>
            </div>
          }
        />

        <AppCard tone="muted" className="mb-6 border border-sky-200/60 bg-sky-50/40">
          <p className="text-sm text-slate-700" style={{ margin: 0 }}>
            <strong>Phase 1 — lecture seule.</strong> Les actions de création, modification et
            annulation de quarts seront disponibles dans une phase ultérieure, avec approbations et
            piste d&apos;audit.
          </p>
        </AppCard>

        <section className="mb-8 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_14px_40px_-12px_rgba(15,23,42,0.1)] sm:p-7">
          <div className="mb-6 flex flex-col gap-2 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Filtres</h2>
              <p className="text-sm text-slate-500">Période, employé, statut et compagnie.</p>
            </div>
            <SecondaryButton type="button" onClick={() => void loadData()} disabled={loading}>
              <span className="inline-flex items-center gap-2">
                <RefreshCw size={16} />
                {loading ? "Actualisation..." : "Actualiser"}
              </span>
            </SecondaryButton>
          </div>

          <div className="flex flex-wrap gap-2.5 mb-6">
            {(
              [
                ["week_current", "Semaine courante"],
                ["week_prev", "Semaine précédente"],
                ["month_current", "Mois courant"],
                ["month_prev", "Mois précédent"],
                ["custom", "Personnalisé"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  periodPreset === id
                    ? "bg-slate-900 text-white shadow-md"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="ui-stack-xs">
              <span className="text-xs font-semibold uppercase text-slate-500">Début</span>
              <input
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(e) => {
                  setPeriodPreset("custom");
                  setStartDate(e.target.value);
                }}
              />
            </label>
            <label className="ui-stack-xs">
              <span className="text-xs font-semibold uppercase text-slate-500">Fin</span>
              <input
                type="date"
                className={inputClass}
                value={endDate}
                onChange={(e) => {
                  setPeriodPreset("custom");
                  setEndDate(e.target.value);
                }}
              />
            </label>
            <label className="ui-stack-xs">
              <span className="text-xs font-semibold uppercase text-slate-500">Employé</span>
              <select
                className={inputClass}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="all">Tous</option>
                {(data?.employeeOptions ?? []).map((opt) => (
                  <option key={opt.id} value={String(opt.id)}>
                    {opt.name ?? `#${opt.id}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-stack-xs">
              <span className="text-xs font-semibold uppercase text-slate-500">Statut</span>
              <select
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as RegistreStatusFilter)}
              >
                <option value="all">Tous</option>
                <option value="complet">Complet</option>
                <option value="incomplet">Incomplet</option>
                <option value="en_attente">En attente</option>
                <option value="exception">Exception</option>
                <option value="corrige">Corrigé</option>
              </select>
            </label>
            <label className="ui-stack-xs">
              <span className="text-xs font-semibold uppercase text-slate-500">Compagnie</span>
              <select
                className={inputClass}
                value={company}
                onChange={(e) => setCompany(e.target.value as RegistreCompanyParam)}
              >
                {(data?.companyOptions ?? [
                  { value: "all", label: "Toutes" },
                ]).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {error ? (
          <AppCard tone="muted" className="mb-6 border border-red-200 bg-red-50/50">
            <p className="text-sm text-red-800" style={{ margin: 0 }}>
              {error}
            </p>
          </AppCard>
        ) : null}

        {loading && !data ? (
          <TagoraLoadingScreen isLoading message="Chargement des quarts..." fullScreen={false} />
        ) : null}

        {data ? (
          <>
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TagoraStatCard
                title="Quarts affichés"
                value={String(data.summary.totalShifts)}
                icon={<CalendarRange size={20} />}
                tone="slate"
              />
              <TagoraStatCard
                title="Heures travaillées"
                value={fmtHoursMinutes(data.summary.totalWorkedMinutes)}
                icon={<Timer size={20} />}
                tone="blue"
              />
              <TagoraStatCard
                title="Heures payables"
                value={fmtHoursMinutes(data.summary.totalPayableMinutes)}
                icon={<Clock3 size={20} />}
                tone="cyan"
              />
              <TagoraStatCard
                title="En attente / incomplets"
                value={`${data.summary.pendingApprovalCount} / ${data.summary.incompleteShiftCount}`}
                icon={<UserRound size={20} />}
                tone={
                  data.summary.pendingApprovalCount > 0 ? "orange" : "slate"
                }
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
              <section className="rounded-3xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-base font-bold text-slate-900">Liste des quarts</h2>
                  <p className="text-sm text-slate-500">
                    {data.summary.periodStart} → {data.summary.periodEnd}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Employé</th>
                        <th className="px-4 py-3">Statut</th>
                        <th className="px-4 py-3">Payable</th>
                        <th className="px-4 py-3">Compagnie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.shifts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            Aucun quart pour ces filtres.
                          </td>
                        </tr>
                      ) : (
                        data.shifts.map((row) => {
                          const selected = row.shiftId === selectedShiftId;
                          return (
                            <tr
                              key={row.shiftId}
                              className={`cursor-pointer border-t border-slate-100 transition ${
                                selected ? "bg-sky-50/80" : "hover:bg-slate-50/80"
                              }`}
                              onClick={() => setSelectedShiftId(row.shiftId)}
                            >
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {fmtDate(row.workDate)}
                              </td>
                              <td className="px-4 py-3">{row.employeeName ?? `#${row.employeeId}`}</td>
                              <td className="px-4 py-3">
                                <StatusBadge
                                  label={row.statusLabel}
                                  tone={statusTone(row.statusKey)}
                                />
                              </td>
                              <td className="px-4 py-3">{fmtHoursMinutes(row.payableMinutes)}</td>
                              <td className="px-4 py-3 text-slate-600">{row.companyLabel}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className="ui-stack-md">
                <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm">
                  <h2 className="text-base font-bold text-slate-900 mb-1">Détail du quart</h2>
                  {!selectedRow ? (
                    <p className="text-sm text-slate-500">Sélectionnez un quart dans la liste.</p>
                  ) : (
                    <div className="ui-stack-sm">
                      <div>
                        <p className="text-lg font-semibold text-slate-900">
                          {selectedRow.employeeName ?? `Employé #${selectedRow.employeeId}`}
                        </p>
                        <p className="text-sm text-slate-600">{fmtDate(selectedRow.workDate)}</p>
                      </div>
                      <StatusBadge
                        label={selectedRow.statusLabel}
                        tone={statusTone(selectedRow.statusKey)}
                      />
                      <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-slate-500">Début</dt>
                          <dd className="font-medium">{fmtDateTime(selectedRow.shiftStartAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Fin</dt>
                          <dd className="font-medium">{fmtDateTime(selectedRow.shiftEndAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Travaillé</dt>
                          <dd className="font-medium">
                            {fmtHoursMinutes(selectedRow.workedMinutes)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Payable</dt>
                          <dd className="font-medium">
                            {fmtHoursMinutes(selectedRow.payableMinutes)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Statut shift</dt>
                          <dd className="font-medium">{selectedRow.shiftStatus}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Exceptions</dt>
                          <dd className="font-medium">{selectedRow.exceptionCount}</dd>
                        </div>
                      </dl>

                      <div className="flex flex-wrap gap-2 pt-2">
                        <PrimaryButton type="button" disabled title="Phase suivante">
                          <span className="inline-flex items-center gap-2 opacity-60">
                            <Plus size={16} />
                            Ajouter un quart
                          </span>
                        </PrimaryButton>
                        <SecondaryButton type="button" disabled title="Phase suivante">
                          <span className="inline-flex items-center gap-2 opacity-60">
                            <Lock size={14} />
                            Modifier
                          </span>
                        </SecondaryButton>
                        <SecondaryButton type="button" disabled title="Phase suivante">
                          <span className="inline-flex items-center gap-2 opacity-60">
                            <Lock size={14} />
                            Annuler
                          </span>
                        </SecondaryButton>
                      </div>
                      <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Lock size={12} />
                        Actions désactivées — phase 2 à venir
                      </p>
                    </div>
                  )}
                </section>

                {selectedRow && selectedDetail ? (
                  <>
                    <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-900 mb-3">
                        Événements ({selectedDetail.events.length})
                      </h3>
                      {selectedDetail.events.length === 0 ? (
                        <p className="text-sm text-slate-500">Aucun événement.</p>
                      ) : (
                        <ul className="ui-stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {selectedDetail.events.map((ev) => (
                            <li
                              key={ev.id}
                              className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-sm"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-slate-800">
                                  {ev.canonicalType ?? ev.eventType}
                                </span>
                                <StatusBadge
                                  label={ev.status}
                                  tone={eventStatusTone(ev.status)}
                                />
                              </div>
                              <p className="text-slate-600 mt-1">{fmtDateTime(ev.occurredAt)}</p>
                              {ev.notes ? (
                                <p className="text-slate-500 mt-1 text-xs">{ev.notes}</p>
                              ) : null}
                              <p className="text-xs text-slate-400 mt-1">
                                {ev.sourceKind ?? "—"} · {ev.actorRole ?? "—"}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-900 mb-3">
                        Exceptions ({selectedDetail.exceptions.length})
                      </h3>
                      {selectedDetail.exceptions.length === 0 ? (
                        <p className="text-sm text-slate-500">Aucune exception.</p>
                      ) : (
                        <ul className="ui-stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {selectedDetail.exceptions.map((ex) => (
                            <li
                              key={ex.id}
                              className="rounded-xl border border-amber-100/80 bg-amber-50/30 px-3 py-2.5 text-sm"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-slate-800">{ex.reasonLabel}</span>
                                <StatusBadge
                                  label={ex.status}
                                  tone={eventStatusTone(ex.status)}
                                />
                              </div>
                              <p className="text-xs text-slate-600 mt-1">{ex.exceptionType}</p>
                              {ex.details ? (
                                <p className="text-slate-600 mt-1">{ex.details}</p>
                              ) : null}
                              <p className="text-xs text-slate-400 mt-1">
                                Demandé {fmtDateTime(ex.requestedAt)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-xs text-slate-500 mt-4">
                        Approuver ou refuser : utilisez l&apos;
                        <Link href="/direction/horodateur" className="underline text-sky-700">
                          horodateur live
                        </Link>{" "}
                        (exceptions en attente) — phase dédiée à venir.
                      </p>
                    </section>
                  </>
                ) : null}
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

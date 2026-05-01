"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  Clock3,
  FileSpreadsheet,
  LayoutDashboard,
  ShieldCheck,
  Timer,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import AppCard from "@/app/components/ui/AppCard";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";
import { getWeekStartDate } from "@/app/lib/horodateur-v1/rules";
import type {
  HorodateurRegistreEmployeeRow,
  HorodateurRegistreEventDetail,
  HorodateurRegistreExceptionDetail,
  HorodateurRegistrePayload,
} from "@/app/lib/horodateur-v1/registre-types";

type PeriodPreset =
  | "week_current"
  | "week_prev"
  | "month_current"
  | "month_prev"
  | "custom";

type RegistrerTabId = "global" | "employee" | "exceptions";

type DetailBody = {
  employeeName: string | null;
  events: HorodateurRegistreEventDetail[];
  exceptions: HorodateurRegistreExceptionDetail[];
  notes: string[];
};

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

function fmtHoursMinutesLabel(totalMinutes: number) {
  return fmtHoursMinutes(totalMinutes);
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleString("fr-CA", {
    timeZone: "America/Toronto",
  });
}

function sourceLabel(ev: HorodateurRegistreEventDetail): string {
  if (ev.isManualCorrection || ev.canonicalType === "manual_correction") {
    return "Correction";
  }
  if (ev.actorRole === "direction" || ev.sourceKind === "direction") {
    return "Admin";
  }
  if (ev.sourceKind === "automatique") {
    return "Automatique";
  }
  return "Employe mobile";
}

function statusTone(row: HorodateurRegistreEmployeeRow["statusKey"]) {
  switch (row) {
    case "incomplet":
      return "warning" as const;
    case "en_attente":
      return "warning" as const;
    case "exception":
      return "warning" as const;
    case "corrige":
      return "info" as const;
    default:
      return "success" as const;
  }
}

/** Paires quart_debut/quart_fin (ou canon punch_in/out) pour expliquer la duree. */
function derivePairedRows(events: HorodateurRegistreEventDetail[]) {
  const sorted = [...events].sort((a, b) => {
    const ta = a.occurredAt ? Date.parse(a.occurredAt) : 0;
    const tb = b.occurredAt ? Date.parse(b.occurredAt) : 0;
    return ta - tb;
  });

  type PairRow = {
    workDate: string | null;
    entryAt: string | null;
    exitAt: string | null;
    durationMinutes: number | null;
    company: string | null;
    chantierLabel: string | null;
    kind: string;
    incomplete: boolean;
  };

  const out: PairRow[] = [];
  let pendingIn: HorodateurRegistreEventDetail | null = null;

  for (const ev of sorted) {
    const t = ev.canonicalType ?? "";
    const isIn =
      t === "punch_in" ||
      ev.eventType === "quart_debut" ||
      ev.eventType === "retroactive_entry";
    const isOut = t === "punch_out" || ev.eventType === "quart_fin";

    if (isIn) {
      pendingIn = ev;
      continue;
    }
    if (isOut && pendingIn && pendingIn.occurredAt && ev.occurredAt) {
      const dur = Math.max(
        0,
        Math.round(
          (Date.parse(ev.occurredAt) - Date.parse(pendingIn.occurredAt)) / 60000
        )
      );
      const chantierParts = [
        ev.livraisonId != null ? `Livraison ${ev.livraisonId}` : null,
        ev.dossierId != null ? `Dossier ${ev.dossierId}` : null,
        ev.sortieId != null ? `Sortie ${ev.sortieId}` : null,
      ].filter(Boolean);

      out.push({
        workDate: ev.workDate ?? pendingIn.workDate ?? null,
        entryAt: pendingIn.occurredAt,
        exitAt: ev.occurredAt,
        durationMinutes: dur,
        company: ev.companyContext ?? pendingIn.companyContext ?? null,
        chantierLabel: chantierParts.length ? chantierParts.join(" · ") : null,
        kind: `${pendingIn.eventType} -> ${ev.eventType}`,
        incomplete: false,
      });
      pendingIn = null;
      continue;
    }
  }

  if (pendingIn) {
    out.push({
      workDate: pendingIn.workDate,
      entryAt: pendingIn.occurredAt,
      exitAt: null,
      durationMinutes: null,
      company: pendingIn.companyContext ?? null,
      chantierLabel: null,
      kind: pendingIn.eventType,
      incomplete: true,
    });
  }

  return out;
}

function exceptionEmployerLookup(data: HorodateurRegistrePayload | null) {
  const map = new Map<string, { employeeId: number; employeeName: string | null }>();
  if (!data) {
    return map;
  }
  for (const p of data.pendingApprovals ?? []) {
    if (p.kind === "exception") {
      map.set(p.id, { employeeId: p.employeeId, employeeName: p.employeeName });
    }
  }
  return map;
}

function lastExceptionTouch(ex: HorodateurRegistreExceptionDetail) {
  return ex.reviewedAt ?? ex.requestedAt;
}

export default function DirectionHorodateurRegistreClient() {
  const { user, loading, hasPermission } = useCurrentAccess();
  const [activeTab, setActiveTab] = useState<RegistrerTabId>("global");

  const [preset, setPreset] = useState<PeriodPreset>("week_current");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [company, setCompany] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [data, setData] = useState<HorodateurRegistrePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  /** Onglet Rapport employe */
  const [reportEmployeeId, setReportEmployeeId] = useState<string>("");
  const [reportDetail, setReportDetail] = useState<
    DetailBody & { shifts?: Array<Record<string, unknown>> }
  >({
    employeeName: null,
    events: [],
    exceptions: [],
    notes: [],
    shifts: [],
  });
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailBody, setDetailBody] = useState<DetailBody | null>(null);

  const range = useMemo(() => presetRange(preset), [preset]);
  const exLookup = useMemo(() => exceptionEmployerLookup(data), [data]);

  useEffect(() => {
    if (preset !== "custom") {
      setStartDate(range.start);
      setEndDate(range.end);
      setCustomStart(range.start);
      setCustomEnd(range.end);
      return;
    }
    const s =
      customStart && /^\d{4}-\d{2}-\d{2}$/.test(customStart)
        ? customStart
        : range.start;
    const e =
      customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customEnd) ? customEnd : range.end;
    setStartDate(s);
    setEndDate(e);
  }, [preset, range.start, range.end, customStart, customEnd]);

  const loadRegister = useCallback(async () => {
    if (!user) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Session absente.");
      return;
    }

    setFetching(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        startDate,
        endDate,
        company,
        status,
      });
      if (employeeId !== "all") {
        qs.set("employeeId", employeeId);
      }

      const res = await fetch(`/api/direction/horodateur/registre?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok) {
        setData(null);
        setError(typeof json.error === "string" ? json.error : "Chargement impossible.");
        return;
      }

      setData(json as unknown as HorodateurRegistrePayload);
    } catch {
      setData(null);
      setError("Erreur reseau.");
    } finally {
      setFetching(false);
    }
  }, [user, startDate, endDate, employeeId, company, status]);

  useEffect(() => {
    if (!loading && user && hasPermission("terrain")) {
      void loadRegister();
    }
  }, [loading, user, hasPermission, loadRegister]);

  const loadEmployeePeriodDetail = useCallback(
    async (
      empId: number,
      empName: string | null,
      mode: "drawer" | "report"
    ) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        if (mode === "drawer") {
          setDetailError("Session absente.");
        } else {
          setReportError("Session absente.");
        }
        return;
      }

      if (mode === "drawer") {
        setDetailOpen(true);
        setDetailLoading(true);
        setDetailError(null);
        setDetailBody(null);
      } else {
        setReportLoading(true);
        setReportError(null);
      }

      try {
        const qs = new URLSearchParams({ startDate, endDate });
        const res = await fetch(`/api/direction/horodateur/registre/${empId}?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as {
          error?: string;
          events?: HorodateurRegistreEventDetail[];
          exceptions?: HorodateurRegistreExceptionDetail[];
          shifts?: unknown[];
          calculationNotes?: string[];
        };

        if (!res.ok) {
          const msg =
            typeof json.error === "string" ? json.error : "Detail indisponible.";
          if (mode === "drawer") {
            setDetailError(msg);
          } else {
            setReportError(msg);
          }
          return;
        }

        const body: DetailBody = {
          employeeName: empName,
          events: json.events ?? [],
          exceptions: json.exceptions ?? [],
          notes: json.calculationNotes ?? [],
        };

        if (mode === "drawer") {
          setDetailBody(body);
        } else {
          setReportDetail({
            ...body,
            shifts: Array.isArray(json.shifts)
              ? (json.shifts as Array<Record<string, unknown>>)
              : [],
          });
        }
      } catch {
        if (mode === "drawer") {
          setDetailError("Erreur reseau.");
        } else {
          setReportError("Erreur reseau.");
        }
      } finally {
        if (mode === "drawer") {
          setDetailLoading(false);
        } else {
          setReportLoading(false);
        }
      }
    },
    [startDate, endDate]
  );

  useEffect(() => {
    if (activeTab !== "employee") {
      return;
    }
    const idNum = Number(reportEmployeeId);
    if (!reportEmployeeId || !Number.isFinite(idNum) || idNum <= 0) {
        setReportDetail({
          employeeName: null,
          events: [],
          exceptions: [],
          notes: [],
          shifts: [],
        });
      setReportLoading(false);
      return;
    }
    const emp = data?.employeeOptions?.find((e) => e.id === idNum);
    void loadEmployeePeriodDetail(idNum, emp?.name ?? null, "report");
  }, [activeTab, reportEmployeeId, data?.employeeOptions, loadEmployeePeriodDetail]);

  if (loading) {
    return (
      <TagoraLoadingScreen
        isLoading
        message="Verification des acces..."
        fullScreen
      />
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
            <h1 className="text-xl font-semibold text-slate-900">Registre des heures</h1>
            <p className="mt-3 text-sm text-slate-600">
              La permission terrain est requise pour consulter le registre des heures.
            </p>
            <Link href="/direction/dashboard" className="mt-6 inline-block">
              <SecondaryButton>Retour au tableau de bord</SecondaryButton>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const summary = data?.summary;
  const reportShiftsRaw = Array.isArray(reportDetail.shifts) ? reportDetail.shifts : [];
  const reportShiftTotals = reportShiftsRaw.reduce<{ worked: number; payable: number; days: number }>(
    (acc, raw) => {
      const row = raw as Record<string, number | undefined>;
      return {
        worked: acc.worked + Number(row.workedMinutes ?? row.worked_minutes ?? 0),
        payable: acc.payable + Number(row.payableMinutes ?? row.payable_minutes ?? 0),
        days: acc.days + 1,
      };
    },
    { worked: 0, payable: 0, days: 0 }
  );

  const sortedExceptions = [...(data?.exceptions ?? [])].sort((a, b) =>
    lastExceptionTouch(b).localeCompare(lastExceptionTouch(a))
  );

  const inputClass =
    "w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-3 text-[15px] text-slate-900 shadow-inner shadow-slate-900/5 outline-none ring-slate-300/80 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200/70";

  return (
    <main className="tagora-app-shell min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_45%,#f1f5f9_100%)]">
      <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 lg:px-10">
        {/* En-tête large */}
        <header className="mb-8 flex flex-col gap-6 rounded-3xl border border-white/70 bg-white/90 px-5 py-6 shadow-[0_20px_60px_-16px_rgba(15,23,42,0.12)] backdrop-blur sm:px-8 sm:py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              <div
                aria-hidden
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#0f3557_0%,#1e4b7c_48%,#102a52_100%)] text-lg font-black tracking-tight text-white shadow-lg shadow-slate-900/25"
              >
                T
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h1 className="text-[1.85rem] font-bold leading-tight tracking-tight text-slate-900 sm:text-[2.1rem]">
                    Registre des heures
                  </h1>
                  <span className="hidden rounded-full border border-sky-100 bg-sky-50 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-sky-800 sm:inline">
                    Direction
                  </span>
                </div>
                <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
                  Consultation des heures par semaine, mois et employe — registre administratif consolidé.
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-3 lg:justify-end">
              <Link
                href="/direction/horodateur"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden /> Retour horodateur
              </Link>
              <Link
                href="/direction/dashboard"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(145deg,#0f3557,#1c4f85)] px-5 text-sm font-semibold text-white shadow-md shadow-slate-900/20 transition hover:opacity-95"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                Tableau de bord direction
              </Link>
            </div>
          </div>
        </header>

        {/* Onglets */}
        <div className="mb-6 inline-flex rounded-2xl border border-slate-200/80 bg-slate-200/35 p-1.5 shadow-inner">
          {(
            [
              ["global", "Vue globale"],
              ["employee", "Rapport par employé"],
              ["exceptions", "Exceptions à vérifier"],
            ] as const
          ).map(([id, label]) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition sm:px-6 sm:py-3 sm:text-[15px] ${
                  selected
                    ? "bg-[linear-gradient(145deg,#0f3557,#153d66)] text-white shadow-md shadow-slate-900/20"
                    : "bg-white/90 text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Filtres — visibles surtout vue globale, utiles aussi aux autres */}
        <section className="mb-8 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_14px_40px_-12px_rgba(15,23,42,0.1)] sm:p-7 lg:p-8">
          <div className="mb-6 flex flex-col gap-2 border-b border-slate-100 pb-5">
            <h2 className="text-lg font-bold text-slate-900">Filtres et période</h2>
            <p className="text-sm text-slate-500">
              Ajustez la fenêtre puis actualisez — les trois onglets utilisent ces paramètres.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr,minmax(0,1fr)]">
            <div>
              <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                Période rapide
              </p>
              <div className="flex flex-wrap gap-2.5">
                {(
                  [
                    ["week_current", "Semaine courante"],
                    ["week_prev", "Semaine précédente"],
                    ["month_current", "Mois courant"],
                    ["month_prev", "Mois précédent"],
                    ["custom", "Personnalisé"],
                  ] as const
                ).map(([id, label]) => {
                  const sel = preset === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPreset(id)}
                      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:px-5 sm:py-3 sm:text-[15px] ${
                        sel
                          ? "bg-slate-900 text-white shadow-md shadow-slate-900/25"
                          : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 text-[15px] text-slate-700">
                <CalendarRange className="h-5 w-5 text-sky-700" aria-hidden />
                <span className="font-semibold">
                  Fenêtre&nbsp;:{" "}
                  <span className="tabular-nums text-slate-900">
                    {startDate} au {endDate}
                  </span>
                </span>
              </div>

              {preset === "custom" ? (
                <div className="mt-4 flex flex-wrap gap-5">
                  <label className="block min-w-[200px] flex-1">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Date début
                    </span>
                    <input
                      type="date"
                      className={inputClass}
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </label>
                  <label className="block min-w-[200px] flex-1">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                      Date fin
                    </span>
                    <input
                      type="date"
                      className={inputClass}
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:gap-6">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Employé (filtre tableau)
                </span>
                <select
                  className={inputClass}
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  <option value="all">Tous les employés</option>
                  {(data?.employeeOptions ?? []).map((e) => (
                    <option key={e.id} value={String(e.id)}>
                      {e.name ?? `Employé #${e.id}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Compagnie
                </span>
                <select
                  className={inputClass}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                >
                  <option value="all">Toutes</option>
                  <option value="oliem">Oliem</option>
                  <option value="titan">Titan</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Statut
                </span>
                <select
                  className={inputClass}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">Tous</option>
                  <option value="complet">Complet</option>
                  <option value="incomplet">Incomplet</option>
                  <option value="en_attente">En attente d approbation</option>
                  <option value="corrige">Corrigé</option>
                  <option value="exception">Exception</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-4 border-t border-slate-100 pt-7 sm:flex-row sm:items-center sm:justify-between">
            <PrimaryButton type="button" onClick={() => void loadRegister()}>
              <span className="inline-flex items-center gap-2 text-[15px] font-semibold">
                Actualiser le registre
              </span>
            </PrimaryButton>
            <SecondaryButton
              type="button"
              disabled
              title="Export prévu phase 2"
              className="h-11 shrink-0 rounded-xl border border-slate-200 px-5 text-sm opacity-65"
            >
              <span className="inline-flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" aria-hidden />
                Export phase 2
              </span>
            </SecondaryButton>
          </div>

          {error ? (
            <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {error}
            </p>
          ) : null}
        </section>

        {fetching && !data ? (
          <div className="py-16">
            <TagoraLoadingScreen isLoading message="Chargement du registre..." />
          </div>
        ) : null}

        {/* Vue globale */}
        {activeTab === "global" ? (
          <>
            {summary ? (
              <section className="mb-10">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-slate-900">Résumé global</h2>
                  <p className="text-sm text-slate-500">
                    Indicateurs agrégés sur la période et filtres sélectionnés.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:gap-5">
                  {[
                    {
                      label: "Heures travaillées",
                      value: fmtHoursMinutes(summary.totalWorkedMinutes),
                      sub: "Minutes pointées cumulées",
                      icon: Timer,
                      tone: "from-sky-50 to-white",
                      iconClr: "text-sky-600",
                    },
                    {
                      label: "Heures approuvées",
                      value: fmtHoursMinutes(summary.totalApprovedPayableMinutes),
                      sub: "Minutes payables approuvées",
                      icon: ShieldCheck,
                      tone: "from-emerald-50 to-white",
                      iconClr: "text-emerald-600",
                    },
                    {
                      label: "En attente approb.",
                      value: fmtHoursMinutes(summary.totalPendingPayableMinutes),
                      sub: "À valider côté direction",
                      icon: TrendingUp,
                      tone: "from-amber-50 to-white",
                      iconClr: "text-amber-600",
                    },
                    {
                      label: "Impact exceptions",
                      value: `${summary.totalExceptionImpactMinutes} min`,
                      sub: "Volume déclaré exceptions",
                      icon: AlertTriangle,
                      tone: "from-rose-50 to-white",
                      iconClr: "text-rose-600",
                    },
                    {
                      label: "Titan refacturable",
                      value: fmtHoursMinutes(summary.titanRefundablePayableMinutes),
                      sub: "Contexte Titan",
                      icon: Wallet,
                      tone: "from-violet-50 to-white",
                      iconClr: "text-violet-600",
                    },
                    {
                      label: "Employés actifs",
                      value: String(summary.activeEmployeesInPeriod),
                      sub: "Dans cette période",
                      icon: Users,
                      tone: "from-slate-50 to-white",
                      iconClr: "text-slate-700",
                    },
                    {
                      label: "Quarts incomplets",
                      value: String(summary.incompleteShiftCount),
                      sub: "Sortie manquante / ouverts",
                      icon: Clock3,
                      tone: "from-orange-50 to-white",
                      iconClr: "text-orange-600",
                    },
                  ].map((card, i) => {
                    const Ico = card.icon;
                    return (
                      <article
                        key={i}
                        className={`group flex flex-col rounded-3xl border border-slate-200/75 bg-gradient-to-br p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.tone}`}
                      >
                        <div className="mb-5 flex items-start justify-between gap-3">
                          <div
                            className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60 ${card.iconClr}`}
                          >
                            <Ico className="h-[22px] w-[22px] opacity-90" aria-hidden />
                          </div>
                        </div>
                        <div className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                          {card.label}
                        </div>
                        <div className="mt-1 break-words text-2xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-[1.75rem]">
                          {card.value}
                        </div>
                        <div className="mt-2 text-[13px] leading-snug text-slate-600">
                          {card.sub}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_14px_40px_-12px_rgba(15,23,42,0.1)] sm:p-8">
              <div className="mb-6 flex flex-col gap-1">
                <h2 className="text-xl font-bold text-slate-900">Tableau du registre</h2>
                <p className="text-sm text-slate-500">Une ligne par employé pour la période filtrée.</p>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full min-w-[920px] border-collapse text-[15px]">
                  <thead>
                    <tr className="bg-slate-100/90 text-left text-[13px] font-bold uppercase tracking-wide text-slate-600">
                      {[
                        "Employé",
                        "Compagnie",
                        "Période",
                        "Normales",
                        "Sup.",
                        "Titan",
                        "Pauses",
                        "Exc.",
                        "Statut",
                        "Dernière modif.",
                        "",
                      ].map((h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-4 font-semibold tracking-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.employees ?? []).map((row, idx) => (
                      <tr
                        key={row.employeeId}
                        className={`border-t border-slate-100 transition hover:bg-sky-50/40 ${
                          idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                        }`}
                      >
                        <td className="px-4 py-3.5 font-semibold text-slate-900">
                          {row.employeeName ?? `#${row.employeeId}`}
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">{row.primaryCompanyLabel}</td>
                        <td className="max-w-[140px] px-4 py-3.5 text-slate-600">{row.periodLabel}</td>
                        <td className="px-4 py-3.5 tabular-nums font-medium text-slate-800">
                          {fmtHoursMinutesLabel(row.normalMinutes)}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-slate-700">
                          {fmtHoursMinutesLabel(row.overtimeMinutes)}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-slate-700">
                          {fmtHoursMinutesLabel(row.titanRefundableMinutes)}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-slate-700">
                          {fmtHoursMinutesLabel(row.breakMinutes)}
                        </td>
                        <td className="px-4 py-3.5">
                          {row.exceptionCount > 0 ? (
                            <StatusBadge label={`${row.exceptionCount}`} tone="warning" />
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex">
                            <StatusBadge label={row.statusLabel} tone={statusTone(row.statusKey)} />
                          </span>
                        </td>
                        <td className="max-w-[120px] px-4 py-3.5 text-sm text-slate-600">
                          {fmtDateTime(row.lastUpdatedAt)}
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow hover:bg-slate-800"
                            onClick={() =>
                              void loadEmployeePeriodDetail(row.employeeId, row.employeeName, "drawer")
                            }
                          >
                            Voir détail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!fetching && (data?.employees?.length ?? 0) === 0 ? (
                <p className="mt-10 text-center text-base font-medium text-slate-600">
                  Aucune heure trouvée pour cette période.
                </p>
              ) : null}
            </section>
          </>
        ) : null}

        {activeTab === "employee" ? (
          <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_14px_40px_-12px_rgba(15,23,42,0.1)] sm:p-8 lg:p-10">
            <div className="mb-8 flex flex-col gap-2">
              <h2 className="text-xl font-bold text-slate-900">Rapport par employé</h2>
              <p className="max-w-2xl text-sm text-slate-500">
                Analyse chronologique des punchs pour un employé sur la période sélectionnée ci-dessus.
              </p>
            </div>

            <label className="mb-10 block max-w-xl">
              <span className="mb-2 block text-sm font-bold text-slate-800">
                Sélectionnez un employé
              </span>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <select
                  className={`${inputClass} pl-12 text-[15px] font-medium`}
                  value={reportEmployeeId}
                  onChange={(e) => setReportEmployeeId(e.target.value)}
                >
                  <option value="">— Choisir un employé —</option>
                  {(data?.employeeOptions ?? []).map((e) => (
                    <option key={e.id} value={String(e.id)}>
                      {e.name ?? `Employé #${e.id}`}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            {reportEmployeeId === "" ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 py-14 text-center text-slate-500">
                Sélectionnez un employé pour afficher le rapport détaillé.
              </p>
            ) : reportLoading ? (
              <TagoraLoadingScreen isLoading message="Chargement du rapport employé..." />
            ) : reportError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {reportError}
              </p>
            ) : (
              <>
                <div className="mb-10 grid gap-4 sm:grid-cols-3">
                  {[
                    {
                      title: "Minutes travaillées",
                      v: `${fmtHoursMinutesLabel(reportShiftTotals.worked)}`,
                      sub: `${reportShiftTotals.days} jour(s) de quart`,
                    },
                    {
                      title: "Minutes payables",
                      v: `${fmtHoursMinutesLabel(reportShiftTotals.payable)}`,
                      sub: "Sur la même période",
                    },
                    {
                      title: "Événements",
                      v: `${reportDetail.events?.length ?? 0}`,
                      sub: "Lignes de punch chronologiques",
                    },
                  ].map((c) => (
                    <article
                      key={c.title}
                      className="rounded-3xl border border-slate-200/75 bg-gradient-to-br from-sky-50/80 via-white to-slate-50/50 p-6 shadow-sm"
                    >
                      <div className="text-[13px] font-semibold text-slate-500">{c.title}</div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">{c.v}</div>
                      <div className="mt-1 text-sm text-slate-600">{c.sub}</div>
                    </article>
                  ))}
                </div>

                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-bold text-slate-900">Historique chronologique</h3>
                  <SecondaryButton
                    disabled
                    className="h-10 rounded-xl px-5 text-sm opacity-60"
                    title="Export prévu phase 2"
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" /> Export phase 2
                    </span>
                  </SecondaryButton>
                </div>

                {(reportDetail.notes ?? []).map((note, idx) => (
                  <AppCard key={note + idx} tone="muted" className="mb-4 rounded-2xl text-sm leading-relaxed">
                    {note}
                  </AppCard>
                ))}

                <div className="rounded-2xl border border-slate-100 bg-slate-50/40 p-5">
                  <div className="space-y-3">
                    {[...(reportDetail.events ?? [])]
                      .sort((a, b) => {
                        const ta = a.occurredAt ? Date.parse(a.occurredAt) : 0;
                        const tb = b.occurredAt ? Date.parse(b.occurredAt) : 0;
                        return ta - tb;
                      })
                      .map((ev) => (
                        <div
                          key={ev.id}
                          className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white bg-white px-4 py-3.5 shadow-sm"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                              {ev.eventType}
                              <StatusBadge
                                label={ev.status}
                                tone={
                                  ev.status === "en_attente"
                                    ? "warning"
                                    : ev.status === "approuve"
                                      ? "success"
                                      : "default"
                                }
                              />
                              <StatusBadge label={sourceLabel(ev)} tone="info" />
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              {fmtDateTime(ev.occurredAt)} · Travail{" "}
                              <span className="font-medium tabular-nums">{ev.workDate ?? "—"}</span>
                            </div>
                            {ev.notes ? (
                              <p className="mt-2 text-sm text-slate-700">{ev.notes}</p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                  </div>
                  {(reportDetail.events ?? []).length === 0 ? (
                    <p className="py-12 text-center text-slate-500">
                      Aucun punch dans la fenêtre sélectionnée.
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </section>
        ) : null}

        {activeTab === "exceptions" ? (
          <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_14px_40px_-12px_rgba(15,23,42,0.1)] sm:p-8 lg:p-10">
            <div className="mb-8 flex flex-col gap-2">
              <h2 className="text-xl font-bold text-slate-900">Exceptions à vérifier</h2>
              <p className="max-w-2xl text-sm text-slate-500">
                Synthèse des exceptions remontées sur la période (alignée avec le filtre registre).
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[840px] border-collapse text-[15px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-amber-50/95 text-left text-[13px] font-bold uppercase tracking-wide text-slate-700">
                    {["Date / demande", "Employé", "Type", "Description", "Statut", "Dernière modif.", ""].map(
                      (h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-4 tracking-normal">
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedExceptions.map((ex, idx) => {
                    const link = exLookup.get(ex.id);
                    return (
                      <tr
                        key={ex.id}
                        className={`border-t border-slate-100 transition hover:bg-amber-50/25 ${
                          idx % 2 === 1 ? "bg-slate-50/35" : "bg-white"
                        }`}
                      >
                        <td className="max-w-[150px] px-4 py-3.5 text-sm text-slate-800">
                          {fmtDateTime(ex.requestedAt)}
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-900">
                          {link?.employeeName ?? "—"}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-700">{ex.exceptionType}</td>
                        <td className="max-w-[340px] px-4 py-3.5 text-slate-700">
                          <div className="font-semibold">{ex.reasonLabel}</div>
                          {ex.details ? (
                            <div className="mt-1 text-sm text-slate-600">{ex.details}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <StatusBadge
                            label={ex.status.replace(/_/g, " ")}
                            tone={ex.status === "en_attente" ? "warning" : "default"}
                          />
                        </td>
                        <td className="max-w-[150px] px-4 py-3.5 text-sm text-slate-600">
                          {fmtDateTime(lastExceptionTouch(ex))}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            disabled={!link}
                            title={
                              link
                                ? "Ouvrir le détail employé"
                                : "Employé non résolu automatiquement"
                            }
                            className={`inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold ${
                              link
                                ? "bg-slate-900 text-white shadow hover:bg-slate-800"
                                : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                            }`}
                            onClick={() =>
                              link
                                ? void loadEmployeePeriodDetail(
                                    link.employeeId,
                                    link.employeeName,
                                    "drawer"
                                  )
                                : undefined
                            }
                          >
                            Voir détail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sortedExceptions.length === 0 ? (
              <p className="mt-12 text-center text-base font-medium text-slate-600">
                Aucune exception à vérifier pour cette période.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      {/* Panneau détail */}
      {detailOpen ? (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-[80] flex justify-end bg-slate-900/45 backdrop-blur-[2px]"
        >
          <div className="flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-slate-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Détail employé
                </div>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">{detailBody?.employeeName ?? "…"}</h2>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                className="-mr-2 rounded-xl p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                onClick={() => setDetailOpen(false)}
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-10 pt-6">
              {detailLoading ? (
                <p className="text-slate-500">Chargement…</p>
              ) : null}
              {detailError ? (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{detailError}</p>
              ) : null}

              {detailBody ? (
                <div className="space-y-8">
                  {(detailBody.notes ?? []).map((note, idx) => (
                    <AppCard key={note + idx} tone="muted" className="rounded-2xl text-sm leading-relaxed">
                      {note}
                    </AppCard>
                  ))}

                  <div>
                    <h3 className="mb-3 text-lg font-bold text-slate-900">Quarts (entrée / sortie)</h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-[13px]">
                        <thead>
                          <tr className="bg-slate-100/90 text-left text-slate-600">
                            <th className="px-3 py-2 font-semibold">Date</th>
                            <th className="px-3 py-2 font-semibold">Entrée</th>
                            <th className="px-3 py-2 font-semibold">Sortie</th>
                            <th className="px-3 py-2 font-semibold">Durée</th>
                            <th className="px-3 py-2 font-semibold">Cie.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {derivePairedRows(detailBody.events).map((pn, ix) => (
                            <tr key={ix} className="border-t border-slate-100 hover:bg-sky-50/30">
                              <td className="px-3 py-2 tabular-nums">{pn.workDate ?? "—"}</td>
                              <td className="px-3 py-2">{fmtDateTime(pn.entryAt)}</td>
                              <td className="px-3 py-2">{pn.exitAt ? fmtDateTime(pn.exitAt) : "—"}</td>
                              <td className="px-3 py-2">
                                <span className="font-semibold tabular-nums">
                                  {pn.durationMinutes != null ? fmtHoursMinutesLabel(pn.durationMinutes) : "—"}
                                </span>
                                {pn.incomplete ? (
                                  <span className="ml-2 inline-flex align-middle">
                                    <StatusBadge label="Incomplet" tone="warning" />
                                  </span>
                                ) : null}
                              </td>
                              <td className="max-w-[100px] truncate px-3 py-2 text-slate-600">
                                {pn.company ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-4 text-lg font-bold text-slate-900">Événements chronologiques</h3>
                    <div className="flex flex-col gap-3">
                      {detailBody.events.map((ev) => (
                        <AppCard key={ev.id} className="rounded-2xl border border-slate-100">
                          <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                            {ev.eventType}
                            <StatusBadge
                              label={ev.status}
                              tone={
                                ev.status === "en_attente"
                                  ? "warning"
                                  : ev.status === "approuve"
                                    ? "success"
                                    : "default"
                              }
                            />
                            <StatusBadge label={sourceLabel(ev)} tone="info" />
                            {ev.exceptionCode ? (
                              <StatusBadge label={`Exc. ${ev.exceptionCode}`} tone="warning" />
                            ) : null}
                          </div>
                          <div className="mt-2 text-xs text-slate-600">
                            {fmtDateTime(ev.occurredAt)} · {ev.workDate ?? "—"}{" "}
                            {[ev.livraisonId ? `Liv. ${ev.livraisonId}` : "", ev.sortieId ? `Sortie ${ev.sortieId}` : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          {(ev.approvalNote || ev.approvedAt) && (
                            <div className="mt-2 text-sm text-slate-800">
                              <span className="font-semibold">Approbation</span>:{" "}
                              {ev.approvedAt ? fmtDateTime(ev.approvedAt) : "—"}
                              {ev.approvalNote ? ` · ${ev.approvalNote}` : ""}
                            </div>
                          )}
                          {ev.notes ? <div className="mt-2 text-sm">Notes: {ev.notes}</div> : null}
                          {ev.isManualCorrection ? (
                            <div className="mt-2">
                              <StatusBadge label="Correction manuelle" tone="warning" />
                            </div>
                          ) : null}
                        </AppCard>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-4 text-lg font-bold text-slate-900">Exceptions</h3>
                    {!detailBody.exceptions.length ? (
                      <p className="text-slate-500">Aucune exception sur la période.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {detailBody.exceptions.map((exRecord) => (
                          <AppCard key={exRecord.id} className="rounded-2xl">
                            <div className="font-bold text-slate-900">{exRecord.reasonLabel}</div>
                            <div className="mt-1 text-sm text-slate-600">
                              {exRecord.exceptionType} · {exRecord.impactMinutes} min · {exRecord.status}
                            </div>
                            {exRecord.reviewNote ? (
                              <div className="mt-2 text-sm">{exRecord.reviewNote}</div>
                            ) : null}
                          </AppCard>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
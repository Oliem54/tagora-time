"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarRange,
  Clock3,
  FileSpreadsheet,
  RefreshCw,
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
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraIconBadge from "@/app/components/TagoraIconBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import TagoraStatCard from "@/app/components/TagoraStatCard";
import type { TagoraStatTone } from "@/app/components/tagora-stat-tone";
import HorodateurDirectionPageShell from "@/app/direction/horodateur/HorodateurDirectionPageShell";
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
  const searchParams = useSearchParams();
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

  const employeeIdParam = searchParams.get("employeeId");
  const periodParam = searchParams.get("period");

  useLayoutEffect(() => {
    const rawId = employeeIdParam;
    if (rawId && /^\d+$/.test(rawId.trim())) {
      setEmployeeId(rawId.trim());
    }
    const period = periodParam;
    if (period === "currentWeek") {
      setPreset("week_current");
    } else if (period === "currentMonth") {
      setPreset("month_current");
    }
  }, [employeeIdParam, periodParam]);

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
      <HorodateurDirectionPageShell
        active="registre"
        subtitle="Registre consolidé des heures, événements et exceptions."
      >
        <AppCard tone="muted" className="ui-stack-sm">
          <h2 className="text-lg font-bold text-slate-900" style={{ margin: 0 }}>
            Accès restreint
          </h2>
          <p className="ui-text-muted" style={{ margin: 0 }}>
            La permission terrain est requise pour consulter le registre des heures.
          </p>
          <Link href="/direction/dashboard">
            <SecondaryButton>Retour au tableau de bord</SecondaryButton>
          </Link>
        </AppCard>
      </HorodateurDirectionPageShell>
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

  const inputClass = "tagora-input";

  return (
    <HorodateurDirectionPageShell
      active="registre"
      subtitle="Registre consolidé des heures, événements et exceptions."
      actions={
        <SecondaryButton type="button" onClick={() => void loadRegister()} disabled={fetching}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <RefreshCw size={16} />
            {fetching ? "Actualisation..." : "Actualiser"}
          </span>
        </SecondaryButton>
      }
    >

        <div className="horodateur-direction-tabs">
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
                className={`horodateur-direction-tab${
                  selected ? " horodateur-direction-tab--active" : ""
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <SectionCard
          title="Filtres et période"
          subtitle="Ajustez la fenêtre puis actualisez — les trois onglets utilisent ces paramètres."
          actions={
            <TagoraIconBadge tone="slate" size="lg">
              <CalendarRange size={24} strokeWidth={2.1} />
            </TagoraIconBadge>
          }
        >
          <div className="ui-stack-md">
            <div>
              <p className="ui-eyebrow" style={{ marginBottom: "var(--ui-space-2)" }}>
                Période rapide
              </p>
              <div className="horodateur-direction-filter-chips">
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
                      className={`horodateur-direction-filter-chip${
                        sel ? " horodateur-direction-filter-chip--active" : ""
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="horodateur-direction-period-label" style={{ marginTop: "var(--ui-space-4)" }}>
                <CalendarRange size={18} strokeWidth={2.1} aria-hidden />
                <span>
                  Fenêtre :{" "}
                  <span style={{ color: "#0f172a" }}>
                    {startDate} au {endDate}
                  </span>
                </span>
              </div>

              {preset === "custom" ? (
                <div className="horodateur-direction-filter-grid" style={{ marginTop: "var(--ui-space-3)", maxWidth: 520 }}>
                  <label className="ui-stack-xs">
                    <span className="ui-eyebrow">Date début</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </label>
                  <label className="ui-stack-xs">
                    <span className="ui-eyebrow">Date fin</span>
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

            <div className="horodateur-direction-filter-grid">
              <label className="ui-stack-xs">
                <span className="ui-eyebrow">Employé (filtre tableau)</span>
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
              <label className="ui-stack-xs">
                <span className="ui-eyebrow">Compagnie</span>
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
              <label className="ui-stack-xs">
                <span className="ui-eyebrow">Statut</span>
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

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--ui-space-3)",
              alignItems: "center",
              marginTop: "var(--ui-space-5)",
              paddingTop: "var(--ui-space-4)",
              borderTop: "1px solid rgba(148, 163, 184, 0.16)",
            }}
          >
            <PrimaryButton type="button" onClick={() => void loadRegister()}>
              Actualiser le registre
            </PrimaryButton>
            <SecondaryButton
              type="button"
              disabled
              title="Export prévu phase 2"
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <FileSpreadsheet size={18} aria-hidden />
                Export phase 2
              </span>
            </SecondaryButton>
          </div>

          {error ? (
            <AppCard
              tone="muted"
              style={{
                marginTop: "var(--ui-space-4)",
                borderColor: "rgba(220, 38, 38, 0.18)",
                background: "rgba(254, 242, 242, 0.8)",
              }}
            >
              <p className="horodateur-direction-info-banner horodateur-direction-info-banner--error" style={{ padding: 0 }}>
                {error}
              </p>
            </AppCard>
          ) : null}
        </SectionCard>

        {fetching && !data ? (
          <div className="py-16">
            <TagoraLoadingScreen isLoading message="Chargement du registre..." />
          </div>
        ) : null}

        {/* Vue globale */}
        {activeTab === "global" ? (
          <>
            {summary ? (
              <SectionCard
                title="Résumé global"
                subtitle="Indicateurs agrégés sur la période et filtres sélectionnés."
                actions={
                  <TagoraIconBadge tone="blue" size="lg">
                    <TrendingUp size={24} strokeWidth={2.1} />
                  </TagoraIconBadge>
                }
              >
                <div className="horodateur-direction-stat-grid">
                  {(
                    [
                      {
                        label: "Heures travaillées",
                        value: fmtHoursMinutes(summary.totalWorkedMinutes),
                        sub: "Minutes pointées cumulées",
                        Icon: Timer,
                        tone: "cyan" as TagoraStatTone,
                      },
                      {
                        label: "Heures approuvées",
                        value: fmtHoursMinutes(summary.totalApprovedPayableMinutes),
                        sub: "Minutes payables approuvées",
                        Icon: ShieldCheck,
                        tone: "green",
                      },
                      {
                        label: "En attente approb.",
                        value: fmtHoursMinutes(summary.totalPendingPayableMinutes),
                        sub: "À valider côté direction",
                        Icon: TrendingUp,
                        tone: "orange",
                      },
                      {
                        label: "Impact exceptions",
                        value: `${summary.totalExceptionImpactMinutes} min`,
                        sub: "Volume déclaré exceptions",
                        Icon: AlertTriangle,
                        tone: "red",
                      },
                      {
                        label: "Titan refacturable",
                        value: fmtHoursMinutes(summary.titanRefundablePayableMinutes),
                        sub: "Contexte Titan",
                        Icon: Wallet,
                        tone: "purple",
                      },
                      {
                        label: "Employés actifs",
                        value: String(summary.activeEmployeesInPeriod),
                        sub: "Dans cette période",
                        Icon: Users,
                        tone: "slate",
                      },
                      {
                        label: "Quarts incomplets",
                        value: String(summary.incompleteShiftCount),
                        sub: "Sortie manquante / ouverts",
                        Icon: Clock3,
                        tone: "orange",
                      },
                    ] as const
                  ).map((card, i) => {
                    const Ico = card.Icon;
                    return (
                      <TagoraStatCard
                        key={i}
                        title={card.label}
                        value={card.value}
                        subtitle={card.sub}
                        tone={card.tone}
                        icon={<Ico strokeWidth={2} aria-hidden />}
                      />
                    );
                  })}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard
              title="Tableau du registre"
              subtitle="Une ligne par employé pour la période filtrée."
              actions={
                <TagoraIconBadge tone="slate" size="lg">
                  <FileSpreadsheet size={24} strokeWidth={2.1} />
                </TagoraIconBadge>
              }
            >
              <div className="horodateur-direction-data-table-wrap">
                <table className="horodateur-direction-data-table" style={{ minWidth: 920 }}>
                  <thead>
                    <tr>
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
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.employees ?? []).map((row) => (
                      <tr key={row.employeeId}>
                        <td style={{ fontWeight: 700 }}>
                          {row.employeeName ?? `#${row.employeeId}`}
                        </td>
                        <td>{row.primaryCompanyLabel}</td>
                        <td className="ui-text-muted">{row.periodLabel}</td>
                        <td style={{ fontWeight: 600 }}>
                          {fmtHoursMinutesLabel(row.normalMinutes)}
                        </td>
                        <td>{fmtHoursMinutesLabel(row.overtimeMinutes)}</td>
                        <td>{fmtHoursMinutesLabel(row.titanRefundableMinutes)}</td>
                        <td>{fmtHoursMinutesLabel(row.breakMinutes)}</td>
                        <td>
                          {row.exceptionCount > 0 ? (
                            <StatusBadge label={`${row.exceptionCount}`} tone="warning" />
                          ) : (
                            <span className="ui-text-muted">0</span>
                          )}
                        </td>
                        <td>
                          <StatusBadge label={row.statusLabel} tone={statusTone(row.statusKey)} />
                        </td>
                        <td className="ui-text-muted" style={{ fontSize: 13 }}>
                          {fmtDateTime(row.lastUpdatedAt)}
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <PrimaryButton
                            type="button"
                            onClick={() =>
                              void loadEmployeePeriodDetail(row.employeeId, row.employeeName, "drawer")
                            }
                          >
                            Voir détail
                          </PrimaryButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!fetching && (data?.employees?.length ?? 0) === 0 ? (
                <p className="ui-text-muted" style={{ marginTop: "var(--ui-space-5)", textAlign: "center" }}>
                  Aucune heure trouvée pour cette période.
                </p>
              ) : null}
            </SectionCard>
          </>
        ) : null}

        {activeTab === "employee" ? (
          <SectionCard
            title="Rapport par employé"
            subtitle="Analyse chronologique des punchs pour un employé sur la période sélectionnée ci-dessus."
            actions={
              <TagoraIconBadge tone="green" size="lg">
                <UserRound size={24} strokeWidth={2.1} />
              </TagoraIconBadge>
            }
          >
            <label className="ui-stack-xs" style={{ maxWidth: 480, marginBottom: "var(--ui-space-5)" }}>
              <span className="ui-eyebrow">Sélectionnez un employé</span>
              <select
                className={inputClass}
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
            </label>

            {reportEmployeeId === "" ? (
              <AppCard tone="muted" className="ui-stack-sm" style={{ textAlign: "center", padding: "var(--ui-space-6)" }}>
                <p className="ui-text-muted" style={{ margin: 0 }}>
                  Sélectionnez un employé pour afficher le rapport détaillé.
                </p>
              </AppCard>
            ) : reportLoading ? (
              <TagoraLoadingScreen isLoading message="Chargement du rapport employé..." />
            ) : reportError ? (
              <AppCard
                tone="muted"
                style={{
                  borderColor: "rgba(220, 38, 38, 0.18)",
                  background: "rgba(254, 242, 242, 0.8)",
                }}
              >
                <p className="horodateur-direction-info-banner horodateur-direction-info-banner--error" style={{ padding: 0 }}>
                  {reportError}
                </p>
              </AppCard>
            ) : (
              <>
                <div className="horodateur-direction-stat-grid" style={{ marginBottom: "var(--ui-space-5)" }}>
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
                    <AppCard key={c.title} tone="muted" className="ui-stack-xs">
                      <span className="ui-eyebrow">{c.title}</span>
                      <strong style={{ fontSize: 24, color: "#0f172a" }}>{c.v}</strong>
                      <span className="ui-text-muted">{c.sub}</span>
                    </AppCard>
                  ))}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--ui-space-3)",
                    marginBottom: "var(--ui-space-4)",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
                    Historique chronologique
                  </h3>
                  <SecondaryButton
                    disabled
                    title="Export prévu phase 2"
                    type="button"
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <FileSpreadsheet size={16} /> Export phase 2
                    </span>
                  </SecondaryButton>
                </div>

                {(reportDetail.notes ?? []).map((note, idx) => (
                  <AppCard key={note + idx} tone="muted" className="ui-stack-xs" style={{ marginBottom: "var(--ui-space-3)" }}>
                    {note}
                  </AppCard>
                ))}

                <ul className="horodateur-direction-detail-list">
                  {[...(reportDetail.events ?? [])]
                    .sort((a, b) => {
                      const ta = a.occurredAt ? Date.parse(a.occurredAt) : 0;
                      const tb = b.occurredAt ? Date.parse(b.occurredAt) : 0;
                      return ta - tb;
                    })
                    .map((ev) => (
                      <li key={ev.id} className="horodateur-direction-detail-list-item">
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 700, color: "#0f172a" }}>{ev.eventType}</span>
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
                        <p className="ui-text-muted" style={{ margin: "6px 0 0" }}>
                          {fmtDateTime(ev.occurredAt)} · Travail {ev.workDate ?? "—"}
                        </p>
                        {ev.notes ? (
                          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#334155" }}>{ev.notes}</p>
                        ) : null}
                      </li>
                    ))}
                </ul>
                {(reportDetail.events ?? []).length === 0 ? (
                  <p className="ui-text-muted" style={{ marginTop: "var(--ui-space-4)", textAlign: "center" }}>
                    Aucun punch dans la fenêtre sélectionnée.
                  </p>
                ) : null}
              </>
            )}
          </SectionCard>
        ) : null}

        {activeTab === "exceptions" ? (
          <SectionCard
            title="Exceptions à vérifier"
            subtitle="Synthèse des exceptions remontées sur la période (alignée avec le filtre registre)."
            actions={
              <TagoraIconBadge tone="orange" size="lg">
                <AlertTriangle size={24} strokeWidth={2.1} />
              </TagoraIconBadge>
            }
          >
            <div className="horodateur-direction-data-table-wrap">
              <table className="horodateur-direction-data-table" style={{ minWidth: 840 }}>
                <thead>
                  <tr>
                    {["Date / demande", "Employé", "Type", "Description", "Statut", "Dernière modif.", ""].map(
                      (h) => (
                        <th key={h}>{h}</th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedExceptions.map((ex) => {
                    const link = exLookup.get(ex.id);
                    return (
                      <tr key={ex.id}>
                        <td className="ui-text-muted" style={{ fontSize: 13 }}>
                          {fmtDateTime(ex.requestedAt)}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {link?.employeeName ?? "—"}
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: 12 }}>{ex.exceptionType}</td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{ex.reasonLabel}</div>
                          {ex.details ? (
                            <div className="ui-text-muted" style={{ marginTop: 4, fontSize: 13 }}>{ex.details}</div>
                          ) : null}
                        </td>
                        <td>
                          <StatusBadge
                            label={ex.status.replace(/_/g, " ")}
                            tone={ex.status === "en_attente" ? "warning" : "default"}
                          />
                        </td>
                        <td className="ui-text-muted" style={{ fontSize: 13 }}>
                          {fmtDateTime(lastExceptionTouch(ex))}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <PrimaryButton
                            type="button"
                            disabled={!link}
                            title={
                              link
                                ? "Ouvrir le détail employé"
                                : "Employé non résolu automatiquement"
                            }
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
                          </PrimaryButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sortedExceptions.length === 0 ? (
              <p className="ui-text-muted" style={{ marginTop: "var(--ui-space-5)", textAlign: "center" }}>
                Aucune exception à vérifier pour cette période.
              </p>
            ) : null}
          </SectionCard>
        ) : null}

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
    </HorodateurDirectionPageShell>
  );
}
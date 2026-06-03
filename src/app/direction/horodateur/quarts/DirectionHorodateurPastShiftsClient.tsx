"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  ClipboardPen,
  Clock3,
  Lock,
  Plus,
  RefreshCw,
  Timer,
  UserRound,
} from "lucide-react";
import HorodateurRetroCorrectionModal from "@/app/components/horodateur/HorodateurRetroCorrectionModal";
import HorodateurDirectionPageShell from "@/app/direction/horodateur/HorodateurDirectionPageShell";
import HorodateurDirectionPrimaryActions from "@/app/direction/horodateur/HorodateurDirectionPrimaryActions";
import AppCard from "@/app/components/ui/AppCard";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraIconBadge from "@/app/components/TagoraIconBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import TagoraStatCard from "@/app/components/TagoraStatCard";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  parsePastShiftRetroSuggestionFromEvents,
  type StaffRetroForgottenEventType,
} from "@/app/lib/horodateur-retro-correction.shared";
import { getLocalWorkDate } from "@/app/lib/horodateur-v1/rules";
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

function toTorontoTimeHHMM(iso: string | null | undefined) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

function suggestRetroTime(
  eventType: StaffRetroForgottenEventType,
  row: HorodateurPastShiftRow
) {
  if (eventType === "punch_in") {
    return toTorontoTimeHHMM(row.shiftStartAt);
  }
  if (eventType === "punch_out") {
    return toTorontoTimeHHMM(row.shiftEndAt);
  }
  return "";
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
  const [message, setMessage] = useState<string | null>(null);
  const [retroModalOpen, setRetroModalOpen] = useState(false);
  const [retroSaving, setRetroSaving] = useState(false);
  const [retroError, setRetroError] = useState<string | null>(null);
  const [retroEmployeeId, setRetroEmployeeId] = useState("");
  const [retroWorkDate, setRetroWorkDate] = useState("");
  const [retroEventType, setRetroEventType] =
    useState<StaffRetroForgottenEventType>("punch_in");
  const [retroTime, setRetroTime] = useState("");
  const [retroReason, setRetroReason] = useState("");

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

  const retroEmployeeOptions = useMemo(
    () =>
      (data?.employeeOptions ?? []).map((item) => ({
        id: item.id,
        label: item.name ?? `Employé #${item.id}`,
      })),
    [data?.employeeOptions]
  );

  const openRetroCorrectionModal = useCallback(() => {
    setRetroError(null);
    setRetroEmployeeId("");
    setRetroWorkDate(getLocalWorkDate(new Date().toISOString()));
    setRetroEventType("punch_in");
    setRetroTime("");
    setRetroReason("");
    setRetroModalOpen(true);
  }, []);

  const openRetroCorrectionForSelectedShift = useCallback(() => {
    if (!selectedRow) {
      return;
    }

    const suggestedType =
      selectedDetail != null
        ? parsePastShiftRetroSuggestionFromEvents(
            selectedDetail.events.map((event) => ({
              canonicalType: event.canonicalType,
              eventType: event.eventType,
              status: event.status,
            }))
          )
        : null;
    const eventType = suggestedType ?? "punch_in";

    setRetroError(null);
    setRetroEmployeeId(String(selectedRow.employeeId));
    setRetroWorkDate(selectedRow.workDate);
    setRetroEventType(eventType);
    setRetroTime(suggestRetroTime(eventType, selectedRow));
    setRetroReason("");
    setRetroModalOpen(true);
  }, [selectedDetail, selectedRow]);

  async function handleRetroCorrectionSubmit() {
    setRetroSaving(true);
    setRetroError(null);
    setMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error("Session expirée. Reconnectez-vous.");
      }

      const response = await fetch("/api/direction/horodateur/retro-correction", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: Number(retroEmployeeId),
          date: retroWorkDate,
          eventType: retroEventType,
          time: retroTime,
          reason: retroReason,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Impossible d envoyer la demande de correction."
        );
      }

      setRetroModalOpen(false);
      setRetroReason("");
      setMessage(
        "Demande de correction envoyée. En attente d approbation admin avant comptabilisation."
      );
      await loadData();
    } catch (submitError) {
      setRetroError(
        submitError instanceof Error
          ? submitError.message
          : "Erreur lors de l envoi de la demande."
      );
    } finally {
      setRetroSaving(false);
    }
  }

  const inputClass = "tagora-input";

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
      <HorodateurDirectionPageShell
        active="quarts"
        subtitle="Consultation des quarts antérieurs et corrections rétroactives."
      >
        <AppCard tone="muted" className="ui-stack-sm">
          <h2 className="text-lg font-bold text-slate-900" style={{ margin: 0 }}>
            Accès restreint
          </h2>
          <p className="ui-text-muted" style={{ margin: 0 }}>
            La permission terrain est requise pour consulter les quarts passés.
          </p>
          <Link href="/direction/dashboard">
            <SecondaryButton>Retour au tableau de bord</SecondaryButton>
          </Link>
        </AppCard>
      </HorodateurDirectionPageShell>
    );
  }

  return (
    <HorodateurDirectionPageShell
      active="quarts"
      subtitle="Consultation des quarts antérieurs et corrections rétroactives."
      actions={
        <SecondaryButton type="button" onClick={() => void loadData()} disabled={loading}>
          <span className="inline-flex items-center gap-2">
            <RefreshCw size={16} />
            {loading ? "Actualisation..." : "Actualiser"}
          </span>
        </SecondaryButton>
      }
    >
        <HorodateurDirectionPrimaryActions
          onRetroCorrection={openRetroCorrectionModal}
          retroDisabled={retroSaving}
          current="quarts"
        />

        {message ? (
          <AppCard
            tone="muted"
            style={{
              borderColor: "rgba(5, 150, 105, 0.18)",
              background: "rgba(236, 253, 245, 0.92)",
            }}
          >
            <p className="horodateur-direction-info-banner horodateur-direction-info-banner--success" style={{ padding: 0 }}>
              {message}
            </p>
          </AppCard>
        ) : null}

        <AppCard tone="muted" className="ui-stack-sm" style={{ borderColor: "rgba(14, 165, 233, 0.22)", background: "linear-gradient(180deg, rgba(240, 249, 255, 0.98) 0%, rgba(255, 255, 255, 0.98) 100%)" }}>
          <p className="horodateur-direction-info-banner horodateur-direction-info-banner--info" style={{ padding: 0 }}>
            <strong>Consultation et correction rétroactive.</strong> Les demandes passent par
            approbation admin. L&apos;ajout, la modification et l&apos;annulation directe de quarts
            restent désactivés pour cette phase.
          </p>
        </AppCard>

        <SectionCard
          title="Filtres"
          subtitle="Période, employé, statut et compagnie."
          actions={
            <TagoraIconBadge tone="slate" size="lg">
              <CalendarRange size={24} strokeWidth={2.1} />
            </TagoraIconBadge>
          }
        >
          <div className="horodateur-direction-filter-chips" style={{ marginBottom: "var(--ui-space-4)" }}>
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
                className={`horodateur-direction-filter-chip${
                  periodPreset === id ? " horodateur-direction-filter-chip--active" : ""
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="horodateur-direction-filter-grid">
            <label className="ui-stack-xs">
              <span className="ui-eyebrow">Début</span>
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
              <span className="ui-eyebrow">Fin</span>
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
              <span className="ui-eyebrow">Employé</span>
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
              <span className="ui-eyebrow">Statut</span>
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
              <span className="ui-eyebrow">Compagnie</span>
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
        </SectionCard>

        {error ? (
          <AppCard
            tone="muted"
            style={{
              borderColor: "rgba(220, 38, 38, 0.18)",
              background: "rgba(254, 242, 242, 0.8)",
            }}
          >
            <p className="horodateur-direction-info-banner horodateur-direction-info-banner--error" style={{ padding: 0 }}>
              {error}
            </p>
          </AppCard>
        ) : null}

        {loading && !data ? (
          <TagoraLoadingScreen isLoading message="Chargement des quarts..." fullScreen={false} />
        ) : null}

        {data ? (
          <>
            <div className="horodateur-direction-stat-grid">
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

            <div className="horodateur-direction-split-layout">
              <SectionCard
                title="Liste des quarts"
                subtitle={`${data.summary.periodStart} → ${data.summary.periodEnd}`}
                actions={
                  <TagoraIconBadge tone="blue" size="lg">
                    <CalendarRange size={24} strokeWidth={2.1} />
                  </TagoraIconBadge>
                }
              >
                <div className="horodateur-direction-data-table-wrap">
                  <table className="horodateur-direction-data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Employé</th>
                        <th>Statut</th>
                        <th>Payable</th>
                        <th>Compagnie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.shifts.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", color: "#64748b", padding: "32px 14px" }}>
                            Aucun quart pour ces filtres.
                          </td>
                        </tr>
                      ) : (
                        data.shifts.map((row) => {
                          const selected = row.shiftId === selectedShiftId;
                          return (
                            <tr
                              key={row.shiftId}
                              className={selected ? "horodateur-direction-data-table-row--selected" : undefined}
                              style={{ cursor: "pointer" }}
                              onClick={() => setSelectedShiftId(row.shiftId)}
                            >
                              <td style={{ fontWeight: 600 }}>{fmtDate(row.workDate)}</td>
                              <td>{row.employeeName ?? `#${row.employeeId}`}</td>
                              <td>
                                <StatusBadge
                                  label={row.statusLabel}
                                  tone={statusTone(row.statusKey)}
                                />
                              </td>
                              <td>{fmtHoursMinutes(row.payableMinutes)}</td>
                              <td className="ui-text-muted">{row.companyLabel}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <aside className="ui-stack-md">
                <SectionCard
                  title="Détail du quart"
                  subtitle={selectedRow ? fmtDate(selectedRow.workDate) : "Sélectionnez un quart dans la liste."}
                  actions={
                    <TagoraIconBadge tone="green" size="lg">
                      <ClipboardPen size={24} strokeWidth={2.1} />
                    </TagoraIconBadge>
                  }
                >
                  {!selectedRow ? (
                    <p className="ui-text-muted" style={{ margin: 0 }}>
                      Sélectionnez un quart dans la liste.
                    </p>
                  ) : (
                    <div className="ui-stack-sm">
                      <div>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                          {selectedRow.employeeName ?? `Employé #${selectedRow.employeeId}`}
                        </p>
                        <p className="ui-text-muted" style={{ margin: "4px 0 0" }}>
                          {fmtDate(selectedRow.workDate)}
                        </p>
                      </div>
                      <StatusBadge
                        label={selectedRow.statusLabel}
                        tone={statusTone(selectedRow.statusKey)}
                      />
                      <dl className="horodateur-direction-filter-grid" style={{ gridTemplateColumns: "1fr 1fr", margin: 0 }}>
                        <div>
                          <dt className="ui-eyebrow">Début</dt>
                          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{fmtDateTime(selectedRow.shiftStartAt)}</dd>
                        </div>
                        <div>
                          <dt className="ui-eyebrow">Fin</dt>
                          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{fmtDateTime(selectedRow.shiftEndAt)}</dd>
                        </div>
                        <div>
                          <dt className="ui-eyebrow">Travaillé</dt>
                          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>
                            {fmtHoursMinutes(selectedRow.workedMinutes)}
                          </dd>
                        </div>
                        <div>
                          <dt className="ui-eyebrow">Payable</dt>
                          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>
                            {fmtHoursMinutes(selectedRow.payableMinutes)}
                          </dd>
                        </div>
                        <div>
                          <dt className="ui-eyebrow">Statut shift</dt>
                          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{selectedRow.shiftStatus}</dd>
                        </div>
                        <div>
                          <dt className="ui-eyebrow">Exceptions</dt>
                          <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{selectedRow.exceptionCount}</dd>
                        </div>
                      </dl>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ui-space-2)", paddingTop: "var(--ui-space-2)" }}>
                        <PrimaryButton
                          type="button"
                          onClick={openRetroCorrectionForSelectedShift}
                          disabled={retroSaving}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <ClipboardPen size={16} />
                            Corriger ce quart
                          </span>
                        </PrimaryButton>
                        <PrimaryButton type="button" disabled title="Phase ultérieure">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, opacity: 0.6 }}>
                            <Plus size={16} />
                            Ajouter un quart
                          </span>
                        </PrimaryButton>
                        <SecondaryButton type="button" disabled title="Phase ultérieure">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, opacity: 0.6 }}>
                            <Lock size={14} />
                            Modifier
                          </span>
                        </SecondaryButton>
                        <SecondaryButton type="button" disabled title="Phase ultérieure">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, opacity: 0.6 }}>
                            <Lock size={14} />
                            Annuler
                          </span>
                        </SecondaryButton>
                      </div>
                      <p className="ui-text-muted" style={{ margin: 0, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        <Lock size={12} />
                        Ajout / modification / annulation de quart — phase ultérieure
                      </p>
                    </div>
                  )}
                </SectionCard>

                {selectedRow && selectedDetail ? (
                  <>
                    <SectionCard
                      title={`Événements (${selectedDetail.events.length})`}
                      subtitle="Chronologie des punchs du quart."
                    >
                      {selectedDetail.events.length === 0 ? (
                        <p className="ui-text-muted" style={{ margin: 0 }}>Aucun événement.</p>
                      ) : (
                        <ul className="horodateur-direction-detail-list">
                          {selectedDetail.events.map((ev) => (
                            <li key={ev.id} className="horodateur-direction-detail-list-item">
                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ fontWeight: 700, color: "#0f172a" }}>
                                  {ev.canonicalType ?? ev.eventType}
                                </span>
                                <StatusBadge
                                  label={ev.status}
                                  tone={eventStatusTone(ev.status)}
                                />
                              </div>
                              <p className="ui-text-muted" style={{ margin: "6px 0 0" }}>{fmtDateTime(ev.occurredAt)}</p>
                              {ev.notes ? (
                                <p className="ui-text-muted" style={{ margin: "6px 0 0", fontSize: 12 }}>{ev.notes}</p>
                              ) : null}
                              <p className="ui-text-muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                                {ev.sourceKind ?? "—"} · {ev.actorRole ?? "—"}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </SectionCard>

                    <SectionCard
                      title={`Exceptions (${selectedDetail.exceptions.length})`}
                      subtitle="Demandes liées à ce quart."
                    >
                      {selectedDetail.exceptions.length === 0 ? (
                        <p className="ui-text-muted" style={{ margin: 0 }}>Aucune exception.</p>
                      ) : (
                        <ul className="horodateur-direction-detail-list">
                          {selectedDetail.exceptions.map((ex) => (
                            <li
                              key={ex.id}
                              className="horodateur-direction-detail-list-item horodateur-direction-detail-list-item--warning"
                            >
                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ fontWeight: 700, color: "#0f172a" }}>{ex.reasonLabel}</span>
                                <StatusBadge
                                  label={ex.status}
                                  tone={eventStatusTone(ex.status)}
                                />
                              </div>
                              <p className="ui-text-muted" style={{ margin: "6px 0 0", fontSize: 12 }}>{ex.exceptionType}</p>
                              {ex.details ? (
                                <p style={{ margin: "6px 0 0", fontSize: 14, color: "#334155" }}>{ex.details}</p>
                              ) : null}
                              <p className="ui-text-muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                                Demandé {fmtDateTime(ex.requestedAt)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="ui-text-muted" style={{ margin: "var(--ui-space-3) 0 0", fontSize: 12 }}>
                        Les demandes de correction rétroactive créées ici apparaissent dans l&apos;
                        <Link href="/direction/horodateur" className="tagora-dark-outline-action" style={{ textDecoration: "none", fontSize: 12, padding: "2px 8px", marginInline: 4 }}>
                          horodateur live
                        </Link>
                        (exceptions en attente admin).
                      </p>
                    </SectionCard>
                  </>
                ) : null}
              </aside>
            </div>
          </>
        ) : null}

        <HorodateurRetroCorrectionModal
          open={retroModalOpen}
          saving={retroSaving}
          submitError={retroError}
          employees={retroEmployeeOptions}
          employeeId={retroEmployeeId}
          workDate={retroWorkDate}
          eventType={retroEventType}
          time={retroTime}
          reason={retroReason}
          title="Corriger ce quart"
          onClose={() => {
            if (!retroSaving) {
              setRetroModalOpen(false);
              setRetroError(null);
            }
          }}
          onEmployeeIdChange={setRetroEmployeeId}
          onWorkDateChange={setRetroWorkDate}
          onEventTypeChange={setRetroEventType}
          onTimeChange={setRetroTime}
          onReasonChange={setRetroReason}
          onSubmit={() => void handleRetroCorrectionSubmit()}
        />
    </HorodateurDirectionPageShell>
  );
}

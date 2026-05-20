"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderTagora from "@/app/components/HeaderTagora";
import AccessNotice from "@/app/components/AccessNotice";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { useEmployeeGpsReporting } from "@/app/hooks/useEmployeeGpsReporting";
import { supabase } from "@/app/lib/supabase/client";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";

type EmployeeSnapshot = {
  employee: {
    employeeId: number;
    employee_id?: number | null;
    fullName: string | null;
    email: string | null;
    primaryCompany: "oliem_solutions" | "titan_produits_industriels" | null;
    /** Pause payée : aucun pointage pause requis (défaut true si absent). */
    pausePaid?: boolean;
  };
  currentState: {
    current_state?: string | null;
    status?: string | null;
    last_event_at?: string | null;
    last_event_type?: string | null;
    currentEventType?: string | null;
    startedAt?: string | null;
    has_open_exception?: boolean;
    activeExceptionCount?: number;
  };
  todayShift: {
    work_date: string;
    worked_minutes: number;
    payable_minutes: number;
    paid_break_minutes: number;
    unpaid_break_minutes: number;
    unpaid_lunch_minutes: number;
    pending_exception_minutes: number;
    approved_exception_minutes: number;
    anomalies_count: number;
    status: string;
  } | null;
  weeklyProjection: {
    workedMinutes: number;
    targetMinutes: number;
    remainingMinutes: number;
    projectedOverflowMinutes: number;
  };
  pendingExceptions: Array<{
    id: string;
    exception_type: string;
    reason_label: string;
    details: string | null;
    impact_minutes: number;
    status: string;
  }>;
  latenessContext?: LatenessContext | null;
};

type LatenessContext = {
  workDate: string;
  isLate: boolean;
  lateMinutes: number;
  scheduledStartAt: string | null;
  scheduledStartLabel: string | null;
  currentAt: string;
  currentLabel: string;
  isWithinScheduleWindow: boolean;
  canPunchNow: boolean;
  canRequestRetroactiveCorrection: boolean;
  showLateStartCard: boolean;
};

type HistoryPayload = {
  workDate: string;
  events: Array<{
    id: string;
    occurredAt?: string | null;
    occurred_at?: string | null;
    event_time?: string | null;
    event_type: string;
    status: string;
    notes?: string | null;
    note?: string | null;
  }>;
  exceptions: Array<{
    id: string;
    exception_type: string;
    reason_label: string;
    impact_minutes: number;
    status: string;
    details: string | null;
    review_note?: string | null;
  }>;
};

const EMPLOYEE_ACTIONS = [
  { eventType: "punch_in", label: "Entree" },
  { eventType: "break_start", label: "Debut pause" },
  { eventType: "break_end", label: "Fin pause" },
  { eventType: "meal_start", label: "Debut diner" },
  { eventType: "meal_end", label: "Fin diner" },
  { eventType: "punch_out", label: "Sortie" },
] as const;

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-CA");
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function exceptionStatusLabelFr(status: string) {
  switch (status) {
    case "en_attente":
      return "En attente";
    case "approuve":
    case "modifie":
      return "Approuvée";
    case "refuse":
      return "Refusée";
    default:
      return status;
  }
}

function resolveOccurredAt(event: {
  occurredAt?: string | null;
  occurred_at?: string | null;
  event_time?: string | null;
}) {
  return event.occurredAt ?? event.occurred_at ?? event.event_time ?? null;
}

function resolveNotes(event: { notes?: string | null; note?: string | null }) {
  return event.notes ?? event.note ?? null;
}

function normalizeLatenessContext(raw: unknown): LatenessContext | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const source = raw as Record<string, unknown>;
  return {
    workDate: typeof source.workDate === "string" ? source.workDate : "",
    isLate: Boolean(source.isLate),
    lateMinutes:
      typeof source.lateMinutes === "number" && Number.isFinite(source.lateMinutes)
        ? source.lateMinutes
        : 0,
    scheduledStartAt:
      typeof source.scheduledStartAt === "string" ? source.scheduledStartAt : null,
    scheduledStartLabel:
      typeof source.scheduledStartLabel === "string" ? source.scheduledStartLabel : null,
    currentAt: typeof source.currentAt === "string" ? source.currentAt : "",
    currentLabel: typeof source.currentLabel === "string" ? source.currentLabel : "",
    isWithinScheduleWindow: Boolean(source.isWithinScheduleWindow),
    canPunchNow: Boolean(source.canPunchNow),
    canRequestRetroactiveCorrection: Boolean(source.canRequestRetroactiveCorrection),
    showLateStartCard: Boolean(source.showLateStartCard),
  };
}

function buildRequestedOccurredAtIso(templateIso: string, timeHHMM: string) {
  const match = timeHHMM.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const template = new Date(templateIso);
  if (!Number.isFinite(template.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(template);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return null;
  }

  const hours = match[1].padStart(2, "0");
  const minutes = match[2];
  const offset = templateIso.match(/([+-]\d{2}:\d{2})$/)?.[1] ?? "-04:00";

  return `${year}-${month}-${day}T${hours}:${minutes}:00${offset}`;
}

function normalizeSnapshotPayload(payload: unknown): EmployeeSnapshot | null {
  const raw = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const source =
    raw?.snapshot && typeof raw.snapshot === "object"
      ? (raw.snapshot as Record<string, unknown>)
      : raw;

  if (!source) {
    return null;
  }

  const employee =
    source.employee && typeof source.employee === "object"
      ? (source.employee as Record<string, unknown>)
      : {};
  const currentState =
    source.currentState && typeof source.currentState === "object"
      ? (source.currentState as Record<string, unknown>)
      : {};
  const todayShiftSource =
    source.todayShift && typeof source.todayShift === "object"
      ? (source.todayShift as Record<string, unknown>)
      : source.shift && typeof source.shift === "object"
        ? (source.shift as Record<string, unknown>)
        : null;
  const weeklyProjection =
    source.weeklyProjection && typeof source.weeklyProjection === "object"
      ? (source.weeklyProjection as Record<string, unknown>)
      : {};

  return {
    employee: {
      employeeId:
        Number(employee.employeeId ?? employee.employee_id) > 0
          ? Number(employee.employeeId ?? employee.employee_id)
          : 0,
      employee_id:
        Number(employee.employee_id ?? employee.employeeId) > 0
          ? Number(employee.employee_id ?? employee.employeeId)
          : null,
      fullName: typeof employee.fullName === "string" ? employee.fullName : null,
      email: typeof employee.email === "string" ? employee.email : null,
      primaryCompany:
        employee.primaryCompany === "oliem_solutions" ||
        employee.primaryCompany === "titan_produits_industriels"
          ? employee.primaryCompany
          : null,
      pausePaid: typeof employee.pausePaid === "boolean" ? employee.pausePaid : true,
    },
    currentState: {
      current_state:
        typeof currentState.currentState === "string"
          ? currentState.currentState
          : typeof currentState.current_state === "string"
            ? currentState.current_state
            : typeof currentState.status === "string"
              ? currentState.status
              : "hors_quart",
      status:
        typeof currentState.status === "string"
          ? currentState.status
          : typeof currentState.current_state === "string"
            ? currentState.current_state
            : typeof currentState.currentState === "string"
              ? currentState.currentState
              : "hors_quart",
      last_event_at:
        typeof currentState.last_event_at === "string"
          ? currentState.last_event_at
          : typeof currentState.lastEventAt === "string"
            ? currentState.lastEventAt
            : null,
      last_event_type:
        typeof currentState.last_event_type === "string"
          ? currentState.last_event_type
          : typeof currentState.lastEventType === "string"
            ? currentState.lastEventType
            : null,
      currentEventType:
        typeof currentState.currentEventType === "string"
          ? currentState.currentEventType
          : typeof currentState.last_event_type === "string"
            ? currentState.last_event_type
            : null,
      startedAt:
        typeof currentState.startedAt === "string" ? currentState.startedAt : null,
      has_open_exception: Boolean(currentState.has_open_exception ?? currentState.hasOpenException),
      activeExceptionCount:
        typeof currentState.activeExceptionCount === "number"
          ? currentState.activeExceptionCount
          : undefined,
    },
    todayShift: todayShiftSource
      ? {
          work_date:
            typeof todayShiftSource.work_date === "string" ? todayShiftSource.work_date : "",
          worked_minutes:
            typeof todayShiftSource.worked_minutes === "number"
              ? todayShiftSource.worked_minutes
              : 0,
          payable_minutes:
            typeof todayShiftSource.payable_minutes === "number"
              ? todayShiftSource.payable_minutes
              : 0,
          paid_break_minutes:
            typeof todayShiftSource.paid_break_minutes === "number"
              ? todayShiftSource.paid_break_minutes
              : 0,
          unpaid_break_minutes:
            typeof todayShiftSource.unpaid_break_minutes === "number"
              ? todayShiftSource.unpaid_break_minutes
              : 0,
          unpaid_lunch_minutes:
            typeof todayShiftSource.unpaid_lunch_minutes === "number"
              ? todayShiftSource.unpaid_lunch_minutes
              : 0,
          pending_exception_minutes:
            typeof todayShiftSource.pending_exception_minutes === "number"
              ? todayShiftSource.pending_exception_minutes
              : 0,
          approved_exception_minutes:
            typeof todayShiftSource.approved_exception_minutes === "number"
              ? todayShiftSource.approved_exception_minutes
              : 0,
          anomalies_count:
            typeof todayShiftSource.anomalies_count === "number"
              ? todayShiftSource.anomalies_count
              : 0,
          status: typeof todayShiftSource.status === "string" ? todayShiftSource.status : "en_attente",
        }
      : null,
    weeklyProjection: {
      workedMinutes:
        typeof weeklyProjection.workedMinutes === "number"
          ? weeklyProjection.workedMinutes
          : typeof source.weekWorkedMinutes === "number"
            ? source.weekWorkedMinutes
            : 0,
      targetMinutes:
        typeof weeklyProjection.targetMinutes === "number"
          ? weeklyProjection.targetMinutes
          : typeof source.weekTargetMinutes === "number"
            ? source.weekTargetMinutes
            : 40 * 60,
      remainingMinutes:
        typeof weeklyProjection.remainingMinutes === "number"
          ? weeklyProjection.remainingMinutes
          : typeof source.weekRemainingMinutes === "number"
            ? source.weekRemainingMinutes
            : 40 * 60,
      projectedOverflowMinutes:
        typeof weeklyProjection.projectedOverflowMinutes === "number"
          ? weeklyProjection.projectedOverflowMinutes
          : typeof source.projectedOverflowMinutes === "number"
            ? source.projectedOverflowMinutes
            : 0,
    },
    pendingExceptions: Array.isArray(source.pendingExceptions)
      ? (source.pendingExceptions as EmployeeSnapshot["pendingExceptions"])
      : [],
    latenessContext:
      normalizeLatenessContext(source.latenessContext) ??
      normalizeLatenessContext(
        raw && typeof raw === "object" ? (raw as Record<string, unknown>).latenessContext : null
      ),
  };
}

export default function EmployeHorodateurPage() {
  const router = useRouter();
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const canUseTerrain = hasPermission("terrain");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [snapshot, setSnapshot] = useState<EmployeeSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [longLeaveBanner, setLongLeaveBanner] = useState<{
    publicLabel: string;
    startDate: string;
    returnSummary: string;
  } | null>(null);
  const [retroactiveModalOpen, setRetroactiveModalOpen] = useState(false);
  const [retroactiveTime, setRetroactiveTime] = useState("");
  const [retroactiveReason, setRetroactiveReason] = useState("");

  const gpsReport = useEmployeeGpsReporting({
    enabled: Boolean(user && canUseTerrain && !accessLoading),
    companyContext: snapshot?.employee.primaryCompany ?? null,
    pageSource: "employe_horodateur",
  });

  const currentStateLabel = useMemo(() => {
    const value =
      snapshot?.currentState.current_state ??
      snapshot?.currentState.status ??
      "hors_quart";

    if (value === "en_quart") return "En quart";
    if (value === "en_pause") return "En pause";
    if (value === "en_diner") return "En diner";
    if (value === "termine") return "Quart termine";
    return "Hors quart";
  }, [snapshot?.currentState.current_state, snapshot?.currentState.status]);

  const loadData = useCallback(async (options?: { preserveMessage?: boolean }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [snapshotResponse, historyResponse] = await Promise.all([
        fetch("/api/horodateur/me", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }),
        fetch("/api/horodateur/me/history", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }),
      ]);

      const snapshotPayload = await snapshotResponse.json();
      const historyPayload = await historyResponse.json();

      if (!snapshotResponse.ok) {
        throw new Error(snapshotPayload.error ?? "Impossible de charger l horodateur.");
      }

      if (!historyResponse.ok) {
        throw new Error(historyPayload.error ?? "Impossible de charger l historique.");
      }

      const ll = (snapshotPayload as { longLeave?: unknown }).longLeave;
      if (
        ll &&
        typeof ll === "object" &&
        ll !== null &&
        "publicLabel" in ll &&
        "returnSummary" in ll
      ) {
        setLongLeaveBanner({
          publicLabel: String((ll as { publicLabel?: unknown }).publicLabel ?? ""),
          startDate: String((ll as { startDate?: unknown }).startDate ?? ""),
          returnSummary: String((ll as { returnSummary?: unknown }).returnSummary ?? ""),
        });
      } else {
        setLongLeaveBanner(null);
      }

      const normalized = normalizeSnapshotPayload(snapshotPayload);
      const latenessFromPayload =
        normalizeLatenessContext(
          (snapshotPayload as { latenessContext?: unknown }).latenessContext
        ) ??
        normalized?.latenessContext ??
        null;

      if (latenessFromPayload?.scheduledStartLabel) {
        const defaultTime = latenessFromPayload.scheduledStartLabel.slice(0, 5);
        if (/^\d{1,2}:\d{2}$/.test(defaultTime)) {
          setRetroactiveTime((current) => current || defaultTime);
        }
      }

      setSnapshot(
        normalized
          ? { ...normalized, latenessContext: latenessFromPayload }
          : null
      );
      setHistory({
        workDate: historyPayload.workDate,
        events: Array.isArray(historyPayload.events) ? historyPayload.events : [],
        exceptions: Array.isArray(historyPayload.exceptions)
          ? historyPayload.exceptions
          : [],
      });
      if (!options?.preserveMessage) {
        setMessage("");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessLoading) {
      return;
    }

    if (!user) {
      router.push("/employe/login");
      return;
    }

    if (!canUseTerrain) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    void loadData();
  }, [accessLoading, canUseTerrain, loadData, router, user]);

  useEffect(() => {
    if (!user || !canUseTerrain) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadData({ preserveMessage: true });
    }, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadData({ preserveMessage: true });
      }
    };

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canUseTerrain, loadData, user]);

  const latenessContext = snapshot?.latenessContext ?? null;

  async function handlePunch(
    eventType: string,
    options?: {
      acknowledgeLongLeave?: boolean;
      retroactive?: boolean;
      occurredAt?: string;
      noteOverride?: string;
    }
  ) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/horodateur/punch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventType: options?.retroactive ? undefined : eventType,
          retroactive: options?.retroactive === true ? true : undefined,
          occurredAt: options?.occurredAt ?? undefined,
          note: (options?.noteOverride ?? note).trim() || null,
          companyContext: snapshot?.employee.primaryCompany ?? null,
          acknowledgeLongLeavePunch: options?.acknowledgeLongLeave === true,
        }),
      });

      const payload = await response.json();

      if (response.status === 409 && payload?.code === "LONG_LEAVE_CONFIRMATION_REQUIRED") {
        const msg =
          typeof payload.error === "string"
            ? payload.error
            : "Vous êtes en congé prolongé. Voulez-vous quand même pointer ?";
        const ok = window.confirm(msg);
        if (ok) {
          await handlePunch(eventType, { acknowledgeLongLeave: true });
        }
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible d enregistrer ce pointage.");
      }

      setNote("");
      setMessage(
        options?.retroactive
          ? "Demande envoyee a la direction pour approbation."
          : payload.exception
            ? "Pointage enregistre avec exception en attente d approbation."
            : "Pointage enregistre."
      );
      if (options?.retroactive) {
        setRetroactiveModalOpen(false);
        setRetroactiveReason("");
      }
      await loadData({ preserveMessage: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur de pointage.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLatePunchNow() {
    await handlePunch("punch_in");
  }

  async function handleRetroactiveRequest() {
    const reason = retroactiveReason.trim();
    if (!reason) {
      setMessage("La raison est obligatoire pour une demande de correction retroactive.");
      return;
    }

    const template =
      latenessContext?.scheduledStartAt ?? latenessContext?.currentAt ?? null;
    if (!template) {
      setMessage("Impossible de determiner la date de travail pour la demande.");
      return;
    }

    const occurredAt = buildRequestedOccurredAtIso(template, retroactiveTime);
    if (!occurredAt) {
      setMessage("Heure demandee invalide (format HH:MM attendu).");
      return;
    }

    await handlePunch("punch_in", {
      retroactive: true,
      occurredAt,
      noteOverride: reason,
    });
  }

  if (accessLoading || loading) {
    return (
      <main className="page-container">
        <HeaderTagora title="Horodateur" subtitle="" />
        <AccessNotice description="Chargement en cours." />
      </main>
    );
  }

  if (!canUseTerrain) {
    return (
      <main className="page-container">
        <HeaderTagora title="Horodateur" subtitle="" />
        <AccessNotice description="La permission terrain est requise pour utiliser l horodateur." />
      </main>
    );
  }

  return (
    <main className="page-container">
      <HeaderTagora title="Horodateur" subtitle="" />

      {message ? <AccessNotice title="Information" description={message} /> : null}

      {longLeaveBanner ? (
        <section className="tagora-panel" style={{ marginTop: 24, borderColor: "rgba(245,158,11,0.5)" }}>
          <h2 className="section-title" style={{ marginBottom: 8 }}>
            Congé prolongé
          </h2>
          <p style={{ margin: 0, lineHeight: 1.5, color: "#0f172a" }}>
            Vous êtes actuellement marqué en congé prolongé ({longLeaveBanner.publicLabel}
            {longLeaveBanner.startDate ? ` — depuis le ${longLeaveBanner.startDate}` : ""}
            ). Contactez la direction avant de pointer.
            <br />
            Retour prévu :{" "}
            {longLeaveBanner.returnSummary === "indéterminé"
              ? "indéterminé"
              : longLeaveBanner.returnSummary}
            .
          </p>
        </section>
      ) : null}

      {canUseTerrain ? (
        <AccessNotice
          title="Localisation"
          description={
            gpsReport.status === "active"
              ? "GPS actif : la position est envoyee au tableau direction tant que cette page reste ouverte."
              : gpsReport.status === "denied"
                ? "GPS bloque : autorisez la localisation pour ce site dans les reglages du navigateur."
                : gpsReport.status === "unsupported"
                  ? "La geolocalisation n est pas disponible sur cet appareil."
                  : gpsReport.status === "error"
                    ? `GPS : ${gpsReport.lastError ?? "erreur d envoi ou de position."}`
                    : gpsReport.status === "requesting"
                      ? "Demande d acces a la localisation en cours..."
                      : "En attente de la localisation..."
          }
        />
      ) : null}

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Etat actuel</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800 }}>{currentStateLabel}</div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Compagnie</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>
              {getCompanyLabel(snapshot?.employee.primaryCompany)}
            </div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Temps paye aujourd hui</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800 }}>
              {formatMinutes(snapshot?.todayShift?.payable_minutes ?? 0)}
            </div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Progression semaine</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800 }}>
              {formatMinutes(snapshot?.weeklyProjection.workedMinutes ?? 0)}
            </div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Restant avant 40 h</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800 }}>
              {formatMinutes(snapshot?.weeklyProjection.remainingMinutes ?? 0)}
            </div>
          </div>
          <div className="tagora-panel-muted">
            <div className="tagora-label">Depassement projete</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800 }}>
              {formatMinutes(snapshot?.weeklyProjection.projectedOverflowMinutes ?? 0)}
            </div>
          </div>
        </div>
      </section>

      {latenessContext?.showLateStartCard ? (
        <section
          className="tagora-panel"
          style={{
            marginTop: 24,
            border: "1px solid rgba(245, 158, 11, 0.45)",
            background:
              "linear-gradient(180deg, rgba(255,251,235,0.98) 0%, rgba(255,255,255,0.98) 100%)",
          }}
        >
          <h2 className="section-title" style={{ marginBottom: 8 }}>
            Retard sur le punch prevu
          </h2>
          <p style={{ margin: "0 0 16px", lineHeight: 1.55, color: "#0f172a" }}>
            Tu es en retard sur ton punch prevu.
          </p>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              marginBottom: 16,
            }}
          >
            <div className="tagora-panel-muted" style={{ padding: 14 }}>
              <div className="tagora-label">Heure prevue</div>
              <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>
                {latenessContext.scheduledStartLabel ?? "—"}
              </div>
            </div>
            <div className="tagora-panel-muted" style={{ padding: 14 }}>
              <div className="tagora-label">Heure actuelle</div>
              <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>
                {latenessContext.currentLabel}
              </div>
            </div>
            {latenessContext.lateMinutes > 0 ? (
              <div className="tagora-panel-muted" style={{ padding: 14 }}>
                <div className="tagora-label">Retard</div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>
                  {formatMinutes(latenessContext.lateMinutes)}
                </div>
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {latenessContext.canPunchNow ? (
              <button
                type="button"
                className="tagora-dark-action"
                style={{ width: "100%", minHeight: 48, fontSize: 16 }}
                disabled={saving}
                onClick={() => void handleLatePunchNow()}
              >
                Puncher maintenant
              </button>
            ) : null}
            {latenessContext.canRequestRetroactiveCorrection ? (
              <button
                type="button"
                className="tagora-dark-outline-action"
                style={{ width: "100%", minHeight: 48, fontSize: 16 }}
                disabled={saving}
                onClick={() => {
                  if (
                    latenessContext.scheduledStartLabel &&
                    /^\d{1,2}:\d{2}$/.test(latenessContext.scheduledStartLabel.slice(0, 5))
                  ) {
                    setRetroactiveTime(latenessContext.scheduledStartLabel.slice(0, 5));
                  }
                  setRetroactiveModalOpen(true);
                }}
              >
                Demander une correction retroactive
              </button>
            ) : null}
          </div>
          <p className="tagora-note" style={{ marginTop: 12, marginBottom: 0 }}>
            {latenessContext.isWithinScheduleWindow
              ? "Toute demande ou pointage en retard sera soumis a la direction avant d etre comptabilise."
              : "Tu es hors fenetre horaire : le pointage necessitera une validation direction."}
          </p>
        </section>
      ) : null}

      {retroactiveModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="retroactive-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 16,
            background: "rgba(15, 23, 42, 0.45)",
          }}
          onClick={() => {
            if (!saving) {
              setRetroactiveModalOpen(false);
            }
          }}
        >
          <div
            className="tagora-panel"
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflow: "auto",
              marginBottom: 0,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="retroactive-modal-title" className="section-title" style={{ marginBottom: 12 }}>
              Demande de correction retroactive
            </h2>
            <p className="tagora-note" style={{ marginTop: 0, marginBottom: 16 }}>
              Indique l heure a laquelle tu aurais du pointer. La direction devra approuver avant
              comptabilisation.
            </p>
            <label className="tagora-field" style={{ marginBottom: 16 }}>
              <span className="tagora-label">Heure demandee</span>
              <input
                className="tagora-input"
                type="time"
                value={retroactiveTime}
                onChange={(event) => setRetroactiveTime(event.target.value)}
                style={{ minHeight: 48, fontSize: 16 }}
              />
            </label>
            <label className="tagora-field" style={{ marginBottom: 16 }}>
              <span className="tagora-label">Raison (obligatoire)</span>
              <textarea
                className="tagora-textarea"
                value={retroactiveReason}
                onChange={(event) => setRetroactiveReason(event.target.value)}
                placeholder="Ex. embouteillage, rendez-vous client..."
                rows={4}
              />
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                className="tagora-dark-action"
                style={{ width: "100%", minHeight: 48 }}
                disabled={saving}
                onClick={() => void handleRetroactiveRequest()}
              >
                Envoyer la demande
              </button>
              <button
                type="button"
                className="tagora-dark-outline-action"
                style={{ width: "100%", minHeight: 44 }}
                disabled={saving}
                onClick={() => setRetroactiveModalOpen(false)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Pointage</h2>
        <label className="tagora-field" style={{ marginBottom: 16 }}>
          <span className="tagora-label">Note optionnelle</span>
          <textarea
            className="tagora-textarea"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ajoutez une note si necessaire"
          />
        </label>
        <div className="actions-row">
          {EMPLOYEE_ACTIONS.map((action) => {
            const pausePaid = snapshot?.employee.pausePaid !== false;
            const isPauseAction =
              action.eventType === "break_start" || action.eventType === "break_end";
            return (
            <button
              key={action.eventType}
              type="button"
              className={
                action.eventType === "punch_in" || action.eventType === "punch_out"
                  ? "tagora-dark-action"
                  : "tagora-dark-outline-action"
              }
              onClick={() => void handlePunch(action.eventType)}
              disabled={saving || (pausePaid && isPauseAction)}
            >
              {action.label}
            </button>
          );
          })}
        </div>
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Exceptions en attente</h2>
        {snapshot?.pendingExceptions.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {snapshot.pendingExceptions.map((item) => (
              <div key={item.id} className="tagora-panel-muted">
                <div className="tagora-label">Motif système · {item.reason_label}</div>
                <div style={{ marginTop: 6, fontWeight: 700 }}>{item.exception_type}</div>
                <div className="tagora-note" style={{ marginTop: 6 }}>
                  Statut : {exceptionStatusLabelFr(item.status)}
                </div>
                <div className="tagora-note" style={{ marginTop: 6 }}>
                  Impact estime: {formatMinutes(item.impact_minutes)}
                </div>
                <div className="tagora-note" style={{ marginTop: 4 }}>
                  Note employé : {item.details?.trim() ? item.details : "Aucune note fournie."}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="tagora-note">Aucune exception en attente.</p>
        )}
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Historique du jour</h2>
        {history?.events.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle}>Heure</th>
                  <th style={thStyle}>Evenement</th>
                  <th style={thStyle}>Statut</th>
                  <th style={thStyle}>Note</th>
                </tr>
              </thead>
              <tbody>
                {history.events.map((event) => (
                  <tr key={event.id}>
                    <td style={tdStyle}>{formatDateTime(resolveOccurredAt(event))}</td>
                    <td style={tdStyle}>{event.event_type}</td>
                    <td style={tdStyle}>{event.status}</td>
                    <td style={tdStyle}>{resolveNotes(event) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tagora-note">Aucun evenement aujourd hui.</p>
        )}
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>
          Exceptions du jour
        </h2>
        {history?.exceptions.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle}>Statut</th>
                  <th style={thStyle}>Motif système</th>
                  <th style={thStyle}>Note employé</th>
                  <th style={thStyle}>Décision</th>
                </tr>
              </thead>
              <tbody>
                {history.exceptions.map((ex) => (
                  <tr key={ex.id}>
                    <td style={tdStyle}>{exceptionStatusLabelFr(ex.status)}</td>
                    <td style={tdStyle}>{ex.reason_label}</td>
                    <td style={tdStyle}>
                      {ex.details?.trim() ? ex.details : "—"}
                    </td>
                    <td style={tdStyle}>
                      {ex.review_note?.trim() ? ex.review_note : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tagora-note">Aucune exception pour cette journée.</p>
        )}
      </section>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#64748b",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#0f172a",
};

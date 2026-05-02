"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderTagora from "@/app/components/HeaderTagora";
import AccessNotice from "@/app/components/AccessNotice";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";

type EmployeeSnapshot = {
  employee: {
    employeeId: number;
    employee_id?: number | null;
    fullName: string | null;
    email: string | null;
    primaryCompany: "oliem_solutions" | "titan_produits_industriels" | null;
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

      setSnapshot(normalizeSnapshotPayload(snapshotPayload));
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

  async function handlePunch(eventType: string) {
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
          eventType,
          note: note.trim() || null,
          companyContext: snapshot?.employee.primaryCompany ?? null,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible d enregistrer ce pointage.");
      }

      setNote("");
      setMessage(
        payload.exception
          ? "Pointage enregistre avec exception en attente d approbation."
          : "Pointage enregistre."
      );
      await loadData({ preserveMessage: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur de pointage.");
    } finally {
      setSaving(false);
    }
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
          {EMPLOYEE_ACTIONS.map((action) => (
            <button
              key={action.eventType}
              type="button"
              className={
                action.eventType === "punch_in" || action.eventType === "punch_out"
                  ? "tagora-dark-action"
                  : "tagora-dark-outline-action"
              }
              onClick={() => void handlePunch(action.eventType)}
              disabled={saving}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Exceptions en attente</h2>
        {snapshot?.pendingExceptions.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {snapshot.pendingExceptions.map((item) => (
              <div key={item.id} className="tagora-panel-muted">
                <div className="tagora-label">{item.reason_label}</div>
                <div style={{ marginTop: 6, fontWeight: 700 }}>{item.exception_type}</div>
                <div className="tagora-note" style={{ marginTop: 6 }}>
                  Impact estime: {formatMinutes(item.impact_minutes)}
                </div>
                {item.details ? (
                  <div className="tagora-note" style={{ marginTop: 4 }}>
                    {item.details}
                  </div>
                ) : null}
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

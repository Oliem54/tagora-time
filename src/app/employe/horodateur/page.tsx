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
    fullName: string | null;
    email: string | null;
    primaryCompany: "oliem_solutions" | "titan_produits_industriels" | null;
  };
  currentState: {
    current_state: string;
    last_event_at: string | null;
    last_event_type: string | null;
    has_open_exception: boolean;
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
  };
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
    occurred_at: string;
    event_type: string;
    status: string;
    notes: string | null;
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
  { eventType: "quart_debut", label: "Entree" },
  { eventType: "pause_debut", label: "Debut pause" },
  { eventType: "pause_fin", label: "Fin pause" },
  { eventType: "dinner_debut", label: "Debut diner" },
  { eventType: "dinner_fin", label: "Fin diner" },
  { eventType: "quart_fin", label: "Sortie" },
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
    const value = snapshot?.currentState.current_state ?? "hors_quart";

    if (value === "en_quart") return "En quart";
    if (value === "en_pause") return "En pause";
    if (value === "en_diner") return "En diner";
    if (value === "termine") return "Quart termine";
    return "Hors quart";
  }, [snapshot?.currentState.current_state]);

  const loadData = useCallback(async () => {
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

      setSnapshot(snapshotPayload.snapshot);
      setHistory({
        workDate: historyPayload.workDate,
        events: Array.isArray(historyPayload.events) ? historyPayload.events : [],
        exceptions: Array.isArray(historyPayload.exceptions)
          ? historyPayload.exceptions
          : [],
      });
      setMessage("");
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
      setLoading(false);
      return;
    }

    void loadData();
  }, [accessLoading, canUseTerrain, loadData, router, user]);

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
      await loadData();
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
              {formatMinutes(snapshot?.todayShift.payable_minutes ?? 0)}
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
                action.eventType === "quart_debut" || action.eventType === "quart_fin"
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
                    <td style={tdStyle}>{formatDateTime(event.occurred_at)}</td>
                    <td style={tdStyle}>{event.event_type}</td>
                    <td style={tdStyle}>{event.status}</td>
                    <td style={tdStyle}>{event.notes || "-"}</td>
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

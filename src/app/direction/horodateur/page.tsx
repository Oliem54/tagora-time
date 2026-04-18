"use client";

import { useCallback, useEffect, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import AccessNotice from "@/app/components/AccessNotice";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";

type LiveRow = {
  employeeId: number;
  fullName: string | null;
  email: string | null;
  primaryCompany: "oliem_solutions" | "titan_produits_industriels" | null;
  currentState: string;
  lastEventAt: string | null;
  lastEventType: string | null;
  todayShift: {
    shift_start_at: string | null;
    payable_minutes: number;
  } | null;
  weekWorkedMinutes: number;
  weekTargetMinutes: number;
  weekRemainingMinutes: number;
  projectedOverflowMinutes: number;
  hasOpenException: boolean;
};

type PendingException = {
  id: string;
  exception_type: string;
  reason_label: string;
  details: string | null;
  impact_minutes: number;
  employee: {
    employeeId: number;
    fullName: string | null;
    email: string | null;
  } | null;
  event: {
    event_type: string;
    occurred_at: string;
  } | null;
};

const DIRECTION_EVENT_TYPES = [
  "quart_debut",
  "pause_debut",
  "pause_fin",
  "dinner_debut",
  "dinner_fin",
  "quart_fin",
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

export default function DirectionHorodateurPage() {
  const { loading: accessLoading, hasPermission } = useCurrentAccess();
  const canUseTerrain = hasPermission("terrain");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [board, setBoard] = useState<LiveRow[]>([]);
  const [exceptions, setExceptions] = useState<PendingException[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedEventType, setSelectedEventType] =
    useState<(typeof DIRECTION_EVENT_TYPES)[number]>("quart_debut");
  const [note, setNote] = useState("");

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
      const [liveResponse, exceptionsResponse] = await Promise.all([
        fetch("/api/direction/horodateur/live", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }),
        fetch("/api/direction/horodateur/exceptions", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }),
      ]);

      const livePayload = await liveResponse.json();
      const exceptionsPayload = await exceptionsResponse.json();

      if (!liveResponse.ok) {
        throw new Error(livePayload.error ?? "Impossible de charger le tableau vivant.");
      }

      if (!exceptionsResponse.ok) {
        throw new Error(exceptionsPayload.error ?? "Impossible de charger les exceptions.");
      }

      setBoard(Array.isArray(livePayload.board) ? livePayload.board : []);
      setExceptions(
        Array.isArray(exceptionsPayload.exceptions) ? exceptionsPayload.exceptions : []
      );
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

    if (!canUseTerrain) {
      setLoading(false);
      return;
    }

    void loadData();
  }, [accessLoading, canUseTerrain, loadData]);

  async function withToken<T>(runner: (token: string) => Promise<T>) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Session introuvable.");
    }

    return runner(session.access_token);
  }

  async function handleManualPunch() {
    const employeeId = Number(selectedEmployeeId);

    if (!Number.isFinite(employeeId)) {
      setMessage("Selectionnez un employe.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await withToken(async (token) => {
        const response = await fetch("/api/direction/horodateur/punch", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            employeeId,
            eventType: selectedEventType,
            note,
          }),
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Impossible d enregistrer ce pointage.");
        }
      });

      setNote("");
      setMessage("Action direction enregistree.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur de pointage.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(exceptionId: string) {
    setSaving(true);
    setMessage("");

    try {
      await withToken(async (token) => {
        const response = await fetch(
          `/api/direction/horodateur/exceptions/${exceptionId}/approve`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          }
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Impossible d approuver cette exception.");
        }
      });

      setMessage("Exception approuvee.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur d approbation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefuse(exceptionId: string) {
    const reviewNote = window.prompt("Note de refus obligatoire") ?? "";

    if (!reviewNote.trim()) {
      setMessage("Une note est obligatoire pour refuser.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await withToken(async (token) => {
        const response = await fetch(
          `/api/direction/horodateur/exceptions/${exceptionId}/refuse`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ reviewNote }),
          }
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Impossible de refuser cette exception.");
        }
      });

      setMessage("Exception refusee.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur de refus.");
    } finally {
      setSaving(false);
    }
  }

  if (accessLoading || loading) {
    return (
      <main className="page-container">
        <HeaderTagora title="Horodateur direction" subtitle="" />
        <AccessNotice description="Chargement en cours." />
      </main>
    );
  }

  if (!canUseTerrain) {
    return (
      <main className="page-container">
        <HeaderTagora title="Horodateur direction" subtitle="" />
        <AccessNotice description="La permission terrain est requise pour superviser l horodateur." />
      </main>
    );
  }

  return (
    <main className="page-container">
      <HeaderTagora title="Horodateur direction" subtitle="" />

      {message ? <AccessNotice title="Information" description={message} /> : null}

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Punch direction</h2>
        <div className="tagora-form-grid">
          <label className="tagora-field">
            <span className="tagora-label">Employe</span>
            <select
              className="tagora-input"
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
            >
              <option value="">Selectionner</option>
              {board.map((row) => (
                <option key={row.employeeId} value={row.employeeId}>
                  {row.fullName || row.email || `#${row.employeeId}`}
                </option>
              ))}
            </select>
          </label>

          <label className="tagora-field">
            <span className="tagora-label">Action</span>
            <select
              className="tagora-input"
              value={selectedEventType}
              onChange={(event) =>
                setSelectedEventType(event.target.value as (typeof DIRECTION_EVENT_TYPES)[number])
              }
            >
              {DIRECTION_EVENT_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Note obligatoire</span>
            <textarea
              className="tagora-textarea"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
        <div className="actions-row" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="tagora-dark-action"
            onClick={() => void handleManualPunch()}
            disabled={saving}
          >
            Enregistrer
          </button>
        </div>
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Tableau vivant</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={thStyle}>Employe</th>
                <th style={thStyle}>Compagnie</th>
                <th style={thStyle}>Etat</th>
                <th style={thStyle}>Dernier evenement</th>
                <th style={thStyle}>Heures semaine</th>
                <th style={thStyle}>Restant</th>
                <th style={thStyle}>Projection</th>
                <th style={thStyle}>Exceptions</th>
              </tr>
            </thead>
            <tbody>
              {board.map((row) => (
                <tr key={row.employeeId}>
                  <td style={tdStyle}>
                    {row.fullName || row.email || `#${row.employeeId}`}
                    <div className="tagora-note">{row.email || "-"}</div>
                  </td>
                  <td style={tdStyle}>{getCompanyLabel(row.primaryCompany)}</td>
                  <td style={tdStyle}>{row.currentState}</td>
                  <td style={tdStyle}>{formatDateTime(row.lastEventAt)}</td>
                  <td style={tdStyle}>{formatMinutes(row.weekWorkedMinutes)}</td>
                  <td style={tdStyle}>{formatMinutes(row.weekRemainingMinutes)}</td>
                  <td style={tdStyle}>{formatMinutes(row.projectedOverflowMinutes)}</td>
                  <td style={tdStyle}>{row.hasOpenException ? "Oui" : "Non"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tagora-panel" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Exceptions a approuver</h2>
        {exceptions.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {exceptions.map((item) => (
              <div key={item.id} className="tagora-panel-muted">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div className="tagora-label">
                      {item.employee?.fullName || item.employee?.email || item.id}
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>{item.reason_label}</div>
                    <div className="tagora-note" style={{ marginTop: 6 }}>
                      {item.exception_type} • Impact estime {formatMinutes(item.impact_minutes)}
                    </div>
                    {item.event ? (
                      <div className="tagora-note" style={{ marginTop: 4 }}>
                        {item.event.event_type} • {formatDateTime(item.event.occurred_at)}
                      </div>
                    ) : null}
                    {item.details ? (
                      <div className="tagora-note" style={{ marginTop: 4 }}>
                        {item.details}
                      </div>
                    ) : null}
                  </div>
                  <div className="actions-row">
                    <button
                      type="button"
                      className="tagora-dark-action"
                      onClick={() => void handleApprove(item.id)}
                      disabled={saving}
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      className="tagora-btn-danger"
                      onClick={() => void handleRefuse(item.id)}
                      disabled={saving}
                    >
                      Refuser
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="tagora-note">Aucune exception en attente.</p>
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

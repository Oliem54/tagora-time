"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AccessNotice from "@/app/components/AccessNotice";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";

type MessageType = "success" | "error" | null;

type DayClosureReason =
  | "journee_complete"
  | "tempete"
  | "manque_chauffeur"
  | "conge"
  | "inventaire"
  | "surcharge"
  | "entretien_flotte"
  | "autre";

type ResourceReason =
  | "entretien"
  | "brise"
  | "deja_occupe"
  | "inspection"
  | "reservation_interne"
  | "tempete"
  | "conge"
  | "inventaire"
  | "surcharge"
  | "autre";

type DayClosure = {
  id: string;
  closure_date: string;
  reason: DayClosureReason;
  note: string | null;
  status: "active" | "cancelled";
  created_at: string;
};

type VehiculeUnavailability = {
  id: string;
  vehicule_id: number;
  start_at: string;
  end_at: string;
  reason: ResourceReason;
  note: string | null;
  status: "active" | "cancelled";
};

type RemorqueUnavailability = {
  id: string;
  remorque_id: number;
  start_at: string;
  end_at: string;
  reason: ResourceReason;
  note: string | null;
  status: "active" | "cancelled";
};

type ResourceRow = {
  id: number;
  nom?: string | null;
  modele?: string | null;
  plaque?: string | null;
  identifiant?: string | null;
  numero?: string | null;
};

const DAY_REASON_LABELS: Record<DayClosureReason, string> = {
  journee_complete: "Journee complete",
  tempete: "Tempete",
  manque_chauffeur: "Manque chauffeur",
  conge: "Conge",
  inventaire: "Inventaire",
  surcharge: "Surcharge",
  entretien_flotte: "Entretien flotte",
  autre: "Autre",
};

const RESOURCE_REASON_LABELS: Record<ResourceReason, string> = {
  entretien: "Entretien",
  brise: "Brise",
  deja_occupe: "Deja occupe",
  inspection: "Inspection",
  reservation_interne: "Reservation interne",
  tempete: "Tempete",
  conge: "Conge",
  inventaire: "Inventaire",
  surcharge: "Surcharge",
  autre: "Autre",
};

const DAY_REASONS = Object.keys(DAY_REASON_LABELS) as DayClosureReason[];
const RESOURCE_REASONS = Object.keys(RESOURCE_REASON_LABELS) as ResourceReason[];

function toDateTimeInputValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function toIsoFromDateTimeInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getResourceLabel(item: ResourceRow) {
  return String(
    item.nom || item.modele || item.plaque || item.identifiant || item.numero || `#${item.id}`
  );
}

type DisponibilitesResponse = {
  dayClosures: DayClosure[];
  vehiculeUnavailabilities: VehiculeUnavailability[];
  remorqueUnavailabilities: RemorqueUnavailability[];
  vehicules: ResourceRow[];
  remorques: ResourceRow[];
};

export default function DirectionDisponibilitesPage() {
  const { user, role, loading: accessLoading } = useCurrentAccess();
  const blocked = !accessLoading && (!!user && role === "employe");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>(null);

  const [dayClosures, setDayClosures] = useState<DayClosure[]>([]);
  const [vehiculeUnavailabilities, setVehiculeUnavailabilities] = useState<
    VehiculeUnavailability[]
  >([]);
  const [remorqueUnavailabilities, setRemorqueUnavailabilities] = useState<
    RemorqueUnavailability[]
  >([]);
  const [vehicules, setVehicules] = useState<ResourceRow[]>([]);
  const [remorques, setRemorques] = useState<ResourceRow[]>([]);

  const [dayForm, setDayForm] = useState({
    closure_date: "",
    reason: "journee_complete" as DayClosureReason,
    note: "",
  });

  const nowPlusOneHour = useMemo(() => {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    return {
      start: toDateTimeInputValue(now.toISOString()),
      end: toDateTimeInputValue(oneHourLater.toISOString()),
    };
  }, []);

  const [vehiculeForm, setVehiculeForm] = useState({
    vehicule_id: "",
    start_at: nowPlusOneHour.start,
    end_at: nowPlusOneHour.end,
    reason: "entretien" as ResourceReason,
    note: "",
  });

  const [remorqueForm, setRemorqueForm] = useState({
    remorque_id: "",
    start_at: nowPlusOneHour.start,
    end_at: nowPlusOneHour.end,
    reason: "entretien" as ResourceReason,
    note: "",
  });

  const clearFeedback = () => {
    setMessage("");
    setMessageType(null);
  };

  const setError = (text: string) => {
    setMessage(text);
    setMessageType("error");
  };

  const setSuccess = (text: string) => {
    setMessage(text);
    setMessageType("success");
  };

  const fetchDisponibilites = useCallback(async () => {
    setLoading(true);
    clearFeedback();
    try {
      const response = await fetch("/api/disponibilites", {
        method: "GET",
      });
      const payload = (await response.json()) as
        | DisponibilitesResponse
        | { error?: string };

      if (!response.ok) {
        setError(payload && "error" in payload ? payload.error || "Chargement impossible." : "Chargement impossible.");
        setLoading(false);
        return;
      }

      const data = payload as DisponibilitesResponse;
      setDayClosures(data.dayClosures ?? []);
      setVehiculeUnavailabilities(data.vehiculeUnavailabilities ?? []);
      setRemorqueUnavailabilities(data.remorqueUnavailabilities ?? []);
      setVehicules(data.vehicules ?? []);
      setRemorques(data.remorques ?? []);
    } catch {
      setError("Erreur reseau pendant le chargement des disponibilites.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessLoading || !user || blocked) return;
    void fetchDisponibilites();
  }, [accessLoading, blocked, fetchDisponibilites, user]);

  async function createDayClosure(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();
    setSubmitting(true);
    try {
      const response = await fetch("/api/disponibilites/day-closures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dayForm),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error || "Creation de la fermeture impossible.");
        return;
      }

      setSuccess("Journee fermee creee.");
      setDayForm({ closure_date: "", reason: "journee_complete", note: "" });
      await fetchDisponibilites();
    } catch {
      setError("Erreur reseau pendant la creation de la fermeture.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createVehiculeUnavailability(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();
    setSubmitting(true);
    try {
      const startAt = toIsoFromDateTimeInput(vehiculeForm.start_at);
      const endAt = toIsoFromDateTimeInput(vehiculeForm.end_at);
      if (!startAt || !endAt) {
        setError("Periode vehicule invalide.");
        return;
      }

      const response = await fetch("/api/disponibilites/vehicules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicule_id: vehiculeForm.vehicule_id ? Number(vehiculeForm.vehicule_id) : null,
          start_at: startAt,
          end_at: endAt,
          reason: vehiculeForm.reason,
          note: vehiculeForm.note,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error || "Creation de l'indisponibilite vehicule impossible.");
        return;
      }

      setSuccess("Indisponibilite vehicule creee.");
      setVehiculeForm((prev) => ({ ...prev, note: "" }));
      await fetchDisponibilites();
    } catch {
      setError("Erreur reseau pendant la creation de l'indisponibilite vehicule.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createRemorqueUnavailability(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();
    setSubmitting(true);
    try {
      const startAt = toIsoFromDateTimeInput(remorqueForm.start_at);
      const endAt = toIsoFromDateTimeInput(remorqueForm.end_at);
      if (!startAt || !endAt) {
        setError("Periode remorque invalide.");
        return;
      }

      const response = await fetch("/api/disponibilites/remorques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remorque_id: remorqueForm.remorque_id ? Number(remorqueForm.remorque_id) : null,
          start_at: startAt,
          end_at: endAt,
          reason: remorqueForm.reason,
          note: remorqueForm.note,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error || "Creation de l'indisponibilite remorque impossible.");
        return;
      }

      setSuccess("Indisponibilite remorque creee.");
      setRemorqueForm((prev) => ({ ...prev, note: "" }));
      await fetchDisponibilites();
    } catch {
      setError("Erreur reseau pendant la creation de l'indisponibilite remorque.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelDayClosure(id: string) {
    clearFeedback();
    setSubmitting(true);
    try {
      const response = await fetch(`/api/disponibilites/day-closures/${id}/cancel`, {
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Annulation de la fermeture impossible.");
        return;
      }
      setSuccess("Fermeture annulee.");
      await fetchDisponibilites();
    } catch {
      setError("Erreur reseau pendant l'annulation de la fermeture.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelVehiculeUnavailability(id: string) {
    clearFeedback();
    setSubmitting(true);
    try {
      const response = await fetch(`/api/disponibilites/vehicules/${id}/cancel`, {
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Annulation de l'indisponibilite vehicule impossible.");
        return;
      }
      setSuccess("Indisponibilite vehicule annulee.");
      await fetchDisponibilites();
    } catch {
      setError("Erreur reseau pendant l'annulation de l'indisponibilite vehicule.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRemorqueUnavailability(id: string) {
    clearFeedback();
    setSubmitting(true);
    try {
      const response = await fetch(`/api/disponibilites/remorques/${id}/cancel`, {
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Annulation de l'indisponibilite remorque impossible.");
        return;
      }
      setSuccess("Indisponibilite remorque annulee.");
      await fetchDisponibilites();
    } catch {
      setError("Erreur reseau pendant l'annulation de l'indisponibilite remorque.");
    } finally {
      setSubmitting(false);
    }
  }

  const vehiculesById = useMemo(
    () => new Map(vehicules.map((item) => [item.id, item])),
    [vehicules]
  );
  const remorquesById = useMemo(
    () => new Map(remorques.map((item) => [item.id, item])),
    [remorques]
  );

  if (accessLoading || (!blocked && loading)) {
    return (
      <main className="page-container">
        <HeaderTagora title="Disponibilites et blocages" subtitle="Chargement" />
        <AccessNotice description="Chargement en cours." />
      </main>
    );
  }

  if (!user) return null;

  if (blocked) {
    return (
      <main className="page-container">
        <HeaderTagora title="Disponibilites et blocages" subtitle="Acces requis" />
        <AccessNotice description="Acces reserve a la direction/admin." />
      </main>
    );
  }

  return (
    <main className="page-container">
      <HeaderTagora title="Disponibilites et blocages" subtitle="Direction" />

      <FeedbackMessage message={message} type={messageType} />

      <section className="tagora-panel" style={{ marginTop: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 14 }}>Journees fermees</h2>
        <form onSubmit={createDayClosure} className="tagora-form-grid">
          <label className="tagora-field">
            <span className="tagora-label">Date</span>
            <input
              type="date"
              className="tagora-input"
              value={dayForm.closure_date}
              onChange={(e) => setDayForm((prev) => ({ ...prev, closure_date: e.target.value }))}
              required
            />
          </label>
          <label className="tagora-field">
            <span className="tagora-label">Raison</span>
            <select
              className="tagora-input"
              value={dayForm.reason}
              onChange={(e) =>
                setDayForm((prev) => ({ ...prev, reason: e.target.value as DayClosureReason }))
              }
            >
              {DAY_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {DAY_REASON_LABELS[reason]}
                </option>
              ))}
            </select>
          </label>
          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Note</span>
            <textarea
              className="tagora-textarea"
              value={dayForm.note}
              onChange={(e) => setDayForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Note optionnelle"
            />
          </label>
          <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="tagora-dark-action" disabled={submitting}>
              Creer fermeture
            </button>
          </div>
        </form>

        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Raison</th>
                <th style={thStyle}>Note</th>
                <th style={thStyle}>Statut</th>
                <th style={thStyle}>Cree le</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {dayClosures.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={6}>Aucune fermeture active.</td>
                </tr>
              ) : (
                dayClosures.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{item.closure_date}</td>
                    <td style={tdStyle}>{DAY_REASON_LABELS[item.reason] || item.reason}</td>
                    <td style={tdStyle}>{item.note || "-"}</td>
                    <td style={tdStyle}>{item.status}</td>
                    <td style={tdStyle}>{formatDateTime(item.created_at)}</td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        onClick={() => void cancelDayClosure(item.id)}
                        disabled={submitting}
                      >
                        Annuler
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tagora-panel" style={{ marginTop: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 14 }}>Vehicules indisponibles</h2>
        <form onSubmit={createVehiculeUnavailability} className="tagora-form-grid">
          <label className="tagora-field">
            <span className="tagora-label">Vehicule</span>
            <select
              className="tagora-input"
              value={vehiculeForm.vehicule_id}
              onChange={(e) => setVehiculeForm((prev) => ({ ...prev, vehicule_id: e.target.value }))}
              required
            >
              <option value="">Choisir un vehicule</option>
              {vehicules.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {getResourceLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="tagora-field">
            <span className="tagora-label">Debut</span>
            <input
              type="datetime-local"
              className="tagora-input"
              value={vehiculeForm.start_at}
              onChange={(e) => setVehiculeForm((prev) => ({ ...prev, start_at: e.target.value }))}
              required
            />
          </label>
          <label className="tagora-field">
            <span className="tagora-label">Fin</span>
            <input
              type="datetime-local"
              className="tagora-input"
              value={vehiculeForm.end_at}
              onChange={(e) => setVehiculeForm((prev) => ({ ...prev, end_at: e.target.value }))}
              required
            />
          </label>
          <label className="tagora-field">
            <span className="tagora-label">Raison</span>
            <select
              className="tagora-input"
              value={vehiculeForm.reason}
              onChange={(e) =>
                setVehiculeForm((prev) => ({ ...prev, reason: e.target.value as ResourceReason }))
              }
            >
              {RESOURCE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {RESOURCE_REASON_LABELS[reason]}
                </option>
              ))}
            </select>
          </label>
          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Note</span>
            <textarea
              className="tagora-textarea"
              value={vehiculeForm.note}
              onChange={(e) => setVehiculeForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Note optionnelle"
            />
          </label>
          <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="tagora-dark-action" disabled={submitting}>
              Creer indisponibilite
            </button>
          </div>
        </form>

        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Vehicule</th>
                <th style={thStyle}>Debut</th>
                <th style={thStyle}>Fin</th>
                <th style={thStyle}>Raison</th>
                <th style={thStyle}>Note</th>
                <th style={thStyle}>Statut</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {vehiculeUnavailabilities.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={7}>Aucune indisponibilite vehicule active.</td>
                </tr>
              ) : (
                vehiculeUnavailabilities.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>
                      {vehiculesById.get(item.vehicule_id)
                        ? getResourceLabel(vehiculesById.get(item.vehicule_id) as ResourceRow)
                        : `#${item.vehicule_id}`}
                    </td>
                    <td style={tdStyle}>{formatDateTime(item.start_at)}</td>
                    <td style={tdStyle}>{formatDateTime(item.end_at)}</td>
                    <td style={tdStyle}>{RESOURCE_REASON_LABELS[item.reason] || item.reason}</td>
                    <td style={tdStyle}>{item.note || "-"}</td>
                    <td style={tdStyle}>{item.status}</td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        onClick={() => void cancelVehiculeUnavailability(item.id)}
                        disabled={submitting}
                      >
                        Annuler
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tagora-panel" style={{ marginTop: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 14 }}>Remorques indisponibles</h2>
        <form onSubmit={createRemorqueUnavailability} className="tagora-form-grid">
          <label className="tagora-field">
            <span className="tagora-label">Remorque</span>
            <select
              className="tagora-input"
              value={remorqueForm.remorque_id}
              onChange={(e) => setRemorqueForm((prev) => ({ ...prev, remorque_id: e.target.value }))}
              required
            >
              <option value="">Choisir une remorque</option>
              {remorques.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {getResourceLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="tagora-field">
            <span className="tagora-label">Debut</span>
            <input
              type="datetime-local"
              className="tagora-input"
              value={remorqueForm.start_at}
              onChange={(e) => setRemorqueForm((prev) => ({ ...prev, start_at: e.target.value }))}
              required
            />
          </label>
          <label className="tagora-field">
            <span className="tagora-label">Fin</span>
            <input
              type="datetime-local"
              className="tagora-input"
              value={remorqueForm.end_at}
              onChange={(e) => setRemorqueForm((prev) => ({ ...prev, end_at: e.target.value }))}
              required
            />
          </label>
          <label className="tagora-field">
            <span className="tagora-label">Raison</span>
            <select
              className="tagora-input"
              value={remorqueForm.reason}
              onChange={(e) =>
                setRemorqueForm((prev) => ({ ...prev, reason: e.target.value as ResourceReason }))
              }
            >
              {RESOURCE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {RESOURCE_REASON_LABELS[reason]}
                </option>
              ))}
            </select>
          </label>
          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Note</span>
            <textarea
              className="tagora-textarea"
              value={remorqueForm.note}
              onChange={(e) => setRemorqueForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Note optionnelle"
            />
          </label>
          <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="tagora-dark-action" disabled={submitting}>
              Creer indisponibilite
            </button>
          </div>
        </form>

        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Remorque</th>
                <th style={thStyle}>Debut</th>
                <th style={thStyle}>Fin</th>
                <th style={thStyle}>Raison</th>
                <th style={thStyle}>Note</th>
                <th style={thStyle}>Statut</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {remorqueUnavailabilities.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={7}>Aucune indisponibilite remorque active.</td>
                </tr>
              ) : (
                remorqueUnavailabilities.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>
                      {remorquesById.get(item.remorque_id)
                        ? getResourceLabel(remorquesById.get(item.remorque_id) as ResourceRow)
                        : `#${item.remorque_id}`}
                    </td>
                    <td style={tdStyle}>{formatDateTime(item.start_at)}</td>
                    <td style={tdStyle}>{formatDateTime(item.end_at)}</td>
                    <td style={tdStyle}>{RESOURCE_REASON_LABELS[item.reason] || item.reason}</td>
                    <td style={tdStyle}>{item.note || "-"}</td>
                    <td style={tdStyle}>{item.status}</td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        onClick={() => void cancelRemorqueUnavailability(item.id)}
                        disabled={submitting}
                      >
                        Annuler
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 900,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#334155",
  background: "#f8fafc",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
  color: "#0f172a",
  verticalAlign: "top",
};

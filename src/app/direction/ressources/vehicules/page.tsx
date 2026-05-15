"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import HeaderTagora from "@/app/components/HeaderTagora";
import { supabase } from "@/app/lib/supabase/client";

type ResourceKind = "vehicule" | "remorque";

type FleetRow = {
  id: number;
  nom?: string | null;
  plaque?: string | null;
  description?: string | null;
  notes?: string | null;
  actif?: boolean | null;
};

const vehScopedCss = `
  .veh-shell-inner {
    width: 100%;
    max-width: min(1580px, 100%);
    margin-left: auto;
    margin-right: auto;
    padding: clamp(16px, 2.5vw, 40px) clamp(16px, 2vw, 32px) 56px;
    box-sizing: border-box;
  }
  .veh-main-grid {
    display: grid;
    grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
    gap: clamp(20px, 2.5vw, 32px);
    align-items: start;
  }
  @media (max-width: 1080px) {
    .veh-main-grid {
      grid-template-columns: 1fr;
    }
  }
  .veh-table-wrap {
    width: 100%;
    border-radius: 14px;
    border: 1px solid #e2e8f0;
    overflow: hidden;
    background: #fafafa;
  }
  .veh-fleet-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    background: #fff;
  }
  .veh-fleet-table thead th {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #64748b;
    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    border-bottom: 1px solid #e2e8f0;
    padding: 14px 16px;
    text-align: left;
    vertical-align: middle;
  }
  .veh-fleet-table tbody td {
    padding: 18px 16px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 14px;
    color: #0f172a;
    vertical-align: middle;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .veh-fleet-table tbody tr:last-child td {
    border-bottom: none;
  }
  .veh-fleet-table tbody tr:nth-child(even) td {
    background: #fcfcfd;
  }
  .veh-col-id { width: 56px; text-align: center; font-variant-numeric: tabular-nums; color: #64748b; font-weight: 600; }
  .veh-col-plaque { width: 118px; font-weight: 600; letter-spacing: 0.02em; color: #334155; }
  .veh-col-nom { width: 22%; min-width: 120px; font-weight: 600; color: #0f172a; }
  .veh-col-desc { /* fluid */ }
  .veh-col-status { width: 108px; text-align: center; }
  .veh-col-actions {
    width: 228px;
    text-align: right;
    padding-right: 18px !important;
    white-space: nowrap;
  }
  .veh-action-row {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: nowrap;
  }
  @media (max-width: 720px) {
    .veh-table-scroll {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .veh-fleet-table {
      min-width: 640px;
    }
  }
`;

export default function Page() {
  const [vehicules, setVehicules] = useState<FleetRow[]>([]);
  const [remorques, setRemorques] = useState<FleetRow[]>([]);
  const [resourceKind, setResourceKind] = useState<ResourceKind>("vehicule");
  const [nom, setNom] = useState("");
  const [plaque, setPlaque] = useState("");
  const [description, setDescription] = useState("");
  const [actif, setActif] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<{ kind: ResourceKind; id: number } | null>(null);

  const authHeaders = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    } as Record<string, string>;
  }, []);

  const fetchFleet = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const headers = await authHeaders();
    if (!headers) {
      setMessage("Session expirée : reconnectez-vous pour charger la flotte.");
      setVehicules([]);
      setRemorques([]);
      setLoading(false);
      return;
    }

    const res = await fetch("/api/direction/ressources/fleet", { headers });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      vehicules?: FleetRow[];
      remorques?: FleetRow[];
    };

    if (!res.ok) {
      setMessage(payload.error ?? "Erreur lors du chargement.");
      setVehicules([]);
      setRemorques([]);
      setLoading(false);
      return;
    }

    setVehicules(Array.isArray(payload.vehicules) ? payload.vehicules : []);
    setRemorques(Array.isArray(payload.remorques) ? payload.remorques : []);
    setLoading(false);
  }, [authHeaders]);

  useEffect(() => {
    void fetchFleet();
  }, [fetchFleet]);

  function resetForm() {
    setResourceKind("vehicule");
    setNom("");
    setPlaque("");
    setDescription("");
    setActif(true);
    setEditing(null);
  }

  function startEdit(kind: ResourceKind, row: FleetRow) {
    setEditing({ kind, id: row.id });
    setResourceKind(kind);
    setNom(row.nom ?? "");
    setPlaque(row.plaque ?? "");
    setDescription(row.description ?? "");
    setActif(row.actif !== false);
    setMessage("");
  }

  function cancelEdit() {
    resetForm();
    setMessage("Modification annulée.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!nom.trim()) {
      setMessage("Le nom est obligatoire.");
      return;
    }

    if (!plaque.trim()) {
      setMessage("La plaque est obligatoire.");
      return;
    }

    const headers = await authHeaders();
    if (!headers) {
      setMessage("Session expirée : reconnectez-vous.");
      return;
    }

    setSaving(true);
    setMessage("");

    const body = {
      resource_kind: editing ? editing.kind : resourceKind,
      nom: nom.trim(),
      plaque: plaque.trim(),
      description: description.trim() || null,
      actif,
    };

    try {
      if (editing) {
        const res = await fetch(`/api/direction/ressources/fleet/${editing.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(body),
        });
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setMessage(payload.error ?? "Erreur lors de l'enregistrement.");
          setSaving(false);
          return;
        }
        setMessage("Modifications enregistrées.");
        resetForm();
      } else {
        const res = await fetch("/api/direction/ressources/fleet", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setMessage(payload.error ?? "Erreur lors de la création.");
          setSaving(false);
          return;
        }
        setMessage(resourceKind === "remorque" ? "Remorque ajoutée." : "Véhicule ajouté.");
        setNom("");
        setPlaque("");
        setDescription("");
        setActif(true);
        setResourceKind("vehicule");
      }

      await fetchFleet();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(kind: ResourceKind, id: number) {
    const label = kind === "remorque" ? "cette remorque" : "ce véhicule";
    const ok = window.confirm(`Supprimer ${label} ?`);
    if (!ok) return;

    const headers = await authHeaders();
    if (!headers) {
      setMessage("Session expirée : reconnectez-vous.");
      return;
    }

    setMessage("");
    const res = await fetch(`/api/direction/ressources/fleet/${id}?kind=${kind}`, {
      method: "DELETE",
      headers: { Authorization: headers.Authorization },
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };

    if (!res.ok) {
      setMessage(payload.error ?? "Erreur lors de la suppression.");
      return;
    }

    if (editing?.id === id && editing.kind === kind) {
      resetForm();
    }

    setMessage(kind === "remorque" ? "Remorque supprimée." : "Véhicule supprimé.");
    await fetchFleet();
  }

  const formTitle = editing
    ? `Modifier ${editing.kind === "remorque" ? "la remorque" : "le véhicule"}`
    : "Ajouter à la flotte";

  const submitLabel = saving ? "En cours…" : editing ? "Enregistrer les modifications" : "Créer";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(165deg, #f8fafc 0%, #f1f5f9 42%, #eef2f7 100%)",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: vehScopedCss }} />
      <HeaderTagora />

      <div className="veh-shell-inner">
        <header
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: "clamp(20px, 2.5vw, 28px)",
            boxShadow: "0 1px 3px rgba(15,23,42,0.06), 0 12px 40px rgba(15,23,42,0.06)",
            border: "1px solid rgba(226,232,240,0.9)",
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 280px", minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#64748b",
                }}
              >
                Ressources · Direction
              </p>
              <h1
                style={{
                  margin: "10px 0 0",
                  fontSize: "clamp(26px, 3vw, 34px)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "#0f172a",
                  lineHeight: 1.15,
                }}
              >
                Véhicules & remorques
              </h1>
              <p style={{ margin: "12px 0 0", color: "#475569", fontSize: 15, lineHeight: 1.55, maxWidth: 620 }}>
                Enregistrez la flotte, gardez les fiches à jour et désactivez une unité sans la supprimer.
              </p>
            </div>

            <Link href="/direction/ressources" style={backButtonStyle}>
              ← Retour aux ressources
            </Link>
          </div>

          {message ? (
            <div
              role="status"
              style={{
                marginTop: 22,
                padding: "14px 18px",
                borderRadius: 14,
                background: "linear-gradient(90deg, #eff6ff 0%, #f0f9ff 100%)",
                border: "1px solid #bfdbfe",
                color: "#0f172a",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {message}
            </div>
          ) : null}
        </header>

        <div className="veh-main-grid">
          <aside
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: "26px 26px 28px",
              boxShadow: "0 1px 3px rgba(15,23,42,0.05), 0 16px 48px rgba(15,23,42,0.06)",
              border: editing ? "2px solid #38bdf8" : "1px solid #e2e8f0",
              position: "sticky",
              top: 16,
              alignSelf: "start",
              transition: "border-color 0.2s ease",
            }}
          >
            {editing ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "#f0f9ff",
                  border: "1px solid #bae6fd",
                  color: "#0369a1",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                Mode édition
              </div>
            ) : (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  color: "#475569",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                Nouvelle entrée
              </div>
            )}

            <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{formTitle}</h2>
            {editing ? (
              <p style={{ margin: "0 0 22px", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
                <strong style={{ color: "#334155" }}>
                  {editing.kind === "remorque" ? "Remorque" : "Véhicule"}
                </strong>
                {" · "}
                réf. #{editing.id}
              </p>
            ) : (
              <p style={{ margin: "0 0 22px", fontSize: 14, color: "#64748b", lineHeight: 1.5 }}>
                Choisissez le type puis renseignez les champs obligatoires.
              </p>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gap: 18 }}>
                {!editing ? (
                  <div>
                    <label style={labelStyle}>Type de ressource</label>
                    <select
                      value={resourceKind}
                      onChange={(e) => setResourceKind(e.target.value as ResourceKind)}
                      style={selectStyle}
                    >
                      <option value="vehicule">Véhicule</option>
                      <option value="remorque">Remorque</option>
                    </select>
                  </div>
                ) : null}

                <div>
                  <label style={labelStyle}>Nom</label>
                  <input
                    type="text"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    style={inputStyle}
                    placeholder="Ex. Camion 12"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Plaque</label>
                  <input
                    type="text"
                    value={plaque}
                    onChange={(e) => setPlaque(e.target.value)}
                    placeholder="Ex. ABC 123"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Modèle, équipement, notes internes…"
                    style={inputStyle}
                  />
                </div>

                <label style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={actif}
                    onChange={(e) => setActif(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "#0f172a", cursor: "pointer" }}
                  />
                  <span style={{ lineHeight: 1.45 }}>
                    Ressource <strong>active</strong> (disponible pour les opérations)
                  </span>
                </label>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 26 }}>
                <button type="submit" className="tagora-dark-action" style={primaryButtonStyle} disabled={saving}>
                  {submitLabel}
                </button>
                {editing ? (
                  <button type="button" onClick={() => cancelEdit()} style={ghostCancelStyle} disabled={saving}>
                    Annuler la modification
                  </button>
                ) : null}
              </div>
            </form>
          </aside>

          <section
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: "clamp(22px, 2.5vw, 30px)",
              boxShadow: "0 1px 3px rgba(15,23,42,0.05), 0 16px 48px rgba(15,23,42,0.06)",
              border: "1px solid #e2e8f0",
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
                  Flotte
                </h2>
                <p style={{ margin: "6px 0 0", fontSize: 14, color: "#64748b" }}>
                  Vue consolidée — colonnes optimisées pour la lecture et les actions.
                </p>
              </div>
              <button type="button" onClick={() => void fetchFleet()} style={refreshButtonStyle} disabled={loading}>
                {loading ? "Actualisation…" : "Actualiser"}
              </button>
            </div>

            {loading ? (
              <p style={{ color: "#64748b", marginTop: 28, fontSize: 15 }}>Chargement de la flotte…</p>
            ) : (
              <>
                <FleetTableBlock
                  title="Véhicules"
                  subtitle={`${vehicules.length} unité${vehicules.length !== 1 ? "s" : ""}`}
                  kind="vehicule"
                  rows={vehicules}
                  emptyHint="Aucun véhicule enregistré pour le moment."
                  onEdit={(row) => startEdit("vehicule", row)}
                  onDelete={(id) => void handleDelete("vehicule", id)}
                />
                <div style={{ height: 8 }} />
                <FleetTableBlock
                  title="Remorques"
                  subtitle={`${remorques.length} unité${remorques.length !== 1 ? "s" : ""}`}
                  kind="remorque"
                  rows={remorques}
                  emptyHint="Aucune remorque enregistrée pour le moment."
                  onEdit={(row) => startEdit("remorque", row)}
                  onDelete={(id) => void handleDelete("remorque", id)}
                  topDivider
                />
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "5px 12px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.03em",
          background: "linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)",
          color: "#047857",
          border: "1px solid #6ee7b7",
          whiteSpace: "nowrap",
        }}
      >
        Actif
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.03em",
        background: "#f1f5f9",
        color: "#475569",
        border: "1px solid #cbd5e1",
        whiteSpace: "nowrap",
      }}
    >
      Inactif
    </span>
  );
}

function FleetTableBlock(props: {
  title: string;
  subtitle: string;
  kind: ResourceKind;
  rows: FleetRow[];
  emptyHint: string;
  onEdit: (row: FleetRow) => void;
  onDelete: (id: number) => void;
  topDivider?: boolean;
}) {
  const { title, subtitle, kind, rows, emptyHint, onEdit, onDelete, topDivider } = props;

  return (
    <div
      style={
        topDivider
          ? {
              marginTop: 12,
              paddingTop: 32,
              borderTop: "2px solid #e2e8f0",
            }
          : undefined
      }
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
            {title}
          </h3>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {subtitle}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            padding: "28px 22px",
            borderRadius: 16,
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
            color: "#64748b",
            fontSize: 15,
            textAlign: "center",
          }}
        >
          {emptyHint}
        </div>
      ) : (
        <div className="veh-table-scroll">
          <div className="veh-table-wrap">
            <table className="veh-fleet-table">
              <thead>
                <tr>
                  <th className="veh-col-id">ID</th>
                  <th className="veh-col-nom">Nom</th>
                  <th className="veh-col-plaque">Plaque</th>
                  <th className="veh-col-desc">Description</th>
                  <th className="veh-col-status">Statut</th>
                  <th className="veh-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={`${kind}-${item.id}`}>
                    <td className="veh-col-id">{item.id}</td>
                    <td className="veh-col-nom">{item.nom || "—"}</td>
                    <td className="veh-col-plaque">{item.plaque || "—"}</td>
                    <td className="veh-col-desc" title={item.description || undefined}>
                      {item.description || "—"}
                    </td>
                    <td className="veh-col-status">
                      <StatusBadge active={item.actif !== false} />
                    </td>
                    <td className="veh-col-actions">
                      <div className="veh-action-row">
                        <button type="button" onClick={() => onEdit(item)} style={editButtonStyle}>
                          Modifier
                        </button>
                        <button type="button" onClick={() => onDelete(item.id)} style={dangerButtonStyle}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#64748b",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  padding: "0 14px",
  fontSize: 15,
  background: "#fafafa",
  color: "#0f172a",
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  padding: "0 14px",
  fontSize: 15,
  background: "#fafafa",
  color: "#0f172a",
  outline: "none",
  transition: "border-color 0.15s ease",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  fontSize: 14,
  color: "#475569",
  cursor: "pointer",
  padding: "14px 16px",
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

const primaryButtonStyle: React.CSSProperties = {
  height: 48,
  borderRadius: 12,
  border: "none",
  padding: "0 22px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
  color: "#ffffff",
  boxShadow: "0 4px 14px rgba(15,23,42,0.25)",
};

const ghostCancelStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  padding: "0 18px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  background: "#ffffff",
  color: "#475569",
};

const refreshButtonStyle: React.CSSProperties = {
  height: 44,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  padding: "0 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  background: "#f8fafc",
  color: "#0f172a",
  flexShrink: 0,
};

const editButtonStyle: React.CSSProperties = {
  height: 38,
  borderRadius: 10,
  border: "1px solid #7dd3fc",
  padding: "0 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  background: "linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)",
  color: "#0369a1",
  flexShrink: 0,
};

const dangerButtonStyle: React.CSSProperties = {
  height: 38,
  borderRadius: 10,
  border: "none",
  padding: "0 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  background: "linear-gradient(180deg, #f87171 0%, #dc2626 100%)",
  color: "#ffffff",
  boxShadow: "0 2px 8px rgba(220,38,38,0.25)",
  flexShrink: 0,
};

const backButtonStyle: React.CSSProperties = {
  height: 44,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  padding: "0 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  background: "#ffffff",
  color: "#334155",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

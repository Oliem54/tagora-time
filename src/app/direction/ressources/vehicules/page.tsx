"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import HeaderTagora from "@/app/components/HeaderTagora";
import { supabase } from "@/app/lib/supabase/client";

type Vehicule = {
  id: number;
  nom?: string | null;
  plaque?: string | null;
  description?: string | null;
  notes?: string | null;
  actif?: boolean | null;
};

export default function Page() {
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [nom, setNom] = useState("");
  const [plaque, setPlaque] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const fetchVehicules = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const res = await supabase
      .from("vehicules")
      .select("*")
      .order("id", { ascending: true });

    if (res.error) {
      setMessage(`Erreur chargement: ${res.error.message}`);
      setVehicules([]);
      setLoading(false);
      return;
    }

    setVehicules((res.data as Vehicule[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function loadInitialVehicules() {
      await fetchVehicules();
    }

    void loadInitialVehicules();
  }, [fetchVehicules]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!nom.trim()) {
      setMessage("Le nom du véhicule est obligatoire.");
      return;
    }

    if (!plaque.trim()) {
      setMessage("La plaque est obligatoire.");
      return;
    }

    setSaving(true);
    setMessage("");

    const res = await supabase.from("vehicules").insert([
      {
        nom: nom.trim(),
        plaque: plaque.trim(),
        description: description.trim() || null,
        actif: true,
      },
    ]);

    if (res.error) {
      setMessage(`Erreur ajout: ${res.error.message}`);
      setSaving(false);
      return;
    }

    setNom("");
    setPlaque("");
    setDescription("");
    setMessage("Véhicule ajouté.");
    await fetchVehicules();
    setSaving(false);
  }

  async function handleDelete(id: number) {
    const ok = window.confirm("Supprimer ce véhicule ?");
    if (!ok) return;

    setMessage("");

    const res = await supabase.from("vehicules").delete().eq("id", id);

    if (res.error) {
      setMessage(`Erreur suppression: ${res.error.message}`);
      return;
    }

    setMessage("Véhicule supprimé.");
    await fetchVehicules();
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f7" }}>
      <HeaderTagora />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "30px 20px 60px" }}>
        <div
          style={{
            background: "#ffffff",
            borderRadius: 18,
            padding: 24,
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 32, color: "#111827" }}>
                Direction - Véhicules
              </h1>
              <p style={{ marginTop: 10, marginBottom: 0, color: "#4b5563", fontSize: 16 }}>
                Ajoute et gère les véhicules utilisés dans les livraisons.
              </p>
            </div>

            <Link href="/direction/ressources" style={backButtonStyle}>
              Retour
            </Link>
          </div>

          {message ? (
            <div
              style={{
                marginTop: 18,
                padding: "12px 14px",
                borderRadius: 12,
                background: "#eef6ff",
                color: "#0f172a",
                fontSize: 14,
              }}
            >
              {message}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.5fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          <section
            style={{
              background: "#ffffff",
              borderRadius: 18,
              padding: 24,
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 24, color: "#111827" }}>
              Ajouter un véhicule
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nom</label>
                  <input
                    type="text"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    style={inputStyle}
                    placeholder="Ex.: Camion 1"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Plaque</label>
                  <input
                    type="text"
                    value={plaque}
                    onChange={(e) => setPlaque(e.target.value)}
                    style={inputStyle}
                    placeholder="Ex.: ABC123"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={inputStyle}
                    placeholder="Ex.: Ford Transit blanc"
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                <button type="submit" className="tagora-dark-action" style={primaryButtonStyle} disabled={saving}>
                  {saving ? "Creation..." : "Creer"}
                </button>
              </div>
            </form>
          </section>

          <section
            style={{
              background: "#ffffff",
              borderRadius: 18,
              padding: 24,
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 24, color: "#111827" }}>
                Liste des véhicules
              </h2>

              <button onClick={fetchVehicules} style={secondaryButtonStyle}>
                Actualiser
              </button>
            </div>

            {loading ? (
              <p style={{ color: "#6b7280" }}>Chargement...</p>
            ) : vehicules.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Aucun véhicule trouvé.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>ID</th>
                      <th style={thStyle}>Nom</th>
                      <th style={thStyle}>Plaque</th>
                      <th style={thStyle}>Description</th>
                      <th style={thStyle}>Actif</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicules.map((item) => (
                      <tr key={item.id}>
                        <td style={tdStyle}>{item.id}</td>
                        <td style={tdStyle}>{item.nom || ""}</td>
                        <td style={tdStyle}>{item.plaque || ""}</td>
                        <td style={tdStyle}>{item.description || ""}</td>
                        <td style={tdStyle}>{item.actif ? "Oui" : "Non"}</td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => handleDelete(item.id)}
                            style={dangerButtonStyle}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 14,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "0 14px",
  fontSize: 15,
  background: "#ffffff",
  color: "#111827",
  outline: "none",
};

const primaryButtonStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 12,
  border: "none",
  padding: "0 18px",
  fontSize: 15,
  cursor: "pointer",
  background: "#111827",
  color: "#ffffff",
};

const secondaryButtonStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "0 18px",
  fontSize: 15,
  cursor: "pointer",
  background: "#ffffff",
  color: "#111827",
};

const dangerButtonStyle: React.CSSProperties = {
  height: 36,
  borderRadius: 10,
  border: "none",
  padding: "0 12px",
  fontSize: 14,
  cursor: "pointer",
  background: "#dc2626",
  color: "#ffffff",
};

const backButtonStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "0 18px",
  fontSize: 15,
  cursor: "pointer",
  background: "#ffffff",
  color: "#111827",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 700,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#374151",
  background: "#f9fafb",
};

const tdStyle: React.CSSProperties = {
  padding: "14px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#111827",
  verticalAlign: "top",
};

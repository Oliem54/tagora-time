"use client";

import HeaderTagora from "../../components/HeaderTagora";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

type Livraison = {
  id: number;
  client: string | null;
  adresse: string | null;
  date_livraison: string | null;
  heure_prevue: string | null;
  chauffeur: string | null;
  vehicule: string | null;
  ordre_arret: number | null;
  statut: string | null;
  heure_depart_reelle: string | null;
  heure_livree: string | null;
  km_depart: number | null;
  km_arrivee: number | null;
  temps_total: string | null;
  dossier_id: number | null;
};

function formatDateTime(dateString: string | null) {
  if (!dateString) return "-";
  const d = new Date(dateString);
  return d.toLocaleString("fr-CA");
}

function calculerTempsTotal(departIso: string, retourIso: string) {
  const depart = new Date(departIso).getTime();
  const retour = new Date(retourIso).getTime();
  const diffMs = retour - depart;

  if (diffMs <= 0) return "0 min";

  const totalMinutes = Math.floor(diffMs / 1000 / 60);
  const heures = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (heures > 0) {
    return `${heures}h ${minutes}min`;
  }

  return `${minutes} min`;
}

function getStatutStyle(statut: string | null) {
  if (statut === "livree") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    };
  }

  if (statut === "en_cours") {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fcd34d",
    };
  }

  return {
    background: "#e2e8f0",
    color: "#334155",
    border: "1px solid #cbd5e1",
  };
}

function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function EmployeLivraisonsPage() {
  const router = useRouter();

  const [livraisons, setLivraisons] = useState<Livraison[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [kmDepartValues, setKmDepartValues] = useState<Record<number, string>>(
    {}
  );
  const [kmArriveeValues, setKmArriveeValues] = useState<Record<number, string>>(
    {}
  );

  const dateDuJour = getTodayLocalDate();

  const chargerLivraisons = async () => {
    const { data, error } = await supabase
      .from("livraisons_planifiees")
      .select("*")
      .eq("date_livraison", dateDuJour)
      .order("ordre_arret", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      alert("Erreur chargement livraisons : " + error.message);
      return;
    }

    setLivraisons((data || []) as Livraison[]);
  };

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.push("/employe/login");
        return;
      }

      await chargerLivraisons();
      setLoading(false);
    };

    init();
  }, [router]);

  const stats = useMemo(() => {
    const total = livraisons.length;
    const planifiees = livraisons.filter((l) => l.statut === "planifiee").length;
    const enCours = livraisons.filter((l) => l.statut === "en_cours").length;
    const livrees = livraisons.filter((l) => l.statut === "livree").length;

    return { total, planifiees, enCours, livrees };
  }, [livraisons]);

  const handleDemarrer = async (livraison: Livraison) => {
    const kmDepart = kmDepartValues[livraison.id];

    if (!kmDepart?.trim()) {
      alert("Entre le km départ");
      return;
    }

    const kmDepartNumber = Number(kmDepart);

    if (Number.isNaN(kmDepartNumber)) {
      alert("Le km départ doit être un nombre");
      return;
    }

    setSavingId(livraison.id);

    const { error } = await supabase
      .from("livraisons_planifiees")
      .update({
        statut: "en_cours",
        heure_depart_reelle: new Date().toISOString(),
        km_depart: kmDepartNumber,
      })
      .eq("id", livraison.id);

    setSavingId(null);

    if (error) {
      alert("Erreur démarrage : " + error.message);
      return;
    }

    await chargerLivraisons();
  };

  const handleLivree = async (livraison: Livraison) => {
    const kmArrivee = kmArriveeValues[livraison.id];

    if (!kmArrivee?.trim()) {
      alert("Entre le km arrivée");
      return;
    }

    const kmArriveeNumber = Number(kmArrivee);

    if (Number.isNaN(kmArriveeNumber)) {
      alert("Le km arrivée doit être un nombre");
      return;
    }

    const heureLivree = new Date().toISOString();
    const tempsTotal =
      livraison.heure_depart_reelle
        ? calculerTempsTotal(livraison.heure_depart_reelle, heureLivree)
        : null;

    setSavingId(livraison.id);

    const { error } = await supabase
      .from("livraisons_planifiees")
      .update({
        statut: "livree",
        heure_livree: heureLivree,
        km_arrivee: kmArriveeNumber,
        temps_total: tempsTotal,
      })
      .eq("id", livraison.id);

    setSavingId(null);

    if (error) {
      alert("Erreur livraison : " + error.message);
      return;
    }

    await chargerLivraisons();
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f5f7fb",
          padding: "30px 40px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        Chargement...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: "30px 40px",
        color: "#0f172a",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <HeaderTagora
        title="Tournée du jour"
        subtitle="Livraisons du jour classées par ordre d’arrêt"
      />

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <button
          onClick={() => router.push("/employe/dashboard")}
          style={{
            padding: "12px 20px",
            border: "none",
            borderRadius: 12,
            background: "#17376b",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          Retour au dashboard
        </button>

        <button
          onClick={chargerLivraisons}
          style={{
            padding: "12px 20px",
            border: "none",
            borderRadius: 12,
            background: "#d6b21f",
            color: "#1e293b",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          Rafraîchir
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 18,
            padding: 18,
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ color: "#64748b", marginBottom: 8 }}>Total</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.total}</div>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 18,
            padding: 18,
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ color: "#64748b", marginBottom: 8 }}>Planifiées</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.planifiees}</div>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 18,
            padding: 18,
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ color: "#64748b", marginBottom: 8 }}>En cours</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.enCours}</div>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 18,
            padding: 18,
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ color: "#64748b", marginBottom: 8 }}>Livrées</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.livrees}</div>
        </div>
      </div>

      {livraisons.length === 0 ? (
        <div
          style={{
            background: "white",
            borderRadius: 20,
            padding: 30,
            border: "1px solid #e5e7eb",
          }}
        >
          Aucune livraison prévue pour aujourd’hui.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 18,
          }}
        >
          {livraisons.map((livraison) => {
            const distance =
              livraison.km_depart != null && livraison.km_arrivee != null
                ? livraison.km_arrivee - livraison.km_depart
                : null;

            return (
              <div
                key={livraison.id}
                style={{
                  background: "white",
                  borderRadius: 20,
                  padding: 24,
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 800,
                        color: "#17376b",
                        marginBottom: 8,
                      }}
                    >
                      {livraison.client || "Sans client"}
                    </div>

                    <div style={{ marginBottom: 6 }}>
                      <strong>Adresse :</strong> {livraison.adresse || "-"}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <strong>Heure prévue :</strong> {livraison.heure_prevue || "-"}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <strong>Chauffeur :</strong> {livraison.chauffeur || "-"}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <strong>Véhicule :</strong> {livraison.vehicule || "-"}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <strong>Ordre arrêt :</strong> {livraison.ordre_arret ?? "-"}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        ...getStatutStyle(livraison.statut),
                        display: "inline-block",
                        padding: "8px 14px",
                        borderRadius: 12,
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {livraison.statut || "-"}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ marginBottom: 6 }}>
                    <strong>Départ réel :</strong> {formatDateTime(livraison.heure_depart_reelle)}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Livrée à :</strong> {formatDateTime(livraison.heure_livree)}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>KM départ :</strong> {livraison.km_depart ?? "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>KM arrivée :</strong> {livraison.km_arrivee ?? "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Temps total :</strong> {livraison.temps_total || "-"}
                  </div>
                  <div>
                    <strong>Distance :</strong> {distance != null ? `${distance} km` : "-"}
                  </div>
                </div>

                {livraison.statut === "planifiee" && (
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="number"
                      placeholder="KM départ"
                      value={kmDepartValues[livraison.id] || ""}
                      onChange={(e) =>
                        setKmDepartValues((prev) => ({
                          ...prev,
                          [livraison.id]: e.target.value,
                        }))
                      }
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #cbd5e1",
                        minWidth: 180,
                      }}
                    />

                    <button
                      onClick={() => handleDemarrer(livraison)}
                      disabled={savingId === livraison.id}
                      style={{
                        padding: "12px 20px",
                        border: "none",
                        borderRadius: 12,
                        background: "#d6b21f",
                        color: "#1e293b",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 16,
                      }}
                    >
                      {savingId === livraison.id ? "Enregistrement..." : "Démarrer"}
                    </button>
                  </div>
                )}

                {livraison.statut === "en_cours" && (
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="number"
                      placeholder="KM arrivée"
                      value={kmArriveeValues[livraison.id] || ""}
                      onChange={(e) =>
                        setKmArriveeValues((prev) => ({
                          ...prev,
                          [livraison.id]: e.target.value,
                        }))
                      }
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #cbd5e1",
                        minWidth: 180,
                      }}
                    />

                    <button
                      onClick={() => handleLivree(livraison)}
                      disabled={savingId === livraison.id}
                      style={{
                        padding: "12px 20px",
                        border: "none",
                        borderRadius: 12,
                        background: "#17376b",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 16,
                      }}
                    >
                      {savingId === livraison.id ? "Enregistrement..." : "Marquer livrée"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
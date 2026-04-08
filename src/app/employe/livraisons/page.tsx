"use client";

import HeaderTagora from "../../components/HeaderTagora";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AccessNotice from "../../components/AccessNotice";
import { supabase } from "../../lib/supabase/client";
import { useCurrentAccess } from "../../hooks/useCurrentAccess";

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
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();

  const [livraisons, setLivraisons] = useState<Livraison[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [kmDepartValues, setKmDepartValues] = useState<Record<number, string>>(
    {}
  );
  const [kmArriveeValues, setKmArriveeValues] = useState<Record<number, string>>(
    {}
  );

  const dateDuJour = getTodayLocalDate();
  const canUseLivraisons = hasPermission("livraisons");

  const chargerLivraisons = async () => {
    const { data, error } = await supabase
      .from("livraisons_planifiees")
      .select("*")
      .eq("date_livraison", dateDuJour)
      .order("ordre_arret", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      setFeedback("Erreur chargement livraisons : " + error.message);
      return;
    }

    setLivraisons((data || []) as Livraison[]);
  };

  useEffect(() => {
    async function init() {
      if (accessLoading) return;

      if (!user) {
        router.push("/employe/login");
        return;
      }

      if (!canUseLivraisons) {
        setLoading(false);
        return;
      }

      await chargerLivraisons();
      setLoading(false);
    }

    void init();
  }, [accessLoading, canUseLivraisons, router, user]);

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
      setFeedback("Entre le km depart.");
      return;
    }

    const kmDepartNumber = Number(kmDepart);

    if (Number.isNaN(kmDepartNumber)) {
      setFeedback("Le km depart doit etre un nombre.");
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
      setFeedback("Erreur demarrage : " + error.message);
      return;
    }

    await chargerLivraisons();
  };

  const handleLivree = async (livraison: Livraison) => {
    const kmArrivee = kmArriveeValues[livraison.id];

    if (!kmArrivee?.trim()) {
      setFeedback("Entre le km arrivee.");
      return;
    }

    const kmArriveeNumber = Number(kmArrivee);

    if (Number.isNaN(kmArriveeNumber)) {
      setFeedback("Le km arrivee doit etre un nombre.");
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
      setFeedback("Erreur livraison : " + error.message);
      return;
    }

    await chargerLivraisons();
  };

  if (accessLoading || loading) {
    return (
      <div className="page-container">
        <HeaderTagora title="Tournee du jour" subtitle="Livraisons du jour classees par ordre d arret" />
        <AccessNotice description="Verification des acces livraisons et chargement des donnees en cours." />
      </div>
    );
  }

  if (!canUseLivraisons) {
    return (
      <div className="page-container">
        <HeaderTagora title="Tournee du jour" subtitle="Livraisons du jour classees par ordre d arret" />
        <AccessNotice description="La permission livraisons n est pas active sur votre compte. Ce module reste masque." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <HeaderTagora
        title="Tournée du jour"
        subtitle="Livraisons du jour classées par ordre d’arrêt"
      />

      {feedback ? <AccessNotice title="Action bloquee" description={feedback} /> : null}

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <button onClick={() => router.push("/employe/dashboard")} className="tagora-dark-outline-action">
          Retour au dashboard
        </button>

        <button onClick={chargerLivraisons} className="tagora-dark-action">
          Actualiser
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 18,
            padding: 18,
            minHeight: 116,
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
            minHeight: 116,
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
            minHeight: 116,
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
            minHeight: 116,
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
                      className="tagora-input"
                      style={{ minWidth: 180 }}
                    />

                    <button
                      onClick={() => handleDemarrer(livraison)}
                      disabled={savingId === livraison.id}
                      className="tagora-dark-action"
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
                      className="tagora-input"
                      style={{ minWidth: 180 }}
                    />

                    <button
                      onClick={() => handleLivree(livraison)}
                      disabled={savingId === livraison.id}
                      className="tagora-navy-action"
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

"use client";

import HeaderTagora from "../../components/HeaderTagora";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

type SortieTerrain = {
  id: number;
  compagnie: string | null;
  client: string | null;
  dossier: string | null;
  dossier_id: number | null;
  vehicule: string | null;
  km_depart: number | null;
  km_arrivee: number | null;
  heure_depart: string | null;
  heure_retour: string | null;
  temps_total: string | null;
  notes: string | null;
  statut: string | null;
};

type DossierOption = {
  id: number;
  nom: string | null;
  client: string | null;
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

export default function TerrainPage() {
  const router = useRouter();

  const [compagnie, setCompagnie] = useState("");
  const [client, setClient] = useState("");
  const [dossierId, setDossierId] = useState("");
  const [vehicule, setVehicule] = useState("");
  const [kmDepart, setKmDepart] = useState("");
  const [kmArrivee, setKmArrivee] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [sortieActive, setSortieActive] = useState<SortieTerrain | null>(null);
  const [historique, setHistorique] = useState<SortieTerrain[]>([]);
  const [dossiers, setDossiers] = useState<DossierOption[]>([]);
  const [loading, setLoading] = useState(true);

  const getNomDossier = (id: number | null) => {
    if (!id) return "-";
    const dossier = dossiers.find((d) => d.id === id);
    return dossier?.nom || `Dossier #${id}`;
  };

  const chargerDossiers = async () => {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      router.push("/employe/login");
      return;
    }

    const { data, error } = await supabase
      .from("dossiers")
      .select("id, nom, client")
      .eq("user_id", userData.user.id)
      .order("id", { ascending: false });

    if (error) {
      alert("Erreur chargement dossiers : " + error.message);
      return;
    }

    const dossiersFiltres = (data || []).filter(
      (d) => d.nom?.trim() || d.client?.trim()
    ) as DossierOption[];

    setDossiers(dossiersFiltres);
  };

  const chargerSorties = async () => {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      router.push("/employe/login");
      return;
    }

    const userId = userData.user.id;

    const { data, error } = await supabase
      .from("sorties_terrain")
      .select("*")
      .eq("user_id", userId)
      .order("id", { ascending: false });

    if (error) {
      alert("Erreur chargement sorties : " + error.message);
      return;
    }

    const sorties = (data || []) as SortieTerrain[];

    const active = sorties.find((s) => s.statut === "en_cours") || null;
    const terminees = sorties.filter((s) => s.statut !== "en_cours");

    setSortieActive(active);
    setHistorique(terminees.slice(0, 10));
  };

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.push("/employe/login");
        return;
      }

      await chargerDossiers();
      await chargerSorties();
      setLoading(false);
    };

    init();
  }, [router]);

  const handleChoixDossier = (value: string) => {
    setDossierId(value);

    const id = Number(value);
    if (!id) return;

    const dossierChoisi = dossiers.find((d) => d.id === id);
    if (!dossierChoisi) return;

    if (!client && dossierChoisi.client) {
      setClient(dossierChoisi.client);
    }
  };

  const handleDemarrer = async () => {
    if (!compagnie.trim()) {
      alert("Entre une compagnie");
      return;
    }

    if (!client.trim()) {
      alert("Entre un client");
      return;
    }

    if (!vehicule.trim()) {
      alert("Entre un véhicule");
      return;
    }

    if (!kmDepart.trim()) {
      alert("Entre le km de départ");
      return;
    }

    const kmDepartNumber = Number(kmDepart);

    if (Number.isNaN(kmDepartNumber)) {
      alert("Le km de départ doit être un nombre");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      alert("Non connecté");
      router.push("/employe/login");
      return;
    }

    const dossierIdNumber = dossierId ? Number(dossierId) : null;
    const dossierNom = dossierIdNumber ? getNomDossier(dossierIdNumber) : null;

    setSaving(true);

    const now = new Date().toISOString();

    const { error } = await supabase.from("sorties_terrain").insert([
      {
        compagnie,
        client,
        dossier: dossierNom,
        dossier_id: dossierIdNumber,
        vehicule,
        km_depart: kmDepartNumber,
        notes,
        heure_depart: now,
        statut: "en_cours",
        user_id: userData.user.id,
      },
    ]);

    setSaving(false);

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    alert("Sortie terrain démarrée");

    setCompagnie("");
    setClient("");
    setDossierId("");
    setVehicule("");
    setKmDepart("");
    setKmArrivee("");
    setNotes("");

    await chargerSorties();
  };

  const handleTerminer = async () => {
    if (!sortieActive) {
      alert("Aucune sortie active");
      return;
    }

    if (!kmArrivee.trim()) {
      alert("Entre le km de retour");
      return;
    }

    const kmArriveeNumber = Number(kmArrivee);

    if (Number.isNaN(kmArriveeNumber)) {
      alert("Le km de retour doit être un nombre");
      return;
    }

    const heureRetour = new Date().toISOString();
    const tempsTotal = calculerTempsTotal(
      sortieActive.heure_depart || heureRetour,
      heureRetour
    );

    setSaving(true);

    const { error } = await supabase
      .from("sorties_terrain")
      .update({
        km_arrivee: kmArriveeNumber,
        heure_retour: heureRetour,
        temps_total: tempsTotal,
        statut: "terminee",
        notes: notes.trim() ? notes : sortieActive.notes,
      })
      .eq("id", sortieActive.id);

    setSaving(false);

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    alert("Sortie terrain terminée");

    setKmArrivee("");
    setNotes("");

    await chargerSorties();
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
        title="Terrain employé"
        subtitle="Sorties, livraisons et interventions"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          alignItems: "start",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 20,
            padding: 26,
            border: "1px solid #e5e7eb",
            boxShadow: "0 16px 36px rgba(15, 23, 42, 0.08)",
          }}
        >
          <h2 style={{ marginTop: 0, color: "#17376b" }}>
            Démarrer une sortie
          </h2>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Compagnie</div>
            <input
              value={compagnie}
              onChange={(e) => setCompagnie(e.target.value)}
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Client</div>
            <input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Dossier lié</div>
            <select
              value={dossierId}
              onChange={(e) => handleChoixDossier(e.target.value)}
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                outline: "none",
                boxSizing: "border-box",
                background: "white",
              }}
            >
              <option value="">Choisir un dossier</option>
              {dossiers.map((dossier) => (
                <option key={dossier.id} value={dossier.id}>
                  {dossier.nom || `Dossier #${dossier.id}`}
                  {dossier.client ? ` - ${dossier.client}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Véhicule</div>
            <input
              value={vehicule}
              onChange={(e) => setVehicule(e.target.value)}
              placeholder="Camion 1, Camion 2, Personnel"
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>KM départ</div>
            <input
              value={kmDepart}
              onChange={(e) => setKmDepart(e.target.value)}
              placeholder="Ex: 2587"
              type="number"
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Notes départ</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ajoute les détails de la sortie..."
              style={{
                width: "100%",
                height: 120,
                padding: 14,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            onClick={handleDemarrer}
            disabled={saving || !!sortieActive}
            style={{
              padding: "12px 20px",
              border: "none",
              borderRadius: 12,
              background: sortieActive ? "#94a3b8" : "#d6b21f",
              color: sortieActive ? "white" : "#1e293b",
              cursor: sortieActive ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            {saving ? "Enregistrement..." : "Démarrer la sortie"}
          </button>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 20,
            padding: 26,
            border: "1px solid #e5e7eb",
            boxShadow: "0 16px 36px rgba(15, 23, 42, 0.08)",
          }}
        >
          <h2 style={{ marginTop: 0, color: "#17376b" }}>Sortie active</h2>

          {!sortieActive ? (
            <p>Aucune sortie en cours pour le moment.</p>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <strong>Compagnie :</strong> {sortieActive.compagnie || "-"}
              </div>
              <div style={{ marginBottom: 10 }}>
                <strong>Client :</strong> {sortieActive.client || "-"}
              </div>
              <div style={{ marginBottom: 10 }}>
                <strong>Dossier :</strong>{" "}
                {sortieActive.dossier_id
                  ? getNomDossier(sortieActive.dossier_id)
                  : sortieActive.dossier || "-"}
              </div>
              <div style={{ marginBottom: 10 }}>
                <strong>Véhicule :</strong> {sortieActive.vehicule || "-"}
              </div>
              <div style={{ marginBottom: 10 }}>
                <strong>KM départ :</strong> {sortieActive.km_depart ?? "-"}
              </div>
              <div style={{ marginBottom: 18 }}>
                <strong>Heure départ :</strong>{" "}
                {formatDateTime(sortieActive.heure_depart)}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>KM retour</div>
                <input
                  value={kmArrivee}
                  onChange={(e) => setKmArrivee(e.target.value)}
                  placeholder="Ex: 2644"
                  type="number"
                  style={{
                    width: "100%",
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Notes de fin
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Complète les détails de fin de sortie..."
                  style={{
                    width: "100%",
                    height: 120,
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    resize: "none",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                onClick={handleTerminer}
                disabled={saving}
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
                {saving ? "Enregistrement..." : "Terminer la sortie"}
              </button>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          background: "white",
          borderRadius: 20,
          padding: 26,
          border: "1px solid #e5e7eb",
          boxShadow: "0 16px 36px rgba(15, 23, 42, 0.08)",
          marginBottom: 20,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#17376b" }}>Historique récent</h2>

        {historique.length === 0 ? (
          <p>Aucune sortie terminée pour le moment.</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {historique.map((sortie) => {
              const distance =
                sortie.km_depart != null && sortie.km_arrivee != null
                  ? sortie.km_arrivee - sortie.km_depart
                  : null;

              return (
                <div
                  key={sortie.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 16,
                    background: "#fafafa",
                  }}
                >
                  <div style={{ marginBottom: 6 }}>
                    <strong>Client :</strong> {sortie.client || "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Compagnie :</strong> {sortie.compagnie || "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Dossier :</strong>{" "}
                    {sortie.dossier_id
                      ? getNomDossier(sortie.dossier_id)
                      : sortie.dossier || "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Véhicule :</strong> {sortie.vehicule || "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Départ :</strong> {formatDateTime(sortie.heure_depart)}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Retour :</strong> {formatDateTime(sortie.heure_retour)}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Temps total :</strong> {sortie.temps_total || "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>KM départ :</strong> {sortie.km_depart ?? "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>KM retour :</strong> {sortie.km_arrivee ?? "-"}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong>Distance :</strong>{" "}
                    {distance != null ? `${distance} km` : "-"}
                  </div>
                  <div>
                    <strong>Notes :</strong> {sortie.notes || "-"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
    </div>
  );
}
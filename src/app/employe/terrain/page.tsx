"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import HeaderTagora from "../../components/HeaderTagora";
import AccessNotice from "../../components/AccessNotice";
import { supabase } from "../../lib/supabase/client";
import { useCurrentAccess } from "../../hooks/useCurrentAccess";

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
  return new Date(dateString).toLocaleString("fr-CA");
}

function calculerTempsTotal(departIso: string, retourIso: string) {
  const depart = new Date(departIso).getTime();
  const retour = new Date(retourIso).getTime();
  const diffMs = retour - depart;

  if (diffMs <= 0) return "0 min";

  const totalMinutes = Math.floor(diffMs / 1000 / 60);
  const heures = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return heures > 0 ? `${heures}h ${minutes}min` : `${minutes} min`;
}

export default function TerrainPage() {
  const router = useRouter();
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const userId = user?.id ?? null;
  const canUseTerrain = hasPermission("terrain");

  const [compagnie, setCompagnie] = useState("");
  const [client, setClient] = useState("");
  const [dossierId, setDossierId] = useState("");
  const [vehicule, setVehicule] = useState("");
  const [kmDepart, setKmDepart] = useState("");
  const [kmArrivee, setKmArrivee] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sortieActive, setSortieActive] = useState<SortieTerrain | null>(null);
  const [historique, setHistorique] = useState<SortieTerrain[]>([]);
  const [dossiers, setDossiers] = useState<DossierOption[]>([]);
  const [feedback, setFeedback] = useState("");
  const [secondaryNotice, setSecondaryNotice] = useState("");

  const getNomDossier = (id: number | null) => {
    if (!id) return "-";
    const dossier = dossiers.find((item) => item.id === id);
    return dossier?.nom || `Dossier #${id}`;
  };

  async function chargerSorties(userId: string) {
    const { data, error } = await supabase
      .from("sorties_terrain")
      .select("*")
      .eq("user_id", userId)
      .order("id", { ascending: false });

    if (error) {
      setFeedback(
        "Les sorties terrain ne sont pas accessibles pour le moment. Verifie vos permissions terrain."
      );
      setSortieActive(null);
      setHistorique([]);
      return;
    }

    const sorties = (data || []) as SortieTerrain[];
    setSortieActive(sorties.find((item) => item.statut === "en_cours") || null);
    setHistorique(sorties.filter((item) => item.statut !== "en_cours").slice(0, 10));
  }

  async function chargerDossiers(userId: string) {
    const { data, error } = await supabase
      .from("dossiers")
      .select("id, nom, client")
      .eq("user_id", userId)
      .order("id", { ascending: false });

    if (error) {
      setDossiers([]);
      setSecondaryNotice(
        "Les dossiers lies ne sont pas disponibles sur ce compte. Vous pouvez tout de meme gerer vos sorties terrain sans rattacher de dossier."
      );
      return;
    }

    const dossiersFiltres = (data || []).filter(
      (item) => item.nom?.trim() || item.client?.trim()
    ) as DossierOption[];

    setDossiers(dossiersFiltres);
    setSecondaryNotice("");
  }

  useEffect(() => {
    async function init() {
      if (accessLoading) return;

      if (!userId) {
        router.push("/employe/login");
        return;
      }

      if (!canUseTerrain) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setFeedback("");
      await Promise.all([chargerSorties(userId), chargerDossiers(userId)]);
      setLoading(false);
    }

    void init();
  }, [accessLoading, canUseTerrain, router, userId]);

  const handleChoixDossier = (value: string) => {
    setDossierId(value);

    const id = Number(value);
    if (!id) return;

    const dossierChoisi = dossiers.find((item) => item.id === id);
    if (!dossierChoisi) return;

    if (!client && dossierChoisi.client) {
      setClient(dossierChoisi.client);
    }
  };

  const handleDemarrer = async () => {
    if (!user) {
      router.push("/employe/login");
      return;
    }

    if (!compagnie.trim()) {
      setFeedback("Entre une compagnie avant de demarrer la sortie.");
      return;
    }

    if (!client.trim()) {
      setFeedback("Entre un client avant de demarrer la sortie.");
      return;
    }

    if (!vehicule.trim()) {
      setFeedback("Entre un vehicule avant de demarrer la sortie.");
      return;
    }

    if (!kmDepart.trim()) {
      setFeedback("Entre le kilometre de depart.");
      return;
    }

    const kmDepartNumber = Number(kmDepart);
    if (Number.isNaN(kmDepartNumber)) {
      setFeedback("Le kilometre de depart doit etre numerique.");
      return;
    }

    const dossierIdNumber = dossierId ? Number(dossierId) : null;
    const dossierNom = dossierIdNumber ? getNomDossier(dossierIdNumber) : null;

    setSaving(true);
    setFeedback("");

    const { error } = await supabase.from("sorties_terrain").insert([
      {
        compagnie,
        client,
        dossier: dossierNom,
        dossier_id: dossierIdNumber,
        vehicule,
        km_depart: kmDepartNumber,
        notes: notes.trim() || null,
        heure_depart: new Date().toISOString(),
        statut: "en_cours",
        user_id: user.id,
      },
    ]);

    setSaving(false);

    if (error) {
      setFeedback(
        "Impossible de demarrer la sortie. Verifie l acces terrain ou les champs requis."
      );
      return;
    }

    setCompagnie("");
    setClient("");
    setDossierId("");
    setVehicule("");
    setKmDepart("");
    setKmArrivee("");
    setNotes("");
    await chargerSorties(user.id);
  };

  const handleTerminer = async () => {
    if (!user) {
      router.push("/employe/login");
      return;
    }

    if (!sortieActive) {
      setFeedback("Aucune sortie active a terminer.");
      return;
    }

    if (!kmArrivee.trim()) {
      setFeedback("Entre le kilometre de retour.");
      return;
    }

    const kmArriveeNumber = Number(kmArrivee);
    if (Number.isNaN(kmArriveeNumber)) {
      setFeedback("Le kilometre de retour doit etre numerique.");
      return;
    }

    const heureRetour = new Date().toISOString();
    const tempsTotal = calculerTempsTotal(
      sortieActive.heure_depart || heureRetour,
      heureRetour
    );

    setSaving(true);
    setFeedback("");

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
      setFeedback(
        "Impossible de terminer la sortie. Verifie que la sortie est toujours accessible."
      );
      return;
    }

    setKmArrivee("");
    setNotes("");
    await chargerSorties(user.id);
  };

  if (accessLoading || loading) {
    return (
      <div className="page-container">
        <HeaderTagora
          title="Terrain employe"
          subtitle="Sorties, livraisons et interventions"
        />
        <AccessNotice description="Verification des acces terrain et chargement des donnees en cours." />
      </div>
    );
  }

  if (!canUseTerrain) {
    return (
      <div className="page-container">
        <HeaderTagora
          title="Terrain employe"
          subtitle="Sorties, livraisons et interventions"
        />
        <AccessNotice description="La permission terrain n est pas active sur votre compte. Cette page reste masquee tant que cet acces n a pas ete accorde." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <HeaderTagora
        title="Terrain employe"
        subtitle="Sorties, livraisons et interventions"
      />

      {feedback ? <AccessNotice title="Action bloquee" description={feedback} /> : null}
      {secondaryNotice ? (
        <div style={{ marginTop: feedback ? 18 : 0 }}>
          <AccessNotice title="Acces partiel" description={secondaryNotice} />
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24,
          alignItems: "start",
          marginTop: 24,
          marginBottom: 24,
        }}
      >
        <div className="tagora-panel" style={{ minHeight: 540 }}>
          <h2 className="section-title" style={{ marginBottom: 18 }}>
            Demarrer une sortie
          </h2>

          <div className="tagora-form-grid">
            <label className="tagora-field">
              <span className="tagora-label">Compagnie</span>
              <input
                value={compagnie}
                onChange={(event) => setCompagnie(event.target.value)}
                className="tagora-input"
              />
            </label>

            <label className="tagora-field">
              <span className="tagora-label">Client</span>
              <input
                value={client}
                onChange={(event) => setClient(event.target.value)}
                className="tagora-input"
              />
            </label>

            <label className="tagora-field">
              <span className="tagora-label">Dossier lie</span>
              <select
                value={dossierId}
                onChange={(event) => handleChoixDossier(event.target.value)}
                className="tagora-input"
              >
                <option value="">Choisir un dossier</option>
                {dossiers.map((dossier) => (
                  <option key={dossier.id} value={dossier.id}>
                    {dossier.nom || `Dossier #${dossier.id}`}
                    {dossier.client ? ` - ${dossier.client}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="tagora-field">
              <span className="tagora-label">Vehicule</span>
              <input
                value={vehicule}
                onChange={(event) => setVehicule(event.target.value)}
                placeholder="Camion 1, personnel, remorque"
                className="tagora-input"
              />
            </label>

            <label className="tagora-field">
              <span className="tagora-label">KM depart</span>
              <input
                value={kmDepart}
                onChange={(event) => setKmDepart(event.target.value)}
                type="number"
                className="tagora-input"
              />
            </label>

            <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
              <span className="tagora-label">Notes depart</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Details de la sortie, consignes, client, contraintes."
                className="tagora-textarea"
              />
            </label>
          </div>

          <button
            onClick={handleDemarrer}
            disabled={saving || !!sortieActive}
            className="tagora-dark-action"
            style={{ marginTop: 18 }}
          >
            {saving ? "Enregistrement..." : "Demarrer la sortie"}
          </button>
        </div>

        <div className="tagora-panel" style={{ minHeight: 540 }}>
          <h2 className="section-title" style={{ marginBottom: 18 }}>
            Sortie active
          </h2>

          {!sortieActive ? (
            <p className="tagora-note">
              Aucune sortie en cours pour le moment.
            </p>
          ) : (
            <>
              <div className="tagora-note" style={{ display: "grid", gap: 8 }}>
                <div>
                  <strong>Compagnie :</strong> {sortieActive.compagnie || "-"}
                </div>
                <div>
                  <strong>Client :</strong> {sortieActive.client || "-"}
                </div>
                <div>
                  <strong>Dossier :</strong>{" "}
                  {sortieActive.dossier_id
                    ? getNomDossier(sortieActive.dossier_id)
                    : sortieActive.dossier || "-"}
                </div>
                <div>
                  <strong>Vehicule :</strong> {sortieActive.vehicule || "-"}
                </div>
                <div>
                  <strong>KM depart :</strong> {sortieActive.km_depart ?? "-"}
                </div>
                <div>
                  <strong>Heure depart :</strong>{" "}
                  {formatDateTime(sortieActive.heure_depart)}
                </div>
              </div>

              <div className="tagora-form-grid" style={{ marginTop: 18 }}>
                <label className="tagora-field">
                  <span className="tagora-label">KM retour</span>
                  <input
                    value={kmArrivee}
                    onChange={(event) => setKmArrivee(event.target.value)}
                    type="number"
                    className="tagora-input"
                  />
                </label>

                <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                  <span className="tagora-label">Notes de fin</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Completer les details de fin de sortie."
                    className="tagora-textarea"
                  />
                </label>
              </div>

              <button
                onClick={handleTerminer}
                disabled={saving}
                className="tagora-dark-action"
                style={{ marginTop: 18 }}
              >
                {saving ? "Enregistrement..." : "Terminer la sortie"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="tagora-panel">
        <h2 className="section-title" style={{ marginBottom: 18 }}>
          Historique recent
        </h2>

        {historique.length === 0 ? (
          <p className="tagora-note">
            Aucune sortie terminee pour le moment.
          </p>
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
                    borderRadius: 16,
                    padding: 16,
                    background: "#fafafa",
                  }}
                >
                  <div className="tagora-note" style={{ display: "grid", gap: 6 }}>
                    <div>
                      <strong>Client :</strong> {sortie.client || "-"}
                    </div>
                    <div>
                      <strong>Compagnie :</strong> {sortie.compagnie || "-"}
                    </div>
                    <div>
                      <strong>Dossier :</strong>{" "}
                      {sortie.dossier_id
                        ? getNomDossier(sortie.dossier_id)
                        : sortie.dossier || "-"}
                    </div>
                    <div>
                      <strong>Vehicule :</strong> {sortie.vehicule || "-"}
                    </div>
                    <div>
                      <strong>Depart :</strong> {formatDateTime(sortie.heure_depart)}
                    </div>
                    <div>
                      <strong>Retour :</strong> {formatDateTime(sortie.heure_retour)}
                    </div>
                    <div>
                      <strong>Temps total :</strong> {sortie.temps_total || "-"}
                    </div>
                    <div>
                      <strong>KM depart :</strong> {sortie.km_depart ?? "-"}
                    </div>
                    <div>
                      <strong>KM retour :</strong> {sortie.km_arrivee ?? "-"}
                    </div>
                    <div>
                      <strong>Distance :</strong>{" "}
                      {distance != null ? `${distance} km` : "-"}
                    </div>
                    <div>
                      <strong>Notes :</strong> {sortie.notes || "-"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="actions-row" style={{ marginTop: 24 }}>
        <button
          onClick={() => router.push("/employe/dashboard")}
          className="tagora-dark-outline-action"
        >
          Retour au dashboard
        </button>
      </div>
    </div>
  );
}

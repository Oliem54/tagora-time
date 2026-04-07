"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import { supabase } from "@/app/lib/supabase/client";

type Row = Record<string, any>;

export default function Page() {
  const [livraisons, setLivraisons] = useState<Row[]>([]);
  const [dossiers, setDossiers] = useState<Row[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Row[]>([]);
  const [vehicules, setVehicules] = useState<Row[]>([]);
  const [remorques, setRemorques] = useState<Row[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  function setFeedbackMessage(msg: string, type: "success" | "error") {
    setMessage(msg);
    setMessageType(type);
  }

  function clearMessage() {
    setMessage("");
    setMessageType(null);
  }

  const [filtre, setFiltre] = useState({
    chauffeur_id: "",
    vehicule_id: "",
    remorque_id: "",
    statut: "",
  });

  const [form, setForm] = useState({
    dossier_id: "",
    adresse: "",
    date_livraison: "",
    heure_prevue: "",
    chauffeur_id: "",
    vehicule_id: "",
    remorque_id: "",
    statut: "",
  });

  const [newForm, setNewForm] = useState({
    chauffeur_id: "",
    vehicule_id: "",
    remorque_id: "",
    dossier_id: "",
    date_livraison: "",
    statut: "planifiee",
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    clearMessage();

    const [
      livraisonsRes,
      dossiersRes,
      chauffeursRes,
      vehiculesRes,
      remorquesRes,
    ] = await Promise.all([
      supabase.from("livraisons_planifiees").select("*").order("id", { ascending: false }),
      supabase.from("dossiers").select("*").order("id", { ascending: false }),
      supabase.from("chauffeurs").select("*").order("id", { ascending: true }),
      supabase.from("vehicules").select("*").order("id", { ascending: true }),
      supabase.from("remorques").select("*").order("id", { ascending: true }),
    ]);

    const erreurs: string[] = [];

    if (livraisonsRes.error) erreurs.push(`Erreur livraisons: ${livraisonsRes.error.message}`);
    if (dossiersRes.error) erreurs.push(`Erreur dossiers: ${dossiersRes.error.message}`);
    if (chauffeursRes.error) erreurs.push(`Erreur chauffeurs: ${chauffeursRes.error.message}`);
    if (vehiculesRes.error) erreurs.push(`Erreur véhicules: ${vehiculesRes.error.message}`);
    if (remorquesRes.error) erreurs.push(`Erreur remorques: ${remorquesRes.error.message}`);

    if (erreurs.length > 0) {
      setFeedbackMessage(errors.join(" | "), "error");
    }

    setLivraisons(livraisonsRes.data || []);
    setDossiers(dossiersRes.data || []);
    setChauffeurs(chauffeursRes.data || []);
    setVehicules(vehiculesRes.data || []);
    setRemorques(remorquesRes.data || []);
    setLoading(false);
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      dossier_id: "",
      adresse: "",
      date_livraison: "",
      heure_prevue: "",
      chauffeur_id: "",
      vehicule_id: "",
      remorque_id: "",
      statut: "",
    });
  }

  function resetCreateForm() {
    setNewForm({
      chauffeur_id: "",
      vehicule_id: "",
      remorque_id: "",
      dossier_id: "",
      date_livraison: "",
      statut: "planifiee",
    });
    setShowCreateForm(false);
  }

  function getDossierLabel(dossier: Row) {
    return (
      dossier.nom ||
      dossier.titre ||
      dossier.reference ||
      dossier.numero ||
      dossier.nom_client ||
      dossier.client ||
      `Dossier #${dossier.id}`
    );
  }

  function getPersonLabel(item: Row) {
    return (
      item.nom_complet ||
      item.nom ||
      item.name ||
      [item.prenom, item.nom].filter(Boolean).join(" ").trim() ||
      `#${item.id}`
    );
  }

  function getVehiculeLabel(item: Row) {
    return (
      item.nom ||
      item.modele ||
      item.plaque ||
      item.identifiant ||
      item.numero ||
      `Véhicule #${item.id}`
    );
  }

  function getRemorqueLabel(item: Row) {
    return (
      item.nom ||
      item.modele ||
      item.plaque ||
      item.identifiant ||
      item.numero ||
      `Remorque #${item.id}`
    );
  }

  function getDossierById(id: any) {
    return dossiers.find((x) => String(x.id) === String(id));
  }

  function getChauffeurById(id: any) {
    return chauffeurs.find((x) => String(x.id) === String(id));
  }

  function getVehiculeById(id: any) {
    return vehicules.find((x) => String(x.id) === String(id));
  }

  function getRemorqueById(id: any) {
    return remorques.find((x) => String(x.id) === String(id));
  }

  function getStatusBadge(statut: string) {
    const colors = {
      planifiee: "#6b7280", // grey
      en_cours: "#f59e0b", // orange
      livree: "#10b981", // green
      probleme: "#ef4444", // red
    };

    const color = colors[statut as keyof typeof colors] || "#6b7280";

    return (
      <span
        style={{
          display: "inline-block",
          padding: "4px 8px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          color: "#ffffff",
          background: color,
          textTransform: "capitalize",
        }}
      >
        {statut === "planifiee" ? "Planifiée" :
         statut === "en_cours" ? "En cours" :
         statut === "livree" ? "Livrée" :
         statut === "probleme" ? "Problème" : statut}
      </span>
    );
  }

  const livraisonsFiltrees = useMemo(() => {
    return livraisons.filter((item) => {
      const okChauffeur =
        !filtre.chauffeur_id || String(item.chauffeur_id) === String(filtre.chauffeur_id);

      const okVehicule =
        !filtre.vehicule_id || String(item.vehicule_id) === String(filtre.vehicule_id);

      const okRemorque =
        !filtre.remorque_id || String(item.remorque_id) === String(filtre.remorque_id);

      const okStatut = !filtre.statut || item.statut === filtre.statut;

      return okChauffeur && okVehicule && okRemorque && okStatut;
    });
  }, [livraisons, filtre]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    clearMessage();

    const payload = {
      dossier_id: form.dossier_id ? Number(form.dossier_id) : null,
      adresse: form.adresse || null,
      date_livraison: form.date_livraison || null,
      heure_prevue: form.heure_prevue || null,
      chauffeur_id: form.chauffeur_id ? Number(form.chauffeur_id) : null,
      vehicule_id: form.vehicule_id ? Number(form.vehicule_id) : null,
      remorque_id: form.remorque_id ? Number(form.remorque_id) : null,
      statut: form.statut || null,
    };

    let res;

    if (editingId) {
      res = await supabase
        .from("livraisons_planifiees")
        .update(payload)
        .eq("id", editingId);
    } else {
      res = await supabase.from("livraisons_planifiees").insert([payload]);
    }

    if (res.error) {
      setFeedbackMessage(`Erreur sauvegarde: ${res.error.message}`, "error");
      setSaving(false);
      return;
    }

    setFeedbackMessage(editingId ? "Livraison modifiée." : "Livraison ajoutée.", "success");
    resetForm();
    await fetchData();
    setSaving(false);
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    clearMessage();

    const payload = {
      chauffeur_id: newForm.chauffeur_id ? Number(newForm.chauffeur_id) : null,
      vehicule_id: newForm.vehicule_id ? Number(newForm.vehicule_id) : null,
      remorque_id: newForm.remorque_id ? Number(newForm.remorque_id) : null,
      dossier_id: newForm.dossier_id ? Number(newForm.dossier_id) : null,
      date_livraison: newForm.date_livraison || null,
      statut: newForm.statut || null,
    };

    const res = await supabase.from("livraisons_planifiees").insert([payload]);

    if (res.error) {
      setFeedbackMessage(`Erreur création: ${res.error.message}`, "error");
      setSaving(false);
      return;
    }

    setFeedbackMessage("Livraison créée.", "success");
    setNewForm({
      chauffeur_id: "",
      vehicule_id: "",
      remorque_id: "",
      dossier_id: "",
      date_livraison: "",
      statut: "planifiee",
    });
    setShowCreateForm(false);
    await fetchData();
    setSaving(false);
  }

  function handleEdit(item: Row) {
    setShowCreateForm(false);
    setEditingId(Number(item.id));
    setForm({
      dossier_id: item.dossier_id ? String(item.dossier_id) : "",
      adresse: item.adresse || "",
      date_livraison: item.date_livraison || "",
      heure_prevue: item.heure_prevue || "",
      chauffeur_id: item.chauffeur_id ? String(item.chauffeur_id) : "",
      vehicule_id: item.vehicule_id ? String(item.vehicule_id) : "",
      remorque_id: item.remorque_id ? String(item.remorque_id) : "",
      statut: item.statut || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: number) {
    const ok = window.confirm("Supprimer cette livraison ?");
    if (!ok) return;

    clearMessage();
    const res = await supabase.from("livraisons_planifiees").delete().eq("id", id);

    if (res.error) {
      setFeedbackMessage(`Erreur suppression: ${res.error.message}`, "error");
      return;
    }

    setFeedbackMessage("Livraison supprimée.", "success");
    if (editingId === id) resetForm();
    await fetchData();
  }

  async function handleStatusChange(id: number, newStatut: string) {
    setMessage("");

    const res = await supabase
      .from("livraisons_planifiees")
      .update({ statut: newStatut })
      .eq("id", id);

    if (res.error) {
      setMessage(`Erreur mise à jour statut: ${res.error.message}`);
      return;
    }

    setMessage(`Statut mis à jour: ${newStatut === "planifiee" ? "Planifiée" :
               newStatut === "en_cours" ? "En cours" :
               newStatut === "livree" ? "Livrée" :
               newStatut === "probleme" ? "Problème" : newStatut}`);

    // Update local state immediately for better UX
    setLivraisons(prev =>
      prev.map(item =>
        item.id === id ? { ...item, statut: newStatut } : item
      )
    );
  }

  function formatDate(date: string | null | undefined) {
    if (!date) return "";
    return date;
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f7" }}>
      <HeaderTagora />

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "30px 20px 60px" }}>
        <div
          style={{
            background: "#ffffff",
            borderRadius: 18,
            padding: 24,
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            marginBottom: 24,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 32, color: "#111827" }}>
            Direction - Livraisons
          </h1>

          <p style={{ marginTop: 10, marginBottom: 0, color: "#4b5563", fontSize: 16 }}>
            Planifie, filtre et gère les livraisons.
          </p>

          <FeedbackMessage message={message} type={messageType} />
        </div>

        {showCreateForm && (
          <div
            style={{
              background: "#ffffff",
              borderRadius: 18,
              padding: 24,
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
              marginBottom: 24,
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 24, color: "#111827" }}>
              Nouvelle livraison
            </h2>

            <form onSubmit={handleCreateSubmit}>
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Chauffeur</label>
                  <select
                    value={newForm.chauffeur_id}
                    onChange={(e) => setNewForm({ ...newForm, chauffeur_id: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="">Choisir un chauffeur</option>
                    {chauffeurs.map((item) => (
                      <option key={item.id} value={item.id}>
                        {getPersonLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Véhicule</label>
                  <select
                    value={newForm.vehicule_id}
                    onChange={(e) => setNewForm({ ...newForm, vehicule_id: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="">Choisir un véhicule</option>
                    {vehicules.map((item) => (
                      <option key={item.id} value={item.id}>
                        {getVehiculeLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Remorque (optionnel)</label>
                  <select
                    value={newForm.remorque_id}
                    onChange={(e) => setNewForm({ ...newForm, remorque_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Choisir une remorque</option>
                    {remorques.map((item) => (
                      <option key={item.id} value={item.id}>
                        {getRemorqueLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Dossier</label>
                  <select
                    value={newForm.dossier_id}
                    onChange={(e) => setNewForm({ ...newForm, dossier_id: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="">Choisir un dossier</option>
                    {dossiers.map((dossier) => (
                      <option key={dossier.id} value={dossier.id}>
                        {getDossierLabel(dossier)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Date de livraison</label>
                  <input
                    type="date"
                    value={newForm.date_livraison}
                    onChange={(e) => setNewForm({ ...newForm, date_livraison: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </div>

                <div>
                  <label style={labelStyle}>Statut</label>
                  <select
                    value={newForm.statut}
                    onChange={(e) => setNewForm({ ...newForm, statut: e.target.value })}
                    style={inputStyle}
                    required
                  >
                    <option value="planifiee">Planifiée</option>
                    <option value="en_cours">En cours</option>
                    <option value="livree">Livrée</option>
                    <option value="probleme">Problème</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                <button type="submit" style={primaryButtonStyle} disabled={saving}>
                  {saving ? "Création..." : "Enregistrer"}
                </button>

                <button
                  type="button"
                  onClick={resetCreateForm}
                  style={secondaryButtonStyle}
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1.9fr",
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
            {!showCreateForm && !editingId && (
              <button onClick={() => setShowCreateForm(true)} style={primaryButtonStyle}>
                Nouvelle livraison
              </button>
            )}

            {editingId && (
              <>
                <h2 style={{ marginTop: 0, fontSize: 24, color: "#111827" }}>
                  Modifier une livraison
                </h2>

                <form onSubmit={handleSubmit}>
                  <div style={{ display: "grid", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Dossier</label>
                      <select
                        value={form.dossier_id}
                        onChange={(e) => setForm({ ...form, dossier_id: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="">Choisir un dossier</option>
                        {dossiers.map((dossier) => (
                          <option key={dossier.id} value={dossier.id}>
                            {getDossierLabel(dossier)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Adresse</label>
                      <input
                        type="text"
                        value={form.adresse}
                        onChange={(e) => setForm({ ...form, adresse: e.target.value })}
                        style={inputStyle}
                        placeholder="Adresse de livraison"
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <label style={labelStyle}>Date</label>
                        <input
                          type="date"
                          value={form.date_livraison}
                          onChange={(e) => setForm({ ...form, date_livraison: e.target.value })}
                          style={inputStyle}
                        />
                      </div>

                      <div>
                        <label style={labelStyle}>Heure prévue</label>
                        <input
                          type="time"
                          value={form.heure_prevue}
                          onChange={(e) => setForm({ ...form, heure_prevue: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>Chauffeur</label>
                      <select
                        value={form.chauffeur_id}
                        onChange={(e) => setForm({ ...form, chauffeur_id: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="">Choisir un chauffeur</option>
                        {chauffeurs.map((item) => (
                          <option key={item.id} value={item.id}>
                            {getPersonLabel(item)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Véhicule</label>
                      <select
                        value={form.vehicule_id}
                        onChange={(e) => setForm({ ...form, vehicule_id: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="">Choisir un véhicule</option>
                        {vehicules.map((item) => (
                          <option key={item.id} value={item.id}>
                            {getVehiculeLabel(item)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Remorque</label>
                      <select
                        value={form.remorque_id}
                        onChange={(e) => setForm({ ...form, remorque_id: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="">Choisir une remorque</option>
                        {remorques.map((item) => (
                          <option key={item.id} value={item.id}>
                            {getRemorqueLabel(item)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Statut</label>
                      <select
                        value={form.statut}
                        onChange={(e) => setForm({ ...form, statut: e.target.value })}
                        style={inputStyle}
                      >
                        <option value="planifiee">Planifiée</option>
                        <option value="en_cours">En cours</option>
                        <option value="livree">Livrée</option>
                        <option value="probleme">Problème</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                    <button type="submit" style={primaryButtonStyle} disabled={saving}>
                      {saving ? "Sauvegarde..." : "Enregistrer les changements"}
                    </button>

                    <button
                      type="button"
                      onClick={resetForm}
                      style={secondaryButtonStyle}
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              </>
            )}
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
                Livraisons planifiées
              </h2>

              <button onClick={fetchData} style={secondaryButtonStyle}>
                Actualiser
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
                gap: 12,
                marginBottom: 18,
              }}
            >
              <select
                value={filtre.chauffeur_id}
                onChange={(e) => setFiltre({ ...filtre, chauffeur_id: e.target.value })}
                style={inputStyle}
              >
                <option value="">Tous les chauffeurs</option>
                {chauffeurs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getPersonLabel(item)}
                  </option>
                ))}
              </select>

              <select
                value={filtre.vehicule_id}
                onChange={(e) => setFiltre({ ...filtre, vehicule_id: e.target.value })}
                style={inputStyle}
              >
                <option value="">Tous les véhicules</option>
                {vehicules.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getVehiculeLabel(item)}
                  </option>
                ))}
              </select>

              <select
                value={filtre.remorque_id}
                onChange={(e) => setFiltre({ ...filtre, remorque_id: e.target.value })}
                style={inputStyle}
              >
                <option value="">Toutes les remorques</option>
                {remorques.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getRemorqueLabel(item)}
                  </option>
                ))}
              </select>

              <select
                value={filtre.statut}
                onChange={(e) => setFiltre({ ...filtre, statut: e.target.value })}
                style={inputStyle}
              >
                <option value="">Tous les statuts</option>
                <option value="planifiee">Planifiée</option>
                <option value="en_cours">En cours</option>
                <option value="livree">Livrée</option>
                <option value="probleme">Problème</option>
              </select>
            </div>

            {loading ? (
              <p style={{ color: "#6b7280" }}>Chargement...</p>
            ) : livraisonsFiltrees.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Aucune livraison trouvée.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>ID</th>
                      <th style={thStyle}>Dossier</th>
                      <th style={thStyle}>Adresse</th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Heure</th>
                      <th style={thStyle}>Chauffeur</th>
                      <th style={thStyle}>Véhicule</th>
                      <th style={thStyle}>Remorque</th>
                      <th style={thStyle}>Statut</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {livraisonsFiltrees.map((item) => {
                      const dossier = getDossierById(item.dossier_id);
                      const chauffeur = getChauffeurById(item.chauffeur_id);
                      const vehicule = getVehiculeById(item.vehicule_id);
                      const remorque = getRemorqueById(item.remorque_id);

                      return (
                        <tr key={item.id}>
                          <td style={tdStyle}>{item.id}</td>
                          <td style={tdStyle}>
                            {dossier ? getDossierLabel(dossier) : item.dossier_id || ""}
                          </td>
                          <td style={tdStyle}>{item.adresse || ""}</td>
                          <td style={tdStyle}>{formatDate(item.date_livraison)}</td>
                          <td style={tdStyle}>{item.heure_prevue || ""}</td>
                          <td style={tdStyle}>
                            {chauffeur ? getPersonLabel(chauffeur) : item.chauffeur_id || ""}
                          </td>
                          <td style={tdStyle}>
                            {vehicule ? getVehiculeLabel(vehicule) : item.vehicule_id || ""}
                          </td>
                          <td style={tdStyle}>
                            {remorque ? getRemorqueLabel(remorque) : item.remorque_id || ""}
                          </td>
                          <td style={tdStyle}>
                            <select
                              value={item.statut || ""}
                              onChange={(e) => handleStatusChange(Number(item.id), e.target.value)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "none",
                                fontSize: 12,
                                fontWeight: 500,
                                color: "#ffffff",
                                background: item.statut === "planifiee" ? "#6b7280" :
                                           item.statut === "en_cours" ? "#f59e0b" :
                                           item.statut === "livree" ? "#10b981" :
                                           item.statut === "probleme" ? "#ef4444" : "#6b7280",
                                textTransform: "capitalize",
                                cursor: "pointer",
                                minWidth: 100,
                              }}
                            >
                              <option value="planifiee" style={{ color: "#000" }}>Planifiée</option>
                              <option value="en_cours" style={{ color: "#000" }}>En cours</option>
                              <option value="livree" style={{ color: "#000" }}>Livrée</option>
                              <option value="probleme" style={{ color: "#000" }}>Problème</option>
                            </select>
                          </td>
                          <td style={tdStyle}>
                            <div style={{
                              display: "flex",
                              gap: 6,
                              alignItems: "center",
                              justifyContent: "flex-start",
                              flexWrap: "nowrap"
                            }}>
                              <button
                                onClick={() => handleEdit(item)}
                                style={actionButtonStyle}
                              >
                                Modifier
                              </button>
                              <Link
                                href={`/direction/sorties-terrain?livraison_id=${item.id}`}
                                style={actionButtonStyle}
                              >
                                Sortie terrain
                              </Link>
                              <button
                                onClick={() => handleDelete(Number(item.id))}
                                style={deleteActionButtonStyle}
                              >
                                Supprimer
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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

const smallButtonStyle: React.CSSProperties = {
  height: 36,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  padding: "0 12px",
  fontSize: 14,
  cursor: "pointer",
  background: "#ffffff",
  color: "#111827",
};

const actionButtonStyle: React.CSSProperties = {
  height: 32,
  minWidth: 90,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  background: "#ffffff",
  color: "#374151",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.15s ease",
  whiteSpace: "nowrap",
};

const deleteActionButtonStyle: React.CSSProperties = {
  height: 32,
  minWidth: 80,
  borderRadius: 8,
  border: "1px solid #dc2626",
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  background: "#ffffff",
  color: "#dc2626",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.15s ease",
  whiteSpace: "nowrap",
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

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1000,
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
  verticalAlign: "middle",
};
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AccessNotice from "@/app/components/AccessNotice";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";

type Row = Record<string, string | number | null | undefined>;

export default function Page() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();

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
  const [linkedDataNotice, setLinkedDataNotice] = useState("");
  const [viewMode, setViewMode] = useState<"liste" | "calendrier">("liste");
  const [calendarDate, setCalendarDate] = useState(new Date());

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

  function setFeedbackMessage(msg: string, type: "success" | "error") {
    setMessage(msg);
    setMessageType(type);
  }

  function clearMessage() {
    setMessage("");
    setMessageType(null);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    clearMessage();

    const results = await Promise.allSettled([
      supabase.from("livraisons_planifiees").select("*").order("id", { ascending: false }),
      supabase.from("dossiers").select("*").order("id", { ascending: false }),
      supabase.from("chauffeurs").select("*").order("id", { ascending: true }),
      supabase.from("vehicules").select("*").order("id", { ascending: true }),
      supabase.from("remorques").select("*").order("id", { ascending: true }),
    ]);

    const notices: string[] = [];

    const livraisonsRes = results[0].status === "fulfilled" ? results[0].value : null;
    const dossiersRes = results[1].status === "fulfilled" ? results[1].value : null;
    const chauffeursRes = results[2].status === "fulfilled" ? results[2].value : null;
    const vehiculesRes = results[3].status === "fulfilled" ? results[3].value : null;
    const remorquesRes = results[4].status === "fulfilled" ? results[4].value : null;

    if (!livraisonsRes || livraisonsRes.error) {
      setFeedbackMessage(
        "Les livraisons ne sont pas accessibles pour le moment. Verifie la permission livraisons ou les regles RLS.",
        "error"
      );
      setLivraisons([]);
    } else {
      setLivraisons(livraisonsRes.data || []);
    }

    if (!dossiersRes || dossiersRes.error) {
      setDossiers([]);
      notices.push("dossiers");
    } else {
      setDossiers(dossiersRes.data || []);
    }

    if (!chauffeursRes || chauffeursRes.error) {
      setChauffeurs([]);
      notices.push("chauffeurs");
    } else {
      setChauffeurs(chauffeursRes.data || []);
    }

    if (!vehiculesRes || vehiculesRes.error) {
      setVehicules([]);
      notices.push("vehicules");
    } else {
      setVehicules(vehiculesRes.data || []);
    }

    if (!remorquesRes || remorquesRes.error) {
      setRemorques([]);
      notices.push("remorques");
    } else {
      setRemorques(remorquesRes.data || []);
    }

    setLinkedDataNotice(
      notices.length > 0
        ? `Certaines donnees liees sont limitees sur ce compte : ${notices.join(", ")}. Les livraisons restent visibles, mais certaines listes ou etiquettes peuvent etre reduites.`
        : ""
    );

    setLoading(false);
  }, []);

  const blocked = !accessLoading && !!user && !hasPermission("livraisons");

  useEffect(() => {
    if (accessLoading || !user || blocked) return;
    const timeout = setTimeout(() => {
      void fetchData();
    }, 0);
    return () => clearTimeout(timeout);
  }, [accessLoading, blocked, fetchData, user]);


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
    return String(
      dossier.nom ||
      dossier.titre ||
      dossier.reference ||
      dossier.numero ||
      dossier.nom_client ||
      dossier.client ||
      `Dossier #${String(dossier.id)}`
    );
  }

  function getPersonLabel(item: Row) {
    const fullName = [item.prenom, item.nom].filter(Boolean).map(String).join(" ").trim();
    return String(item.nom_complet || item.nom || item.name || fullName || `#${String(item.id)}`);
  }

  function getVehiculeLabel(item: Row) {
    return String(item.nom || item.modele || item.plaque || item.identifiant || item.numero || `Vehicule #${String(item.id)}`);
  }

  function getRemorqueLabel(item: Row) {
    return String(item.nom || item.modele || item.plaque || item.identifiant || item.numero || `Remorque #${String(item.id)}`);
  }

  function getDossierById(id: unknown) {
    return dossiers.find((item) => String(item.id) === String(id));
  }

  function getChauffeurById(id: unknown) {
    return chauffeurs.find((item) => String(item.id) === String(id));
  }

  function getVehiculeById(id: unknown) {
    return vehicules.find((item) => String(item.id) === String(id));
  }

  function getRemorqueById(id: unknown) {
    return remorques.find((item) => String(item.id) === String(id));
  }

  function getStatusBadge(statut: string) {
    const colors = {
      planifiee: "#6b7280",
      en_cours: "#f59e0b",
      livree: "#10b981",
      probleme: "#ef4444",
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
        {statut === "planifiee"
          ? "Planifiee"
          : statut === "en_cours"
            ? "En cours"
            : statut === "livree"
              ? "Livree"
              : statut === "probleme"
                ? "Probleme"
                : statut}
      </span>
    );
  }

  function getCalendarDays() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7;

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }

  function formatDateISO(day: number) {
    const year = calendarDate.getFullYear();
    const month = String(calendarDate.getMonth() + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${month}-${d}`;
  }

  function getLivraisonsByDate(dateStr: string) {
    return livraisonsFiltrees.filter((l) => l.date_livraison === dateStr);
  }

  function prevMonth() {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  }

  const livraisonsFiltrees = useMemo(() => {
    return livraisons.filter((item) => {
      const okChauffeur = !filtre.chauffeur_id || String(item.chauffeur_id) === String(filtre.chauffeur_id);
      const okVehicule = !filtre.vehicule_id || String(item.vehicule_id) === String(filtre.vehicule_id);
      const okRemorque = !filtre.remorque_id || String(item.remorque_id) === String(filtre.remorque_id);
      const okStatut = !filtre.statut || item.statut === filtre.statut;
      return okChauffeur && okVehicule && okRemorque && okStatut;
    });
  }, [filtre, livraisons]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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

    const res = editingId
      ? await supabase.from("livraisons_planifiees").update(payload).eq("id", editingId)
      : await supabase.from("livraisons_planifiees").insert([payload]);

    if (res.error) {
      setFeedbackMessage(`Erreur sauvegarde: ${res.error.message}`, "error");
      setSaving(false);
      return;
    }

    setFeedbackMessage(editingId ? "Livraison modifiee." : "Livraison ajoutee.", "success");
    resetForm();
    await fetchData();
    setSaving(false);
  }

  async function handleCreateSubmit(event: React.FormEvent) {
    event.preventDefault();
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
      setFeedbackMessage(`Erreur creation: ${res.error.message}`, "error");
      setSaving(false);
      return;
    }

    setFeedbackMessage("Livraison creee.", "success");
    resetCreateForm();
    await fetchData();
    setSaving(false);
  }

  function handleEdit(item: Row) {
    setShowCreateForm(false);
    setEditingId(Number(item.id));
    setForm({
      dossier_id: item.dossier_id ? String(item.dossier_id) : "",
      adresse: typeof item.adresse === "string" ? item.adresse : "",
      date_livraison: typeof item.date_livraison === "string" ? item.date_livraison : "",
      heure_prevue: typeof item.heure_prevue === "string" ? item.heure_prevue : "",
      chauffeur_id: item.chauffeur_id ? String(item.chauffeur_id) : "",
      vehicule_id: item.vehicule_id ? String(item.vehicule_id) : "",
      remorque_id: item.remorque_id ? String(item.remorque_id) : "",
      statut: typeof item.statut === "string" ? item.statut : "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cette livraison ?")) return;

    clearMessage();
    const res = await supabase.from("livraisons_planifiees").delete().eq("id", id);

    if (res.error) {
      setFeedbackMessage(`Erreur suppression: ${res.error.message}`, "error");
      return;
    }

    setFeedbackMessage("Livraison supprimee.", "success");
    if (editingId === id) resetForm();
    await fetchData();
  }

  async function handleStatusChange(id: number, newStatut: string) {
    clearMessage();

    const res = await supabase
      .from("livraisons_planifiees")
      .update({ statut: newStatut })
      .eq("id", id);

    if (res.error) {
      setFeedbackMessage(`Erreur mise a jour statut: ${res.error.message}`, "error");
      return;
    }

    setFeedbackMessage(`Statut mis a jour: ${newStatut}`, "success");
    setLivraisons((prev) => prev.map((item) => (item.id === id ? { ...item, statut: newStatut } : item)));
  }

  if (accessLoading || (!blocked && loading)) {
    return (
      <main className="page-container">
        <HeaderTagora title="Direction livraisons" subtitle="Planification et suivi des livraisons" />
        <AccessNotice description="Verification des acces livraisons et chargement des donnees en cours." />
      </main>
    );
  }

  if (!user) {
    return null;
  }

  if (blocked) {
    return (
      <main className="page-container">
        <HeaderTagora title="Direction livraisons" subtitle="Planification et suivi des livraisons" />
        <AccessNotice description="La permission livraisons n est pas active sur ce compte direction. Le module reste masque tant que cet acces n est pas ouvert." />
      </main>
    );
  }

  return (
    <main className="page-container">
      <HeaderTagora title="Direction livraisons" subtitle="Planifie, filtre et gere les livraisons" />

      <div className="tagora-panel" style={{ marginTop: 24 }}>
        <FeedbackMessage message={message} type={messageType} />
        {linkedDataNotice ? (
          <div style={{ marginTop: 12 }}>
            <AccessNotice title="Acces partiel" description={linkedDataNotice} />
          </div>
        ) : null}
      </div>

      {showCreateForm ? (
        <div className="tagora-panel" style={{ marginTop: 24 }}>
          <h2 className="section-title" style={{ marginBottom: 18 }}>Nouvelle livraison</h2>
          <form onSubmit={handleCreateSubmit} className="tagora-form-grid">
            <label className="tagora-field">
              <span className="tagora-label">Chauffeur</span>
              <select value={newForm.chauffeur_id} onChange={(e) => setNewForm({ ...newForm, chauffeur_id: e.target.value })} className="tagora-input" required>
                <option value="">Choisir un chauffeur</option>
                {chauffeurs.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getPersonLabel(item))}</option>)}
              </select>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Vehicule</span>
              <select value={newForm.vehicule_id} onChange={(e) => setNewForm({ ...newForm, vehicule_id: e.target.value })} className="tagora-input" required>
                <option value="">Choisir un vehicule</option>
                {vehicules.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getVehiculeLabel(item))}</option>)}
              </select>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Remorque</span>
              <select value={newForm.remorque_id} onChange={(e) => setNewForm({ ...newForm, remorque_id: e.target.value })} className="tagora-input">
                <option value="">Choisir une remorque</option>
                {remorques.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getRemorqueLabel(item))}</option>)}
              </select>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Dossier</span>
              <select value={newForm.dossier_id} onChange={(e) => setNewForm({ ...newForm, dossier_id: e.target.value })} className="tagora-input" required>
                <option value="">Choisir un dossier</option>
                {dossiers.map((dossier) => <option key={String(dossier.id)} value={String(dossier.id)}>{String(getDossierLabel(dossier))}</option>)}
              </select>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Date de livraison</span>
              <input type="date" value={newForm.date_livraison} onChange={(e) => setNewForm({ ...newForm, date_livraison: e.target.value })} className="tagora-input" required />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Statut</span>
              <select value={newForm.statut} onChange={(e) => setNewForm({ ...newForm, statut: e.target.value })} className="tagora-input" required>
                <option value="planifiee">Planifiee</option>
                <option value="en_cours">En cours</option>
                <option value="livree">Livree</option>
                <option value="probleme">Probleme</option>
              </select>
            </label>
            <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="tagora-dark-action" disabled={saving}>{saving ? "Creation..." : "Enregistrer"}</button>
              <button type="button" className="tagora-dark-outline-action" onClick={resetCreateForm}>Annuler</button>
            </div>
          </form>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) minmax(0, 2fr)", gap: 24, alignItems: "start", marginTop: 24 }}>
        <section className="tagora-panel">
          {!showCreateForm && !editingId ? (
            <button onClick={() => setShowCreateForm(true)} className="tagora-dark-action">
              Nouvelle livraison
            </button>
          ) : null}

          {editingId ? (
            <>
              <h2 className="section-title" style={{ marginTop: 18, marginBottom: 18 }}>Modifier une livraison</h2>
              <form onSubmit={handleSubmit} className="tagora-form-grid">
                <label className="tagora-field"><span className="tagora-label">Dossier</span><select value={form.dossier_id} onChange={(e) => setForm({ ...form, dossier_id: e.target.value })} className="tagora-input"><option value="">Choisir un dossier</option>{dossiers.map((dossier) => <option key={String(dossier.id)} value={String(dossier.id)}>{String(getDossierLabel(dossier))}</option>)}</select></label>
                <label className="tagora-field"><span className="tagora-label">Adresse</span><input type="text" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} className="tagora-input" placeholder="Adresse de livraison" /></label>
                <label className="tagora-field"><span className="tagora-label">Date</span><input type="date" value={form.date_livraison} onChange={(e) => setForm({ ...form, date_livraison: e.target.value })} className="tagora-input" /></label>
                <label className="tagora-field"><span className="tagora-label">Heure prevue</span><input type="time" value={form.heure_prevue} onChange={(e) => setForm({ ...form, heure_prevue: e.target.value })} className="tagora-input" /></label>
                <label className="tagora-field"><span className="tagora-label">Chauffeur</span><select value={form.chauffeur_id} onChange={(e) => setForm({ ...form, chauffeur_id: e.target.value })} className="tagora-input"><option value="">Choisir un chauffeur</option>{chauffeurs.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getPersonLabel(item))}</option>)}</select></label>
                <label className="tagora-field"><span className="tagora-label">Vehicule</span><select value={form.vehicule_id} onChange={(e) => setForm({ ...form, vehicule_id: e.target.value })} className="tagora-input"><option value="">Choisir un vehicule</option>{vehicules.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getVehiculeLabel(item))}</option>)}</select></label>
                <label className="tagora-field"><span className="tagora-label">Remorque</span><select value={form.remorque_id} onChange={(e) => setForm({ ...form, remorque_id: e.target.value })} className="tagora-input"><option value="">Choisir une remorque</option>{remorques.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getRemorqueLabel(item))}</option>)}</select></label>
                <label className="tagora-field"><span className="tagora-label">Statut</span><select value={form.statut} onChange={(e) => setForm({ ...form, statut: e.target.value })} className="tagora-input"><option value="planifiee">Planifiee</option><option value="en_cours">En cours</option><option value="livree">Livree</option><option value="probleme">Probleme</option></select></label>
                <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="tagora-dark-action" disabled={saving}>{saving ? "Sauvegarde..." : "Enregistrer les changements"}</button>
                  <button type="button" className="tagora-dark-outline-action" onClick={resetForm}>Annuler</button>
                </div>
              </form>
            </>
          ) : null}
        </section>

        <section className="tagora-panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Livraisons planifiees</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => setViewMode("liste")}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid #0f2948",
                  background: viewMode === "liste" ? "#0f2948" : "transparent",
                  color: viewMode === "liste" ? "#fff" : "#0f2948",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "all 140ms ease",
                }}
              >
                Liste
              </button>
              <button
                onClick={() => setViewMode("calendrier")}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid #0f2948",
                  background: viewMode === "calendrier" ? "#0f2948" : "transparent",
                  color: viewMode === "calendrier" ? "#fff" : "#0f2948",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "all 140ms ease",
                }}
              >
                Calendrier
              </button>
              <button onClick={() => void fetchData()} className="tagora-dark-outline-action">Actualiser</button>
            </div>
          </div>

          {viewMode === "liste" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
                <select value={filtre.chauffeur_id} onChange={(e) => setFiltre({ ...filtre, chauffeur_id: e.target.value })} className="tagora-input"><option value="">Tous les chauffeurs</option>{chauffeurs.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getPersonLabel(item))}</option>)}</select>
                <select value={filtre.vehicule_id} onChange={(e) => setFiltre({ ...filtre, vehicule_id: e.target.value })} className="tagora-input"><option value="">Tous les vehicules</option>{vehicules.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getVehiculeLabel(item))}</option>)}</select>
                <select value={filtre.remorque_id} onChange={(e) => setFiltre({ ...filtre, remorque_id: e.target.value })} className="tagora-input"><option value="">Toutes les remorques</option>{remorques.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getRemorqueLabel(item))}</option>)}</select>
                <select value={filtre.statut} onChange={(e) => setFiltre({ ...filtre, statut: e.target.value })} className="tagora-input"><option value="">Tous les statuts</option><option value="planifiee">Planifiee</option><option value="en_cours">En cours</option><option value="livree">Livree</option><option value="probleme">Probleme</option></select>
              </div>
              {livraisonsFiltrees.length === 0 ? (
                <p className="tagora-note">Aucune livraison trouvee.</p>
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
                        <th style={thStyle}>Vehicule</th>
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
                            <td style={tdStyle}>{dossier ? getDossierLabel(dossier) : item.dossier_id || "-"}</td>
                            <td style={tdStyle}>{item.adresse || "-"}</td>
                            <td style={tdStyle}>{item.date_livraison || "-"}</td>
                            <td style={tdStyle}>{item.heure_prevue || "-"}</td>
                            <td style={tdStyle}>{chauffeur ? getPersonLabel(chauffeur) : item.chauffeur_id || "-"}</td>
                            <td style={tdStyle}>{vehicule ? getVehiculeLabel(vehicule) : item.vehicule_id || "-"}</td>
                            <td style={tdStyle}>{remorque ? getRemorqueLabel(remorque) : item.remorque_id || "-"}</td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {getStatusBadge(typeof item.statut === "string" ? item.statut : "planifiee")}
                                <select value={typeof item.statut === "string" ? item.statut : ""} onChange={(e) => void handleStatusChange(Number(item.id), e.target.value)} className="tagora-input" style={{ minWidth: 110 }}>
                                  <option value="planifiee">Planifiee</option>
                                  <option value="en_cours">En cours</option>
                                  <option value="livree">Livree</option>
                                  <option value="probleme">Probleme</option>
                                </select>
                              </div>
                            </td>
                            <td style={tdStyle}>
                              <div className="actions-row">
                                <button onClick={() => handleEdit(item)} className="tagora-dark-outline-action">Modifier</button>
                                <Link href={`/direction/sorties-terrain?livraison_id=${item.id}`} className="tagora-dark-outline-action">Sortie terrain</Link>
                                <button onClick={() => void handleDelete(Number(item.id))} className="tagora-dark-action">Supprimer</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <button onClick={prevMonth} className="tagora-dark-outline-action" style={{ width: 120 }}>← Mois prec</button>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f2948" }}>
                  {calendarDate.toLocaleString("fr-FR", { month: "long", year: "numeric" })}
                </h3>
                <button onClick={nextMonth} className="tagora-dark-outline-action" style={{ width: 120 }}>Mois suiv →</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 12 }}>
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                  <div key={d} style={{ textAlign: "center", fontWeight: 700, fontSize: 12, color: "#64748b", padding: "8px 0" }}>
                    {d}
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                {getCalendarDays().map((day, idx) => {
                  const dateStr = day ? formatDateISO(day) : "";
                  const datumsForDay = day ? getLivraisonsByDate(dateStr) : [];
                  return (
                    <div
                      key={idx}
                      style={{
                        minHeight: 100,
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 8,
                        background: day ? "#ffffff" : "#f8fafc",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}
                    >
                      {day && (
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f2948", marginBottom: 6 }}>{day}</div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, overflow: "auto" }}>
                        {datumsForDay.slice(0, 3).map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleEdit(item)}
                            style={{
                              padding: "3px 6px",
                              borderRadius: 4,
                              border: "none",
                              cursor: "pointer",
                              fontSize: 11,
                              fontWeight: 600,
                              background: item.statut === "planifiee" ? "#6b7280" : item.statut === "en_cours" ? "#f59e0b" : item.statut === "livree" ? "#10b981" : "#ef4444",
                              color: "#fff",
                              textAlign: "left",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              transition: "opacity 140ms ease",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                          >
                            #{item.id} {item.heure_prevue ? `@ ${item.heure_prevue}` : ""}
                          </button>
                        ))}
                        {datumsForDay.length > 3 && (
                          <div style={{ color: "#64748b", fontSize: 10, fontWeight: 600 }}>+{datumsForDay.length - 3} autre(s)</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

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
  verticalAlign: "top",
};






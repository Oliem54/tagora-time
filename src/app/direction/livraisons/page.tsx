"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AccessNotice from "@/app/components/AccessNotice";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import OperationProofsPanel from "@/app/components/proofs/OperationProofsPanel";
import InternalMentionsPanel from "@/app/components/internal/InternalMentionsPanel";
import {
  ACCOUNT_REQUEST_COMPANIES,
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";

type Row = Record<string, string | number | null | undefined>;
type LivraisonFormState = {
  dossier_id: string;
  client: string;
  adresse: string;
  date_livraison: string;
  heure_prevue: string;
  chauffeur_id: string;
  vehicule_id: string;
  remorque_id: string;
  statut: string;
  company_context: string;
  notes: string;
};

function getLivraisonCompanyValue(item: Row | undefined) {
  if (!item) return "";

  const companyContext = item.company_context;
  if (typeof companyContext === "string" && companyContext.trim()) {
    return companyContext;
  }

  const company = item.company;
  if (typeof company === "string" && company.trim()) {
    return company;
  }

  const compagnie = item.compagnie;
  if (typeof compagnie === "string" && compagnie.trim()) {
    return compagnie;
  }

  return "";
}

function createLivraisonForm(
  overrides?: Partial<LivraisonFormState>
): LivraisonFormState {
  return {
    dossier_id: "",
    client: "",
    adresse: "",
    date_livraison: "",
    heure_prevue: "",
    chauffeur_id: "",
    vehicule_id: "",
    remorque_id: "",
    statut: "",
    company_context: "",
    notes: "",
    ...overrides,
  };
}

export default function Page() {
  const { user, loading: accessLoading, hasPermission, role } = useCurrentAccess();

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
  const [viewMode, setViewMode] = useState<"liste" | "calendrier">("calendrier");
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [filtre, setFiltre] = useState({
    chauffeur_id: "",
    vehicule_id: "",
    remorque_id: "",
    statut: "",
  });

  const [form, setForm] = useState<LivraisonFormState>(createLivraisonForm());

  const [newForm, setNewForm] = useState<LivraisonFormState>(
    createLivraisonForm({ statut: "planifiee" })
  );

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
        ? `Listes limitees : ${notices.join(", ")}.`
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
    setForm(createLivraisonForm());
  }

  function resetCreateForm() {
    setNewForm(createLivraisonForm({ statut: "planifiee" }));
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

  function getStringField(item: Row | undefined, field: string) {
    if (!item) return "";
    const value = item[field];
    return typeof value === "string" ? value : "";
  }

  function getDossierClient(dossier: Row | undefined) {
    return String(dossier?.client || dossier?.nom_client || "").trim();
  }

  function getLivraisonClient(item: Row, dossier?: Row) {
    const directClient = String(item.client || item.nom_client || "").trim();
    if (directClient) {
      return directClient;
    }

    const dossierClient = getDossierClient(dossier);
    return dossierClient || "";
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

  const canEditLivraisonNotes = livraisons.some((item) =>
    Object.prototype.hasOwnProperty.call(item, "notes")
  );

  function buildPayload(source: LivraisonFormState) {
    const dossier = source.dossier_id ? getDossierById(source.dossier_id) : undefined;
    const clientValue = source.client.trim() || getDossierClient(dossier) || null;

    return {
      dossier_id: source.dossier_id ? Number(source.dossier_id) : null,
      client: clientValue,
      adresse: source.adresse.trim() || null,
      date_livraison: source.date_livraison || null,
      heure_prevue: source.heure_prevue || null,
      chauffeur_id: source.chauffeur_id ? Number(source.chauffeur_id) : null,
      vehicule_id: source.vehicule_id ? Number(source.vehicule_id) : null,
      remorque_id: source.remorque_id ? Number(source.remorque_id) : null,
      statut: source.statut || null,
      ...(canEditLivraisonNotes ? { notes: source.notes.trim() || null } : {}),
    };
  }

  const livraisonsFiltrees = livraisons.filter((item) => {
    const okChauffeur = !filtre.chauffeur_id || String(item.chauffeur_id) === String(filtre.chauffeur_id);
    const okVehicule = !filtre.vehicule_id || String(item.vehicule_id) === String(filtre.vehicule_id);
    const okRemorque = !filtre.remorque_id || String(item.remorque_id) === String(filtre.remorque_id);
    const okStatut = !filtre.statut || item.statut === filtre.statut;
    return okChauffeur && okVehicule && okRemorque && okStatut;
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    clearMessage();

    const payload = buildPayload(form);

    const res = editingId
      ? await supabase.from("livraisons_planifiees").update(payload).eq("id", editingId)
      : await supabase.from("livraisons_planifiees").insert([payload]);

    if (res.error) {
      setFeedbackMessage(`Erreur sauvegarde: ${res.error.message}`, "error");
      setSaving(false);
      return;
    }

    setFeedbackMessage("Livraison mise a jour.", "success");
    resetForm();
    await fetchData();
    setSaving(false);
  }

  async function handleCreateSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    clearMessage();

    const payload = buildPayload(newForm);

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
    clearMessage();
    const dossier = getDossierById(item.dossier_id);
    setEditingId(Number(item.id));
    setForm(createLivraisonForm({
      dossier_id: item.dossier_id ? String(item.dossier_id) : "",
      client: getLivraisonClient(item, dossier),
      adresse: getStringField(item, "adresse"),
      date_livraison: getStringField(item, "date_livraison"),
      heure_prevue: getStringField(item, "heure_prevue"),
      chauffeur_id: item.chauffeur_id ? String(item.chauffeur_id) : "",
      vehicule_id: item.vehicule_id ? String(item.vehicule_id) : "",
      remorque_id: item.remorque_id ? String(item.remorque_id) : "",
      statut: getStringField(item, "statut"),
      company_context: getLivraisonCompanyValue(item),
      notes: getStringField(item, "notes"),
    }));

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
    return <TagoraLoadingScreen isLoading message="Chargement de votre espace..." fullScreen />;
  }

  if (!user) {
    return null;
  }

  if (blocked) {
    return (
      <main className="page-container">
        <HeaderTagora title="Livraison & ramassage" subtitle="" showNavigation={false} />
        <AccessNotice description="Acces requis." />
      </main>
    );
  }

  const navButtonBase: React.CSSProperties = {
    minHeight: 40,
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid #0f2948",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    whiteSpace: "nowrap",
    transition: "all 140ms ease",
  };

  const actionButtonBase: React.CSSProperties = {
    minHeight: 40,
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid #0f2948",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "all 140ms ease",
  };

  const getButtonTone = (active: boolean) =>
    active
      ? { background: "#0f2948", color: "#ffffff" }
      : { background: "#ffffff", color: "#0f2948" };

  const showDisponibilitesPlanning =
    (role === "direction" || role === "admin") && !blocked;

  return (
    <main className="page-container">
      <HeaderTagora
        title="Livraison & ramassage"
        subtitle=""
        showNavigation={false}
        actions={
          <div
            style={{
              display: "flex",
              gap: "var(--ui-space-3)",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Link href="/direction/ramassages" className="tagora-dark-outline-action" style={{ textDecoration: "none" }}>
              Ramassages
            </Link>
            <Link href="/direction/livraisons/archives" className="tagora-dark-outline-action" style={{ textDecoration: "none" }}>
              Archives
            </Link>
            <Link href="/direction/dashboard" className="tagora-dark-action" style={{ textDecoration: "none" }}>
              Tableau de bord direction
            </Link>
          </div>
        }
      />
      {showDisponibilitesPlanning ? (
        <section
          className="tagora-panel"
          style={{
            marginTop: 12,
            padding: "14px 16px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            border: "1px solid rgba(205, 219, 238, 0.95)",
            borderRadius: 14,
            boxShadow: "0 6px 20px rgba(15, 41, 72, 0.07)",
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            boxSizing: "border-box",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#64748b",
              }}
            >
              Planification
            </p>
            <h2
              className="section-title"
              style={{
                margin: "6px 0 0",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#0f2948",
              }}
            >
              Disponibilités et blocages
            </h2>
            <p
              className="ui-text-muted"
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                lineHeight: 1.45,
                maxWidth: 540,
              }}
            >
              Fermez une journée de livraison ou rendez un véhicule/remorque indisponible pour une
              plage horaire précise.
            </p>
          </div>
          <Link
            href="/direction/disponibilites"
            className="tagora-dark-action"
            style={{
              flexShrink: 0,
              minHeight: 40,
              padding: "10px 18px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Gérer
          </Link>
        </section>
      ) : null}
      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/direction/livraisons"
            aria-current="page"
            style={{ ...navButtonBase, ...getButtonTone(true) }}
          >
            Livraisons
          </Link>
          <Link
            href="/direction/ramassages"
            style={{ ...navButtonBase, ...getButtonTone(false) }}
          >
            Ramassages
          </Link>
          <Link
            href="/direction/livraisons/archives"
            style={{ ...navButtonBase, ...getButtonTone(false) }}
          >
            Archives
          </Link>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              resetForm();
              clearMessage();
              setShowCreateForm(true);
            }}
            style={{ ...actionButtonBase, ...getButtonTone(showCreateForm) }}
          >
            Creer
          </button>
          <button
            onClick={() => setViewMode("liste")}
            style={{ ...actionButtonBase, ...getButtonTone(viewMode === "liste") }}
          >
            Liste
          </button>
          <button
            onClick={() => setViewMode("calendrier")}
            style={{ ...actionButtonBase, ...getButtonTone(viewMode === "calendrier") }}
          >
            Calendrier
          </button>
          <button
            onClick={() => void fetchData()}
            style={{ ...actionButtonBase, ...getButtonTone(false) }}
          >
            Actualiser
          </button>
        </div>
      </div>

      <FeedbackMessage message={message} type={messageType} />
      {linkedDataNotice ? (
        <div style={{ marginTop: 16 }}>
          <AccessNotice title="Acces partiel" description="Certaines listes sont limitees." />
        </div>
      ) : null}

      {showCreateForm ? (
        <div className="tagora-panel" style={{ marginTop: 24 }}>
          <h2 className="section-title" style={{ marginBottom: 18 }}>Nouvelle livraison</h2>
          <form onSubmit={handleCreateSubmit} className="tagora-form-grid">
            <label className="tagora-field">
              <span className="tagora-label">Client</span>
              <input
                type="text"
                value={newForm.client}
                onChange={(e) => setNewForm({ ...newForm, client: e.target.value })}
                className="tagora-input"
                placeholder="Nom du client"
                required
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Adresse</span>
              <input
                type="text"
                value={newForm.adresse}
                onChange={(e) => setNewForm({ ...newForm, adresse: e.target.value })}
                className="tagora-input"
                placeholder="Adresse de livraison"
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Chauffeur</span>
              <select value={newForm.chauffeur_id} onChange={(e) => setNewForm({ ...newForm, chauffeur_id: e.target.value })} className="tagora-input" required>
                <option value="">Choisir un chauffeur</option>
                {chauffeurs.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getPersonLabel(item))}</option>)}
              </select>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Compagnie</span>
              <select value={newForm.company_context} onChange={(e) => setNewForm({ ...newForm, company_context: e.target.value as AccountRequestCompany | "" })} className="tagora-input" required>
                <option value="">Choisir une compagnie</option>
                {ACCOUNT_REQUEST_COMPANIES.map((company) => <option key={company.value} value={company.value}>{company.label}</option>)}
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
              <span className="tagora-label">Dossier (optionnel)</span>
              <select value={newForm.dossier_id} onChange={(e) => setNewForm({ ...newForm, dossier_id: e.target.value })} className="tagora-input">
                <option value="">Choisir un dossier</option>
                {dossiers.map((dossier) => <option key={String(dossier.id)} value={String(dossier.id)}>{String(getDossierLabel(dossier))}</option>)}
              </select>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Date de livraison</span>
              <input type="date" value={newForm.date_livraison} onChange={(e) => setNewForm({ ...newForm, date_livraison: e.target.value })} className="tagora-input" required />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Heure</span>
              <input type="time" value={newForm.heure_prevue} onChange={(e) => setNewForm({ ...newForm, heure_prevue: e.target.value })} className="tagora-input" />
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
            {canEditLivraisonNotes ? (
              <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                <span className="tagora-label">Notes</span>
                <textarea
                  value={newForm.notes}
                  onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                  className="tagora-textarea"
                  placeholder="Notes"
                />
              </label>
            ) : null}
            <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="tagora-dark-action" disabled={saving}>{saving ? "Creation..." : "Creer"}</button>
              <button type="button" className="tagora-dark-outline-action" onClick={resetCreateForm}>Annuler</button>
            </div>
          </form>
        </div>
      ) : null}

      {editingId ? (
        <section className="tagora-panel" style={{ marginTop: 24 }}>
          <h2 className="section-title" style={{ marginBottom: 18 }}>Modifier la livraison</h2>
          <form onSubmit={handleSubmit} className="tagora-form-grid">
            <label className="tagora-field"><span className="tagora-label">Client</span><input type="text" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} className="tagora-input" placeholder="Nom du client" required /></label>
            <label className="tagora-field"><span className="tagora-label">Adresse</span><input type="text" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} className="tagora-input" placeholder="Adresse de livraison" /></label>
            <label className="tagora-field"><span className="tagora-label">Dossier</span><select value={form.dossier_id} onChange={(e) => setForm({ ...form, dossier_id: e.target.value })} className="tagora-input"><option value="">Choisir un dossier</option>{dossiers.map((dossier) => <option key={String(dossier.id)} value={String(dossier.id)}>{String(getDossierLabel(dossier))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Date</span><input type="date" value={form.date_livraison} onChange={(e) => setForm({ ...form, date_livraison: e.target.value })} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">Heure</span><input type="time" value={form.heure_prevue} onChange={(e) => setForm({ ...form, heure_prevue: e.target.value })} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">Compagnie</span><select value={form.company_context} onChange={(e) => setForm({ ...form, company_context: e.target.value as AccountRequestCompany | "" })} className="tagora-input"><option value="">Choisir une compagnie</option>{ACCOUNT_REQUEST_COMPANIES.map((company) => <option key={company.value} value={company.value}>{company.label}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Chauffeur</span><select value={form.chauffeur_id} onChange={(e) => setForm({ ...form, chauffeur_id: e.target.value })} className="tagora-input"><option value="">Choisir un chauffeur</option>{chauffeurs.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getPersonLabel(item))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Vehicule</span><select value={form.vehicule_id} onChange={(e) => setForm({ ...form, vehicule_id: e.target.value })} className="tagora-input"><option value="">Choisir un vehicule</option>{vehicules.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getVehiculeLabel(item))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Remorque</span><select value={form.remorque_id} onChange={(e) => setForm({ ...form, remorque_id: e.target.value })} className="tagora-input"><option value="">Choisir une remorque</option>{remorques.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getRemorqueLabel(item))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Statut</span><select value={form.statut} onChange={(e) => setForm({ ...form, statut: e.target.value })} className="tagora-input"><option value="planifiee">Planifiee</option><option value="en_cours">En cours</option><option value="livree">Livree</option><option value="probleme">Probleme</option></select></label>
            {canEditLivraisonNotes ? (
              <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                <span className="tagora-label">Notes</span>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="tagora-textarea" placeholder="Notes" />
              </label>
            ) : null}
            <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="tagora-dark-action" disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</button>
              <button type="button" className="tagora-dark-outline-action" onClick={resetForm}>Annuler</button>
            </div>
          </form>
          <div style={{ marginTop: 16 }}>
            <OperationProofsPanel
              moduleSource="livraison"
              sourceId={editingId}
              categorieParDefaut="preuve_livraison_direction"
              titre="Preuves livraison"
              commentairePlaceholder="Commentaire direction"
            />
            <InternalMentionsPanel
              entityType="livraison"
              entityId={editingId}
              recipients={chauffeurs
                .filter((item) => {
                  const actifValue = String(item.actif ?? "true").toLowerCase();
                  return actifValue !== "false" && actifValue !== "0";
                })
                .map((item) => ({
                  id: Number(item.id),
                  name: getPersonLabel(item),
                  email: typeof item.courriel === "string" ? item.courriel : null,
                  active: true,
                }))}
              context={{
                title: form.client || undefined,
                client: form.client || undefined,
                date: form.date_livraison || undefined,
                linkPath: `/direction/livraisons?edit=${editingId}`,
              }}
            />
          </div>
        </section>
      ) : null}

      <section className="tagora-panel" style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Livraisons planifiees</h2>
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
                        <th style={thStyle}>Client</th>
                        <th style={thStyle}>Adresse</th>
                        <th style={thStyle}>Date</th>
                        <th style={thStyle}>Heure</th>
                        <th style={thStyle}>Compagnie</th>
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
                        const clientLabel = getLivraisonClient(item, dossier);

                        return (
                          <tr key={item.id}>
                            <td style={tdStyle}>{item.id}</td>
                            <td style={tdStyle}>{dossier ? getDossierLabel(dossier) : item.dossier_id || "-"}</td>
                            <td style={tdStyle}>{clientLabel || "-"}</td>
                            <td style={tdStyle}>{item.adresse || "-"}</td>
                            <td style={tdStyle}>{item.date_livraison || "-"}</td>
                            <td style={tdStyle}>{item.heure_prevue || "-"}</td>
                            <td style={tdStyle}>{getLivraisonCompanyValue(item) ? getCompanyLabel(getLivraisonCompanyValue(item) as AccountRequestCompany) : "-"}</td>
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
                                <button onClick={() => handleEdit(item)} className="tagora-dark-outline-action">Gerer</button>
                                <Link href={`/direction/sorties-terrain?livraison_id=${item.id}`} className="tagora-dark-outline-action">Voir</Link>
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
                      {day ? (
                        <Link
                          href={`/direction/livraisons/jour?date=${dateStr}`}
                          className="tagora-dark-outline-action"
                          style={{ width: "fit-content", padding: "2px 8px", marginBottom: 6 }}
                        >
                          {day}
                        </Link>
                      ) : null}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, overflow: "auto" }}>
                        {datumsForDay.slice(0, 3).map((item) => (
                          <Link
                            key={item.id}
                            href={`/direction/livraisons/jour?date=${dateStr}`}
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
                              display: "block",
                            }}
                          >
                            {getLivraisonClient(item, getDossierById(item.dossier_id)) || `#${item.id}`} {item.heure_prevue ? `@ ${item.heure_prevue}` : ""}
                          </Link>
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






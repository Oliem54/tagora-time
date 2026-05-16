"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AccessNotice from "@/app/components/AccessNotice";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import SectionCard from "@/app/components/ui/SectionCard";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import OperationProofsPanel from "@/app/components/proofs/OperationProofsPanel";
import InternalMentionsPanel from "@/app/components/internal/InternalMentionsPanel";
import {
  ACCOUNT_REQUEST_COMPANIES,
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { isChauffeurDeliveryPoolMember } from "@/app/lib/employee-fonctions.shared";
import {
  applyPaymentPreferCommentaire,
  embeddedFromFormInput,
  formInputFromParsed,
  mergePaymentIntoText,
  parsePaymentFromRow,
  requiresPaymentFinalizeGate,
  splitOperationalCommentForForm,
  stripPaymentEmbedFromText,
  validatePaymentFormInput,
  withFinalizationConfirmation,
} from "@/app/lib/livraisons/payment-embed";
import {
  PaymentClientFormSection,
  PaymentDetailBanner,
  PaymentFinalizeModal,
} from "@/app/components/livraisons/PaymentClientUi";

type Row = Record<string, string | number | null | undefined>;
type LivraisonFormState = {
  dossier_id: string;
  client: string;
  adresse: string;
  code_postal: string;
  contact_name: string;
  contact_phone_primary: string;
  contact_phone_primary_ext: string;
  contact_phone_secondary: string;
  contact_phone_secondary_ext: string;
  date_livraison: string;
  heure_prevue: string;
  chauffeur_id: string;
  vehicule_id: string;
  remorque_id: string;
  statut: string;
  company_context: string;
  notes: string;
  commentaire_operationnel: string;
  payment_paid_full: boolean;
  payment_balance_due: string;
  payment_method: string;
  payment_note: string;
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
    code_postal: "",
    contact_name: "",
    contact_phone_primary: "",
    contact_phone_primary_ext: "",
    contact_phone_secondary: "",
    contact_phone_secondary_ext: "",
    date_livraison: "",
    heure_prevue: "",
    chauffeur_id: "",
    vehicule_id: "",
    remorque_id: "",
    statut: "",
    company_context: "",
    notes: "",
    commentaire_operationnel: "",
    payment_paid_full: true,
    payment_balance_due: "",
    payment_method: "deja_paye",
    payment_note: "",
    ...overrides,
  };
}

export default function Page() {
  const { user, loading: accessLoading, hasPermission, role } = useCurrentAccess();

  const [finalizePayOpen, setFinalizePayOpen] = useState(false);
  const [finalizePayId, setFinalizePayId] = useState<number | null>(null);
  const [finalizePayBalance, setFinalizePayBalance] = useState(0);
  const [finalizeMethod, setFinalizeMethod] = useState("");
  const [finalizeAck, setFinalizeAck] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);

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

  const chauffeursLivreurs = useMemo(
    () =>
      chauffeurs.filter((item) =>
        isChauffeurDeliveryPoolMember(item as Record<string, unknown>)
      ),
    [chauffeurs]
  );

  const [form, setForm] = useState<LivraisonFormState>(createLivraisonForm());

  const [newForm, setNewForm] = useState<LivraisonFormState>(
    createLivraisonForm({ statut: "planifiee" })
  );

  const chauffeursPourSelectLivraison = useMemo(() => {
    const pool = chauffeursLivreurs;
    const extraIds = new Set<string>();
    if (form.chauffeur_id) extraIds.add(form.chauffeur_id);
    if (newForm.chauffeur_id) extraIds.add(newForm.chauffeur_id);
    if (filtre.chauffeur_id) extraIds.add(filtre.chauffeur_id);
    const out = [...pool];
    for (const id of extraIds) {
      if (!out.some((r) => String(r.id) === id)) {
        const row = chauffeurs.find((r) => String(r.id) === id);
        if (row) out.push(row);
      }
    }
    return out;
  }, [
    chauffeurs,
    chauffeursLivreurs,
    form.chauffeur_id,
    newForm.chauffeur_id,
    filtre.chauffeur_id,
  ]);

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

  function getPostalCodeFromRow(item: Row | undefined) {
    if (!item) return "";
    const fromCode = getStringField(item, "code_postal");
    if (fromCode.trim()) return fromCode.trim();
    return getStringField(item, "postal_code").trim();
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

    const embedded = embeddedFromFormInput({
      paidFull: source.payment_paid_full,
      balanceDue: source.payment_balance_due,
      method: source.payment_method,
      note: source.payment_note,
    });
    const commentaireMerged = mergePaymentIntoText(
      stripPaymentEmbedFromText(source.commentaire_operationnel.trim()),
      embedded
    );
    const extraNotes = source.notes.trim();
    const commentaireWithNotes =
      extraNotes.length > 0
        ? commentaireMerged.length > 0
          ? `${commentaireMerged}\n\nNotes:\n${extraNotes}`
          : `Notes:\n${extraNotes}`
        : commentaireMerged;

    return {
      dossier_id: source.dossier_id ? Number(source.dossier_id) : null,
      client: clientValue,
      adresse: source.adresse.trim() || null,
      postal_code: source.code_postal.trim() || null,
      contact_name: source.contact_name.trim() || null,
      contact_phone_primary: source.contact_phone_primary.trim() || null,
      contact_phone_primary_ext: source.contact_phone_primary_ext.trim() || null,
      contact_phone_secondary: source.contact_phone_secondary.trim() || null,
      contact_phone_secondary_ext: source.contact_phone_secondary_ext.trim() || null,
      company_context: source.company_context.trim() || null,
      date_livraison: source.date_livraison || null,
      heure_prevue: source.heure_prevue || null,
      chauffeur_id: source.chauffeur_id ? Number(source.chauffeur_id) : null,
      vehicule_id: source.vehicule_id ? Number(source.vehicule_id) : null,
      remorque_id: source.remorque_id ? Number(source.remorque_id) : null,
      statut: source.statut || null,
      commentaire_operationnel:
        commentaireWithNotes.length > 0 ? commentaireWithNotes : null,
    };
  }

  const livraisonKpi = useMemo(() => {
    const rows = livraisons.filter(
      (item) => String(item.type_operation || "").toLowerCase() !== "ramassage_client"
    );
    let planifiee = 0;
    let en_cours = 0;
    let livree = 0;
    let probleme = 0;
    for (const item of rows) {
      const s = String(item.statut || "").toLowerCase();
      if (s === "en_cours") en_cours += 1;
      else if (s === "livree" || s === "ramassee") livree += 1;
      else if (s === "probleme") probleme += 1;
      else planifiee += 1;
    }
    return { planifiee, en_cours, livree, probleme, total: rows.length };
  }, [livraisons]);

  const livraisonsFiltrees = livraisons.filter((item) => {
    const isRamassage =
      String(item.type_operation || "").toLowerCase() === "ramassage_client";
    const okChauffeur = !filtre.chauffeur_id || String(item.chauffeur_id) === String(filtre.chauffeur_id);
    const okVehicule = !filtre.vehicule_id || String(item.vehicule_id) === String(filtre.vehicule_id);
    const okRemorque = !filtre.remorque_id || String(item.remorque_id) === String(filtre.remorque_id);
    const okStatut = !filtre.statut || item.statut === filtre.statut;
    return !isRamassage && okChauffeur && okVehicule && okRemorque && okStatut;
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    clearMessage();

    const payErr = validatePaymentFormInput({
      paidFull: form.payment_paid_full,
      balanceDue: form.payment_balance_due,
      method: form.payment_method,
      note: form.payment_note,
    });
    if (payErr) {
      setFeedbackMessage(payErr, "error");
      setSaving(false);
      return;
    }

    const payload = buildPayload(form);

    const response = editingId
      ? await fetch(`/api/livraisons/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/livraisons`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });

    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };

    if (!response.ok) {
      setFeedbackMessage(
        `Erreur sauvegarde: ${data.error?.message ?? "erreur inconnue"}`,
        "error"
      );
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

    if (!newForm.adresse.trim()) {
      setFeedbackMessage("L'adresse est obligatoire.", "error");
      setSaving(false);
      return;
    }
    if (!newForm.code_postal.trim()) {
      setFeedbackMessage("Le code postal est obligatoire.", "error");
      setSaving(false);
      return;
    }

    const payErr = validatePaymentFormInput({
      paidFull: newForm.payment_paid_full,
      balanceDue: newForm.payment_balance_due,
      method: newForm.payment_method,
      note: newForm.payment_note,
    });
    if (payErr) {
      setFeedbackMessage(payErr, "error");
      setSaving(false);
      return;
    }

    const payload = buildPayload(newForm);

    const response = await fetch(`/api/livraisons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };

    if (!response.ok) {
      setFeedbackMessage(
        `Erreur creation: ${data.error?.message ?? "erreur inconnue"}`,
        "error"
      );
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
    const parsedPay = parsePaymentFromRow(item as Record<string, unknown>);
    const payForm = formInputFromParsed(parsedPay);
    const rawCommentaire =
      getStringField(item, "commentaire_operationnel") || getStringField(item, "commentaire");
    const { commentaire, notes: notesFromCommentaire } =
      splitOperationalCommentForForm(rawCommentaire);
    const notesFromColumn = stripPaymentEmbedFromText(getStringField(item, "notes"));
    setEditingId(Number(item.id));
    setForm(createLivraisonForm({
      dossier_id: item.dossier_id ? String(item.dossier_id) : "",
      client: getLivraisonClient(item, dossier),
      adresse: getStringField(item, "adresse"),
      code_postal: getPostalCodeFromRow(item),
      contact_name: getStringField(item, "contact_name"),
      contact_phone_primary: getStringField(item, "contact_phone_primary"),
      contact_phone_primary_ext: getStringField(item, "contact_phone_primary_ext"),
      contact_phone_secondary: getStringField(item, "contact_phone_secondary"),
      contact_phone_secondary_ext: getStringField(item, "contact_phone_secondary_ext"),
      date_livraison: getStringField(item, "date_livraison"),
      heure_prevue: getStringField(item, "heure_prevue"),
      chauffeur_id: item.chauffeur_id ? String(item.chauffeur_id) : "",
      vehicule_id: item.vehicule_id ? String(item.vehicule_id) : "",
      remorque_id: item.remorque_id ? String(item.remorque_id) : "",
      statut: getStringField(item, "statut"),
      company_context: getLivraisonCompanyValue(item),
      notes: notesFromCommentaire || notesFromColumn,
      commentaire_operationnel: commentaire,
      payment_paid_full: payForm.paidFull,
      payment_balance_due: payForm.balanceDue,
      payment_method: payForm.method,
      payment_note: payForm.note,
    }));

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cette livraison ?")) return;

    clearMessage();
    const response = await fetch(`/api/livraisons/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };

    if (!response.ok) {
      setFeedbackMessage(
        `Erreur suppression: ${data.error?.message ?? "erreur inconnue"}`,
        "error"
      );
      return;
    }

    setFeedbackMessage("Livraison supprimee.", "success");
    if (editingId === id) resetForm();
    await fetchData();
  }

  async function handleStatusChange(id: number, newStatut: string) {
    clearMessage();

    if (newStatut === "livree") {
      const row = livraisons.find((item) => Number(item.id) === id);
      if (row) {
        const pv = parsePaymentFromRow(row as Record<string, unknown>);
        if (requiresPaymentFinalizeGate(pv)) {
          setFinalizePayId(id);
          setFinalizePayBalance(pv.payment_balance_due);
          setFinalizeMethod("");
          setFinalizeAck(false);
          setFinalizePayOpen(true);
          return;
        }
      }
    }

    const response = await fetch(`/api/livraisons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ statut: newStatut }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      updated_row?: Row;
      error?: { message?: string };
    };

    if (!response.ok || !data.updated_row) {
      setFeedbackMessage(
        `Erreur mise a jour statut: ${data.error?.message ?? "erreur inconnue"}`,
        "error"
      );
      return;
    }

    const updatedRow = data.updated_row;
    setFeedbackMessage(`Statut mis a jour: ${newStatut}`, "success");
    setLivraisons((prev) =>
      prev.map((item) => (Number(item.id) === id ? { ...item, ...updatedRow } : item))
    );
  }

  async function submitFinalizeLivreeFromModal() {
    if (finalizePayId == null) return;
    if (!finalizeMethod.trim() || !finalizeAck) return;
    const row = livraisons.find((item) => Number(item.id) === finalizePayId);
    if (!row) {
      setFinalizePayOpen(false);
      return;
    }
    const meta = user?.user_metadata as Record<string, unknown> | undefined;
    const fromMeta =
      typeof meta?.full_name === "string"
        ? meta.full_name
        : typeof meta?.name === "string"
          ? meta.name
          : "";
    const payerName =
      [fromMeta, user?.email].filter((s) => typeof s === "string" && s.trim()).join(" ").trim() ||
      "Employé";
    const parsed = parsePaymentFromRow(row as Record<string, unknown>);
    const next = withFinalizationConfirmation(parsed, finalizeMethod, payerName);
    const fields = applyPaymentPreferCommentaire(row as Record<string, unknown>, next);
    setFinalizeLoading(true);
    try {
      const response = await fetch(`/api/livraisons/${finalizePayId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ statut: "livree", ...fields }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        updated_row?: Row;
        error?: { message?: string };
      };
      if (!response.ok || !data.updated_row) {
        setFeedbackMessage(
          `Finalisation impossible: ${data.error?.message ?? "erreur inconnue"}`,
          "error"
        );
        return;
      }
      const updatedRow = data.updated_row;
      setLivraisons((prev) =>
        prev.map((item) => (Number(item.id) === finalizePayId ? { ...item, ...updatedRow } : item))
      );
      setFeedbackMessage("Livraison marquée livrée et paiement confirmé.", "success");
      setFinalizePayOpen(false);
      setFinalizePayId(null);
    } finally {
      setFinalizeLoading(false);
    }
  }

  if (accessLoading || (!blocked && loading)) {
    return <TagoraLoadingScreen isLoading message="Chargement de votre espace..." fullScreen />;
  }

  if (!user) {
    return null;
  }

  if (blocked) {
    return (
      <main className="page-container livraison-page">
        <HeaderTagora title="Livraison & ramassage" subtitle="" showNavigation={false} />
        <AccessNotice description="Acces requis." />
      </main>
    );
  }

  const showDisponibilitesPlanning =
    (role === "direction" || role === "admin") && !blocked;

  return (
    <main className="page-container livraison-page">
      <HeaderTagora
        title="Livraison & ramassage"
        subtitle=""
        showNavigation={false}
        actions={
          <div className="livraison-header-toolbar">
            <Link href="/direction/livraisons" className="tagora-dark-outline-action livraison-header-link">
              Livraisons
            </Link>
            <Link href="/direction/ramassages" className="tagora-dark-outline-action livraison-header-link">
              Ramassages
            </Link>
            <Link href="/direction/livraisons/archives" className="tagora-dark-outline-action livraison-header-link">
              Archives
            </Link>
            <Link
              href="/direction/dashboard"
              className="tagora-dark-action livraison-header-link livraison-header-link--solid"
            >
              Tableau de bord direction
            </Link>
          </div>
        }
      />
      {showDisponibilitesPlanning ? (
        <section
          className="tagora-panel livraison-plan-card"
          aria-labelledby="livraison-plan-title"
        >
          <div className="livraison-plan-card__copy">
            <p className="livraison-plan-card__eyebrow">Planification</p>
            <h2 id="livraison-plan-title" className="section-title livraison-plan-card__title">
              Disponibilités et blocages
            </h2>
            <p className="livraison-plan-card__description">
              Fermez une journée de livraison ou rendez un véhicule/remorque indisponible pour une
              plage horaire précise.
            </p>
          </div>
          <Link href="/direction/disponibilites" className="tagora-dark-action livraison-plan-card__manage">
            Gérer
          </Link>
        </section>
      ) : null}
      <div className="livraison-toolbar-stack">
        <div className="livraison-segmented-bar" aria-label="Navigation livraisons">
          <div className="livraison-segmented" role="tablist">
            <Link
              href="/direction/livraisons"
              aria-current="page"
              className="livraison-segment livraison-segment--active"
            >
              Livraisons
            </Link>
            <Link href="/direction/ramassages" className="livraison-segment">
              Ramassages
            </Link>
            <Link href="/direction/livraisons/archives" className="livraison-segment">
              Archives
            </Link>
          </div>
        </div>
        <div className="livraison-actions-bar" role="toolbar" aria-label="Actions livraisons">
          <div className="livraison-actions-bar__main">
            <button
              type="button"
              className={`livraison-btn livraison-btn--primary${showCreateForm ? " livraison-btn--pressed" : ""}`}
              onClick={() => {
                resetForm();
                clearMessage();
                setShowCreateForm(true);
              }}
            >
              Creer
            </button>
            <div className="livraison-actions-bar__secondary" role="group" aria-label="Affichage liste ou calendrier">
              <button
                type="button"
                className={`livraison-btn livraison-btn--secondary${viewMode === "liste" ? " livraison-btn--secondary-active" : ""}`}
                onClick={() => setViewMode("liste")}
              >
                Liste
              </button>
              <button
                type="button"
                className={`livraison-btn livraison-btn--secondary${viewMode === "calendrier" ? " livraison-btn--secondary-active" : ""}`}
                onClick={() => setViewMode("calendrier")}
              >
                Calendrier
              </button>
            </div>
          </div>
          <button type="button" className="livraison-btn livraison-btn--ghost livraison-actions-bar__refresh" onClick={() => void fetchData()}>
            Actualiser
          </button>
        </div>
      </div>

      <FeedbackMessage message={message} type={messageType} />

      <section className="tagora-panel livraison-metrics-panel">
        <h2 className="livraison-metrics-panel__title">Indicateurs livraisons</h2>
        <div className="livraison-metrics-panel__grid">
          <SectionCard title="Total livraisons" subtitle={String(livraisonKpi.total)} />
          <SectionCard title="Planifiees" subtitle={String(livraisonKpi.planifiee)} />
          <SectionCard title="En cours" subtitle={String(livraisonKpi.en_cours)} />
          <SectionCard title="Livrees" subtitle={String(livraisonKpi.livree)} />
          <SectionCard title="Problemes" subtitle={String(livraisonKpi.probleme)} />
        </div>
      </section>

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
                placeholder="Ex: 27 Rue de la Pointe aux Bleuets"
                required
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Code postal</span>
              <input
                type="text"
                value={newForm.code_postal}
                onChange={(e) => setNewForm({ ...newForm, code_postal: e.target.value })}
                className="tagora-input"
                placeholder="Ex: G3N 0C2"
                autoComplete="postal-code"
                required
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Personne a contacter</span>
              <input
                type="text"
                value={newForm.contact_name}
                onChange={(e) => setNewForm({ ...newForm, contact_name: e.target.value })}
                className="tagora-input"
                placeholder="Ex: Jean Tremblay (sur place)"
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Telephone principal</span>
              <input
                type="tel"
                value={newForm.contact_phone_primary}
                onChange={(e) => setNewForm({ ...newForm, contact_phone_primary: e.target.value })}
                className="tagora-input"
                placeholder="Ex: 418-555-1234"
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Extension telephone principal</span>
              <input
                type="text"
                value={newForm.contact_phone_primary_ext}
                onChange={(e) => setNewForm({ ...newForm, contact_phone_primary_ext: e.target.value })}
                className="tagora-input"
                placeholder="Ex: 204"
                inputMode="numeric"
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Telephone secondaire</span>
              <input
                type="tel"
                value={newForm.contact_phone_secondary}
                onChange={(e) => setNewForm({ ...newForm, contact_phone_secondary: e.target.value })}
                className="tagora-input"
                placeholder="Optionnel"
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Extension telephone secondaire</span>
              <input
                type="text"
                value={newForm.contact_phone_secondary_ext}
                onChange={(e) => setNewForm({ ...newForm, contact_phone_secondary_ext: e.target.value })}
                className="tagora-input"
                placeholder="Optionnel"
                inputMode="numeric"
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Livreur</span>
              <select value={newForm.chauffeur_id} onChange={(e) => setNewForm({ ...newForm, chauffeur_id: e.target.value })} className="tagora-input" required>
                <option value="">Choisir un livreur</option>
                {chauffeursPourSelectLivraison.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getPersonLabel(item))}</option>)}
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
              <div className="livraison-datetime-control livraison-datetime-control--date">
                <input type="date" value={newForm.date_livraison} onChange={(e) => setNewForm({ ...newForm, date_livraison: e.target.value })} className="tagora-input livraison-datetime-control__input" required />
              </div>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Heure</span>
              <div className="livraison-datetime-control livraison-datetime-control--time">
                <input type="time" value={newForm.heure_prevue} onChange={(e) => setNewForm({ ...newForm, heure_prevue: e.target.value })} className="tagora-input livraison-datetime-control__input" />
              </div>
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
            <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
              <span className="tagora-label">Commentaire opérationnel</span>
              <textarea
                value={newForm.commentaire_operationnel}
                onChange={(e) => setNewForm({ ...newForm, commentaire_operationnel: e.target.value })}
                className="tagora-textarea"
                placeholder="Contexte pour l’équipe (sans données de paiement — le bloc Paiement les enregistre)."
                rows={2}
              />
            </label>
            <div style={{ gridColumn: "1 / -1" }}>
              <PaymentClientFormSection
                idPrefix="liv-new"
                value={{
                  paidFull: newForm.payment_paid_full,
                  balanceDue: newForm.payment_balance_due,
                  method: newForm.payment_method,
                  note: newForm.payment_note,
                }}
                onChange={(next) =>
                  setNewForm({
                    ...newForm,
                    payment_paid_full: next.paidFull,
                    payment_balance_due: next.balanceDue,
                    payment_method: next.method,
                    payment_note: next.note,
                  })
                }
                disabled={saving}
              />
            </div>
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
          <div style={{ marginBottom: 16 }}>
            <PaymentDetailBanner
              payment={embeddedFromFormInput({
                paidFull: form.payment_paid_full,
                balanceDue: form.payment_balance_due,
                method: form.payment_method,
                note: form.payment_note,
              })}
            />
          </div>
          <form onSubmit={handleSubmit} className="tagora-form-grid">
            <label className="tagora-field"><span className="tagora-label">Client</span><input type="text" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} className="tagora-input" placeholder="Nom du client" required /></label>
            <label className="tagora-field"><span className="tagora-label">Adresse</span><input type="text" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} className="tagora-input" placeholder="Adresse de livraison" /></label>
            <label className="tagora-field"><span className="tagora-label">Code postal</span><input type="text" value={form.code_postal} onChange={(e) => setForm({ ...form, code_postal: e.target.value })} className="tagora-input" placeholder="Ex: G3N 0C2" autoComplete="postal-code" /></label>
            <label className="tagora-field"><span className="tagora-label">Personne a contacter</span><input type="text" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="tagora-input" placeholder="Contact sur place" /></label>
            <label className="tagora-field"><span className="tagora-label">Telephone principal</span><input type="tel" value={form.contact_phone_primary} onChange={(e) => setForm({ ...form, contact_phone_primary: e.target.value })} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">Extension tel. principal</span><input type="text" value={form.contact_phone_primary_ext} onChange={(e) => setForm({ ...form, contact_phone_primary_ext: e.target.value })} className="tagora-input" inputMode="numeric" /></label>
            <label className="tagora-field"><span className="tagora-label">Telephone secondaire</span><input type="tel" value={form.contact_phone_secondary} onChange={(e) => setForm({ ...form, contact_phone_secondary: e.target.value })} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">Extension tel. secondaire</span><input type="text" value={form.contact_phone_secondary_ext} onChange={(e) => setForm({ ...form, contact_phone_secondary_ext: e.target.value })} className="tagora-input" inputMode="numeric" /></label>
            <label className="tagora-field"><span className="tagora-label">Dossier</span><select value={form.dossier_id} onChange={(e) => setForm({ ...form, dossier_id: e.target.value })} className="tagora-input"><option value="">Choisir un dossier</option>{dossiers.map((dossier) => <option key={String(dossier.id)} value={String(dossier.id)}>{String(getDossierLabel(dossier))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Date</span><input type="date" value={form.date_livraison} onChange={(e) => setForm({ ...form, date_livraison: e.target.value })} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">Heure</span><input type="time" value={form.heure_prevue} onChange={(e) => setForm({ ...form, heure_prevue: e.target.value })} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">Compagnie</span><select value={form.company_context} onChange={(e) => setForm({ ...form, company_context: e.target.value as AccountRequestCompany | "" })} className="tagora-input"><option value="">Choisir une compagnie</option>{ACCOUNT_REQUEST_COMPANIES.map((company) => <option key={company.value} value={company.value}>{company.label}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Livreur</span><select value={form.chauffeur_id} onChange={(e) => setForm({ ...form, chauffeur_id: e.target.value })} className="tagora-input"><option value="">Choisir un livreur</option>{chauffeursPourSelectLivraison.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getPersonLabel(item))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Vehicule</span><select value={form.vehicule_id} onChange={(e) => setForm({ ...form, vehicule_id: e.target.value })} className="tagora-input"><option value="">Choisir un vehicule</option>{vehicules.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getVehiculeLabel(item))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Remorque</span><select value={form.remorque_id} onChange={(e) => setForm({ ...form, remorque_id: e.target.value })} className="tagora-input"><option value="">Choisir une remorque</option>{remorques.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getRemorqueLabel(item))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Statut</span><select value={form.statut} onChange={(e) => setForm({ ...form, statut: e.target.value })} className="tagora-input"><option value="planifiee">Planifiee</option><option value="en_cours">En cours</option><option value="livree">Livree</option><option value="probleme">Probleme</option></select></label>
            <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
              <span className="tagora-label">Commentaire opérationnel</span>
              <textarea
                value={form.commentaire_operationnel}
                onChange={(e) => setForm({ ...form, commentaire_operationnel: e.target.value })}
                className="tagora-textarea"
                placeholder="Contexte pour l’équipe"
                rows={2}
              />
            </label>
            <div style={{ gridColumn: "1 / -1" }}>
              <PaymentClientFormSection
                idPrefix={`liv-edit-${editingId}`}
                value={{
                  paidFull: form.payment_paid_full,
                  balanceDue: form.payment_balance_due,
                  method: form.payment_method,
                  note: form.payment_note,
                }}
                onChange={(next) =>
                  setForm({
                    ...form,
                    payment_paid_full: next.paidFull,
                    payment_balance_due: next.balanceDue,
                    payment_method: next.method,
                    payment_note: next.note,
                  })
                }
                disabled={saving}
              />
            </div>
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

      <section className="tagora-panel livraison-calendar-card">
          <header className="livraison-calendar-card__header">
            <div>
              <h2 className="section-title livraison-calendar-card__title">Livraisons planifiees</h2>
              {viewMode === "calendrier" ? (
                <p className="livraison-calendar-card__subtitle">
                  Vue mensuelle : cliquez un jour pour ouvrir la journée ou un événement pour le détail.
                </p>
              ) : (
                <p className="livraison-calendar-card__subtitle">
                  Filtrez par livreur, véhicule, remorque ou statut, puis gérez chaque ligne.
                </p>
              )}
            </div>
          </header>

          {viewMode === "liste" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
                <select value={filtre.chauffeur_id} onChange={(e) => setFiltre({ ...filtre, chauffeur_id: e.target.value })} className="tagora-input"><option value="">Tous les livreurs</option>{chauffeursPourSelectLivraison.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getPersonLabel(item))}</option>)}</select>
                <select value={filtre.vehicule_id} onChange={(e) => setFiltre({ ...filtre, vehicule_id: e.target.value })} className="tagora-input"><option value="">Tous les vehicules</option>{vehicules.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getVehiculeLabel(item))}</option>)}</select>
                <select value={filtre.remorque_id} onChange={(e) => setFiltre({ ...filtre, remorque_id: e.target.value })} className="tagora-input"><option value="">Toutes les remorques</option>{remorques.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getRemorqueLabel(item))}</option>)}</select>
                <select value={filtre.statut} onChange={(e) => setFiltre({ ...filtre, statut: e.target.value })} className="tagora-input"><option value="">Tous les statuts</option><option value="planifiee">Planifiee</option><option value="en_cours">En cours</option><option value="livree">Livree</option><option value="probleme">Probleme</option></select>
              </div>
              {livraisonsFiltrees.length === 0 ? (
                <p className="tagora-note">Aucune livraison trouvee.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="livraison-data-table" style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>ID</th>
                        <th style={thStyle}>Dossier</th>
                        <th style={thStyle}>Client</th>
                        <th style={thStyle}>Adresse</th>
                        <th style={thStyle}>Code postal</th>
                        <th style={thStyle}>Date</th>
                        <th style={thStyle}>Heure</th>
                        <th style={thStyle}>Compagnie</th>
                        <th style={thStyle}>Livreur</th>
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
                            <td style={tdStyle}>{getPostalCodeFromRow(item) || "-"}</td>
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
              <div className="livraison-cal-nav" aria-label="Navigation calendrier">
                <button type="button" onClick={prevMonth} className="livraison-cal-nav-btn">
                  ← Mois prec
                </button>
                <h3 className="livraison-cal-month">
                  {calendarDate.toLocaleString("fr-FR", { month: "long", year: "numeric" })}
                </h3>
                <button type="button" onClick={nextMonth} className="livraison-cal-nav-btn">
                  Mois suiv →
                </button>
              </div>
              <div className="livraison-cal-weekdays">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                  <div key={d} className="livraison-cal-weekday">
                    {d}
                  </div>
                ))}
              </div>
              <div className="livraison-cal-grid">
                {getCalendarDays().map((day, idx) => {
                  const dateStr = day ? formatDateISO(day) : "";
                  const datumsForDay = day ? getLivraisonsByDate(dateStr) : [];
                  return (
                    <div
                      key={idx}
                      className={day ? "livraison-cal-cell" : "livraison-cal-cell livraison-cal-cell--empty"}
                    >
                      {day ? (
                        <Link href={`/direction/livraisons/jour?date=${dateStr}`} className="livraison-cal-daynum">
                          {day}
                        </Link>
                      ) : null}
                      <div className="livraison-cal-events">
                        {datumsForDay.slice(0, 3).map((item) => {
                          const statutKey =
                            item.statut === "en_cours"
                              ? "en_cours"
                              : item.statut === "livree"
                                ? "livree"
                                : item.statut === "probleme"
                                  ? "probleme"
                                  : "planifiee";
                          return (
                            <Link
                              key={item.id}
                              href={`/direction/livraisons/jour?date=${dateStr}`}
                              className={`livraison-cal-event livraison-cal-event--${statutKey}`}
                            >
                              {getLivraisonClient(item, getDossierById(item.dossier_id)) || `#${item.id}`}{" "}
                              {item.heure_prevue ? `@ ${item.heure_prevue}` : ""}
                            </Link>
                          );
                        })}
                        {datumsForDay.length > 3 && (
                          <div className="livraison-cal-more">+{datumsForDay.length - 3} autre(s)</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
      </section>
      <PaymentFinalizeModal
        open={finalizePayOpen}
        kind="livraison"
        balanceDue={finalizePayBalance}
        loading={finalizeLoading}
        method={finalizeMethod}
        confirmChecked={finalizeAck}
        onMethodChange={setFinalizeMethod}
        onConfirmChange={setFinalizeAck}
        onCancel={() => {
          if (!finalizeLoading) {
            setFinalizePayOpen(false);
            setFinalizePayId(null);
            setFinalizeMethod("");
            setFinalizeAck(false);
          }
        }}
        onSubmit={() => void submitFinalizeLivreeFromModal()}
      />
    </main>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1120,
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






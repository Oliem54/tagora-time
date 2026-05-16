"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AccessNotice from "@/app/components/AccessNotice";
import SectionCard from "@/app/components/ui/SectionCard";
import AppCard from "@/app/components/ui/AppCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import OperationProofsPanel from "@/app/components/proofs/OperationProofsPanel";
import InternalMentionsPanel from "@/app/components/internal/InternalMentionsPanel";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import {
  ACCOUNT_REQUEST_COMPANIES,
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
  stripPaymentMarker,
  validatePaymentFormInput,
  withFinalizationConfirmation,
} from "@/app/lib/livraisons/payment-embed";
import {
  PaymentClientFormSection,
  PaymentDetailBanner,
  PaymentFinalizeModal,
} from "@/app/components/livraisons/PaymentClientUi";

type Row = Record<string, string | number | null | undefined>;

const RAMASSAGE_DEFAULT_PICKUP_ADDRESS = "Oliem Solutions";

function formatAuditTimestamp(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AUDIT_NON_RENSEIGNE = "Non renseigné";

function pickupRowFieldString(row: Row | undefined, keys: string[]) {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeTimeShort(raw: string | number | null | undefined) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
  return s.slice(0, 5);
}

type PickupStatus =
  | "pret_a_ramasser"
  | "planifie"
  | "en_cours"
  | "ramasse"
  | "non_ramasse"
  | "a_replanifier";
type PickupFilter = PickupStatus | "en_retard" | "";

type PickupCreateFormState = {
  client: string;
  adresse: string;
  item_location: string;
  date_livraison: string;
  heure_prevue: string;
  dossier_id: string;
  chauffeur_id: string;
  company_context: string;
  statut: string;
  notes: string;
  commentaire_operationnel: string;
  payment_paid_full: boolean;
  payment_balance_due: string;
  payment_method: string;
  payment_note: string;
};

function getPickupCompanyValue(item: Row | undefined) {
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

type OverdueSeverity = "overdue" | "warning" | "normal";
type OverdueItem = {
  id: number;
  client: string;
  commande: string;
  facture: string;
  expectedDate: string;
  diffDays: number;
  lateDays: number;
  status: string;
  phone: string;
  email: string;
  severity: OverdueSeverity;
};

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getPickupStatus(item: Row, todayIso: string): PickupStatus {
  const raw = String(item.statut || "").toLowerCase().trim();
  const date = String(item.date_livraison || "");

  if (raw === "pret_a_ramasser") return "pret_a_ramasser";
  if (raw === "a_replanifier") return "a_replanifier";
  if (raw === "en_cours") return "en_cours";
  if (raw === "livree" || raw === "ramassee") return "ramasse";
  if (raw === "non_ramassee" || raw === "non_ramasse") return "non_ramasse";

  if (date && date < todayIso) {
    return "non_ramasse";
  }
  return "planifie";
}

function getPickupStatusLabel(status: PickupStatus) {
  if (status === "pret_a_ramasser") return "Pret a ramasser";
  if (status === "planifie") return "Planifie";
  if (status === "en_cours") return "En cours";
  if (status === "ramasse") return "Ramasse";
  if (status === "non_ramasse") return "Non ramasse";
  return "A replanifier";
}

function getPickupStatusTone(status: PickupStatus) {
  if (status === "ramasse") return "success" as const;
  if (status === "en_cours") return "warning" as const;
  if (status === "pret_a_ramasser") return "info" as const;
  if (status === "non_ramasse" || status === "a_replanifier") return "danger" as const;
  return "default" as const;
}

/** Classes événement calendrier (même grille que Livraisons). */
function pickupCalendarEventClass(status: PickupStatus) {
  if (status === "ramasse") return "livraison-cal-event livraison-cal-event--livree";
  if (status === "en_cours" || status === "pret_a_ramasser") {
    return "livraison-cal-event livraison-cal-event--en_cours";
  }
  if (status === "non_ramasse" || status === "a_replanifier") {
    return "livraison-cal-event livraison-cal-event--probleme";
  }
  return "livraison-cal-event livraison-cal-event--planifiee";
}

function toPickupDateTimeValue(date: string, time: string) {
  if (!date) return Number.MAX_SAFE_INTEGER;
  const safeTime = time && time.length >= 4 ? time : "23:59";
  const parsed = new Date(`${date}T${safeTime}`);
  const value = parsed.getTime();
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function getPickupSortPriority(status: PickupStatus, isOverdue: boolean) {
  if (isOverdue) return 0;
  if (status === "pret_a_ramasser") return 1;
  if (status === "en_cours") return 2;
  if (status === "a_replanifier") return 3;
  if (status === "planifie") return 4;
  if (status === "non_ramasse") return 5;
  return 6;
}

function monthLabel(viewDate: Date) {
  return viewDate.toLocaleString("fr-CA", { month: "long", year: "numeric" });
}

function createPickupForm(): PickupCreateFormState {
  return {
    client: "",
    adresse: RAMASSAGE_DEFAULT_PICKUP_ADDRESS,
    item_location: "",
    date_livraison: "",
    heure_prevue: "",
    dossier_id: "",
    chauffeur_id: "",
    company_context: "",
    statut: "planifiee",
    notes: "",
    commentaire_operationnel: "",
    payment_paid_full: true,
    payment_balance_due: "",
    payment_method: "deja_paye",
    payment_note: "",
  };
}

/** Paiement + notes formulaire → commentaire_operationnel (colonne notes absente en base). */
function mergeOperationalComment(
  commentaire: string,
  notes: string,
  payment: ReturnType<typeof embeddedFromFormInput>
): string | null {
  const commentaireMerged = mergePaymentIntoText(stripPaymentMarker(commentaire.trim()), payment);
  const extraNotes = notes.trim();
  const commentaireWithNotes =
    extraNotes.length > 0
      ? commentaireMerged.length > 0
        ? `${commentaireMerged}\n\nNotes:\n${extraNotes}`
        : `Notes:\n${extraNotes}`
      : commentaireMerged;
  return commentaireWithNotes.length > 0 ? commentaireWithNotes : null;
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
  const fullName = [item.prenom, item.nom]
    .filter(Boolean)
    .map(String)
    .join(" ")
    .trim();
  return String(item.nom_complet || item.nom || item.name || fullName || `#${String(item.id)}`);
}

export default function DirectionRamassagesPage() {
  const { user, role, loading: accessLoading, hasPermission } = useCurrentAccess();
  const canUseLivraisons = hasPermission("livraisons");
  const isAdmin = role === "admin";
  const canViewAlertSettings = role === "admin" || role === "direction";
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dossiersById, setDossiersById] = useState<Map<number, Row>>(new Map());
  const [dossiers, setDossiers] = useState<Row[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Row[]>([]);
  const [newForm, setNewForm] = useState<PickupCreateFormState>(createPickupForm());
  const chauffeursLivreurs = useMemo(
    () =>
      chauffeurs.filter((item) =>
        isChauffeurDeliveryPoolMember(item as Record<string, unknown>)
      ),
    [chauffeurs]
  );
  const chauffeursPourRamassage = useMemo(() => {
    const pool = chauffeursLivreurs;
    const id = newForm.chauffeur_id;
    if (!id) return pool;
    if (pool.some((r) => String(r.id) === id)) return pool;
    const row = chauffeurs.find((r) => String(r.id) === id);
    return row ? [...pool, row] : pool;
  }, [chauffeurs, chauffeursLivreurs, newForm.chauffeur_id]);

  const [viewMode, setViewMode] = useState<"liste" | "calendrier">("liste");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<PickupFilter>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [overdueItems, setOverdueItems] = useState<OverdueItem[]>([]);
  const [overdueLoading, setOverdueLoading] = useState(false);
  const [delayDays, setDelayDays] = useState(2);
  const [warningDays, setWarningDays] = useState(1);
  const [configSaving, setConfigSaving] = useState(false);
  const canEditRamassageDetails = role === "direction" || role === "admin";
  const [editingRamassage, setEditingRamassage] = useState(false);
  const [editForm, setEditForm] = useState<PickupCreateFormState>(() => createPickupForm());
  const [quickActionLoading, setQuickActionLoading] = useState<string | null>(null);
  const [showReplanSelected, setShowReplanSelected] = useState(false);
  const [replanDate, setReplanDate] = useState("");
  const [replanHeure, setReplanHeure] = useState("");

  const [finalizeRamassageOpen, setFinalizeRamassageOpen] = useState(false);
  const [finalizeRamassageId, setFinalizeRamassageId] = useState<number | null>(null);
  const [finalizeRamassageBalance, setFinalizeRamassageBalance] = useState(0);
  const [finalizeMethod, setFinalizeMethod] = useState("");
  const [finalizeAck, setFinalizeAck] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);

  const todayIso = toIsoDate(new Date());

  const chauffeursPourEditRamassage = useMemo(() => {
    const pool = chauffeursLivreurs;
    const id = editForm.chauffeur_id;
    if (!id) return pool;
    if (pool.some((r) => String(r.id) === id)) return pool;
    const row = chauffeurs.find((r) => String(r.id) === id);
    return row ? [...pool, row] : pool;
  }, [chauffeurs, chauffeursLivreurs, editForm.chauffeur_id]);

  const fetchOverdue = useCallback(async () => {
    setOverdueLoading(true);
    try {
      const res = await fetch("/api/direction/ramassages/overdue", { cache: "no-store" });
      const payload = (await res.json().catch(() => ({}))) as {
        items?: OverdueItem[];
        config?: { delayDays?: number; warningDays?: number };
      };
      if (!res.ok) throw new Error((payload as { error?: string }).error ?? "Erreur overdue");
      setOverdueItems(Array.isArray(payload.items) ? payload.items : []);
      setDelayDays(Number(payload.config?.delayDays ?? 2));
      setWarningDays(Number(payload.config?.warningDays ?? 1));
    } catch {
      setOverdueItems([]);
    } finally {
      setOverdueLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setMessageType(null);

    const [ramassagesRes, dossiersRes, chauffeursRes] = await Promise.all([
      supabase
        .from("livraisons_planifiees")
        .select("*")
        .eq("type_operation", "ramassage_client")
        .order("date_livraison", { ascending: true })
        .order("heure_prevue", { ascending: true }),
      supabase.from("dossiers").select("id, nom, client").order("id", { ascending: false }),
      supabase.from("chauffeurs").select("*").order("id", { ascending: true }),
    ]);

    if (ramassagesRes.error) {
      setRows([]);
      setSelectedId(null);
      setMessage(`Erreur chargement ramassages: ${ramassagesRes.error.message}`);
      setMessageType("error");
    } else {
      const nextRows = (ramassagesRes.data ?? []) as Row[];
      setRows(nextRows);
      setSelectedId((prev) => {
        if (nextRows.length === 0) return null;
        if (prev == null) return Number(nextRows[0].id);
        if (nextRows.some((r) => Number(r.id) === prev)) return prev;
        return Number(nextRows[0].id);
      });
    }

    if (!dossiersRes.error) {
      const dossierRows = (dossiersRes.data ?? []) as Row[];
      setDossiers(dossierRows);
      const map = new Map<number, Row>();
      for (const row of dossierRows) {
        const id = Number((row as Row).id);
        if (Number.isFinite(id)) map.set(id, row as Row);
      }
      setDossiersById(map);
    } else {
      setDossiers([]);
    }
    setChauffeurs(chauffeursRes.error ? [] : ((chauffeursRes.data ?? []) as Row[]));

    setLoading(false);
  }, []);

  async function saveOverdueConfig() {
    setConfigSaving(true);
    try {
      const response = await fetch("/api/direction/ramassages/overdue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delayDays, warningDays }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Sauvegarde refusee.");
      }
      await fetchOverdue();
      setMessage("Delai d alerte ramassage mis a jour.");
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de sauvegarder la configuration d alerte.");
      setMessageType("error");
    } finally {
      setConfigSaving(false);
    }
  }

  useEffect(() => {
    if (accessLoading || !user || !canUseLivraisons) return;
    const timer = window.setTimeout(() => {
      void fetchData();
      void fetchOverdue();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accessLoading, canUseLivraisons, fetchData, fetchOverdue, user]);

  const computed = useMemo(() => {
    return rows.map((item) => ({
      item,
      id: Number(item.id),
      date: String(item.date_livraison || ""),
      time: String(item.heure_prevue || ""),
      status: getPickupStatus(item, todayIso),
      isOverdue:
        String(item.date_livraison || "") < todayIso &&
        getPickupStatus(item, todayIso) !== "ramasse",
    }));
  }, [rows, todayIso]);

  const filtered = useMemo(() => {
    if (statusFilter === "en_retard") {
      return computed.filter((entry) => entry.isOverdue);
    }
    if (!statusFilter) return computed;
    return computed.filter((entry) => entry.status === statusFilter);
  }, [computed, statusFilter]);

  const listOrdered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aPriority = getPickupSortPriority(a.status, a.isOverdue);
      const bPriority = getPickupSortPriority(b.status, b.isOverdue);
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aTime = toPickupDateTimeValue(a.date, a.time);
      const bTime = toPickupDateTimeValue(b.date, b.time);
      if (aTime !== bTime) return aTime - bTime;
      return a.id - b.id;
    });
  }, [filtered]);

  const indicators = useMemo(() => {
    return {
      pret: computed.filter((entry) => entry.status === "pret_a_ramasser").length,
      planifie: computed.filter((entry) => entry.status === "planifie").length,
      enCours: computed.filter((entry) => entry.status === "en_cours").length,
      ramasse: computed.filter((entry) => entry.status === "ramasse").length,
      nonRamasse: computed.filter((entry) => entry.status === "non_ramasse").length,
      replanifier: computed.filter((entry) => entry.status === "a_replanifier").length,
      enRetard: computed.filter((entry) => entry.isOverdue).length,
    };
  }, [computed]);

  const selected = listOrdered.find((entry) => entry.id === selectedId) ?? listOrdered[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    const it = selected.item;
    const addrRaw = String(it.adresse || "").trim();
    const parsedPay = parsePaymentFromRow(it as Record<string, unknown>);
    const payForm = formInputFromParsed(parsedPay);
    setEditForm({
      client: String(it.client || ""),
      adresse: addrRaw || RAMASSAGE_DEFAULT_PICKUP_ADDRESS,
      item_location: pickupRowFieldString(it, ["item_location"]),
      date_livraison: String(it.date_livraison || "").slice(0, 10),
      heure_prevue: normalizeTimeShort(it.heure_prevue),
      dossier_id: it.dossier_id != null && String(it.dossier_id) !== "0" ? String(it.dossier_id) : "",
      chauffeur_id: it.chauffeur_id != null && String(it.chauffeur_id) !== "0" ? String(it.chauffeur_id) : "",
      company_context: getPickupCompanyValue(it),
      statut: String(it.statut || "planifiee"),
      notes: stripPaymentMarker(String(it.notes || "")),
      commentaire_operationnel: stripPaymentMarker(
        pickupRowFieldString(it, ["commentaire_operationnel", "commentaire"])
      ),
      payment_paid_full: payForm.paidFull,
      payment_balance_due: payForm.balanceDue,
      payment_method: payForm.method,
      payment_note: payForm.note,
    });
    setEditingRamassage(false);
    setShowReplanSelected(false);
    setReplanDate(String(it.date_livraison || "").slice(0, 10));
    setReplanHeure(normalizeTimeShort(it.heure_prevue));
  }, [selected?.id]);

  const chauffeursPourMentionsRamassage = useMemo(() => {
    const pool = chauffeursLivreurs.filter((item) => {
      const actifValue = String(item.actif ?? "true").toLowerCase();
      return actifValue !== "false" && actifValue !== "0";
    });
    const assignRaw = selected?.item?.chauffeur_id ?? selected?.item?.chauffeur;
    const assignId =
      assignRaw != null && assignRaw !== "" ? String(assignRaw) : "";
    if (assignId && assignId !== "0" && !pool.some((r) => String(r.id) === assignId)) {
      const row = chauffeurs.find((r) => String(r.id) === assignId);
      if (row) return [...pool, row];
    }
    return pool;
  }, [chauffeurs, chauffeursLivreurs, selected]);

  function getDaysForMonth() {
    const y = calendarDate.getFullYear();
    const m = calendarDate.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const daysInMonth = last.getDate();
    const startOffset = (first.getDay() + 6) % 7;
    const cells: Array<number | null> = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
    return cells;
  }

  function getDateIsoForDay(day: number) {
    const y = calendarDate.getFullYear();
    const m = String(calendarDate.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-${String(day).padStart(2, "0")}`;
  }

  async function updatePickupStatus(id: number, nextStatus: PickupStatus, nextDate?: string) {
    if (nextStatus === "ramasse") {
      beginRamassageFinalize(id);
      return;
    }
    setSavingId(id);
    setMessage("");
    setMessageType(null);

    const payload: Record<string, unknown> = {};
    if (nextStatus === "planifie") payload.statut = "planifiee";
    else payload.statut = nextStatus;
    if (nextDate) payload.date_livraison = nextDate;

    const { error } = await supabase.from("livraisons_planifiees").update(payload).eq("id", id);

    setSavingId(null);
    if (error) {
      setMessage(`Erreur mise a jour: ${error.message}`);
      setMessageType("error");
      return;
    }
    setMessage("Ramassage mis a jour.");
    setMessageType("success");
    await fetchData();
    await fetchOverdue();
  }

  function beginRamassageFinalize(id: number) {
    const row = rows.find((r) => Number(r.id) === id);
    if (!row) return;
    const pv = parsePaymentFromRow(row as Record<string, unknown>);
    if (requiresPaymentFinalizeGate(pv)) {
      setFinalizeRamassageId(id);
      setFinalizeRamassageBalance(pv.payment_balance_due);
      setFinalizeMethod("");
      setFinalizeAck(false);
      setFinalizeRamassageOpen(true);
      return;
    }
    if (!window.confirm("Marquer ce ramassage comme ramassé ?")) return;
    void patchRamassageQuick(
      id,
      { statut: "ramassee" },
      "Ramassage marqué ramassé.",
      `ramasse:${id}`
    );
  }

  async function submitFinalizeRamassageFromModal() {
    if (finalizeRamassageId == null) return;
    if (!finalizeMethod.trim() || !finalizeAck) return;
    const row = rows.find((r) => Number(r.id) === finalizeRamassageId);
    if (!row) {
      setFinalizeRamassageOpen(false);
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
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch(`/api/livraisons/${finalizeRamassageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ statut: "ramassee", ...fields }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        updated_row?: Row;
        error?: { message?: string };
      };
      if (!res.ok || !data.updated_row) {
        throw new Error(data.error?.message || "Finalisation impossible.");
      }
      setRows((prev) =>
        prev.map((r) => (Number(r.id) === finalizeRamassageId ? { ...r, ...data.updated_row } : r))
      );
      setFinalizeRamassageOpen(false);
      setFinalizeRamassageId(null);
      setMessage("Ramassage marqué ramassé et paiement confirmé.");
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur.");
      setMessageType("error");
    } finally {
      setFinalizeLoading(false);
      await fetchData();
      await fetchOverdue();
    }
  }

  async function handleCreatePickup(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    setMessageType(null);

    const payErr = validatePaymentFormInput({
      paidFull: newForm.payment_paid_full,
      balanceDue: newForm.payment_balance_due,
      method: newForm.payment_method,
      note: newForm.payment_note,
    });
    if (payErr) {
      setMessage(payErr);
      setMessageType("error");
      setCreating(false);
      return;
    }

    const companyContext = newForm.company_context.trim();
    if (!companyContext) {
      setMessage("Choisissez une compagnie.");
      setMessageType("error");
      setCreating(false);
      return;
    }

    const embedded = embeddedFromFormInput({
      paidFull: newForm.payment_paid_full,
      balanceDue: newForm.payment_balance_due,
      method: newForm.payment_method,
      note: newForm.payment_note,
    });
    const commentaireOperationnel = mergeOperationalComment(
      newForm.commentaire_operationnel,
      newForm.notes,
      embedded
    );

    const payload: Record<string, unknown> = {
      type_operation: "ramassage_client",
      client: newForm.client.trim(),
      adresse: newForm.adresse.trim() || RAMASSAGE_DEFAULT_PICKUP_ADDRESS,
      item_location: newForm.item_location.trim() || null,
      date_livraison: newForm.date_livraison,
      heure_prevue: newForm.heure_prevue || null,
      dossier_id: newForm.dossier_id ? Number(newForm.dossier_id) : null,
      chauffeur_id: newForm.chauffeur_id ? Number(newForm.chauffeur_id) : null,
      company_context: companyContext,
      statut: newForm.statut,
      commentaire_operationnel: commentaireOperationnel,
    };

    const { data, error } = await supabase
      .from("livraisons_planifiees")
      .insert([payload])
      .select("id")
      .single();

    setCreating(false);

    if (error) {
      setMessage(`Erreur creation ramassage: ${error.message}`);
      setMessageType("error");
      return;
    }

    const createdId = Number((data as Row | null)?.id);
    setShowCreateForm(false);
    setNewForm(createPickupForm());
    if (Number.isFinite(createdId)) {
      setSelectedId(createdId);
    }
    setMessage("Ramassage cree.");
    setMessageType("success");
    await fetchData();
    await fetchOverdue();
  }

  async function sendReminder(id: number) {
    setSavingId(id);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch(`/api/direction/ramassages/${id}/send-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Relance impossible");
      setMessage("Relance client envoyee (si un contact etait disponible).");
      setMessageType("success");
      await fetchData();
      await fetchOverdue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur relance client.");
      setMessageType("error");
    } finally {
      setSavingId(null);
    }
  }

  async function reschedulePickup(id: number, currentDate: string) {
    const nextDate = window.prompt("Nouvelle date de ramassage (YYYY-MM-DD)", currentDate || "");
    if (!nextDate) return;
    setSavingId(id);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch(`/api/direction/ramassages/${id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateLivraison: nextDate }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Replanification impossible");
      setMessage("Ramassage replanifie.");
      setMessageType("success");
      await fetchData();
      await fetchOverdue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur replanification.");
      setMessageType("error");
    } finally {
      setSavingId(null);
    }
  }

  async function saveRamassageEdit() {
    if (!selected || !canEditRamassageDetails) return;
    const id = selected.id;
    setSavingId(id);
    setMessage("");
    setMessageType(null);
    const payErr = validatePaymentFormInput({
      paidFull: editForm.payment_paid_full,
      balanceDue: editForm.payment_balance_due,
      method: editForm.payment_method,
      note: editForm.payment_note,
    });
    if (payErr) {
      setMessage(payErr);
      setMessageType("error");
      setSavingId(null);
      return;
    }
    const embedded = embeddedFromFormInput({
      paidFull: editForm.payment_paid_full,
      balanceDue: editForm.payment_balance_due,
      method: editForm.payment_method,
      note: editForm.payment_note,
    });
    const commentaireOperationnel = mergeOperationalComment(
      editForm.commentaire_operationnel,
      editForm.notes,
      embedded
    );
    const companyContext = editForm.company_context.trim();
    if (!companyContext) {
      setMessage("Choisissez une compagnie.");
      setMessageType("error");
      setSavingId(null);
      return;
    }

    const adresse = editForm.adresse.trim() || RAMASSAGE_DEFAULT_PICKUP_ADDRESS;
    const patch: Record<string, unknown> = {
      client: editForm.client.trim(),
      adresse,
      item_location: editForm.item_location.trim() || null,
      date_livraison: editForm.date_livraison.trim() || null,
      heure_prevue: editForm.heure_prevue.trim() || null,
      dossier_id: editForm.dossier_id ? Number(editForm.dossier_id) : null,
      chauffeur_id: editForm.chauffeur_id ? Number(editForm.chauffeur_id) : null,
      company_context: companyContext,
      statut: editForm.statut.trim() || null,
      commentaire_operationnel: commentaireOperationnel,
    };
    try {
      const res = await fetch(`/api/livraisons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as {
        updated_row?: Row;
        error?: { message?: string };
      };
      if (!res.ok || !data.updated_row) {
        throw new Error(data.error?.message || "Enregistrement impossible.");
      }
      setRows((prev) => prev.map((r) => (Number(r.id) === id ? { ...r, ...data.updated_row } : r)));
      setEditingRamassage(false);
      setMessage("Ramassage enregistre.");
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur enregistrement.");
      setMessageType("error");
    } finally {
      setSavingId(null);
      await fetchData();
      await fetchOverdue();
    }
  }

  async function patchRamassageQuick(
    id: number,
    body: Record<string, unknown>,
    successMsg: string,
    loadingKey: string
  ) {
    setQuickActionLoading(loadingKey);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch(`/api/livraisons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        updated_row?: Row;
        error?: { message?: string };
      };
      if (!res.ok || !data.updated_row) {
        throw new Error(data.error?.message || "Action impossible.");
      }
      setRows((prev) => prev.map((r) => (Number(r.id) === id ? { ...r, ...data.updated_row } : r)));
      setMessage(successMsg);
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur.");
      setMessageType("error");
    } finally {
      setQuickActionLoading(null);
      await fetchData();
      await fetchOverdue();
    }
  }

  async function deleteRamassageApi(id: number) {
    setQuickActionLoading(`del:${id}`);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch(`/api/livraisons/${id}`, { method: "DELETE", credentials: "same-origin" });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        throw new Error(data.error?.message || "Suppression impossible.");
      }
      setMessage("Ramassage supprime.");
      setMessageType("success");
      if (selectedId === id) setSelectedId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur suppression.");
      setMessageType("error");
    } finally {
      setQuickActionLoading(null);
      await fetchData();
      await fetchOverdue();
    }
  }

  async function submitReplanForSelected() {
    if (!selected || !replanDate.trim()) {
      setMessage("Choisissez une date de replanification.");
      setMessageType("error");
      return;
    }
    setQuickActionLoading(`replan:${selected.id}`);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch(`/api/direction/ramassages/${selected.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateLivraison: replanDate.trim(),
          heurePrevue: replanHeure.trim() || undefined,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Replanification impossible.");
      setShowReplanSelected(false);
      setMessage("Ramassage replanifie.");
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur replanification.");
      setMessageType("error");
    } finally {
      setQuickActionLoading(null);
      await fetchData();
      await fetchOverdue();
    }
  }

  if (accessLoading || (canUseLivraisons && loading)) {
    return <TagoraLoadingScreen isLoading message="Chargement de votre espace..." fullScreen />;
  }

  if (!user) return null;

  if (!canUseLivraisons) {
    return (
      <main className="page-container livraison-page">
        <HeaderTagora title="Livraison & ramassage" subtitle="" showNavigation={false} />
        <AccessNotice description="Permission livraisons requise." />
      </main>
    );
  }

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
      <div className="livraison-toolbar-stack">
        <div className="livraison-segmented-bar" aria-label="Navigation livraisons et ramassages">
          <div className="livraison-segmented" role="tablist">
            <Link href="/direction/livraisons" className="livraison-segment">
              Livraisons
            </Link>
            <Link href="/direction/ramassages" aria-current="page" className="livraison-segment livraison-segment--active">
              Ramassages
            </Link>
            <Link href="/direction/livraisons/archives" className="livraison-segment">
              Archives
            </Link>
          </div>
        </div>
        <div className="livraison-actions-bar" role="toolbar" aria-label="Actions ramassages">
          <div className="livraison-actions-bar__main">
            <button
              type="button"
              className={`livraison-btn livraison-btn--primary${showCreateForm ? " livraison-btn--pressed" : ""}`}
              onClick={() => {
                setShowCreateForm(true);
                setMessage("");
                setMessageType(null);
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
          <button
            type="button"
            className="livraison-btn livraison-btn--ghost livraison-actions-bar__refresh"
            onClick={() => void fetchData()}
          >
            Actualiser
          </button>
        </div>
      </div>

      <FeedbackMessage message={message} type={messageType} />

      {canViewAlertSettings ? (
        <section className="tagora-panel" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 6 }}>
              Parametres alertes ramassage
            </h2>
            <p className="ui-text-muted" style={{ margin: 0 }}>
              Configuration du delai et actualisation des alertes direction.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {isAdmin ? (
              <>
                <label className="ui-text-muted" style={{ fontSize: 12 }}>
                  Delai (jours)
                </label>
                <input
                  type="number"
                  min={1}
                  value={delayDays}
                  onChange={(e) => setDelayDays(Number(e.target.value || 2))}
                  className="tagora-input"
                  style={{ width: 88 }}
                />
                <label className="ui-text-muted" style={{ fontSize: 12 }}>
                  Alerte avant (jours)
                </label>
                <input
                  type="number"
                  min={0}
                  value={warningDays}
                  onChange={(e) => setWarningDays(Number(e.target.value || 1))}
                  className="tagora-input"
                  style={{ width: 88 }}
                />
                <button type="button" className="tagora-dark-outline-action" onClick={() => void saveOverdueConfig()} disabled={configSaving}>
                  {configSaving ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </>
            ) : (
              <span className="ui-text-muted" style={{ fontSize: 13 }}>
                Delai actuel: {delayDays} jour(s) | Alerte avant: {warningDays} jour(s)
              </span>
            )}
            <button type="button" className="tagora-dark-outline-action" onClick={() => void fetchOverdue()} disabled={overdueLoading}>
              {overdueLoading ? "..." : "Actualiser alertes"}
            </button>
          </div>
        </div>
        </section>
      ) : null}

      {overdueItems.length > 0 ? (
        <section className="tagora-panel" style={{ marginTop: 12 }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 6 }}>
              Commandes non ramassees
            </h2>
            <p className="ui-text-muted" style={{ margin: 0 }}>
              Priorite direction: commandes en retard ou proches du delai.
            </p>
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {overdueItems.slice(0, 8).map((item) => {
              const bg =
                item.severity === "overdue"
                  ? "rgba(254, 242, 242, 0.96)"
                  : item.severity === "warning"
                    ? "rgba(255, 247, 237, 0.96)"
                    : "rgba(248, 250, 252, 0.96)";
              const border =
                item.severity === "overdue"
                  ? "#ef4444"
                  : item.severity === "warning"
                    ? "#f97316"
                    : "#cbd5e1";
              return (
                <article
                  key={item.id}
                  style={{
                    border: `1px solid ${border}`,
                    borderRadius: 12,
                    background: bg,
                    padding: 12,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>{item.client || `Ramassage #${item.id}`}</strong>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: 999,
                        padding: "2px 8px",
                        border: `1px solid ${border}`,
                        color: item.severity === "overdue" ? "#b91c1c" : item.severity === "warning" ? "#c2410c" : "#334155",
                        background: "#ffffff",
                      }}
                    >
                      {item.severity === "overdue" ? `En retard de ${item.lateDays} jour(s)` : "A relancer bientot"}
                    </span>
                  </div>
                  <div className="ui-text-muted">
                    Commande: {item.commande || "-"} | Facture: {item.facture || "-"} | Date prevue: {item.expectedDate || "-"}
                  </div>
                  <div className="ui-text-muted">
                    Statut: {item.status || "-"} | Telephone: {item.phone || "-"} | Courriel: {item.email || "-"}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="tagora-dark-outline-action"
                      disabled={savingId === item.id}
                      onClick={() => void sendReminder(item.id)}
                    >
                      Relancer client
                    </button>
                    <button
                      type="button"
                      className="tagora-dark-outline-action"
                      disabled={savingId === item.id}
                      onClick={() => void reschedulePickup(item.id, item.expectedDate)}
                    >
                      Replanifier
                    </button>
                    <button
                      type="button"
                      className="tagora-dark-outline-action"
                      disabled={savingId === item.id}
                      onClick={() => void updatePickupStatus(item.id, "ramasse")}
                    >
                      Marquer comme ramasse
                    </button>
                    <Link
                      href={`/direction/livraisons/archives?search=${encodeURIComponent(item.commande || item.client || String(item.id))}`}
                      className="tagora-dark-outline-action"
                    >
                      Voir dossier
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {showCreateForm ? (
        <section className="tagora-panel" style={{ marginTop: 24 }}>
          <h2 className="section-title" style={{ marginBottom: 18 }}>
            Nouveau ramassage
          </h2>
          <form onSubmit={handleCreatePickup} className="tagora-form-grid">
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
              <span className="tagora-label">Adresse de ramassage</span>
              <input
                type="text"
                value={newForm.adresse}
                onChange={(e) => setNewForm({ ...newForm, adresse: e.target.value })}
                className="tagora-input"
                placeholder={RAMASSAGE_DEFAULT_PICKUP_ADDRESS}
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Emplacement de l&apos;item à remettre au client</span>
              <input
                type="text"
                value={newForm.item_location}
                onChange={(e) => setNewForm({ ...newForm, item_location: e.target.value })}
                className="tagora-input"
                placeholder="Ex.: Entrepôt A, Étagère 3, Bureau réception…"
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Date prevue</span>
              <input
                type="date"
                value={newForm.date_livraison}
                onChange={(e) => setNewForm({ ...newForm, date_livraison: e.target.value })}
                className="tagora-input"
                required
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Heure prevue</span>
              <input
                type="time"
                value={newForm.heure_prevue}
                onChange={(e) => setNewForm({ ...newForm, heure_prevue: e.target.value })}
                className="tagora-input"
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Dossier lie (optionnel)</span>
              <select
                value={newForm.dossier_id}
                onChange={(e) => setNewForm({ ...newForm, dossier_id: e.target.value })}
                className="tagora-input"
              >
                <option value="">Aucun dossier (creation sans dossier)</option>
                {dossiers.map((dossier) => (
                  <option key={String(dossier.id)} value={String(dossier.id)}>
                    {getDossierLabel(dossier)}
                  </option>
                ))}
              </select>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Compagnie</span>
              <select
                value={newForm.company_context}
                onChange={(e) =>
                  setNewForm({
                    ...newForm,
                    company_context: e.target.value as AccountRequestCompany | "",
                  })
                }
                className="tagora-input"
                required
              >
                <option value="">Choisir une compagnie</option>
                {ACCOUNT_REQUEST_COMPANIES.map((company) => (
                  <option key={company.value} value={company.value}>
                    {company.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Representant</span>
              <select
                value={newForm.chauffeur_id}
                onChange={(e) => setNewForm({ ...newForm, chauffeur_id: e.target.value })}
                className="tagora-input"
              >
                <option value="">Aucun representant</option>
                {chauffeursPourRamassage.map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {getPersonLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Statut initial</span>
              <select
                value={newForm.statut}
                onChange={(e) =>
                  setNewForm({
                    ...newForm,
                    statut: e.target.value,
                  })
                }
                className="tagora-input"
              >
                <option value="planifiee">Planifie</option>
                <option value="pret_a_ramasser">Pret a ramasser</option>
              </select>
            </label>
            <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
              <span className="tagora-label">Commentaire opérationnel</span>
              <textarea
                value={newForm.commentaire_operationnel}
                onChange={(e) => setNewForm({ ...newForm, commentaire_operationnel: e.target.value })}
                className="tagora-textarea"
                rows={2}
                placeholder="Contexte interne (le bloc Paiement enregistre l’état de paiement)."
              />
            </label>
            <div style={{ gridColumn: "1 / -1" }}>
              <PaymentClientFormSection
                idPrefix="ram-new"
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
                disabled={creating}
              />
            </div>
            <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
              <span className="tagora-label">Notes</span>
              <textarea
                value={newForm.notes}
                onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                className="tagora-textarea"
                placeholder="Notes de ramassage"
              />
            </label>
            <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="tagora-dark-action" disabled={creating}>
                {creating ? "Creation..." : "Creer ramassage"}
              </button>
              <button
                type="button"
                className="tagora-dark-outline-action"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewForm(createPickupForm());
                }}
                disabled={creating}
              >
                Annuler
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="tagora-panel livraison-metrics-panel">
        <h2 className="livraison-metrics-panel__title">Indicateurs ramassage</h2>
        <div className="livraison-metrics-panel__grid">
          <SectionCard title="Pret a ramasser" subtitle={String(indicators.pret)} />
          <SectionCard title="Planifies" subtitle={String(indicators.planifie)} />
          <SectionCard title="En cours" subtitle={String(indicators.enCours)} />
          <SectionCard title="Ramasses" subtitle={String(indicators.ramasse)} />
          <SectionCard title="Non ramasses" subtitle={String(indicators.nonRamasse)} />
          <SectionCard title="A replanifier" subtitle={String(indicators.replanifier)} />
          <SectionCard title="En retard" subtitle={String(indicators.enRetard)} />
        </div>
      </section>

      <section className="tagora-panel livraison-calendar-card">
        <header className="livraison-calendar-card__header">
          <div>
            <h2 className="section-title livraison-calendar-card__title">Ramassages planifies</h2>
            {viewMode === "calendrier" ? (
              <p className="livraison-calendar-card__subtitle">
                Vue mensuelle : cliquez un jour pour ouvrir la journée livraison & ramassage, ou un ramassage pour le
                détail opérationnel.
              </p>
            ) : (
              <p className="livraison-calendar-card__subtitle">
                Filtrez par statut, sélectionnez une fiche dans la liste, puis utilisez les actions rapides.
              </p>
            )}
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PickupFilter)}
            className="tagora-input"
          >
            <option value="">Tous les statuts</option>
            <option value="pret_a_ramasser">Pret a ramasser</option>
            <option value="planifie">Planifie</option>
            <option value="en_cours">En cours</option>
            <option value="ramasse">Ramasse</option>
            <option value="non_ramasse">Non ramasse</option>
            <option value="a_replanifier">A replanifier</option>
            <option value="en_retard">En retard de ramassage</option>
          </select>
        </div>

        {viewMode === "calendrier" ? (
          <>
            <div className="livraison-cal-nav" aria-label="Navigation calendrier ramassages">
              <button
                type="button"
                className="livraison-cal-nav-btn"
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
              >
                ← Mois prec
              </button>
              <h3 className="livraison-cal-month">{monthLabel(calendarDate)}</h3>
              <button
                type="button"
                className="livraison-cal-nav-btn"
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
              >
                Mois suiv →
              </button>
            </div>
            <div className="livraison-cal-weekdays">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
                <div key={day} className="livraison-cal-weekday">
                  {day}
                </div>
              ))}
            </div>
            <div className="livraison-cal-grid">
              {getDaysForMonth().map((day, index) => {
                const isoDate = day ? getDateIsoForDay(day) : "";
                const entries = day ? listOrdered.filter((entry) => entry.date === isoDate) : [];
                return (
                  <div
                    key={`${isoDate}-${index}`}
                    className={day ? "livraison-cal-cell" : "livraison-cal-cell livraison-cal-cell--empty"}
                  >
                    {day ? (
                      <Link href={`/direction/ramassages/jour?date=${isoDate}`} className="livraison-cal-daynum">
                        {day}
                      </Link>
                    ) : null}
                    <div className="livraison-cal-events">
                      {entries.slice(0, 3).map((entry) => (
                        <Link
                          key={entry.id}
                          href={`/direction/ramassages/jour?date=${isoDate}`}
                          className={pickupCalendarEventClass(entry.status)}
                        >
                          {String(entry.item.client || `#${entry.id}`)}
                        </Link>
                      ))}
                      {entries.length > 3 ? (
                        <div className="livraison-cal-more">+{entries.length - 3} autre(s)</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="ui-stack-sm">
            {listOrdered.length === 0 ? (
              <AppCard tone="muted">
                <span className="ui-text-muted">Aucun ramassage pour ce filtre.</span>
              </AppCard>
            ) : (
              listOrdered.map((entry, index) => {
                const dossierId = Number(entry.item.dossier_id);
                const dossier = Number.isFinite(dossierId) ? dossiersById.get(dossierId) : undefined;
                return (
                  <AppCard
                    key={entry.id}
                    className="ui-stack-sm"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(entry.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(entry.id);
                      }
                    }}
                    style={{
                      border:
                        selectedId === entry.id
                          ? "2px solid #0f2948"
                          : entry.isOverdue
                            ? "1px solid #ef4444"
                            : "1px solid #e2e8f0",
                      background: entry.isOverdue ? "rgba(254, 242, 242, 0.95)" : undefined,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <strong>{String(entry.item.client || `Ramassage #${entry.id}`)}</strong>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {entry.isOverdue ? (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#b91c1c",
                              border: "1px solid #b91c1c",
                              borderRadius: 999,
                              padding: "2px 8px",
                            }}
                          >
                            RETARD
                          </span>
                        ) : null}
                        {entry.status === "pret_a_ramasser" ? (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#0f2948",
                              border: "1px solid #0f2948",
                              borderRadius: 999,
                              padding: "2px 8px",
                            }}
                          >
                            PRIORITE
                          </span>
                        ) : null}
                        <StatusBadge
                          label={getPickupStatusLabel(entry.status)}
                          tone={getPickupStatusTone(entry.status)}
                        />
                      </div>
                    </div>
                    <div className="ui-text-muted" style={{ fontWeight: 600 }}>
                      Ordre de ramassage: {index + 1}
                    </div>
                    <div className="ui-text-muted">
                      Date: {String(entry.item.date_livraison || "-")} | Heure: {String(entry.item.heure_prevue || "-")}
                    </div>
                    <div className="ui-text-muted">
                      Dossier: {dossier ? String(dossier.nom || `#${dossierId}`) : (Number.isFinite(dossierId) ? `#${dossierId}` : "-")}
                    </div>
                    <div
                      style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        disabled={savingId === entry.id}
                        onClick={() => void updatePickupStatus(entry.id, "pret_a_ramasser")}
                      >
                        Pret a ramasser
                      </button>
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        disabled={savingId === entry.id}
                        onClick={() => void updatePickupStatus(entry.id, "en_cours")}
                      >
                        En cours
                      </button>
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        disabled={savingId === entry.id}
                        onClick={() => void updatePickupStatus(entry.id, "ramasse")}
                      >
                        Ramasse
                      </button>
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        disabled={savingId === entry.id}
                        onClick={() => void updatePickupStatus(entry.id, "a_replanifier")}
                      >
                        A replanifier
                      </button>
                    </div>
                  </AppCard>
                );
              })
            )}
          </div>
        )}
      </section>

      {selected ? (
        <section className="tagora-panel ui-stack-xs day-ops-detail-shell" style={{ marginTop: 20 }}>
          <h2 className="section-title day-ops-section-title" style={{ marginBottom: 14 }}>
            Détail ramassage #{selected.id}
          </h2>

          <PaymentDetailBanner payment={parsePaymentFromRow(selected.item as Record<string, unknown>)} />

          <div className="day-ops-detail-grid">
            <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
              <div style={{ display: "grid", gap: 2 }}>
                <span className="ui-text-muted" style={{ fontSize: 12 }}>
                  Client
                </span>
                <strong style={{ fontSize: 15 }}>{String(selected.item.client || "-")}</strong>
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                <span className="ui-text-muted" style={{ fontSize: 12 }}>
                  Adresse de ramassage
                </span>
                <span>{RAMASSAGE_DEFAULT_PICKUP_ADDRESS}</span>
              </div>
              {(() => {
                const raw = pickupRowFieldString(selected.item, ["adresse", "address", "rue"]);
                if (!raw || raw === RAMASSAGE_DEFAULT_PICKUP_ADDRESS) return null;
                return (
                  <div style={{ display: "grid", gap: 2 }}>
                    <span className="ui-text-muted" style={{ fontSize: 12 }}>
                      Adresse optionnelle (si différente)
                    </span>
                    <span>{raw}</span>
                  </div>
                );
              })()}
              <div style={{ display: "grid", gap: 2 }}>
                <span className="ui-text-muted" style={{ fontSize: 12 }}>
                  Emplacement de l&apos;item à remettre au client
                </span>
                <span>
                  {pickupRowFieldString(selected.item, ["item_location"]) || "Non renseigné"}
                </span>
              </div>
              <div className="day-ops-detail-stat-row">
                <strong>Statut :</strong>{" "}
                <StatusBadge
                  label={getPickupStatusLabel(selected.status)}
                  tone={getPickupStatusTone(selected.status)}
                />
              </div>
            </AppCard>

            <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
              {(() => {
                const row = selected.item;
                const createdBy = pickupRowFieldString(row, ["created_by_name"]);
                const createdAtRaw = row.created_at;
                const creeLeFmt = formatAuditTimestamp(createdAtRaw);
                const updatedBy = pickupRowFieldString(row, ["updated_by_name"]);
                const updatedAtRaw = row.updated_at;
                const modLeFmt = formatAuditTimestamp(updatedAtRaw);
                const createdAtNorm = String(createdAtRaw ?? "").trim();
                const updatedAtNorm = String(updatedAtRaw ?? "").trim();
                const showLastMod =
                  updatedBy.length > 0 ||
                  (modLeFmt.trim().length > 0 &&
                    updatedAtNorm.length > 0 &&
                    updatedAtNorm !== createdAtNorm);
                return (
                  <div className="day-ops-detail-trace" aria-label="Traçabilité">
                    <div className="day-ops-detail-stat-row day-ops-detail-trace-row">
                      <strong>Créé par :</strong> <span>{createdBy || AUDIT_NON_RENSEIGNE}</span>
                    </div>
                    <div className="day-ops-detail-stat-row day-ops-detail-trace-row">
                      <strong>Créé le :</strong> <span>{creeLeFmt.trim() || AUDIT_NON_RENSEIGNE}</span>
                    </div>
                    {showLastMod ? (
                      <>
                        <div className="day-ops-detail-stat-row day-ops-detail-trace-row">
                          <strong>Dernière modification par :</strong>{" "}
                          <span>{updatedBy || AUDIT_NON_RENSEIGNE}</span>
                        </div>
                        <div className="day-ops-detail-stat-row day-ops-detail-trace-row">
                          <strong>Dernière modification :</strong>{" "}
                          <span>{modLeFmt.trim() || AUDIT_NON_RENSEIGNE}</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })()}
            </AppCard>
          </div>

          {canEditRamassageDetails ? (
            <AppCard tone="muted" className="day-ops-quick-actions-card ui-stack-xs" style={{ padding: 12 }}>
              <strong className="day-ops-quick-actions-title">Actions rapides</strong>
              <div className="day-ops-quick-actions">
                <button
                  type="button"
                  className="tagora-dark-outline-action day-ops-compact-btn"
                  disabled={savingId === selected.id}
                  onClick={() => {
                    setEditingRamassage(true);
                    setShowReplanSelected(false);
                    setMessage("");
                    setMessageType(null);
                  }}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="tagora-dark-outline-action day-ops-compact-btn"
                  disabled={quickActionLoading === `replan:${selected.id}` || savingId === selected.id}
                  onClick={() => {
                    setShowReplanSelected(true);
                    setEditingRamassage(false);
                    setReplanDate(String(selected.item.date_livraison || "").slice(0, 10));
                    setReplanHeure(normalizeTimeShort(selected.item.heure_prevue));
                    setMessage("");
                    setMessageType(null);
                  }}
                >
                  Replanifier
                </button>
                <button
                  type="button"
                  className="tagora-dark-outline-action day-ops-compact-btn"
                  disabled={quickActionLoading === `annuler:${selected.id}` || savingId === selected.id}
                  onClick={() => {
                    if (!window.confirm("Annuler cette opération ? Le statut passera à annulée.")) return;
                    void patchRamassageQuick(
                      selected.id,
                      { statut: "annulee" },
                      "Ramassage annulé.",
                      `annuler:${selected.id}`
                    );
                  }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="tagora-dark-outline-action day-ops-compact-btn"
                  disabled={quickActionLoading === `ramasse:${selected.id}` || savingId === selected.id}
                  onClick={() => beginRamassageFinalize(selected.id)}
                >
                  Marquer ramassé
                </button>
                <button
                  type="button"
                  className="tagora-dark-outline-action day-ops-compact-btn"
                  disabled={quickActionLoading === `del:${selected.id}` || savingId === selected.id}
                  onClick={() => {
                    if (!window.confirm("Confirmer la suppression de ce ramassage ?")) return;
                    void deleteRamassageApi(selected.id);
                  }}
                >
                  Supprimer
                </button>
                <Link
                  href={`/direction/ramassages/jour?date=${encodeURIComponent(String(selected.item.date_livraison || todayIso))}&focusStop=${selected.id}&manualMap=1`}
                  className="tagora-dark-outline-action day-ops-compact-btn"
                  style={{ textDecoration: "none" }}
                >
                  Définir position carte
                </Link>
              </div>

              {showReplanSelected ? (
                <div
                  className="tagora-panel-muted"
                  style={{
                    marginTop: 12,
                    padding: 12,
                    display: "grid",
                    gap: 10,
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                  }}
                >
                  <span className="tagora-label">Nouvelle date</span>
                  <input
                    type="date"
                    className="tagora-input"
                    value={replanDate}
                    onChange={(e) => setReplanDate(e.target.value)}
                  />
                  <span className="tagora-label">Nouvelle heure (optionnel)</span>
                  <input
                    type="time"
                    className="tagora-input"
                    value={replanHeure}
                    onChange={(e) => setReplanHeure(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="tagora-dark-action day-ops-compact-btn"
                      disabled={quickActionLoading === `replan:${selected.id}`}
                      onClick={() => void submitReplanForSelected()}
                    >
                      {quickActionLoading === `replan:${selected.id}` ? "Enregistrement..." : "Enregistrer replanification"}
                    </button>
                    <button
                      type="button"
                      className="tagora-dark-outline-action day-ops-compact-btn"
                      onClick={() => setShowReplanSelected(false)}
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              ) : null}
            </AppCard>
          ) : null}

          {editingRamassage && canEditRamassageDetails ? (
            <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
              <strong className="day-ops-quick-actions-title">Modifier le ramassage</strong>
              <div style={{ marginBottom: 12 }}>
                <PaymentDetailBanner
                  payment={embeddedFromFormInput({
                    paidFull: editForm.payment_paid_full,
                    balanceDue: editForm.payment_balance_due,
                    method: editForm.payment_method,
                    note: editForm.payment_note,
                  })}
                />
              </div>
              <div className="tagora-form-grid">
                <label className="tagora-field">
                  <span className="tagora-label">Client</span>
                  <input
                    type="text"
                    className="tagora-input"
                    value={editForm.client}
                    onChange={(e) => setEditForm({ ...editForm, client: e.target.value })}
                  />
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Adresse de ramassage</span>
                  <input
                    type="text"
                    className="tagora-input"
                    value={editForm.adresse}
                    onChange={(e) => setEditForm({ ...editForm, adresse: e.target.value })}
                    placeholder={RAMASSAGE_DEFAULT_PICKUP_ADDRESS}
                  />
                </label>
                <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                  <span className="tagora-label">Emplacement de l&apos;item à remettre au client</span>
                  <input
                    type="text"
                    className="tagora-input"
                    value={editForm.item_location}
                    onChange={(e) => setEditForm({ ...editForm, item_location: e.target.value })}
                    placeholder="Ex.: Entrepôt A, Étagère 3…"
                  />
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Date prévue</span>
                  <input
                    type="date"
                    className="tagora-input"
                    value={editForm.date_livraison}
                    onChange={(e) => setEditForm({ ...editForm, date_livraison: e.target.value })}
                  />
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Heure prévue</span>
                  <input
                    type="time"
                    className="tagora-input"
                    value={editForm.heure_prevue}
                    onChange={(e) => setEditForm({ ...editForm, heure_prevue: e.target.value })}
                  />
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Dossier lié (optionnel)</span>
                  <select
                    className="tagora-input"
                    value={editForm.dossier_id}
                    onChange={(e) => setEditForm({ ...editForm, dossier_id: e.target.value })}
                  >
                    <option value="">Aucun dossier</option>
                    {dossiers.map((dossier) => (
                      <option key={String(dossier.id)} value={String(dossier.id)}>
                        {getDossierLabel(dossier)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Compagnie</span>
                  <select
                    className="tagora-input"
                    value={editForm.company_context}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        company_context: e.target.value as AccountRequestCompany | "",
                      })
                    }
                    required
                  >
                    <option value="">Choisir une compagnie</option>
                    {ACCOUNT_REQUEST_COMPANIES.map((company) => (
                      <option key={company.value} value={company.value}>
                        {company.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Représentant</span>
                  <select
                    className="tagora-input"
                    value={editForm.chauffeur_id}
                    onChange={(e) => setEditForm({ ...editForm, chauffeur_id: e.target.value })}
                  >
                    <option value="">Aucun représentant</option>
                    {chauffeursPourEditRamassage.map((item) => (
                      <option key={String(item.id)} value={String(item.id)}>
                        {getPersonLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Statut</span>
                  <select
                    className="tagora-input"
                    value={editForm.statut}
                    onChange={(e) => setEditForm({ ...editForm, statut: e.target.value })}
                  >
                    <option value="planifiee">Planifiée</option>
                    <option value="pret_a_ramasser">Prêt à ramasser</option>
                    <option value="en_cours">En cours</option>
                    <option value="livree">Livrée (ramassage effectué)</option>
                    <option value="ramassee">Ramassée</option>
                    <option value="a_replanifier">À replanifier</option>
                    <option value="annulee">Annulée</option>
                  </select>
                </label>
                <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                  <span className="tagora-label">Commentaire opérationnel</span>
                  <textarea
                    className="tagora-textarea"
                    value={editForm.commentaire_operationnel}
                    onChange={(e) =>
                      setEditForm({ ...editForm, commentaire_operationnel: e.target.value })
                    }
                    rows={2}
                  />
                </label>
                <div style={{ gridColumn: "1 / -1" }}>
                  <PaymentClientFormSection
                    idPrefix={`ram-edit-${selected.id}`}
                    value={{
                      paidFull: editForm.payment_paid_full,
                      balanceDue: editForm.payment_balance_due,
                      method: editForm.payment_method,
                      note: editForm.payment_note,
                    }}
                    onChange={(next) =>
                      setEditForm({
                        ...editForm,
                        payment_paid_full: next.paidFull,
                        payment_balance_due: next.balanceDue,
                        payment_method: next.method,
                        payment_note: next.note,
                      })
                    }
                    disabled={savingId === selected.id}
                  />
                </div>
                <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
                  <span className="tagora-label">Notes</span>
                  <textarea
                    className="tagora-textarea"
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    rows={3}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button
                  type="button"
                  className="tagora-dark-action day-ops-compact-btn"
                  disabled={savingId === selected.id}
                  onClick={() => void saveRamassageEdit()}
                >
                  {savingId === selected.id ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button
                  type="button"
                  className="tagora-dark-outline-action day-ops-compact-btn"
                  disabled={savingId === selected.id}
                  onClick={() => setEditingRamassage(false)}
                >
                  Fermer
                </button>
              </div>
            </AppCard>
          ) : null}

          <OperationProofsPanel
            moduleSource="ramassage"
            sourceId={selected.id}
            categorieParDefaut="preuve_ramassage_direction"
            titre="Documents et preuves du ramassage"
            commentairePlaceholder="Commentaire ramassage"
          />
          <InternalMentionsPanel
            entityType="ramassage"
            entityId={selected.id}
            recipients={chauffeursPourMentionsRamassage.map((item) => ({
              id: Number(item.id),
              name: getPersonLabel(item),
              email: typeof item.courriel === "string" ? item.courriel : null,
              active: true,
            }))}
            context={{
              title: String(selected.item.client || ""),
              client: String(selected.item.client || ""),
              commande: String(selected.item.numero_commande || selected.item.commande || ""),
              facture: String(selected.item.numero_facture || selected.item.facture || ""),
              date: String(selected.item.date_livraison || ""),
              linkPath: `/direction/ramassages`,
            }}
          />
        </section>
      ) : null}
      <PaymentFinalizeModal
        open={finalizeRamassageOpen}
        kind="ramassage"
        balanceDue={finalizeRamassageBalance}
        loading={finalizeLoading}
        method={finalizeMethod}
        confirmChecked={finalizeAck}
        onMethodChange={setFinalizeMethod}
        onConfirmChange={setFinalizeAck}
        onCancel={() => {
          if (!finalizeLoading) {
            setFinalizeRamassageOpen(false);
            setFinalizeRamassageId(null);
            setFinalizeMethod("");
            setFinalizeAck(false);
          }
        }}
        onSubmit={() => void submitFinalizeRamassageFromModal()}
      />
    </main>
  );
}

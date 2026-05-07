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

type Row = Record<string, string | number | null | undefined>;

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
  date_livraison: string;
  heure_prevue: string;
  dossier_id: string;
  chauffeur_id: string;
  statut: "planifiee" | "pret_a_ramasser";
  notes: string;
};

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
    adresse: "",
    date_livraison: "",
    heure_prevue: "",
    dossier_id: "",
    chauffeur_id: "",
    statut: "planifiee",
    notes: "",
  };
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
  const [viewMode, setViewMode] = useState<"liste" | "calendrier">("liste");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<PickupFilter>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [overdueItems, setOverdueItems] = useState<OverdueItem[]>([]);
  const [overdueLoading, setOverdueLoading] = useState(false);
  const [delayDays, setDelayDays] = useState(2);
  const [warningDays, setWarningDays] = useState(1);
  const [configSaving, setConfigSaving] = useState(false);

  const todayIso = toIsoDate(new Date());

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
      setMessage(`Erreur chargement ramassages: ${ramassagesRes.error.message}`);
      setMessageType("error");
    } else {
      const nextRows = (ramassagesRes.data ?? []) as Row[];
      setRows(nextRows);
      if (selectedId == null && nextRows.length > 0) {
        setSelectedId(Number(nextRows[0].id));
      }
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
  }, [selectedId]);

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
    setSavingId(id);
    setMessage("");
    setMessageType(null);

    const payload: Record<string, unknown> = {};
    if (nextStatus === "ramasse") payload.statut = "livree";
    else if (nextStatus === "planifie") payload.statut = "planifiee";
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

  async function handleCreatePickup(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    setMessageType(null);

    const payload: Record<string, unknown> = {
      type_operation: "ramassage_client",
      client: newForm.client.trim(),
      adresse: newForm.adresse.trim() || null,
      date_livraison: newForm.date_livraison,
      heure_prevue: newForm.heure_prevue || null,
      dossier_id: newForm.dossier_id ? Number(newForm.dossier_id) : null,
      chauffeur_id: newForm.chauffeur_id ? Number(newForm.chauffeur_id) : null,
      statut: newForm.statut,
      notes: newForm.notes.trim() || null,
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

  if (accessLoading || (canUseLivraisons && loading)) {
    return <TagoraLoadingScreen isLoading message="Chargement de votre espace..." fullScreen />;
  }

  if (!user) return null;

  if (!canUseLivraisons) {
    return (
      <main className="page-container">
        <HeaderTagora title="Calendrier ramassages" subtitle="Acces requis" />
        <AccessNotice description="Permission livraisons requise." />
      </main>
    );
  }

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
  const pageTitle = viewMode === "liste" ? "Ramassages" : "Calendrier ramassages";
  const headerActions = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <Link href="/direction/livraisons" className="tagora-dark-outline-action">
        Livraisons
      </Link>
      <Link href="/direction/ramassages" className="tagora-dark-outline-action">
        Ramassages
      </Link>
      <Link href="/direction/livraisons/archives" className="tagora-dark-outline-action">
        Archives
      </Link>
      <Link href="/direction/dashboard" className="tagora-dark-action">
        Tableau de bord direction
      </Link>
    </div>
  );

  return (
    <main className="page-container">
      <HeaderTagora
        title={pageTitle}
        subtitle=""
        showNavigation={false}
        actions={headerActions}
      />
      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            style={{ ...actionButtonBase, ...getButtonTone(showCreateForm) }}
          >
            Creer
          </button>
          <button
            type="button"
            onClick={() => setViewMode("liste")}
            style={{ ...actionButtonBase, ...getButtonTone(viewMode === "liste") }}
          >
            Liste
          </button>
          <button
            type="button"
            onClick={() => setViewMode("calendrier")}
            style={{ ...actionButtonBase, ...getButtonTone(viewMode === "calendrier") }}
          >
            Calendrier
          </button>
          <button
            type="button"
            onClick={() => void fetchData()}
            style={{ ...actionButtonBase, ...getButtonTone(false) }}
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
        <section className="tagora-panel" style={{ marginTop: 16 }}>
          <h2 className="section-title" style={{ marginBottom: 14 }}>
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
              <span className="tagora-label">Adresse</span>
              <input
                type="text"
                value={newForm.adresse}
                onChange={(e) => setNewForm({ ...newForm, adresse: e.target.value })}
                className="tagora-input"
                placeholder="Adresse de ramassage"
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
              <span className="tagora-label">Representant</span>
              <select
                value={newForm.chauffeur_id}
                onChange={(e) => setNewForm({ ...newForm, chauffeur_id: e.target.value })}
                className="tagora-input"
              >
                <option value="">Aucun representant</option>
                {chauffeurs.map((item) => (
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
                    statut: e.target.value as PickupCreateFormState["statut"],
                  })
                }
                className="tagora-input"
              >
                <option value="planifiee">Planifie</option>
                <option value="pret_a_ramasser">Pret a ramasser</option>
              </select>
            </label>
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

      <div className="ui-grid-auto" style={{ marginTop: 16 }}>
        <SectionCard title="Pret a ramasser" subtitle={String(indicators.pret)} />
        <SectionCard title="Planifies" subtitle={String(indicators.planifie)} />
        <SectionCard title="En cours" subtitle={String(indicators.enCours)} />
        <SectionCard title="Ramasses" subtitle={String(indicators.ramasse)} />
        <SectionCard title="Non ramasses" subtitle={String(indicators.nonRamasse)} />
        <SectionCard title="A replanifier" subtitle={String(indicators.replanifier)} />
        <SectionCard title="En retard" subtitle={String(indicators.enRetard)} />
      </div>

      <section className="tagora-panel" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PickupFilter)}
            className="tagora-input"
            style={{ maxWidth: 240 }}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <button
                type="button"
                className="tagora-dark-outline-action"
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
              >
                ← Mois prec
              </button>
              <strong style={{ textTransform: "capitalize" }}>{monthLabel(calendarDate)}</strong>
              <button
                type="button"
                className="tagora-dark-outline-action"
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
              >
                Mois suiv →
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 8 }}>
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
                <div key={day} style={{ textAlign: "center", fontWeight: 700, fontSize: 12 }}>
                  {day}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
              {getDaysForMonth().map((day, index) => {
                const isoDate = day ? getDateIsoForDay(day) : "";
                const entries = day ? listOrdered.filter((entry) => entry.date === isoDate) : [];
                return (
                  <div
                    key={`${isoDate}-${index}`}
                    style={{
                      minHeight: 110,
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 8,
                      background: day ? "#fff" : "#f8fafc",
                    }}
                  >
                    {day ? (
                      <Link
                        href={`/direction/livraisons/jour?date=${isoDate}`}
                        className="tagora-dark-outline-action"
                        style={{ width: "fit-content", padding: "2px 8px", marginBottom: 6 }}
                      >
                        {day}
                      </Link>
                    ) : null}
                    <div style={{ display: "grid", gap: 4 }}>
                      {entries.slice(0, 3).map((entry) => (
                        <Link
                          key={entry.id}
                          href={`/direction/livraisons/jour?date=${isoDate}`}
                          className="tagora-dark-outline-action"
                          style={{ textAlign: "left", padding: "4px 8px", fontSize: 11 }}
                        >
                          {String(entry.item.client || `#${entry.id}`)}
                        </Link>
                      ))}
                      {entries.length > 3 ? (
                        <span className="ui-text-muted" style={{ fontSize: 11 }}>
                          +{entries.length - 3} autre(s)
                        </span>
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
                    style={{
                      border: entry.isOverdue ? "1px solid #ef4444" : "1px solid #e2e8f0",
                      background: entry.isOverdue ? "rgba(254, 242, 242, 0.95)" : undefined,
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
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
        <section className="tagora-panel" style={{ marginTop: 20 }}>
          <h2 className="section-title" style={{ marginBottom: 14 }}>
            Detail ramassage #{selected.id}
          </h2>
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
    </main>
  );
}

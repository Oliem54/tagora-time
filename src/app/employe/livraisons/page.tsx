"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { useCurrentAccess } from "../../hooks/useCurrentAccess";
import {
  getCompanyLabel,
  type AccountRequestCompany,
} from "../../lib/account-requests.shared";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import StatCard from "@/app/components/ui/StatCard";
import AppCard from "@/app/components/ui/AppCard";
import InfoRow from "@/app/components/ui/InfoRow";
import FormField from "@/app/components/ui/FormField";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import StatusBadge from "@/app/components/ui/StatusBadge";
import OperationProofsPanel, { type ModuleSource } from "@/app/components/proofs/OperationProofsPanel";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";

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
  type_operation?: string | null;
  company_context?: AccountRequestCompany | null;
  company?: AccountRequestCompany | null;
  compagnie?: AccountRequestCompany | null;
};

function getLivraisonCompany(livraison: Livraison) {
  return livraison.company_context ?? livraison.company ?? livraison.compagnie ?? null;
}

function formatDateTime(dateString: string | null) {
  if (!dateString) return "-";
  const d = new Date(dateString);
  return d.toLocaleString("fr-CA");
}

function normalizeOperationStatus(raw: string | null | undefined) {
  const value = (raw || "").trim().toLowerCase();
  if (value === "en_cours") return "en_cours" as const;
  if (value === "livree" || value === "ramassee" || value === "ramasse") return "terminee" as const;
  if (value === "pret_a_ramasser") return "prioritaire" as const;
  return "planifiee" as const;
}

function getOperationStatusLabel(raw: string | null | undefined, operationView: "livraisons" | "ramassages") {
  const status = normalizeOperationStatus(raw);
  if (status === "en_cours") return "En cours";
  if (status === "terminee") return operationView === "ramassages" ? "Ramasse" : "Livree";
  if (status === "prioritaire") return "Pret a ramasser";
  return "Planifie";
}

function getOperationStatusTone(raw: string | null | undefined) {
  const status = normalizeOperationStatus(raw);
  if (status === "terminee") return "success" as const;
  if (status === "en_cours") return "warning" as const;
  return "default" as const;
}

function getTypeOperationLabel(typeOperation: string | null | undefined) {
  if (typeOperation === "livraison_client") return "Livraison client";
  if (typeOperation === "ramassage_client") return "Ramassage client";
  return "-";
}

function getProofNoteLabel(typeOperation: string | null | undefined) {
  if (typeOperation === "livraison_client") return "Note de remise";
  if (typeOperation === "ramassage_client") return "Note de ramassage";
  return "Note operation";
}

function getProofModuleSource(typeOperation: string | null | undefined): ModuleSource {
  return typeOperation === "ramassage_client" ? "ramassage" : "livraison";
}

function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric" }).format(date);
}

export default function EmployeLivraisonsPage() {
  const router = useRouter();
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();

  const [livraisons, setLivraisons] = useState<Livraison[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [kmDepartValues, setKmDepartValues] = useState<Record<number, string>>({});
  const [kmArriveeValues, setKmArriveeValues] = useState<Record<number, string>>({});
  const [proofNoteValues, setProofNoteValues] = useState<Record<number, string>>({});
  const [proofAcknowledgedValues, setProofAcknowledgedValues] = useState<
    Record<number, boolean>
  >({});
  const [proofAcknowledgedByValues, setProofAcknowledgedByValues] = useState<
    Record<number, string>
  >({});
  const [incidentEnabledValues, setIncidentEnabledValues] = useState<
    Record<number, boolean>
  >({});
  const [incidentCategoryValues, setIncidentCategoryValues] = useState<
    Record<number, string>
  >({});
  const [incidentDescriptionValues, setIncidentDescriptionValues] = useState<
    Record<number, string>
  >({});
  const [operationView, setOperationView] = useState<"livraisons" | "ramassages">(
    "livraisons"
  );
  const [viewMode, setViewMode] = useState<"liste" | "calendrier">("calendrier");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<
    "" | "planifiee" | "prioritaire" | "en_cours" | "terminee" | "en_retard"
  >("");

  const dateDuJour = getTodayLocalDate();
  const canUseLivraisons = hasPermission("livraisons");
  const canManagePlanning = false;

  const chargerLivraisons = useCallback(async () => {
    const { data, error } = await supabase
      .from("livraisons_planifiees")
      .select("*")
      .gte("date_livraison", dateDuJour)
      .order("ordre_arret", { ascending: true })
      .order("date_livraison", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      setFeedback("Erreur chargement livraisons : " + error.message);
      return;
    }

    setLivraisons((data || []) as Livraison[]);
  }, [dateDuJour]);

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
  }, [accessLoading, canUseLivraisons, chargerLivraisons, router, user]);

  const total = livraisons.length;
  const livraisonsFiltrees = livraisons.filter((item) =>
    operationView === "ramassages"
      ? item.type_operation === "ramassage_client"
      : item.type_operation !== "ramassage_client"
  );
  const totalFiltres = livraisonsFiltrees.length;
  const planifiees = livraisonsFiltrees.filter(
    (l) => normalizeOperationStatus(l.statut) === "planifiee"
  ).length;
  const enCours = livraisonsFiltrees.filter(
    (l) => normalizeOperationStatus(l.statut) === "en_cours"
  ).length;
  const terminees = livraisonsFiltrees.filter(
    (l) => normalizeOperationStatus(l.statut) === "terminee"
  ).length;
  const prioritaires = livraisonsFiltrees.filter(
    (l) => normalizeOperationStatus(l.statut) === "prioritaire"
  ).length;
  const enRetard = livraisonsFiltrees.filter(
    (l) =>
      Boolean(l.date_livraison) &&
      String(l.date_livraison) < dateDuJour &&
      normalizeOperationStatus(l.statut) !== "terminee"
  ).length;
  const listOrdered = [...livraisonsFiltrees].sort((a, b) => {
    const aOverdue =
      Boolean(a.date_livraison) &&
      String(a.date_livraison) < dateDuJour &&
      normalizeOperationStatus(a.statut) !== "terminee";
    const bOverdue =
      Boolean(b.date_livraison) &&
      String(b.date_livraison) < dateDuJour &&
      normalizeOperationStatus(b.statut) !== "terminee";
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

    const getPriority = (raw: string | null) => {
      const status = normalizeOperationStatus(raw);
      if (status === "prioritaire") return 0;
      if (status === "planifiee") return 1;
      if (status === "en_cours") return 2;
      return 3;
    };
    const deltaPriority = getPriority(a.statut) - getPriority(b.statut);
    if (deltaPriority !== 0) return deltaPriority;
    return String(a.date_livraison || "").localeCompare(String(b.date_livraison || ""));
  });
  const filteredOrdered = listOrdered.filter((item) => {
    if (!statusFilter) return true;
    const isOverdue =
      Boolean(item.date_livraison) &&
      String(item.date_livraison) < dateDuJour &&
      normalizeOperationStatus(item.statut) !== "terminee";
    if (statusFilter === "en_retard") return isOverdue;
    return normalizeOperationStatus(item.statut) === statusFilter;
  });
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
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "all 140ms ease",
  };
  const getButtonTone = (active: boolean): React.CSSProperties =>
    active
      ? { background: "#0f2948", color: "#ffffff" }
      : { background: "#ffffff", color: "#0f2948" };
  const getDaysForMonth = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days: (number | null)[] = [];
    const offset = (first.getDay() + 6) % 7;
    for (let i = 0; i < offset; i += 1) days.push(null);
    for (let day = 1; day <= last.getDate(); day += 1) days.push(day);
    return days;
  };
  const getDateIsoForDay = (day: number) => {
    const year = calendarDate.getFullYear();
    const month = `${calendarDate.getMonth() + 1}`.padStart(2, "0");
    const d = `${day}`.padStart(2, "0");
    return `${year}-${month}-${d}`;
  };

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

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(`/api/livraisons/${livraison.id}/demarrer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({
        kmDepart: kmDepartNumber,
      }),
    });

    const result = (await response.json()) as {
      error?: string;
      trackingUrl?: string;
      sms?: {
        sent: boolean;
        skipped: boolean;
        reason: string | null;
      };
    };

    setSavingId(null);

    if (!response.ok) {
      setFeedback("Erreur demarrage : " + (result.error || "Action refusee."));
      return;
    }

    if (result.sms?.sent) {
      setFeedback(`Livraison demarree. SMS envoye au client. Lien: ${result.trackingUrl || "-"}`);
    } else if (result.trackingUrl) {
      setFeedback(`Livraison demarree. Lien de suivi pret: ${result.trackingUrl}`);
    } else {
      setFeedback("Livraison demarree.");
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

    const proofNote = (proofNoteValues[livraison.id] || "").trim();
    const proofAcknowledged = Boolean(proofAcknowledgedValues[livraison.id]);
    const proofAcknowledgedBy = (proofAcknowledgedByValues[livraison.id] || "").trim();
    const shouldSaveProof =
      proofNote.length > 0 || proofAcknowledged || proofAcknowledgedBy.length > 0;

    const incidentEnabled = Boolean(incidentEnabledValues[livraison.id]);
    const incidentCategory = (incidentCategoryValues[livraison.id] || "").trim() || "autre";
    const incidentDescription = (incidentDescriptionValues[livraison.id] || "").trim();

    setSavingId(livraison.id);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(`/api/livraisons/${livraison.id}/livrer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({
        kmArrivee: kmArriveeNumber,
        proof: shouldSaveProof
          ? {
              note: proofNote,
              acknowledged: proofAcknowledged,
              acknowledgedBy: proofAcknowledgedBy || null,
            }
          : null,
        incident: incidentEnabled
          ? {
              category: incidentCategory,
              description: incidentDescription || null,
            }
          : null,
      }),
    });

    const result = (await response.json()) as {
      error?: string;
      proofSaved?: boolean;
      incidentSaved?: boolean;
    };

    setSavingId(null);

    if (!response.ok) {
      setFeedback("Erreur livraison : " + (result.error || "Action refusee."));
      return;
    }

    setProofNoteValues((prev) => ({ ...prev, [livraison.id]: "" }));
    setProofAcknowledgedValues((prev) => ({ ...prev, [livraison.id]: false }));
    setProofAcknowledgedByValues((prev) => ({ ...prev, [livraison.id]: "" }));
    setIncidentEnabledValues((prev) => ({ ...prev, [livraison.id]: false }));
    setIncidentCategoryValues((prev) => ({ ...prev, [livraison.id]: "" }));
    setIncidentDescriptionValues((prev) => ({ ...prev, [livraison.id]: "" }));

    if (result.proofSaved || result.incidentSaved) {
      setFeedback("Livraison marquee livree. Preuve/incident enregistres.");
    } else {
      setFeedback("Livraison marquee livree.");
    }

    await chargerLivraisons();
  };

  const handleDemarrerSubmit = (event: FormEvent<HTMLFormElement>, livraison: Livraison) => {
    event.preventDefault();
    void handleDemarrer(livraison);
  };

  const handleLivreeSubmit = (event: FormEvent<HTMLFormElement>, livraison: Livraison) => {
    event.preventDefault();
    void handleLivree(livraison);
  };

  if (accessLoading || loading) {
    return <TagoraLoadingScreen isLoading message="Chargement de votre espace..." fullScreen />;
  }

  if (!canUseLivraisons) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Livraison & ramassage" />
          <SectionCard title="Module masque" subtitle="Acces requis." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader title="Livraison & ramassage" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onPointerUp={(event) => {
              event.preventDefault();
              setOperationView("livraisons");
            }}
            onClick={() => setOperationView("livraisons")}
            style={{ ...navButtonBase, ...getButtonTone(operationView === "livraisons") }}
          >
            Livraisons
          </button>
          <button
            type="button"
            onPointerUp={(event) => {
              event.preventDefault();
              setOperationView("ramassages");
            }}
            onClick={() => setOperationView("ramassages")}
            style={{ ...navButtonBase, ...getButtonTone(operationView === "ramassages") }}
          >
            Ramassages
          </button>
          <button
            type="button"
            onPointerUp={(event) => {
              event.preventDefault();
              setViewMode("liste");
            }}
            onClick={() => setViewMode("liste")}
            style={{ ...navButtonBase, ...getButtonTone(viewMode === "liste") }}
          >
            Liste
          </button>
          <button
            type="button"
            onPointerUp={(event) => {
              event.preventDefault();
              setViewMode("calendrier");
            }}
            onClick={() => setViewMode("calendrier")}
            style={{ ...navButtonBase, ...getButtonTone(viewMode === "calendrier") }}
          >
            Calendrier
          </button>
        </div>

        {feedback ? <SectionCard title="Action" subtitle={feedback} tone="muted" /> : null}

        <div className="ui-grid-auto">
          <StatCard label="Total a venir" value={total} />
          <StatCard
            label={operationView === "ramassages" ? "Ramassages" : "Livraisons"}
            value={totalFiltres}
          />
          <StatCard label="Planifiees" value={planifiees} />
          <StatCard label="Prioritaires" value={prioritaires} />
          <StatCard label="En cours" value={enCours} tone="warning" />
          <StatCard
            label={operationView === "ramassages" ? "Ramasses" : "Livrees"}
            value={terminees}
            tone="success"
          />
          <StatCard label="En retard" value={enRetard} tone="warning" />
        </div>

        <SectionCard
          title={operationView === "ramassages" ? "Ramassages a venir" : "Livraisons a venir"}
          subtitle="Consultation et documentation."
          actions={<PrimaryButton onClick={chargerLivraisons}>Actualiser</PrimaryButton>}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "" | "planifiee" | "prioritaire" | "en_cours" | "terminee" | "en_retard"
                )
              }
              className="tagora-input"
              style={{ maxWidth: 240 }}
            >
              <option value="">Tous les statuts</option>
              <option value="planifiee">Planifie</option>
              <option value="prioritaire">Prioritaire</option>
              <option value="en_cours">En cours</option>
              <option value="terminee">{operationView === "ramassages" ? "Ramasse" : "Livree"}</option>
              <option value="en_retard">En retard</option>
            </select>
          </div>
          {viewMode === "calendrier" ? (
            <div className="ui-stack-sm">
              {filteredOrdered.length === 0 ? (
                <AppCard tone="muted">
                  <p className="ui-text-muted" style={{ margin: 0 }}>
                    {operationView === "ramassages"
                      ? "Aucun ramassage a venir."
                      : "Aucune livraison a venir."}
                  </p>
                </AppCard>
              ) : null}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <button
                  type="button"
                  className="tagora-dark-outline-action"
                  onClick={() =>
                    setCalendarDate(
                      new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1)
                    )
                  }
                >
                  ← Mois prec
                </button>
                <strong style={{ textTransform: "capitalize" }}>{monthLabel(calendarDate)}</strong>
                <button
                  type="button"
                  className="tagora-dark-outline-action"
                  onClick={() =>
                    setCalendarDate(
                      new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1)
                    )
                  }
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
                  const entries = day
                    ? filteredOrdered.filter((entry) => String(entry.date_livraison || "") === isoDate)
                    : [];
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
                          href={`/employe/livraisons/jour?date=${isoDate}`}
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
                            href={`/employe/livraisons/jour?date=${isoDate}`}
                            className="tagora-dark-outline-action"
                            style={{ textAlign: "left", padding: "4px 8px", fontSize: 11 }}
                          >
                            {String(entry.client || `#${entry.id}`)}
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
            </div>
          ) : (
            <div className="ui-stack-md">
              {filteredOrdered.length === 0 ? (
                <AppCard tone="muted">
                  <p className="ui-text-muted" style={{ margin: 0 }}>
                    {operationView === "ramassages"
                      ? "Aucun ramassage a venir."
                      : "Aucune livraison a venir."}
                  </p>
                </AppCard>
              ) : null}
              {filteredOrdered.map((livraison, index) => {
                const distance =
                  livraison.km_depart != null && livraison.km_arrivee != null
                    ? livraison.km_arrivee - livraison.km_depart
                    : null;
                const isOverdue =
                  Boolean(livraison.date_livraison) &&
                  String(livraison.date_livraison) < dateDuJour &&
                  normalizeOperationStatus(livraison.statut) !== "terminee";
                const normalizedStatus = normalizeOperationStatus(livraison.statut);

                return (
                  <AppCard
                    key={livraison.id}
                    className="ui-stack-md"
                    style={{
                      border: isOverdue ? "1px solid #ef4444" : undefined,
                      background: isOverdue ? "rgba(254, 242, 242, 0.95)" : undefined,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div className="ui-stack-xs">
                        <span className="ui-eyebrow">
                          {livraison.type_operation === "ramassage_client"
                            ? "Ramassage"
                            : "Livraison"}
                        </span>
                        <div
                          style={{
                            fontSize: 28,
                            fontWeight: 800,
                            color: "var(--ui-color-primary)",
                            letterSpacing: "-0.03em",
                          }}
                        >
                          {livraison.client || "Sans client"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {isOverdue ? (
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
                        {normalizedStatus === "prioritaire" ? (
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
                          label={getOperationStatusLabel(livraison.statut, operationView)}
                          tone={getOperationStatusTone(livraison.statut)}
                        />
                      </div>
                    </div>

                    <div className="ui-grid-3">
                      <InfoRow label="Adresse" value={livraison.adresse || "-"} />
                      <InfoRow label="Heure prevue" value={livraison.heure_prevue || "-"} />
                      <InfoRow
                        label="Compagnie"
                        value={getLivraisonCompany(livraison) ? getCompanyLabel(getLivraisonCompany(livraison)!) : "-"}
                      />
                      <InfoRow label="Chauffeur" value={livraison.chauffeur || "-"} />
                      <InfoRow label="Vehicule" value={livraison.vehicule || "-"} />
                      <InfoRow label="Ordre arret" value={String(livraison.ordre_arret ?? "-")} />
                      <InfoRow
                        label="Type operation"
                        value={getTypeOperationLabel(livraison.type_operation)}
                      />
                    </div>

                    <div className="ui-text-muted" style={{ fontWeight: 600 }}>
                      Ordre de passage: {index + 1}
                    </div>

                    <AppCard tone="muted">
                      <div className="ui-grid-3">
                        <InfoRow label="Depart reel" value={formatDateTime(livraison.heure_depart_reelle)} compact />
                        <InfoRow label="Livree a" value={formatDateTime(livraison.heure_livree)} compact />
                        <InfoRow label="Temps total" value={livraison.temps_total || "-"} compact />
                        <InfoRow label="KM depart" value={String(livraison.km_depart ?? "-")} compact />
                        <InfoRow label="KM arrivee" value={String(livraison.km_arrivee ?? "-")} compact />
                        <InfoRow label="Distance" value={distance != null ? `${distance} km` : "-"} compact />
                      </div>
                    </AppCard>

                    {canManagePlanning && livraison.statut === "planifiee" ? (
                      <form
                        onSubmit={(event) => handleDemarrerSubmit(event, livraison)}
                        style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}
                      >
                        <div style={{ minWidth: 220 }}>
                          <FormField label="KM depart">
                            <input
                              type="number"
                              placeholder="KM depart"
                              value={kmDepartValues[livraison.id] || ""}
                              onChange={(e) =>
                                setKmDepartValues((prev) => ({
                                  ...prev,
                                  [livraison.id]: e.target.value,
                                }))
                              }
                              className="tagora-input"
                            />
                          </FormField>
                        </div>
                        <PrimaryButton
                          type="submit"
                          disabled={savingId === livraison.id}
                        >
                          {savingId === livraison.id ? "Demarrer..." : "Demarrer"}
                        </PrimaryButton>
                      </form>
                    ) : null}

                    {canManagePlanning && livraison.statut === "en_cours" ? (
                      <div className="ui-stack-sm">
                        <form
                          className="ui-stack-sm"
                          onSubmit={(event) => handleLivreeSubmit(event, livraison)}
                        >
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
                            <div style={{ minWidth: 220 }}>
                              <FormField label="KM arrivee">
                                <input
                                  type="number"
                                  placeholder="KM arrivee"
                                  value={kmArriveeValues[livraison.id] || ""}
                                  onChange={(e) =>
                                    setKmArriveeValues((prev) => ({
                                      ...prev,
                                      [livraison.id]: e.target.value,
                                    }))
                                  }
                                  className="tagora-input"
                                />
                              </FormField>
                            </div>
                            <PrimaryButton
                              type="submit"
                              disabled={savingId === livraison.id}
                            >
                              {savingId === livraison.id ? "Marquer livree..." : "Marquer livree"}
                            </PrimaryButton>
                          </div>

                          <FormField label={getProofNoteLabel(livraison.type_operation)}>
                            <textarea
                              rows={2}
                              placeholder="Ajouter une note courte"
                              value={proofNoteValues[livraison.id] || ""}
                              onChange={(e) =>
                                setProofNoteValues((prev) => ({
                                  ...prev,
                                  [livraison.id]: e.target.value,
                                }))
                              }
                              className="tagora-input"
                            />
                          </FormField>

                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
                            <label
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                fontWeight: 600,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(proofAcknowledgedValues[livraison.id])}
                                onChange={(e) =>
                                  setProofAcknowledgedValues((prev) => ({
                                    ...prev,
                                    [livraison.id]: e.target.checked,
                                  }))
                                }
                              />
                              Confirmation verbale recue
                            </label>
                            <div style={{ minWidth: 220 }}>
                              <FormField label="Nom du contact (optionnel)">
                                <input
                                  type="text"
                                  placeholder="Nom du contact"
                                  value={proofAcknowledgedByValues[livraison.id] || ""}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                    }
                                  }}
                                  onChange={(e) =>
                                    setProofAcknowledgedByValues((prev) => ({
                                      ...prev,
                                      [livraison.id]: e.target.value,
                                    }))
                                  }
                                  className="tagora-input"
                                />
                              </FormField>
                            </div>
                          </div>

                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              fontWeight: 600,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(incidentEnabledValues[livraison.id])}
                              onChange={(e) =>
                                setIncidentEnabledValues((prev) => ({
                                  ...prev,
                                  [livraison.id]: e.target.checked,
                                }))
                              }
                            />
                            Signaler un incident
                          </label>

                          {incidentEnabledValues[livraison.id] ? (
                            <div className="ui-stack-xs">
                              <div style={{ minWidth: 220 }}>
                                <FormField label="Categorie incident">
                                  <select
                                    value={incidentCategoryValues[livraison.id] || "autre"}
                                    onChange={(e) =>
                                      setIncidentCategoryValues((prev) => ({
                                        ...prev,
                                        [livraison.id]: e.target.value,
                                      }))
                                    }
                                    className="tagora-input"
                                  >
                                    <option value="dommage">Dommage</option>
                                    <option value="piece_manquante">Piece manquante</option>
                                    <option value="autre">Autre</option>
                                  </select>
                                </FormField>
                              </div>
                              <FormField label="Description incident">
                                <textarea
                                  rows={2}
                                  placeholder="Description courte"
                                  value={incidentDescriptionValues[livraison.id] || ""}
                                  onChange={(e) =>
                                    setIncidentDescriptionValues((prev) => ({
                                      ...prev,
                                      [livraison.id]: e.target.value,
                                    }))
                                  }
                                  className="tagora-input"
                                />
                              </FormField>
                            </div>
                          ) : null}
                        </form>
                      </div>
                    ) : null}
                    <OperationProofsPanel
                      moduleSource={getProofModuleSource(livraison.type_operation)}
                      sourceId={livraison.id}
                      categorieParDefaut={
                        livraison.type_operation === "ramassage_client"
                          ? "preuve_ramassage"
                          : "preuve_livraison"
                      }
                      titre="Preuves de livraison / ramassage"
                      commentairePlaceholder="Commentaire preuve livraison"
                    />
                  </AppCard>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}

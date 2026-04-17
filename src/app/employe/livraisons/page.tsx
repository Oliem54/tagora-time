"use client";

import { useCallback, useEffect, useState } from "react";
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

function getStatusTone(statut: string | null) {
  if (statut === "livree") return "success" as const;
  if (statut === "en_cours") return "warning" as const;
  return "default" as const;
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
  const [kmDepartValues, setKmDepartValues] = useState<Record<number, string>>({});
  const [kmArriveeValues, setKmArriveeValues] = useState<Record<number, string>>({});

  const dateDuJour = getTodayLocalDate();
  const canUseLivraisons = hasPermission("livraisons");

  const chargerLivraisons = useCallback(async () => {
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
  const planifiees = livraisons.filter((l) => l.statut === "planifiee").length;
  const enCours = livraisons.filter((l) => l.statut === "en_cours").length;
  const livrees = livraisons.filter((l) => l.statut === "livree").length;

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
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Tournee" subtitle="Livraisons du jour." />
          <SectionCard title="Chargement" subtitle="Acces en cours." />
        </div>
      </main>
    );
  }

  if (!canUseLivraisons) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Tournee" subtitle="Livraisons du jour." />
          <SectionCard title="Module masque" subtitle="Acces requis." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Tournee"
          subtitle="Livraisons du jour."
        />

        {feedback ? <SectionCard title="Action" subtitle={feedback} tone="muted" /> : null}

        <div className="ui-grid-auto">
          <StatCard label="Total" value={total} />
          <StatCard label="Planifiees" value={planifiees} />
          <StatCard label="En cours" value={enCours} tone="warning" />
          <StatCard label="Livrees" value={livrees} tone="success" />
        </div>

        <SectionCard
          title="Livraisons"
          subtitle="Suivi et actions."
          actions={<PrimaryButton onClick={chargerLivraisons}>Actualiser</PrimaryButton>}
        >
          {livraisons.length === 0 ? (
            <AppCard tone="muted">
              <p className="ui-text-muted" style={{ margin: 0 }}>
                Aucune livraison.
              </p>
            </AppCard>
          ) : (
            <div className="ui-stack-md">
              {livraisons.map((livraison) => {
                const distance =
                  livraison.km_depart != null && livraison.km_arrivee != null
                    ? livraison.km_arrivee - livraison.km_depart
                    : null;

                return (
                  <AppCard key={livraison.id} className="ui-stack-md">
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
                        <span className="ui-eyebrow">Livraison</span>
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
                      <StatusBadge
                        label={livraison.statut || "-"}
                        tone={getStatusTone(livraison.statut)}
                      />
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

                    {livraison.statut === "planifiee" ? (
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
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
                          onClick={() => handleDemarrer(livraison)}
                          disabled={savingId === livraison.id}
                        >
                          {savingId === livraison.id ? "Demarrer..." : "Demarrer"}
                        </PrimaryButton>
                      </div>
                    ) : null}

                    {livraison.statut === "en_cours" ? (
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
                          onClick={() => handleLivree(livraison)}
                          disabled={savingId === livraison.id}
                        >
                          {savingId === livraison.id ? "Marquer livree..." : "Marquer livree"}
                        </PrimaryButton>
                      </div>
                    ) : null}
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

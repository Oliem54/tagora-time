"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import AppCard from "@/app/components/ui/AppCard";
import InfoRow from "@/app/components/ui/InfoRow";
import OperationProofsPanel from "@/app/components/proofs/OperationProofsPanel";

type ServiceCaseRow = {
  id: string;
  livraison_id: number | null;
  incident_id: string | null;
  status: string | null;
  summary: string | null;
  created_at: string | null;
};

export default function DirectionSavPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [cases, setCases] = useState<ServiceCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const canUseLivraisons = hasPermission("livraisons");

  const loadCases = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("service_cases")
      .select("id, livraison_id, incident_id, status, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      setCases([]);
      setFeedback("Impossible de charger les tickets SAV.");
    } else {
      const rows = (data ?? []) as ServiceCaseRow[];
      setCases(rows);
      setFeedback("");
      if (!selectedCaseId && rows.length > 0) {
        setSelectedCaseId(rows[0].id);
      }
    }
    setLoading(false);
  }, [selectedCaseId]);

  useEffect(() => {
    if (accessLoading || !user || !canUseLivraisons) return;
    const timer = window.setTimeout(() => {
      void loadCases();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accessLoading, canUseLivraisons, loadCases, user]);

  if (accessLoading || loading) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="SAV / Help desk" />
          <SectionCard title="Chargement" subtitle="Tickets en cours." />
        </div>
      </main>
    );
  }

  if (!user || !canUseLivraisons) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="SAV / Help desk" />
          <SectionCard title="Acces bloque" subtitle="Permission requise." />
        </div>
      </main>
    );
  }

  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? null;

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader title="SAV / Help desk" />
        {feedback ? <SectionCard title="Etat" subtitle={feedback} tone="muted" /> : null}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.95fr) minmax(0, 1.45fr)", gap: "var(--ui-space-5)" }}>
          <SectionCard title="Tickets" subtitle="Demandes de service.">
            {cases.length === 0 ? (
              <AppCard tone="muted">
                <p className="ui-text-muted" style={{ margin: 0 }}>Aucun ticket SAV.</p>
              </AppCard>
            ) : (
              <div className="ui-stack-sm">
                {cases.map((serviceCase) => (
                  <AppCard
                    key={serviceCase.id}
                    className="ui-stack-xs"
                    style={{
                      cursor: "pointer",
                      borderColor: serviceCase.id === selectedCaseId ? "var(--ui-color-primary)" : undefined,
                    }}
                    onClick={() => setSelectedCaseId(serviceCase.id)}
                  >
                    <div className="ui-eyebrow">Ticket #{serviceCase.id.slice(0, 8)}</div>
                    <div style={{ fontWeight: 700 }}>{serviceCase.summary || "Demande SAV"}</div>
                    <div className="ui-text-muted">Livraison: {serviceCase.livraison_id ?? "-"}</div>
                  </AppCard>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Detail ticket" subtitle="Preuves par ticket.">
            {!selectedCase ? (
              <AppCard tone="muted">
                <p className="ui-text-muted" style={{ margin: 0 }}>Selectionnez un ticket.</p>
              </AppCard>
            ) : (
              <div className="ui-stack-md">
                <div className="ui-grid-2">
                  <InfoRow label="Ticket" value={`#${selectedCase.id}`} compact />
                  <InfoRow label="Statut" value={selectedCase.status || "-"} compact />
                  <InfoRow label="Livraison" value={String(selectedCase.livraison_id ?? "-")} compact />
                  <InfoRow label="Incident" value={selectedCase.incident_id || "-"} compact />
                </div>
                <OperationProofsPanel
                  moduleSource="service_case"
                  sourceId={selectedCase.id}
                  categorieParDefaut="preuve_sav"
                  titre="Preuves SAV (photos, documents, vocal, signature)"
                  commentairePlaceholder="Commentaire ticket SAV"
                />
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </main>
  );
}

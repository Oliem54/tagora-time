"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import AccessNotice from "@/app/components/AccessNotice";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import {
  OBJECTIVE_STATUS_LABELS,
  objectiveStatusTone,
  type ObjectiveStatus,
} from "@/app/lib/commissions/commissions.shared";

type DirectionSalesBookObjective = {
  id: string;
  title: string;
  description: string | null;
  chauffeur_id: number | null;
  period_start: string;
  period_end: string;
  target_type: string;
  target_sales_count: number | null;
  achieved_sales_count: number;
  status: string;
  entries_count: number;
  entries_pending_validation: number;
  entries_paid: number;
};

export default function DirectionSalesBookDetailPage({
  params,
}: {
  params: Promise<{ chauffeurId: string }>;
}) {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const canUseCommissions = hasPermission("commissions");

  const [chauffeurIdParam, setChauffeurIdParam] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [chauffeurLabel, setChauffeurLabel] = useState("");
  const [objectives, setObjectives] = useState<DirectionSalesBookObjective[]>([]);

  useEffect(() => {
    void params.then((value) => setChauffeurIdParam(value.chauffeurId));
  }, [params]);

  const loadBook = useCallback(async () => {
    if (!chauffeurIdParam) return;

    setLoading(true);
    setForbidden(false);
    setErrorMessage("");

    const response = await commissionsFetch(`/api/direction/sales-books/${chauffeurIdParam}`);
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      chauffeur_label?: string;
      objectives?: DirectionSalesBookObjective[];
    };

    if (response.status === 403) {
      setForbidden(true);
      setObjectives([]);
      setLoading(false);
      return;
    }

    if (!response.ok) {
      setObjectives([]);
      setErrorMessage(payload.error ?? "Impossible de charger ce livre.");
      setLoading(false);
      return;
    }

    setChauffeurLabel(String(payload.chauffeur_label ?? `Employe #${chauffeurIdParam}`));
    setObjectives(Array.isArray(payload.objectives) ? payload.objectives : []);
    setLoading(false);
  }, [chauffeurIdParam]);

  useEffect(() => {
    if (accessLoading || !user || !canUseCommissions || !chauffeurIdParam) return;
    void loadBook();
  }, [accessLoading, canUseCommissions, chauffeurIdParam, loadBook, user]);

  const summary = useMemo(() => {
    return objectives.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "active" || row.status === "partially_achieved") acc.active += 1;
        if (row.status === "achieved") acc.achieved += 1;
        if (row.status === "behind") acc.behind += 1;
        acc.pendingValidation += row.entries_pending_validation;
        return acc;
      },
      { total: 0, active: 0, achieved: 0, behind: 0, pendingValidation: 0 }
    );
  }, [objectives]);

  if (
    accessLoading ||
    (!errorMessage && !forbidden && !canUseCommissions && !!user) ||
    (canUseCommissions && loading)
  ) {
    return <TagoraLoadingScreen isLoading message="Chargement du livre autorise..." fullScreen />;
  }

  if (!user) {
    return (
      <div className="page-container">
        <AccessNotice title="Session requise" description="Connectez-vous pour continuer." />
      </div>
    );
  }

  if (!canUseCommissions) {
    return (
      <div className="page-container">
        <AccessNotice
          title="Acces refuse"
          description="La permission commissions est requise pour consulter ce livre."
        />
      </div>
    );
  }

  if (forbidden) {
    return (
      <main className="page-container">
        <AuthenticatedPageHeader
          title="Livre non autorise"
          subtitle="Vous n avez pas d acces actif a ce livre de ventes."
        />
        <AccessNotice
          title="Acces refuse"
          description="Ce livre n est pas autorise pour votre compte Direction. Demandez l acces a un administrateur."
        />
        <Link href="/direction/commissions" className="tagora-dark-action" style={{ marginTop: 16 }}>
          Retour aux livres autorises
        </Link>
      </main>
    );
  }

  return (
    <main className="page-container direction-sales-book-detail-page">
      <div className="direction-sales-book-detail-nav">
        <Link href="/direction/commissions" className="direction-sales-book-back">
          <ArrowLeft size={16} aria-hidden />
          Livres autorises
        </Link>
      </div>

      <AuthenticatedPageHeader
        title={chauffeurLabel || "Livre autorise"}
        subtitle="Detail operationnel sans montants monetaires."
      />

      <div className="direction-sales-book-detail-badges">
        <StatusBadge label="Acces accorde par Admin" tone="info" />
        <StatusBadge label="Lecture seule" tone="default" />
      </div>

      {errorMessage ? (
        <div style={{ marginTop: 20 }}>
          <AccessNotice title="Chargement limite" description={errorMessage} />
        </div>
      ) : null}

      <SectionCard title="Indicateurs operationnels" className="ui-stack-sm">
        <div className="direction-sales-books-kpi-grid">
          <AppCard tone="muted" className="direction-sales-books-kpi">
            <span className="tagora-label">Objectifs</span>
            <strong>{summary.total}</strong>
          </AppCard>
          <AppCard tone="muted" className="direction-sales-books-kpi">
            <span className="tagora-label">Actifs</span>
            <strong>{summary.active}</strong>
          </AppCard>
          <AppCard tone="muted" className="direction-sales-books-kpi">
            <span className="tagora-label">Atteints</span>
            <strong>{summary.achieved}</strong>
          </AppCard>
          <AppCard tone="muted" className="direction-sales-books-kpi">
            <span className="tagora-label">Entrees a valider</span>
            <strong>{summary.pendingValidation}</strong>
          </AppCard>
        </div>
      </SectionCard>

      <SectionCard title="Objectifs du livre" subtitle="Performance non monetaire pour pilotage operationnel.">
        <div className="tagora-panel" style={{ overflowX: "auto" }}>
          <table className="direction-sales-book-table">
            <thead>
              <tr>
                <th>Objectif</th>
                <th>Periode</th>
                <th>Type</th>
                <th>Cible (non monetaire)</th>
                <th>Realise</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {objectives.map((row) => {
                const status = row.status as ObjectiveStatus;
                return (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{row.title}</div>
                      {row.description ? (
                        <div className="tagora-note" style={{ marginTop: 4 }}>
                          {row.description}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {row.period_start} - {row.period_end}
                    </td>
                    <td>{row.target_type === "sales_count" ? "Volume" : "Objectif qualitatif"}</td>
                    <td>
                      {row.target_type === "sales_count" && row.target_sales_count != null
                        ? `${row.target_sales_count} ventes`
                        : "Reserve admin"}
                    </td>
                    <td>
                      {row.target_type === "sales_count"
                        ? `${row.achieved_sales_count} ventes`
                        : "Suivi operationnel"}
                    </td>
                    <td>
                      <StatusBadge
                        label={OBJECTIVE_STATUS_LABELS[status] ?? row.status}
                        tone={objectiveStatusTone(status)}
                      />
                    </td>
                  </tr>
                );
              })}
              {objectives.length === 0 ? (
                <tr>
                  <td colSpan={6} className="direction-sales-book-empty">
                    Aucun objectif visible pour ce livre autorise.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Confidentialite">
        <div className="tagora-panel-muted direction-sales-books-security">
          <ShieldCheck size={18} aria-hidden />
          <p>
            Ce livre est affiche sans montants monetaires. Les commissions en dollars, salaires, taux,
            bonus et couts de paie restent reserves a l administration.
          </p>
        </div>
      </SectionCard>

      <style jsx>{`
        .direction-sales-book-detail-nav {
          margin-bottom: 12px;
        }
        .direction-sales-book-back {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #334155;
          text-decoration: none;
          font-weight: 600;
        }
        .direction-sales-book-detail-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 12px 0 4px;
        }
        .direction-sales-books-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }
        .direction-sales-books-kpi {
          display: grid;
          gap: 8px;
          padding: 14px;
        }
        .direction-sales-books-kpi strong {
          font-size: 1.45rem;
        }
        .direction-sales-book-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.92rem;
        }
        .direction-sales-book-table th,
        .direction-sales-book-table td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid #f1f5f9;
        }
        .direction-sales-book-table thead th {
          border-bottom: 1px solid #e2e8f0;
        }
        .direction-sales-book-empty {
          padding: 16px 12px;
          color: #64748b;
        }
        .direction-sales-books-security {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 14px;
        }
        .direction-sales-books-security p {
          margin: 0;
          line-height: 1.5;
        }
      `}</style>
    </main>
  );
}

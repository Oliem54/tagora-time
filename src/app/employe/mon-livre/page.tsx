"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Lock, ShieldCheck } from "lucide-react";
import AccessNotice from "@/app/components/AccessNotice";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  formatCad,
  OBJECTIVE_STATUS_LABELS,
  objectiveStatusTone,
  type ObjectiveStatus,
} from "@/app/lib/commissions/commissions.shared";
import { supabase } from "@/app/lib/supabase/client";

const PROFILE_NOT_LINKED_MESSAGE = "Aucun profil employé lié à ce compte.";

type EmployeeSalesBookObjective = {
  id: string;
  title: string;
  description: string | null;
  chauffeur_id: number;
  period_start: string;
  period_end: string;
  target_type: string;
  target_amount: number | null;
  target_sales_count: number | null;
  achieved_amount: number;
  achieved_sales_count: number;
  status: string;
  company_context: string | null;
  entries_count: number;
  entries_pending_validation: number;
  entries_paid: number;
  total_sales_basis_amount: number;
  total_calculated_amount: number;
};

type SalesBookPayload = {
  chauffeur_id?: number;
  objectives?: EmployeeSalesBookObjective[];
  read_only?: boolean;
  error?: string;
};

function formatDateFr(value: string) {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function normalizeObjectiveStatus(status: string): ObjectiveStatus {
  if (
    status === "draft" ||
    status === "active" ||
    status === "achieved" ||
    status === "partially_achieved" ||
    status === "behind" ||
    status === "cancelled"
  ) {
    return status;
  }
  return "draft";
}

function getObjectiveProgress(objective: EmployeeSalesBookObjective) {
  if (objective.target_type === "amount") {
    const target = objective.target_amount ?? 0;
    if (target <= 0) return 0;
    return Math.min(100, Math.round((objective.achieved_amount / target) * 100));
  }
  const target = objective.target_sales_count ?? 0;
  if (target <= 0) return 0;
  return Math.min(100, Math.round((objective.achieved_sales_count / target) * 100));
}

function formatTarget(objective: EmployeeSalesBookObjective) {
  if (objective.target_type === "amount") {
    return formatCad(objective.target_amount ?? 0);
  }
  return `${objective.target_sales_count ?? 0} vente(s)`;
}

function formatAchieved(objective: EmployeeSalesBookObjective) {
  if (objective.target_type === "amount") {
    return formatCad(objective.achieved_amount ?? 0);
  }
  return `${objective.achieved_sales_count ?? 0} vente(s)`;
}

export default function EmployeMonLivrePage() {
  const router = useRouter();
  const { user, role, loading: accessLoading } = useCurrentAccess();

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [profileNotLinked, setProfileNotLinked] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [objectives, setObjectives] = useState<EmployeeSalesBookObjective[]>([]);

  useEffect(() => {
    if (!accessLoading && user && role && role !== "employe") {
      router.replace("/employe/login");
    }
  }, [accessLoading, user, role, router]);

  const loadSalesBook = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    setProfileNotLinked(false);
    setErrorMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setErrorMessage("Session expirée. Veuillez vous reconnecter.");
        setObjectives([]);
        setLoading(false);
        return;
      }

      const response = await fetch("/api/employe/sales-book", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as SalesBookPayload;

      if (response.status === 401) {
        router.push("/employe/login");
        return;
      }

      if (response.status === 403) {
        setForbidden(true);
        setObjectives([]);
        setLoading(false);
        return;
      }

      if (response.status === 404) {
        setProfileNotLinked(true);
        setObjectives([]);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        setObjectives([]);
        setErrorMessage(payload.error ?? "Impossible de charger votre livre de ventes.");
        setLoading(false);
        return;
      }

      setObjectives(Array.isArray(payload.objectives) ? payload.objectives : []);
      setLoading(false);
    } catch {
      setObjectives([]);
      setErrorMessage("Erreur réseau lors du chargement de votre livre.");
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!accessLoading && user && role === "employe") {
      void loadSalesBook();
    }
  }, [accessLoading, user, role, loadSalesBook]);

  const summary = useMemo(() => {
    const activeObjectives = objectives.filter(
      (row) => row.status === "active" || row.status === "partially_achieved"
    );
    const progressValues = objectives
      .filter((row) => row.status !== "cancelled" && row.status !== "draft")
      .map(getObjectiveProgress);
    const averageProgress =
      progressValues.length > 0
        ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
        : 0;

    return objectives.reduce(
      (acc, row) => {
        acc.totalObjectives += 1;
        if (row.status === "active" || row.status === "partially_achieved") {
          acc.activeObjectives += 1;
        }
        acc.totalCalculated += row.total_calculated_amount ?? 0;
        acc.entriesPending += row.entries_pending_validation ?? 0;
        acc.entriesPaid += row.entries_paid ?? 0;
        acc.entriesTotal += row.entries_count ?? 0;
        return acc;
      },
      {
        totalObjectives: 0,
        activeObjectives: activeObjectives.length,
        averageProgress,
        totalCalculated: 0,
        entriesPending: 0,
        entriesPaid: 0,
        entriesTotal: 0,
      }
    );
  }, [objectives]);

  if (accessLoading || (user && role === "employe" && loading)) {
    return <TagoraLoadingScreen isLoading message="Chargement de votre livre..." fullScreen />;
  }

  if (!user) {
    return (
      <main className="page-container">
        <AccessNotice title="Session requise" description="Connectez-vous pour consulter votre livre." />
      </main>
    );
  }

  if (role !== "employe") {
    return <TagoraLoadingScreen isLoading message="Redirection..." fullScreen />;
  }

  if (forbidden) {
    return (
      <main className="page-container employe-sales-book-page">
        <AuthenticatedPageHeader
          title="Mon livre de ventes"
          subtitle="Suivi personnel de vos objectifs et commissions"
        />
        <AccessNotice
          title="Accès refusé"
          description="Cette section est réservée aux comptes employé. Si le problème persiste, contactez un administrateur."
        />
      </main>
    );
  }

  if (profileNotLinked) {
    return (
      <main className="page-container employe-sales-book-page">
        <AuthenticatedPageHeader
          title="Mon livre de ventes"
          subtitle="Suivi personnel de vos objectifs et commissions"
        />
        <AppCard tone="muted" className="employe-sales-book-empty">
          <BookOpen size={28} strokeWidth={2} aria-hidden />
          <p style={{ margin: 0, fontWeight: 700 }}>{PROFILE_NOT_LINKED_MESSAGE}</p>
          <p className="tagora-note" style={{ margin: 0 }}>
            Votre compte utilisateur n&apos;est pas encore associé à un profil employé.
          </p>
        </AppCard>
      </main>
    );
  }

  return (
    <main className="page-container employe-sales-book-page">
      <AuthenticatedPageHeader
        title="Mon livre de ventes"
        subtitle="Suivi personnel de vos objectifs et commissions"
      />

      <div className="employe-sales-book-badges">
        <StatusBadge label="Lecture seule" tone="info" />
        <StatusBadge label="Données personnelles" tone="success" />
      </div>

      {errorMessage ? (
        <div style={{ marginTop: 16 }}>
          <AccessNotice title="Chargement limité" description={errorMessage} />
        </div>
      ) : null}

      <SectionCard title="Vue d'ensemble" subtitle="Résumé de votre performance personnelle.">
        <div className="employe-sales-book-kpi-grid">
          <AppCard tone="muted" className="employe-sales-book-kpi">
            <span className="tagora-label">Objectifs actifs</span>
            <strong>{summary.activeObjectives}</strong>
          </AppCard>
          <AppCard tone="muted" className="employe-sales-book-kpi">
            <span className="tagora-label">Progression moyenne</span>
            <strong>{summary.averageProgress}%</strong>
          </AppCard>
          <AppCard tone="muted" className="employe-sales-book-kpi">
            <span className="tagora-label">Commissions calculées</span>
            <strong>{formatCad(summary.totalCalculated)}</strong>
          </AppCard>
          <AppCard tone="muted" className="employe-sales-book-kpi">
            <span className="tagora-label">Entrées à valider / payées</span>
            <strong>
              {summary.entriesPending} / {summary.entriesPaid}
            </strong>
          </AppCard>
        </div>
      </SectionCard>

      <SectionCard
        title="Mes objectifs"
        subtitle="Objectifs et commissions liés à votre profil uniquement."
      >
        {objectives.length === 0 ? (
          <AppCard tone="muted" className="employe-sales-book-empty">
            <BookOpen size={28} strokeWidth={2} aria-hidden />
            <p style={{ margin: 0, fontWeight: 700 }}>Aucun objectif pour le moment</p>
            <p className="tagora-note" style={{ margin: 0 }}>
              Votre livre apparaîtra ici dès qu&apos;un objectif ou une commission vous sera assigné.
            </p>
          </AppCard>
        ) : (
          <div className="employe-sales-book-objectives">
            {objectives.map((objective) => {
              const status = normalizeObjectiveStatus(objective.status);
              const progress = getObjectiveProgress(objective);

              return (
                <AppCard key={objective.id} tone="elevated" className="employe-sales-book-objective-card">
                  <div className="employe-sales-book-objective-head">
                    <div>
                      <h3 className="employe-sales-book-objective-title">{objective.title}</h3>
                      {objective.description ? (
                        <p className="tagora-note employe-sales-book-objective-desc">
                          {objective.description}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge
                      label={OBJECTIVE_STATUS_LABELS[status]}
                      tone={objectiveStatusTone(status)}
                    />
                  </div>

                  <div className="employe-sales-book-objective-meta">
                    <span>
                      Période : {formatDateFr(objective.period_start)} →{" "}
                      {formatDateFr(objective.period_end)}
                    </span>
                    <span>
                      Cible : {formatTarget(objective)} · Réalisé : {formatAchieved(objective)}
                    </span>
                  </div>

                  <div className="employe-sales-book-progress" aria-label={`Progression ${progress}%`}>
                    <div className="employe-sales-book-progress-track">
                      <div
                        className="employe-sales-book-progress-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="employe-sales-book-progress-label">{progress}%</span>
                  </div>

                  <div className="employe-sales-book-entries">
                    <span className="tagora-label">Entrées de commission liées</span>
                    <div className="employe-sales-book-entries-grid">
                      <div>
                        <span className="employe-sales-book-entry-stat-label">Total</span>
                        <strong>{objective.entries_count}</strong>
                      </div>
                      <div>
                        <span className="employe-sales-book-entry-stat-label">À valider</span>
                        <strong>{objective.entries_pending_validation}</strong>
                      </div>
                      <div>
                        <span className="employe-sales-book-entry-stat-label">Payées</span>
                        <strong>{objective.entries_paid}</strong>
                      </div>
                      <div>
                        <span className="employe-sales-book-entry-stat-label">Base ventes</span>
                        <strong>{formatCad(objective.total_sales_basis_amount)}</strong>
                      </div>
                      <div>
                        <span className="employe-sales-book-entry-stat-label">Montant calculé</span>
                        <strong>{formatCad(objective.total_calculated_amount)}</strong>
                      </div>
                    </div>
                  </div>
                </AppCard>
              );
            })}
          </div>
        )}
      </SectionCard>

      <div className="tagora-panel-muted employe-sales-book-security">
        <ShieldCheck size={18} aria-hidden />
        <div>
          <p style={{ margin: 0, fontWeight: 700 }}>Confidentialité</p>
          <p style={{ margin: "6px 0 0" }}>
            Ces données sont visibles seulement par vous et les administrateurs autorisés.
          </p>
          <p className="tagora-note" style={{ margin: "8px 0 0", display: "flex", gap: 6, alignItems: "center" }}>
            <Lock size={14} aria-hidden />
            Consultation en lecture seule — aucune modification possible depuis cet espace.
          </p>
        </div>
      </div>

      <style jsx>{`
        .employe-sales-book-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        .employe-sales-book-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }
        .employe-sales-book-kpi {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 16px;
        }
        .employe-sales-book-kpi strong {
          font-size: 1.5rem;
          letter-spacing: -0.02em;
        }
        .employe-sales-book-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 10px;
          padding: 36px 24px;
        }
        .employe-sales-book-objectives {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .employe-sales-book-objective-card {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 18px;
        }
        .employe-sales-book-objective-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .employe-sales-book-objective-title {
          margin: 0;
          font-size: 1.15rem;
          letter-spacing: -0.02em;
        }
        .employe-sales-book-objective-desc {
          margin: 6px 0 0;
        }
        .employe-sales-book-objective-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.9rem;
          color: var(--ui-color-text-muted, #64748b);
        }
        .employe-sales-book-progress {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .employe-sales-book-progress-track {
          flex: 1;
          height: 8px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.25);
          overflow: hidden;
        }
        .employe-sales-book-progress-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #2563eb, #0ea5e9);
        }
        .employe-sales-book-progress-label {
          font-weight: 800;
          font-size: 0.85rem;
          min-width: 40px;
          text-align: right;
        }
        .employe-sales-book-entries {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 4px;
          border-top: 1px solid var(--ui-color-border, #e2e8f0);
        }
        .employe-sales-book-entries-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 10px;
        }
        .employe-sales-book-entry-stat-label {
          display: block;
          font-size: 0.75rem;
          color: var(--ui-color-text-muted, #64748b);
          margin-bottom: 2px;
        }
        .employe-sales-book-security {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          margin-top: 20px;
          padding: 16px 18px;
          border-radius: 14px;
        }
        .employe-sales-book-security p {
          color: var(--ui-color-text, #0f172a);
        }
      `}</style>
    </main>
  );
}

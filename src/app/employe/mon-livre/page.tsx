"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  Lock,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import AccessNotice from "@/app/components/AccessNotice";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { getHomePathForRole, type AppRole } from "@/app/lib/auth/roles";
import {
  formatCad,
  normalizeCommissionBasis,
  normalizeRuleType,
  OBJECTIVE_STATUS_LABELS,
  objectiveStatusTone,
  type ObjectiveStatus,
} from "@/app/lib/commissions/commissions.shared";
import {
  formatAchievedValue,
  formatAggregateSalesBasisDisplay,
  formatTargetTypeLabel,
  formatTargetValue,
  summarizeObjectiveRulesForDisplay,
  type CommissionRuleDisplayInput,
} from "@/app/lib/commissions/commission-display.shared";
import {
  getEmployeeSalesBookObjectiveProgress,
  summarizeEmployeeSalesBookKpis,
} from "@/app/lib/commissions/employee-sales-book-kpi.shared";
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

type EmployeeRuleDisplay = CommissionRuleDisplayInput & { objective_id: string };

type ObjectiveRulesSummary = ReturnType<typeof summarizeObjectiveRulesForDisplay>;

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

function mapEmployeeRuleRow(row: Record<string, unknown>): EmployeeRuleDisplay | null {
  const objective_id = String(row.objective_id ?? "");
  if (!objective_id) return null;
  return {
    objective_id,
    rule_type: normalizeRuleType(row.rule_type) ?? row.rule_type,
    commission_basis:
      row.commission_basis == null ? null : normalizeCommissionBasis(row.commission_basis),
    fixed_amount: row.fixed_amount == null ? null : Number(row.fixed_amount),
    percentage_rate: row.percentage_rate == null ? null : Number(row.percentage_rate),
    per_unit_amount: row.per_unit_amount == null ? null : Number(row.per_unit_amount),
    tier_config: Array.isArray(row.tier_config)
      ? (row.tier_config as CommissionRuleDisplayInput["tier_config"])
      : [],
  };
}

function sharedBooksHref(role: AppRole | null) {
  if (role === "admin") return "/direction/commissions";
  if (role === "direction") return "/direction/commissions";
  return getHomePathForRole(role ?? "employe");
}

function sharedBooksLabel(role: AppRole | null) {
  if (role === "admin" || role === "direction") return "Voir les livres autorisés";
  return "Retour au tableau de bord";
}

export default function EmployeMonLivrePage() {
  const router = useRouter();
  const { user, role, loading: accessLoading } = useCurrentAccess();

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [profileNotLinked, setProfileNotLinked] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [objectives, setObjectives] = useState<EmployeeSalesBookObjective[]>([]);
  const [rulesSummaryByObjectiveId, setRulesSummaryByObjectiveId] = useState<
    Record<string, ObjectiveRulesSummary>
  >({});

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
        setRulesSummaryByObjectiveId({});
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
        setRulesSummaryByObjectiveId({});
        setLoading(false);
        return;
      }

      if (response.status === 404) {
        setProfileNotLinked(true);
        setObjectives([]);
        setRulesSummaryByObjectiveId({});
        setLoading(false);
        return;
      }

      if (!response.ok) {
        setObjectives([]);
        setRulesSummaryByObjectiveId({});
        setErrorMessage(payload.error ?? "Impossible de charger votre livre de ventes.");
        setLoading(false);
        return;
      }

      const nextObjectives = Array.isArray(payload.objectives) ? payload.objectives : [];
      setObjectives(nextObjectives);

      const objectiveIds = nextObjectives.map((row) => row.id).filter(Boolean);
      if (objectiveIds.length === 0) {
        setRulesSummaryByObjectiveId({});
      } else {
        const { data: ruleRows, error: rulesError } = await supabase
          .from("commission_rules")
          .select(
            "objective_id, rule_type, commission_basis, fixed_amount, percentage_rate, per_unit_amount, tier_config"
          )
          .in("objective_id", objectiveIds);
        if (rulesError || !ruleRows) {
          setRulesSummaryByObjectiveId({});
        } else {
          const rulesByObjective = new Map<string, CommissionRuleDisplayInput[]>();
          for (const raw of ruleRows as Array<Record<string, unknown>>) {
            const mapped = mapEmployeeRuleRow(raw);
            if (!mapped) continue;
            const list = rulesByObjective.get(mapped.objective_id) ?? [];
            list.push(mapped);
            rulesByObjective.set(mapped.objective_id, list);
          }
          const nextSummaries: Record<string, ObjectiveRulesSummary> = {};
          for (const [objectiveId, rules] of rulesByObjective) {
            nextSummaries[objectiveId] = summarizeObjectiveRulesForDisplay(rules);
          }
          setRulesSummaryByObjectiveId(nextSummaries);
        }
      }

      setLoading(false);
    } catch {
      setObjectives([]);
      setRulesSummaryByObjectiveId({});
      setErrorMessage("Erreur réseau lors du chargement de votre livre.");
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!accessLoading && user && role === "employe") {
      void loadSalesBook();
    }
  }, [accessLoading, user, role, loadSalesBook]);

  const summary = useMemo(
    () => summarizeEmployeeSalesBookKpis(objectives),
    [objectives]
  );

  if (accessLoading) {
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
    return (
      <main className="page-container employe-sales-book-page">
        <AuthenticatedPageHeader
          title="Mon livre de ventes"
          subtitle="Espace réservé aux comptes employé."
        />
        <AccessNotice
          title="Réservé aux comptes employé"
          description="Cette page affiche le livre de ventes personnel d'un employé. Utilisez l'espace de consultation des livres autorisés si un accès vous a été partagé."
        />
        <Link href={sharedBooksHref(role)} className="tagora-dark-action employe-sales-book-wrong-role-cta">
          {sharedBooksLabel(role)}
        </Link>
        <style jsx>{`
          .employe-sales-book-wrong-role-cta {
            display: inline-flex;
            margin-top: 16px;
            text-decoration: none;
          }
        `}</style>
      </main>
    );
  }

  if (loading) {
    return <TagoraLoadingScreen isLoading message="Chargement de votre livre..." fullScreen />;
  }

  if (forbidden) {
    return (
      <main className="page-container employe-sales-book-page">
        <AuthenticatedPageHeader
          title="Mon livre de ventes"
          subtitle="Vos objectifs et commissions personnelles, en lecture seule."
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
          subtitle="Vos objectifs et commissions personnelles, en lecture seule."
        />
        <AppCard tone="muted" className="employe-sales-book-empty">
          <BookOpen size={28} strokeWidth={2} aria-hidden />
          <p className="employe-sales-book-empty-title">{PROFILE_NOT_LINKED_MESSAGE}</p>
          <p className="tagora-note employe-sales-book-empty-text">
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
        subtitle="Vos objectifs et commissions personnelles, en lecture seule."
      />

      <div className="employe-sales-book-badges">
        <StatusBadge label="Lecture seule" tone="info" />
        <StatusBadge label="Données personnelles" tone="success" />
      </div>

      {errorMessage ? (
        <div className="employe-sales-book-alert">
          <AccessNotice title="Chargement impossible" description={errorMessage} />
          <button type="button" className="tagora-dark-outline-action" onClick={() => void loadSalesBook()}>
            Réessayer
          </button>
        </div>
      ) : null}

      {!errorMessage ? (
        <SectionCard title="Vue d'ensemble" subtitle="Résumé de votre performance personnelle.">
          <div className="employe-sales-book-kpi-grid">
            <AppCard tone="muted" className="employe-sales-book-kpi-card">
              <div className="employe-sales-book-kpi-icon employe-sales-book-kpi-icon-target" aria-hidden>
                <Target size={20} />
              </div>
              <div>
                <div className="employe-sales-book-kpi-value">{summary.activeObjectives}</div>
                <div className="employe-sales-book-kpi-label">Objectifs actifs</div>
              </div>
            </AppCard>
            <AppCard tone="muted" className="employe-sales-book-kpi-card">
              <div className="employe-sales-book-kpi-icon employe-sales-book-kpi-icon-progress" aria-hidden>
                <TrendingUp size={20} />
              </div>
              <div>
                <div className="employe-sales-book-kpi-value">{summary.averageProgress}%</div>
                <div className="employe-sales-book-kpi-label">Progression moyenne</div>
              </div>
            </AppCard>
            <AppCard tone="muted" className="employe-sales-book-kpi-card">
              <div className="employe-sales-book-kpi-icon employe-sales-book-kpi-icon-wallet" aria-hidden>
                <Wallet size={20} />
              </div>
              <div>
                <div className="employe-sales-book-kpi-value">{formatCad(summary.totalCalculated)}</div>
                <div className="employe-sales-book-kpi-label">Commissions calculées</div>
              </div>
            </AppCard>
            <AppCard tone="muted" className="employe-sales-book-kpi-card">
              <div className="employe-sales-book-kpi-icon employe-sales-book-kpi-icon-entries" aria-hidden>
                <ClipboardList size={20} />
              </div>
              <div>
                <div className="employe-sales-book-kpi-value">
                  {summary.entriesPending} / {summary.entriesPaid}
                </div>
                <div className="employe-sales-book-kpi-label">Entrées à valider / payées</div>
              </div>
            </AppCard>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Mes objectifs"
        subtitle="Objectifs et commissions liés à votre profil uniquement."
      >
        {objectives.length === 0 ? (
          <AppCard tone="muted" className="employe-sales-book-empty">
            <BookOpen size={28} strokeWidth={2} aria-hidden />
            <p className="employe-sales-book-empty-title">Votre livre sera disponible ici</p>
            <p className="tagora-note employe-sales-book-empty-text">
              Dès qu&apos;un objectif ou une commission vous sera assigné, il apparaîtra dans cette
              page.
            </p>
          </AppCard>
        ) : (
          <div className="employe-sales-book-objectives">
            {objectives.map((objective) => {
              const status = normalizeObjectiveStatus(objective.status);
              const progress = getEmployeeSalesBookObjectiveProgress(objective);

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
                    <span>Type de cible : {formatTargetTypeLabel(objective.target_type)}</span>
                    <span>
                      Cible : {formatTargetValue(objective)} · Réalisé :{" "}
                      {formatAchievedValue(objective)}
                    </span>
                    {rulesSummaryByObjectiveId[objective.id] ? (
                      <>
                        <span>
                          Mode de rémunération :{" "}
                          {rulesSummaryByObjectiveId[objective.id].ruleTypeLabel}
                        </span>
                        <span>
                          Base de calcul : {rulesSummaryByObjectiveId[objective.id].basisLabel}
                        </span>
                        <span>
                          Détail : {rulesSummaryByObjectiveId[objective.id].ruleValueLabel}
                        </span>
                      </>
                    ) : null}
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
                    <div className="employe-sales-book-entries-title">Entrées de commission liées</div>
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
                        <strong>
                          {formatAggregateSalesBasisDisplay(
                            objective.total_sales_basis_amount,
                            rulesSummaryByObjectiveId[objective.id]?.basisKind ?? { kind: "none" }
                          )}
                        </strong>
                      </div>
                      <div>
                        <span className="employe-sales-book-entry-stat-label">Commission estimée</span>
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
          <p className="employe-sales-book-security-title">Confidentialité</p>
          <p className="employe-sales-book-security-text">
            Ces données sont visibles seulement par vous et les administrateurs autorisés.
          </p>
          <p className="tagora-note employe-sales-book-security-note">
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
        .employe-sales-book-alert {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
          margin-top: 16px;
        }
        .employe-sales-book-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 14px;
        }
        .employe-sales-book-kpi-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
        }
        .employe-sales-book-kpi-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          flex-shrink: 0;
        }
        .employe-sales-book-kpi-icon-target {
          background: linear-gradient(135deg, #f5f3ff, #ede9fe);
          color: #6d28d9;
        }
        .employe-sales-book-kpi-icon-progress {
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
          color: #1d4ed8;
        }
        .employe-sales-book-kpi-icon-wallet {
          background: linear-gradient(135deg, #ecfdf5, #d1fae5);
          color: #047857;
        }
        .employe-sales-book-kpi-icon-entries {
          background: linear-gradient(135deg, #fff7ed, #ffedd5);
          color: #c2410c;
        }
        .employe-sales-book-kpi-value {
          font-size: 1.45rem;
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }
        .employe-sales-book-kpi-label {
          font-weight: 700;
          color: #334155;
          margin-top: 4px;
          font-size: 0.92rem;
        }
        .employe-sales-book-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 10px;
          padding: 36px 24px;
        }
        .employe-sales-book-empty-title {
          margin: 0;
          font-weight: 800;
          font-size: 1.05rem;
          color: #334155;
        }
        .employe-sales-book-empty-text {
          margin: 0;
          max-width: 32rem;
          line-height: 1.5;
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
        .employe-sales-book-entries-title {
          font-weight: 700;
          font-size: 0.88rem;
          color: #334155;
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
        .employe-sales-book-security-title {
          margin: 0;
          font-weight: 700;
        }
        .employe-sales-book-security-text {
          margin: 6px 0 0;
          color: var(--ui-color-text, #0f172a);
        }
        .employe-sales-book-security-note {
          margin: 8px 0 0;
          display: flex;
          gap: 6px;
          align-items: center;
        }
      `}</style>
    </main>
  );
}

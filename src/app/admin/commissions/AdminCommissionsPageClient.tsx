"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  ClipboardList,
  KeyRound,
  LayoutList,
  PlusCircle,
  Target,
  WalletCards,
} from "lucide-react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AdminCommissionsNavigation from "@/app/components/admin/AdminCommissionsNavigation";
import AdminCommissionsMetricCard from "@/app/components/admin/AdminCommissionsMetricCard";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import AppCard from "@/app/components/ui/AppCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import {
  CommissionActionGroup,
  CommissionAmount,
  CommissionProgressBar,
  CommissionQuickActions,
} from "@/app/admin/commissions/commission-module-ui";
import {
  filterRecentPayPlanResultsForOrganization,
  readRecentPayPlanResults,
  type RecentPayPlanResultItem,
} from "@/app/admin/commissions/recent-pay-plan-results.shared";
import {
  formatCad as formatCadPayPlan,
  formatFrDateTime,
  PayPlanStatusBadge,
} from "@/app/admin/commissions/plans/pay-plan-readability";
import {
  COMMISSION_STATUS_LABELS,
  OBJECTIVE_STATUS_LABELS,
  formatCad,
  formatCommissionBasisDisplay,
  firstDayOfMonthIsoLocal,
  todayIsoLocal,
  commissionStatusTone,
  normalizeCommissionBasis,
  normalizeRuleType,
  objectiveStatusTone,
  type CommissionEntryRow,
  type CommissionTier,
  type CommissionsSummary,
  type RuleType,
  type SalesObjectiveRow,
  type TargetType,
} from "@/app/lib/commissions/commissions.shared";
import {
  formatAchievedValue,
  formatCommissionRuleValue,
  formatRuleTypeLabel,
  formatTargetTypeLabel,
  formatTargetValue,
  summarizeObjectiveRulesForDisplay,
  type CommissionRuleDisplayInput,
} from "@/app/lib/commissions/commission-display.shared";
import {
  applyCommissionBasisChange,
  applyRuleTypeChange,
  applyTargetTypeChange,
  COMMISSION_BASIS_FORM_OPTIONS,
  emptyAdminCreateObjectiveForm,
  RULE_TYPE_FORM_OPTIONS,
  TARGET_TYPE_FORM_OPTIONS,
  validateAndBuildAdminCreateObjectivePayload,
  type AdminCreateObjectiveFormState,
} from "@/app/lib/commissions/admin-create-objective-form.shared";
import { resolveSingleMembershipOrganizationPreselect } from "@/app/lib/auth/organization-access.shared";

type ChauffeurOption = {
  id: number;
  label: string;
};

type OrganizationOption = {
  id: string;
  display_name: string;
};

type AdminRuleDisplayRow = CommissionRuleDisplayInput & {
  id: string;
  objective_id: string;
};

function emptyForm(): AdminCreateObjectiveFormState {
  return emptyAdminCreateObjectiveForm({
    period_start: firstDayOfMonthIsoLocal(),
    period_end: todayIsoLocal(),
  });
}

function mapRuleDisplayRow(row: Record<string, unknown>): AdminRuleDisplayRow | null {
  const id = String(row.id ?? "");
  const objective_id = String(row.objective_id ?? "");
  if (!id || !objective_id) return null;
  const rule_type = normalizeRuleType(row.rule_type) ?? row.rule_type;
  const commission_basis =
    row.commission_basis == null ? null : normalizeCommissionBasis(row.commission_basis);
  const tier_config = Array.isArray(row.tier_config)
    ? (row.tier_config as CommissionTier[])
    : [];
  return {
    id,
    objective_id,
    rule_type,
    commission_basis,
    fixed_amount: row.fixed_amount == null ? null : Number(row.fixed_amount),
    percentage_rate: row.percentage_rate == null ? null : Number(row.percentage_rate),
    per_unit_amount: row.per_unit_amount == null ? null : Number(row.per_unit_amount),
    tier_config,
  };
}

function assigneeLabel(objective: SalesObjectiveRow) {
  if (objective.chauffeur_label?.trim()) return objective.chauffeur_label;
  if (objective.team_name?.trim()) return objective.team_name;
  return "Non assigne";
}

export default function AdminCommissionsPageClient() {
  const { user, loading: accessLoading } = useCurrentAccess();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [summary, setSummary] = useState<CommissionsSummary | null>(null);
  const [objectives, setObjectives] = useState<SalesObjectiveRow[]>([]);
  const [entries, setEntries] = useState<CommissionEntryRow[]>([]);
  const [rulesById, setRulesById] = useState<Record<string, AdminRuleDisplayRow>>({});
  const [rulesByObjectiveId, setRulesByObjectiveId] = useState<
    Record<string, AdminRuleDisplayRow[]>
  >({});
  const [chauffeurs, setChauffeurs] = useState<ChauffeurOption[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<AdminCreateObjectiveFormState>(() => emptyForm());
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [commissionFilter, setCommissionFilter] = useState<
    "all" | "pending_validation" | "paid" | "estimated"
  >("all");
  const [recentPayPlanResults, setRecentPayPlanResults] = useState<
    RecentPayPlanResultItem[]
  >([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setMessageType(null);

    const [summaryRes, objectivesRes, entriesRes, orgsRes, chauffeursRes] = await Promise.all([
      commissionsFetch("/api/direction/commissions/summary"),
      commissionsFetch("/api/direction/commissions/objectives"),
      commissionsFetch("/api/direction/commissions/entries"),
      commissionsFetch("/api/admin/commissions/organizations"),
      supabase
        .from("chauffeurs")
        .select("id, nom, prenom, nom_complet, actif")
        .order("nom", { ascending: true }),
    ]);

    const summaryJson = (await summaryRes.json().catch(() => ({}))) as {
      summary?: CommissionsSummary;
      error?: string;
    };
    const objectivesJson = (await objectivesRes.json().catch(() => ({}))) as {
      objectives?: SalesObjectiveRow[];
      error?: string;
    };
    const entriesJson = (await entriesRes.json().catch(() => ({}))) as {
      entries?: CommissionEntryRow[];
      error?: string;
    };
    const orgsJson = (await orgsRes.json().catch(() => ({}))) as {
      organizations?: OrganizationOption[];
      error?: string;
    };
    if (orgsRes.ok && Array.isArray(orgsJson.organizations)) {
      const nextOrgs = orgsJson.organizations;
      setOrganizations(nextOrgs);
      setCreateForm((prev) => {
        if (prev.organization_id) return prev;
        const preselect = resolveSingleMembershipOrganizationPreselect(
          nextOrgs.map((row) => ({ organizationId: row.id }))
        );
        return preselect ? { ...prev, organization_id: preselect } : prev;
      });
    } else {
      setOrganizations([]);
    }

    if (!summaryRes.ok || !objectivesRes.ok || !entriesRes.ok) {
      setSummary(null);
      setObjectives([]);
      setEntries([]);
      setRulesById({});
      setRulesByObjectiveId({});
      setMessage(
        summaryJson.error ||
          objectivesJson.error ||
          entriesJson.error ||
          "Impossible de charger le module commissions."
      );
      setMessageType("error");
    } else {
      const nextEntries = Array.isArray(entriesJson.entries) ? entriesJson.entries : [];
      const nextObjectives = Array.isArray(objectivesJson.objectives)
        ? objectivesJson.objectives
        : [];
      setSummary(summaryJson.summary ?? null);
      setObjectives(nextObjectives);
      setEntries(nextEntries);

      const objectiveIds = nextObjectives.map((row) => row.id).filter(Boolean);
      if (objectiveIds.length === 0) {
        setRulesById({});
        setRulesByObjectiveId({});
      } else {
        const { data: ruleRows, error: rulesError } = await supabase
          .from("commission_rules")
          .select(
            "id, objective_id, rule_type, commission_basis, fixed_amount, percentage_rate, per_unit_amount, tier_config"
          )
          .in("objective_id", objectiveIds);
        if (rulesError || !ruleRows) {
          setRulesById({});
          setRulesByObjectiveId({});
        } else {
          const byId: Record<string, AdminRuleDisplayRow> = {};
          const byObjective: Record<string, AdminRuleDisplayRow[]> = {};
          for (const raw of ruleRows as Array<Record<string, unknown>>) {
            const mapped = mapRuleDisplayRow(raw);
            if (!mapped) continue;
            byId[mapped.id] = mapped;
            const list = byObjective[mapped.objective_id] ?? [];
            list.push(mapped);
            byObjective[mapped.objective_id] = list;
          }
          setRulesById(byId);
          setRulesByObjectiveId(byObjective);
        }
      }
    }

    if (!chauffeursRes.error) {
      setChauffeurs(
        (chauffeursRes.data ?? [])
          .map((row) => {
            const record = row as Record<string, unknown>;
            const id = Number(record.id);
            const label = String(
              record.nom_complet ||
                [record.prenom, record.nom].filter(Boolean).join(" ") ||
                `#${id}`
            ).trim();
            return Number.isFinite(id) ? { id, label } : null;
          })
          .filter((item): item is ChauffeurOption => item !== null)
      );
    } else {
      setChauffeurs([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (accessLoading || !user) return;
    void loadData();
  }, [accessLoading, loadData, user]);

  useEffect(() => {
    setRecentPayPlanResults(readRecentPayPlanResults());
  }, [loading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "nouvel-objectif") {
        setShowCreateForm(true);
        setCommissionFilter("all");
      } else if (hash === "commissions-a-valider") {
        setCommissionFilter("pending_validation");
      } else if (hash === "commissions-payees") {
        setCommissionFilter("paid");
      } else if (hash === "commissions-estimees") {
        setCommissionFilter("estimated");
      } else if (hash === "objectifs" || hash === "resultats-plans") {
        setCommissionFilter("all");
      }
      if (!hash) return;
      window.requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const scopedRecentPayPlanResults = useMemo(() => {
    const orgId = createForm.organization_id || organizations[0]?.id || "";
    if (!orgId) return recentPayPlanResults.slice(0, 6);
    return filterRecentPayPlanResultsForOrganization(
      recentPayPlanResults,
      orgId
    ).slice(0, 6);
  }, [createForm.organization_id, organizations, recentPayPlanResults]);

  const filteredEntries = useMemo(() => {
    if (commissionFilter === "all") return entries;
    return entries.filter((entry) => entry.status === commissionFilter);
  }, [commissionFilter, entries]);

  const kpiCards = useMemo(
    () => [
      {
        label: "Objectifs actifs",
        value: String(summary?.activeObjectives ?? 0),
        valueIsCurrency: false,
        href: "/admin/commissions#objectifs",
      },
      {
        label: "Objectifs atteints",
        value: String(summary?.achievedObjectives ?? 0),
        valueIsCurrency: false,
        href: "/admin/commissions#objectifs",
      },
      {
        label: "Objectifs en retard",
        value: String(summary?.behindObjectives ?? 0),
        valueIsCurrency: false,
        href: "/admin/commissions#objectifs",
      },
      {
        label: "Commissions estimées",
        value: formatCad(summary?.estimatedCommissions ?? 0),
        valueIsCurrency: true,
        href: "/admin/commissions#commissions-estimees",
      },
      {
        label: "À valider",
        value: formatCad(summary?.pendingValidationCommissions ?? 0),
        valueIsCurrency: true,
        href: "/admin/commissions#commissions-a-valider",
      },
      {
        label: "Commissions payées",
        value: formatCad(summary?.paidCommissions ?? 0),
        valueIsCurrency: true,
        href: "/admin/commissions#commissions-payees",
      },
    ],
    [summary]
  );

  const quickActions = useMemo(
    () => [
      {
        key: "new-objective",
        href: "/admin/commissions#nouvel-objectif",
        title: "Nouvel objectif",
        description: "Créer un objectif de vente en une étape.",
        icon: PlusCircle,
        primary: true,
      },
      {
        key: "manage-objectives",
        href: "/admin/commissions#objectifs",
        title: "Gérer les objectifs",
        description: "Voir la progression et saisir une réalisation.",
        icon: Target,
      },
      {
        key: "create-plan",
        href: "/admin/commissions/plans#nouveau-plan",
        title: "Créer un plan",
        description: "Démarrer un modèle de rémunération.",
        icon: WalletCards,
      },
      {
        key: "manage-plans",
        href: "/admin/commissions/plans",
        title: "Gérer les plans",
        description: "Versions, règles, affectations et calcul.",
        icon: LayoutList,
        primary: true,
      },
      {
        key: "results",
        href: "/admin/commissions#resultats-plans",
        title: "Voir les résultats",
        description: "Retrouver rapidement les commissions calculées.",
        icon: ClipboardList,
      },
      {
        key: "pending",
        href: "/admin/commissions#commissions-a-valider",
        title: "Commissions à valider",
        description: "Traiter les montants en attente.",
        icon: BadgeCheck,
      },
      {
        key: "paid",
        href: "/admin/commissions#commissions-payees",
        title: "Commissions payées",
        description: "Consulter l’historique payé.",
        icon: Banknote,
      },
      {
        key: "books",
        href: "/admin/commissions/acces-direction",
        title: "Partage des livres de ventes",
        description: "Configurer les accès de consultation.",
        icon: KeyRound,
      },
    ],
    []
  );

  async function createObjective(publish: boolean) {
    setSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const built = validateAndBuildAdminCreateObjectivePayload(createForm, publish);
      if (!built.ok) {
        throw new Error(built.error);
      }

      const res = await commissionsFetch("/api/direction/commissions/objectives", {
        method: "POST",
        body: JSON.stringify(built.payload),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Creation impossible.");

      setShowCreateForm(false);
      setCreateForm(emptyForm());
      setMessage(publish ? "Objectif créé" : "Objectif créé");
      setMessageType("success");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur creation.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function updateAchieved(objective: SalesObjectiveRow) {
    const promptValue =
      objective.target_type === "amount"
        ? window.prompt("Realise ($ CAD)", String(objective.achieved_amount ?? 0))
        : window.prompt("Realise (nombre de ventes)", String(objective.achieved_sales_count ?? 0));
    if (promptValue == null) return;

    setActionKey(`achieved:${objective.id}`);
    try {
      const body =
        objective.target_type === "amount"
          ? { achieved_amount: Number(promptValue) }
          : { achieved_sales_count: Number(promptValue) };

      const res = await commissionsFetch(`/api/direction/commissions/objectives/${objective.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Mise a jour impossible.");
      setMessage("Réalisation enregistrée");
      setMessageType("success");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur saisie réalisée.");
      setMessageType("error");
    } finally {
      setActionKey(null);
    }
  }

  async function editObjective(objective: SalesObjectiveRow) {
    const title = window.prompt("Titre de l'objectif", objective.title);
    if (title == null) return;

    setActionKey(`edit:${objective.id}`);
    try {
      const res = await commissionsFetch(`/api/direction/commissions/objectives/${objective.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.trim() }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Edition impossible.");
      setMessage("Objectif mis a jour.");
      setMessageType("success");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur edition.");
      setMessageType("error");
    } finally {
      setActionKey(null);
    }
  }

  async function publishObjective(objectiveId: string) {
    setActionKey(`publish:${objectiveId}`);
    try {
      const res = await commissionsFetch(`/api/direction/commissions/objectives/${objectiveId}`, {
        method: "PATCH",
        body: JSON.stringify({ publish: true }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Publication impossible.");
      setMessage("Objectif publie.");
      setMessageType("success");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur publication.");
      setMessageType("error");
    } finally {
      setActionKey(null);
    }
  }

  async function cancelObjective(objectiveId: string) {
    if (!window.confirm("Annuler cet objectif et les commissions estimees / a valider associees ?")) {
      return;
    }

    setActionKey(`cancel:${objectiveId}`);
    try {
      const res = await commissionsFetch(`/api/direction/commissions/objectives/${objectiveId}`, {
        method: "DELETE",
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Annulation impossible.");
      setMessage("Objectif annule.");
      setMessageType("success");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur annulation.");
      setMessageType("error");
    } finally {
      setActionKey(null);
    }
  }

  async function recalculateObjective(objectiveId: string) {
    setActionKey(`recalc:${objectiveId}`);
    try {
      const res = await commissionsFetch(
        `/api/direction/commissions/objectives/${objectiveId}/recalculate`,
        { method: "POST" }
      );
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Recalcul impossible.");
      setMessage("Commissions recalculees.");
      setMessageType("success");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur recalcul.");
      setMessageType("error");
    } finally {
      setActionKey(null);
    }
  }

  async function patchEntry(entryId: string, action: "validate" | "pay" | "cancel") {
    setActionKey(`${action}:${entryId}`);
    try {
      const res = await commissionsFetch(`/api/direction/commissions/entries/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Action impossible.");
      setMessage("Commission mise a jour.");
      setMessageType("success");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur commission.");
      setMessageType("error");
    } finally {
      setActionKey(null);
    }
  }

  if (accessLoading || loading) {
    return (
      <TagoraLoadingScreen isLoading message="Chargement du module commissions admin..." fullScreen />
    );
  }

  if (!user) return null;

  return (
    <main className="page-container commissions-page">
      <AuthenticatedPageHeader
        className="ui-page-header-premium-2027"
        eyebrow="Finance · Administration"
        title="Commissions et objectifs"
        subtitle="Créez des objectifs, gérez les plans et validez les commissions."
        showNavigation={false}
        navigation={<AdminCommissionsNavigation variant="commissions" />}
      />

      {message && messageType ? <FeedbackMessage message={message} type={messageType} /> : null}

      <SectionCard
        title="Actions rapides"
        subtitle="Les actions principales du module, en un clic."
      >
        <CommissionQuickActions actions={quickActions} />
      </SectionCard>

      <section className="admin-commissions-metric-grid" aria-label="Indicateurs">
        {kpiCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <AdminCommissionsMetricCard
              label={card.label}
              value={card.value}
              valueIsCurrency={card.valueIsCurrency}
            />
          </Link>
        ))}
      </section>

      <SectionCard
        id="resultats-plans"
        title="Derniers résultats de commission"
        subtitle="Retrouvez rapidement un résultat de plan, dont le QA 50,00 $."
      >
        {scopedRecentPayPlanResults.length === 0 ? (
          <p className="ui-text-muted">
            Aucun résultat de plan mémorisé pour le moment. Calculez une commission
            depuis un plan pour l’afficher ici.
          </p>
        ) : (
          <div className="commissions-list">
            {scopedRecentPayPlanResults.map((result) => (
              <AppCard key={`${result.organizationId}-${result.accrualId}`}>
                <div className="commissions-list-head">
                  <div style={{ display: "grid", gap: 6 }}>
                    <strong style={{ fontSize: 17, color: "#0f172a" }}>
                      {result.beneficiaryPrimary}
                    </strong>
                    <span className="ui-text-muted">{result.planName}</span>
                  </div>
                  <PayPlanStatusBadge status={result.status} />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "end",
                    marginTop: 12,
                  }}
                >
                  <CommissionAmount
                    label="Montant"
                    amountLabel={formatCadPayPlan(result.amount)}
                  />
                  <div style={{ display: "grid", gap: 4 }}>
                    <span className="ui-text-muted" style={{ fontSize: 12 }}>
                      Date
                    </span>
                    <strong style={{ color: "#0f172a" }}>
                      {result.processedAt
                        ? formatFrDateTime(result.processedAt)
                        : "—"}
                    </strong>
                  </div>
                  <Link
                    href={`/admin/commissions/plans/results/${result.accrualId}?organization_id=${encodeURIComponent(result.organizationId)}`}
                    className="tagora-dark-action tagora-page-navigation-button"
                  >
                    Voir le résultat
                  </Link>
                </div>
              </AppCard>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="commissions-toolbar" id="nouvel-objectif">
        <button
          type="button"
          className="tagora-dark-action"
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          {showCreateForm ? "Fermer le formulaire" : "Nouvel objectif"}
        </button>
      </div>

      {showCreateForm ? (
        <SectionCard title="Créer un objectif" subtitle="Saisie admin finance (montants et règles).">
          <div className="commissions-form-grid">
            <label className="tagora-field">
              <span className="tagora-label">Titre</span>
              <input
                className="tagora-input"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Employe / representant</span>
              <select
                className="tagora-input"
                value={createForm.chauffeur_id}
                onChange={(e) => setCreateForm({ ...createForm, chauffeur_id: e.target.value })}
              >
                <option value="">— Choisir —</option>
                {chauffeurs.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Equipe (si pas d employe)</span>
              <input
                className="tagora-input"
                value={createForm.team_name}
                onChange={(e) => setCreateForm({ ...createForm, team_name: e.target.value })}
                placeholder="Ex.: Equipe showroom"
              />
            </label>
            {!createForm.chauffeur_id ? (
              <label className="tagora-field">
                <span className="tagora-label">Organisation (objectif d’équipe)</span>
                <select
                  className="tagora-input"
                  value={createForm.organization_id}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, organization_id: e.target.value })
                  }
                >
                  <option value="">— Choisir une organisation —</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.display_name}
                    </option>
                  ))}
                </select>
                <span className="tagora-note">
                  Clé = UUID organisations.id. Présélection uniquement s’il n’existe qu’une
                  membership active.
                </span>
              </label>
            ) : null}
            <label className="tagora-field">
              <span className="tagora-label">Debut periode</span>
              <input
                type="date"
                className="tagora-input"
                value={createForm.period_start}
                onChange={(e) => setCreateForm({ ...createForm, period_start: e.target.value })}
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Fin periode</span>
              <input
                type="date"
                className="tagora-input"
                value={createForm.period_end}
                onChange={(e) => setCreateForm({ ...createForm, period_end: e.target.value })}
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Type de cible</span>
              <select
                className="tagora-input"
                value={createForm.target_type}
                onChange={(e) => {
                  const nextType: TargetType =
                    e.target.value === "sales_count" ? "sales_count" : "amount";
                  setCreateForm(applyTargetTypeChange(createForm, nextType));
                }}
              >
                {TARGET_TYPE_FORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {createForm.target_type === "amount" ? (
              <label className="tagora-field">
                <span className="tagora-label">Montant cible</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="tagora-input"
                  value={createForm.target_amount}
                  onChange={(e) => setCreateForm({ ...createForm, target_amount: e.target.value })}
                  placeholder="Ex. : 100000"
                />
              </label>
            ) : (
              <label className="tagora-field">
                <span className="tagora-label">Nombre d’unités cible</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="tagora-input"
                  value={createForm.target_sales_count}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, target_sales_count: e.target.value })
                  }
                  placeholder="Ex. : 10"
                />
              </label>
            )}
            <label className="tagora-field">
              <span className="tagora-label">Mode de rémunération</span>
              <select
                className="tagora-input"
                value={createForm.rule_type}
                onChange={(e) => {
                  const nextType = (["fixed", "percentage", "tier_bonus", "per_unit"] as const).includes(
                    e.target.value as RuleType
                  )
                    ? (e.target.value as RuleType)
                    : "fixed";
                  setCreateForm(applyRuleTypeChange(createForm, nextType));
                }}
              >
                {RULE_TYPE_FORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Base de calcul</span>
              <select
                className="tagora-input"
                value={createForm.commission_basis}
                onChange={(e) => {
                  const nextBasis =
                    e.target.value === "achieved_sales_count"
                      ? "achieved_sales_count"
                      : "achieved_amount";
                  setCreateForm(applyCommissionBasisChange(createForm, nextBasis));
                }}
              >
                {COMMISSION_BASIS_FORM_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={
                      createForm.rule_type === "per_unit" && option.value === "achieved_amount"
                    }
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {createForm.rule_type === "fixed" ? (
              <label className="tagora-field">
                <span className="tagora-label">Montant fixe</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="tagora-input"
                  value={createForm.fixed_amount}
                  onChange={(e) => setCreateForm({ ...createForm, fixed_amount: e.target.value })}
                />
              </label>
            ) : null}
            {createForm.rule_type === "percentage" ? (
              <label className="tagora-field">
                <span className="tagora-label">Pourcentage</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="tagora-input"
                  value={createForm.percentage_rate}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, percentage_rate: e.target.value })
                  }
                  placeholder="Ex. : 5"
                />
              </label>
            ) : null}
            {createForm.rule_type === "tier_bonus" ? (
              <>
                <label className="tagora-field">
                  <span className="tagora-label">
                    {createForm.commission_basis === "achieved_sales_count"
                      ? "Seuil (unités)"
                      : "Seuil (montant)"}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step={createForm.commission_basis === "achieved_sales_count" ? "1" : "0.01"}
                    className="tagora-input"
                    value={createForm.tier_threshold}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, tier_threshold: e.target.value })
                    }
                  />
                </label>
                <label className="tagora-field">
                  <span className="tagora-label">Bonus du palier</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="tagora-input"
                    value={createForm.tier_bonus_amount}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, tier_bonus_amount: e.target.value })
                    }
                  />
                </label>
              </>
            ) : null}
            {createForm.rule_type === "per_unit" ? (
              <label className="tagora-field">
                <span className="tagora-label">Montant par unité</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="tagora-input"
                  value={createForm.per_unit_amount}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, per_unit_amount: e.target.value })
                  }
                  placeholder="Ex. : 100"
                />
                <span className="tagora-note">Ex. : 100 $ par unité réalisée</span>
              </label>
            ) : null}
            <label className="tagora-field commissions-form-span-2">
              <span className="tagora-label">Description</span>
              <textarea
                className="tagora-textarea"
                rows={3}
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              />
            </label>
          </div>
          <div className="commissions-form-actions">
            <button
              type="button"
              className="tagora-dark-outline-action"
              disabled={saving}
              onClick={() => void createObjective(false)}
            >
              Enregistrer brouillon
            </button>
            <button
              type="button"
              className="tagora-dark-action"
              disabled={saving}
              onClick={() => void createObjective(true)}
            >
              {saving ? "Enregistrement..." : "Publier objectif"}
            </button>
          </div>
        </SectionCard>
      ) : null}

      <div className="commissions-panels">
        <SectionCard
          id="objectifs"
          title="Objectifs"
          subtitle="Performance par employé, représentant ou équipe."
        >
          {objectives.length === 0 ? (
            <p className="ui-text-muted">
              Aucun objectif pour le moment. Utilisez « Nouvel objectif ».
            </p>
          ) : (
            <div className="commissions-list">
              {objectives.map((objective) => {
                const status = objective.computed_status ?? objective.status;
                const summaryRules = summarizeObjectiveRulesForDisplay(
                  rulesByObjectiveId[objective.id] ?? []
                );
                return (
                  <AppCard key={objective.id} className="commissions-list-item">
                    <div className="commissions-list-head">
                      <div style={{ display: "grid", gap: 6 }}>
                        <strong style={{ fontSize: 17, color: "#0f172a" }}>
                          {objective.title}
                        </strong>
                        <p className="ui-text-muted" style={{ margin: 0 }}>
                          {assigneeLabel(objective)}
                        </p>
                        <p className="ui-text-muted" style={{ margin: 0 }}>
                          {objective.period_start} → {objective.period_end}
                        </p>
                      </div>
                      <StatusBadge
                        label={OBJECTIVE_STATUS_LABELS[status]}
                        tone={objectiveStatusTone(status)}
                      />
                    </div>
                    <div className="commissions-list-meta">
                      <span>Type de cible : {formatTargetTypeLabel(objective.target_type)}</span>
                      <span>Cible : {formatTargetValue(objective)}</span>
                      <span>Réalisé : {formatAchievedValue(objective)}</span>
                      <span>Mode : {summaryRules.ruleTypeLabel}</span>
                      <span>Base : {summaryRules.basisLabel}</span>
                      {summaryRules.ruleValueLabel !== "—" ? (
                        <span>Détail : {summaryRules.ruleValueLabel}</span>
                      ) : null}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <CommissionProgressBar percent={objective.progress_percent ?? 0} />
                    </div>
                    <CommissionActionGroup
                      primary={
                        <button
                          type="button"
                          className="tagora-dark-action"
                          disabled={actionKey != null}
                          onClick={() => void updateAchieved(objective)}
                        >
                          Saisir une réalisation
                        </button>
                      }
                      secondary={
                        <>
                          <button
                            type="button"
                            className="tagora-dark-outline-action"
                            disabled={actionKey != null}
                            onClick={() => void editObjective(objective)}
                          >
                            Modifier l’objectif
                          </button>
                          {objective.status === "draft" ? (
                            <button
                              type="button"
                              className="tagora-dark-outline-action"
                              disabled={actionKey != null}
                              onClick={() => void publishObjective(objective.id)}
                            >
                              Publier
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="tagora-dark-outline-action"
                            disabled={actionKey != null}
                            onClick={() => void recalculateObjective(objective.id)}
                          >
                            Recalculer
                          </button>
                          {status !== "cancelled" ? (
                            <button
                              type="button"
                              className="tagora-dark-outline-action"
                              disabled={actionKey != null}
                              onClick={() => void cancelObjective(objective.id)}
                            >
                              Annuler
                            </button>
                          ) : null}
                        </>
                      }
                    />
                  </AppCard>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          id="commissions-a-valider"
          title="Commissions"
          subtitle="Estimées, à valider et payées."
        >
          <div id="commissions-estimees" />
          <div id="commissions-payees" />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {(
              [
                ["all", "Toutes"],
                ["estimated", "Estimées"],
                ["pending_validation", "À valider"],
                ["paid", "Payées"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  commissionFilter === value
                    ? "tagora-dark-action"
                    : "tagora-dark-outline-action"
                }
                onClick={() => setCommissionFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {filteredEntries.length === 0 ? (
            <p className="ui-text-muted">Aucune commission dans ce filtre.</p>
          ) : (
            <div className="commissions-list">
              {filteredEntries.map((entry) => (
                <AppCard key={entry.id} className="commissions-list-item">
                  <div className="commissions-list-head">
                    <div style={{ display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 17, color: "#0f172a" }}>
                        {entry.assignee_label || entry.label}
                      </strong>
                      <p className="ui-text-muted" style={{ margin: 0 }}>
                        {entry.objective_title || "Objectif"} · {entry.period_start} →{" "}
                        {entry.period_end}
                      </p>
                    </div>
                    <StatusBadge
                      label={COMMISSION_STATUS_LABELS[entry.status]}
                      tone={commissionStatusTone(entry.status)}
                    />
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      marginTop: 12,
                    }}
                  >
                    <CommissionAmount
                      label="Montant"
                      amountLabel={formatCad(entry.calculated_amount)}
                    />
                    <div style={{ display: "grid", gap: 4 }}>
                      <span className="ui-text-muted" style={{ fontSize: 12 }}>
                        Base de calcul
                      </span>
                      <strong style={{ color: "#0f172a" }}>
                        {formatCommissionBasisDisplay(
                          entry.sales_basis_amount,
                          entry.rule_id
                            ? (rulesById[entry.rule_id]?.commission_basis ?? null)
                            : null
                        )}
                      </strong>
                    </div>
                    {entry.rule_id && rulesById[entry.rule_id] ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        <span className="ui-text-muted" style={{ fontSize: 12 }}>
                          Règle
                        </span>
                        <strong style={{ color: "#0f172a" }}>
                          {formatRuleTypeLabel(rulesById[entry.rule_id].rule_type)} ·{" "}
                          {formatCommissionRuleValue(rulesById[entry.rule_id])}
                        </strong>
                      </div>
                    ) : null}
                    {entry.validated_at ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        <span className="ui-text-muted" style={{ fontSize: 12 }}>
                          Validée
                        </span>
                        <strong style={{ color: "#0f172a" }}>
                          {new Date(entry.validated_at).toLocaleString("fr-CA")}
                        </strong>
                      </div>
                    ) : null}
                    {entry.paid_at ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        <span className="ui-text-muted" style={{ fontSize: 12 }}>
                          Payée
                        </span>
                        <strong style={{ color: "#0f172a" }}>
                          {new Date(entry.paid_at).toLocaleString("fr-CA")}
                        </strong>
                      </div>
                    ) : null}
                  </div>
                  <CommissionActionGroup
                    primary={
                      entry.status === "pending_validation" ? (
                        <button
                          type="button"
                          className="tagora-dark-action"
                          disabled={actionKey != null}
                          onClick={() => void patchEntry(entry.id, "pay")}
                        >
                          Marquer payée
                        </button>
                      ) : entry.status === "estimated" ? (
                        <button
                          type="button"
                          className="tagora-dark-action"
                          disabled={actionKey != null}
                          onClick={() => void patchEntry(entry.id, "validate")}
                        >
                          Envoyer à valider
                        </button>
                      ) : null
                    }
                    secondary={
                      entry.status === "estimated" ||
                      entry.status === "pending_validation" ? (
                        <button
                          type="button"
                          className="tagora-dark-outline-action"
                          disabled={actionKey != null}
                          onClick={() => void patchEntry(entry.id, "cancel")}
                        >
                          Annuler
                        </button>
                      ) : null
                    }
                  />
                </AppCard>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <style jsx>{`
        :global(.admin-commissions-access-link) {
          display: block;
          text-decoration: none;
          color: inherit;
          margin-bottom: 20px;
        }
        :global(.admin-commissions-access-card) {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 14px;
          align-items: center;
          padding: 18px;
        }
        :global(.admin-commissions-access-icon) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
          color: #1d4ed8;
        }
        :global(.admin-commissions-access-cta) {
          white-space: nowrap;
        }
        .commissions-toolbar {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 16px;
        }
        .commissions-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .commissions-form-span-2 {
          grid-column: span 2;
        }
        .commissions-form-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 16px;
        }
        .commissions-panels {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .commissions-list {
          display: grid;
          gap: 12px;
        }
        .commissions-list-item {
          display: grid;
          gap: 10px;
        }
        .commissions-list-head,
        .commissions-list-meta,
        .commissions-list-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
        }
        .commissions-list-meta {
          color: var(--ui-text-muted, #64748b);
          font-size: 0.92rem;
        }
        @media (max-width: 1100px) {
          .commissions-panels,
          .commissions-form-grid {
            grid-template-columns: 1fr;
          }
          .commissions-form-span-2 {
            grid-column: span 1;
          }
        }
      `}</style>
    </main>
  );
}

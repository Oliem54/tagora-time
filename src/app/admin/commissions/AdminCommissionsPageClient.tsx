"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  withResolvedBeneficiaryNames,
  writeRecentPayPlanResults,
  type RecentPayPlanResultItem,
} from "@/app/admin/commissions/recent-pay-plan-results.shared";
import {
  ALL_SELLERS_KEY,
  buildCommissionSellerOptions,
  filterCommissionsBySeller,
  groupCommissionsBySeller,
  type PlanBeneficiarySellerSource,
} from "@/app/admin/commissions/commission-seller-filter.shared";
import {
  filterPayPlanResultsPendingValidation,
  formatPendingValidationCategoryCounts,
  isPayPlanResultPendingValidation,
  PENDING_OBJECTIVE_COMMISSIONS_EMPTY,
  PENDING_OBJECTIVE_COMMISSIONS_SECTION_TITLE,
  PENDING_PLAN_RESULT_CTA_LABEL,
  PENDING_PLAN_RESULTS_EMPTY,
  PENDING_PLAN_RESULTS_SECTION_TITLE,
  PENDING_VALIDATION_ZONE_TITLE,
} from "@/app/admin/commissions/pending-validation-workflow.shared";
import {
  filterPaidPayPlanResults,
  filterPayPlanResultsBySellerKey,
  formatIsoDateFrCa,
  formatPaidCategoryCounts,
  formatPayrollPeriodLabel,
  PAID_BY_CONFIRMED_BY_LABEL,
  PAID_OBJECTIVE_COMMISSIONS_EMPTY,
  PAID_OBJECTIVE_COMMISSIONS_SECTION_TITLE,
  PAID_PLAN_RESULT_CTA_LABEL,
  PAID_PLAN_RESULTS_EMPTY,
  PAID_PLAN_RESULTS_SECTION_SUBTITLE,
  PAID_PLAN_RESULTS_SECTION_TITLE,
  payrollReferenceDisplayLabel,
} from "@/app/lib/commissions/pay-plan-accrual-payment.shared";
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
import {
  readPayPlanOrganizationSession,
  resolvePayPlanOrganizationContext,
  withOrganizationId,
  writePayPlanOrganizationSession,
} from "@/app/lib/commissions/pay-plan-organization-context.shared";

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
  const searchParams = useSearchParams();
  const requestedOrganizationId = searchParams.get("organization_id") || "";

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
  const [sellerFilter, setSellerFilter] = useState<string>(ALL_SELLERS_KEY);
  const [recentPayPlanResults, setRecentPayPlanResults] = useState<
    RecentPayPlanResultItem[]
  >(() => readRecentPayPlanResults());
  const [planResultsLoading, setPlanResultsLoading] = useState(false);
  const [planResultsErrorCode, setPlanResultsErrorCode] = useState<string | null>(
    null
  );
  const [planAssigneeSellers, setPlanAssigneeSellers] = useState<
    PlanBeneficiarySellerSource[]
  >([]);

  const loadPlanAssigneeSellers = useCallback(
    async (
      organizationId: string,
      chauffeurOptions: ChauffeurOption[]
    ) => {
      const orgId = String(organizationId || "").trim();
      if (!orgId) {
        setPlanAssigneeSellers([]);
        return;
      }
      const plansRes = await commissionsFetch(
        `/api/admin/generic-pay-plans?organization_id=${encodeURIComponent(orgId)}`
      );
      const plansJson = (await plansRes.json().catch(() => ({}))) as {
        templates?: Array<{ id?: string; assignment_count?: number }>;
      };
      if (!plansRes.ok || !Array.isArray(plansJson.templates)) {
        setPlanAssigneeSellers([]);
        return;
      }
      const templatesWithAssignments = plansJson.templates
        .filter((row) => Number(row.assignment_count || 0) > 0 && row.id)
        .slice(0, 25);
      const chauffeurById = new Map(
        chauffeurOptions.map((row) => [row.id, row.label] as const)
      );
      const byEmployeeId = new Map<number, PlanBeneficiarySellerSource>();
      await Promise.all(
        templatesWithAssignments.map(async (template) => {
          const detailRes = await commissionsFetch(
            `/api/admin/generic-pay-plans/${encodeURIComponent(String(template.id))}?organization_id=${encodeURIComponent(orgId)}`
          );
          if (!detailRes.ok) return;
          const detailJson = (await detailRes.json().catch(() => ({}))) as {
            assignments?: Array<{ employee_id?: number | null }>;
          };
          for (const assignment of detailJson.assignments || []) {
            const employeeId = Math.trunc(Number(assignment.employee_id));
            if (!Number.isInteger(employeeId) || employeeId <= 0) continue;
            if (byEmployeeId.has(employeeId)) continue;
            const name = String(chauffeurById.get(employeeId) || "").trim();
            byEmployeeId.set(employeeId, {
              employeeId,
              primary: name || `Employé #${employeeId}`,
              secondary: `Employé #${employeeId}`,
            });
          }
        })
      );
      setPlanAssigneeSellers(Array.from(byEmployeeId.values()));
    },
    []
  );

  const loadPersistedPlanResults = useCallback(
    async (
      organizationId: string,
      chauffeurOptions: ChauffeurOption[] = []
    ) => {
      const orgId = String(organizationId || "").trim();
      if (!orgId) {
        setRecentPayPlanResults([]);
        setPlanResultsErrorCode("RESULTS_ORG_MISSING");
        return;
      }
      setPlanResultsLoading(true);
      setPlanResultsErrorCode(null);
      try {
        const res = await commissionsFetch(
          `/api/admin/generic-pay-plans/results?organization_id=${encodeURIComponent(orgId)}`
        );
        const json = (await res.json().catch(() => ({}))) as {
          results?: RecentPayPlanResultItem[];
          error?: string;
          diagnostic_code?: string;
        };
        if (!res.ok) {
          setRecentPayPlanResults([]);
          setPlanResultsErrorCode(
            String(json.diagnostic_code || `RESULTS_HTTP_${res.status}`)
          );
          return;
        }
        if (!Array.isArray(json.results)) {
          setRecentPayPlanResults([]);
          setPlanResultsErrorCode("RESULTS_INVALID_PAYLOAD");
          return;
        }
        const namesByEmployeeId = new Map(
          chauffeurOptions.map((row) => [row.id, row.label] as const)
        );
        const enriched = withResolvedBeneficiaryNames(
          json.results,
          namesByEmployeeId
        );
        setRecentPayPlanResults(enriched);
        writeRecentPayPlanResults(enriched);
        setPlanResultsErrorCode(null);
      } catch {
        setRecentPayPlanResults([]);
        setPlanResultsErrorCode("RESULTS_NETWORK");
      } finally {
        setPlanResultsLoading(false);
      }
    },
    []
  );

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
    let resolvedOrgId = "";
    if (orgsRes.ok && Array.isArray(orgsJson.organizations)) {
      const nextOrgs = orgsJson.organizations;
      setOrganizations(nextOrgs);
      const memberships = nextOrgs.map((row) => ({
        organizationId: row.id,
      }));
      const resolved = resolvePayPlanOrganizationContext({
        requestedOrganizationId: requestedOrganizationId || null,
        sessionOrganizationId: readPayPlanOrganizationSession(),
        memberships,
      });
      if (resolved.ok) {
        resolvedOrgId = resolved.organizationId;
        writePayPlanOrganizationSession(resolvedOrgId);
        setCreateForm((prev) =>
          prev.organization_id === resolvedOrgId
            ? prev
            : { ...prev, organization_id: resolvedOrgId }
        );
      } else {
        setCreateForm((prev) => {
          if (!prev.organization_id) return prev;
          const stillAllowed = memberships.some(
            (row) => row.organizationId === prev.organization_id
          );
          return stillAllowed ? prev : { ...prev, organization_id: "" };
        });
      }
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

    let nextChauffeurs: ChauffeurOption[] = [];
    if (!chauffeursRes.error) {
      nextChauffeurs = (chauffeursRes.data ?? [])
        .map((row) => {
          const record = row as Record<string, unknown>;
          const id = Number(record.id);
          const label = String(
            record.nom_complet ||
              [record.prenom, record.nom].filter(Boolean).join(" ") ||
              record.nom ||
              `Employé #${id}`
          ).trim();
          return Number.isFinite(id) ? { id, label } : null;
        })
        .filter((item): item is ChauffeurOption => item !== null);
      setChauffeurs(nextChauffeurs);
    } else {
      setChauffeurs([]);
    }

    await Promise.all([
      loadPersistedPlanResults(resolvedOrgId, nextChauffeurs),
      loadPlanAssigneeSellers(resolvedOrgId, nextChauffeurs),
    ]);
    setLoading(false);
  }, [
    loadPersistedPlanResults,
    loadPlanAssigneeSellers,
    requestedOrganizationId,
  ]);

  useEffect(() => {
    if (accessLoading || !user) return;
    void loadData();
  }, [accessLoading, loadData, user]);

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
    if (!orgId) return recentPayPlanResults.slice(0, 12);
    return filterRecentPayPlanResultsForOrganization(
      recentPayPlanResults,
      orgId
    ).slice(0, 12);
  }, [createForm.organization_id, organizations, recentPayPlanResults]);

  const pendingPayPlanResults = useMemo(
    () => filterPayPlanResultsPendingValidation(scopedRecentPayPlanResults),
    [scopedRecentPayPlanResults]
  );

  const paidPayPlanResults = useMemo(
    () => filterPaidPayPlanResults(scopedRecentPayPlanResults),
    [scopedRecentPayPlanResults]
  );

  const generalPayPlanResults = useMemo(() => {
    if (commissionFilter === "paid") {
      // Les plans payés sont listés dans la zone Payées (deux catégories).
      return [];
    }
    if (commissionFilter !== "pending_validation") {
      return scopedRecentPayPlanResults;
    }
    // Évite le doublon : les plans à valider sont listés dans « Éléments à valider ».
    return scopedRecentPayPlanResults.filter(
      (result) => !isPayPlanResultPendingValidation(result)
    );
  }, [commissionFilter, scopedRecentPayPlanResults]);

  const isPaidCommissionsWorkflow = commissionFilter === "paid";

  const statusFilteredEntries = useMemo(() => {
    if (commissionFilter === "all") return entries;
    return entries.filter((entry) => entry.status === commissionFilter);
  }, [commissionFilter, entries]);

  const isPendingValidationWorkflow =
    commissionFilter === "pending_validation";

  const planBeneficiarySellers = useMemo(() => {
    const byEmployeeId = new Map<number, PlanBeneficiarySellerSource>();
    for (const assignee of planAssigneeSellers) {
      byEmployeeId.set(assignee.employeeId, assignee);
    }
    for (const result of recentPayPlanResults) {
      if (
        result.employeeId == null ||
        !Number.isInteger(result.employeeId) ||
        result.employeeId <= 0
      ) {
        continue;
      }
      byEmployeeId.set(result.employeeId, {
        employeeId: result.employeeId,
        primary: result.beneficiaryPrimary,
        secondary: result.beneficiarySecondary,
      });
    }
    return Array.from(byEmployeeId.values());
  }, [planAssigneeSellers, recentPayPlanResults]);

  const sellerOptions = useMemo(
    () =>
      buildCommissionSellerOptions(
        statusFilteredEntries,
        planBeneficiarySellers
      ),
    [planBeneficiarySellers, statusFilteredEntries]
  );

  const filteredEntries = useMemo(
    () => filterCommissionsBySeller(statusFilteredEntries, sellerFilter),
    [sellerFilter, statusFilteredEntries]
  );

  const filteredPaidPayPlanResults = useMemo(
    () => filterPayPlanResultsBySellerKey(paidPayPlanResults, sellerFilter),
    [paidPayPlanResults, sellerFilter]
  );

  const pendingValidationCounts = useMemo(
    () =>
      formatPendingValidationCategoryCounts(
        pendingPayPlanResults.length,
        filteredEntries.length
      ),
    [filteredEntries.length, pendingPayPlanResults.length]
  );

  const paidCategoryCounts = useMemo(
    () =>
      formatPaidCategoryCounts(
        filteredPaidPayPlanResults.length,
        filteredEntries.length
      ),
    [filteredEntries.length, filteredPaidPayPlanResults.length]
  );

  const groupedEntries = useMemo(
    () => groupCommissionsBySeller(filteredEntries),
    [filteredEntries]
  );

  useEffect(() => {
    if (sellerFilter === ALL_SELLERS_KEY) return;
    if (sellerOptions.some((option) => option.key === sellerFilter)) return;
    setSellerFilter(ALL_SELLERS_KEY);
  }, [sellerFilter, sellerOptions]);

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
        title="Commissions et objectifs"
        showNavigation={false}
        navigation={
          <AdminCommissionsNavigation
            variant="commissions"
            organizationId={createForm.organization_id}
          />
        }
      />

      {message && messageType ? <FeedbackMessage message={message} type={messageType} /> : null}

      <SectionCard title="Actions rapides">
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

      {!isPendingValidationWorkflow && !isPaidCommissionsWorkflow ? (
        <SectionCard
          id="resultats-plans"
          title="Résultats des plans de rémunération"
          subtitle="Commissions calculées depuis les plans — distinctes des commissions d’objectifs."
        >
          {planResultsLoading ? (
            <p className="ui-text-muted">Chargement des résultats de plans…</p>
          ) : planResultsErrorCode ? (
            <div role="alert" style={{ display: "grid", gap: 6 }}>
              <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>
                Impossible de charger les résultats des plans. Veuillez
                actualiser la page.
              </p>
              <p className="ui-text-muted" style={{ margin: 0, fontSize: 12 }}>
                Code diagnostique : {planResultsErrorCode}
              </p>
            </div>
          ) : generalPayPlanResults.length === 0 ? (
            <p className="ui-text-muted">
              Aucun résultat persistant trouvé pour l’organisation active.
            </p>
          ) : (
            <div className="commissions-list">
              {generalPayPlanResults.map((result) => (
                <AppCard key={`${result.organizationId}-${result.accrualId}`}>
                  <div className="commissions-list-head">
                    <div style={{ display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 17, color: "#0f172a" }}>
                        {result.beneficiaryPrimary}
                      </strong>
                      {result.beneficiarySecondary ? (
                        <span className="ui-text-muted">
                          {result.beneficiarySecondary}
                        </span>
                      ) : null}
                      <span className="ui-text-muted">{result.planName}</span>
                    </div>
                    <PayPlanStatusBadge status={result.status} />
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      marginTop: 12,
                      fontSize: 13,
                      color: "#475569",
                    }}
                  >
                    <div>
                      <strong style={{ color: "#0f172a" }}>Version :</strong>{" "}
                      {result.versionLabel}
                    </div>
                    <div>
                      <strong style={{ color: "#0f172a" }}>Règle :</strong>{" "}
                      {result.ruleName}
                    </div>
                    <div>
                      <strong style={{ color: "#0f172a" }}>Base :</strong>{" "}
                      {formatCadPayPlan(result.basisAmount)}
                    </div>
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
                      label="Commission"
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
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <Link
                        href={withOrganizationId(
                          `/admin/commissions/plans/results/${result.accrualId}`,
                          result.organizationId
                        )}
                        className="tagora-dark-action tagora-page-navigation-button"
                      >
                        Voir la commission
                      </Link>
                      <Link
                        href={withOrganizationId(
                          `/admin/commissions/plans/${result.templateId}`,
                          result.organizationId
                        )}
                        className="tagora-dark-outline-action tagora-page-navigation-button"
                      >
                        Ouvrir le plan
                      </Link>
                    </div>
                  </div>
                </AppCard>
              ))}
            </div>
          )}
        </SectionCard>
      ) : (
        <div id="resultats-plans" className="commissions-anchor" />
      )}

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
        <SectionCard title="Créer un objectif">
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
                  onChange={(e) => {
                    const nextOrg = e.target.value;
                    setCreateForm({ ...createForm, organization_id: nextOrg });
                    writePayPlanOrganizationSession(nextOrg);
                    void loadPersistedPlanResults(nextOrg, chauffeurs);
                    void loadPlanAssigneeSellers(nextOrg, chauffeurs);
                  }}
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
        <SectionCard id="objectifs" title="Objectifs">
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
          className="commissions-panel-card"
          title={
            isPendingValidationWorkflow
              ? PENDING_VALIDATION_ZONE_TITLE
              : isPaidCommissionsWorkflow
                ? "Commissions payées"
                : "Commissions liées aux objectifs"
          }
          subtitle={
            isPendingValidationWorkflow
              ? "Deux catégories distinctes : résultats de plans et commissions d’objectifs."
              : isPaidCommissionsWorkflow
                ? "Deux catégories distinctes : résultats de plans payés et commissions d’objectifs payées."
                : "Estimées, à valider et payées — distinctes des résultats de plans."
          }
        >
          <div id="commissions-estimees" className="commissions-anchor" />
          <div id="commissions-payees" className="commissions-anchor" />
          {isPaidCommissionsWorkflow ? (
            <div id="resultats-plans-payes" className="commissions-anchor" />
          ) : null}
          <div className="commissions-controls">
            <div className="commissions-status-filters">
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
            <label className="commissions-seller-filter">
              <span>Vendeur / représentant</span>
              <select
                className="tagora-input"
                value={sellerFilter}
                onChange={(event) => setSellerFilter(event.target.value)}
              >
                <option value={ALL_SELLERS_KEY}>Tous les vendeurs</option>
                {sellerOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isPaidCommissionsWorkflow ? (
            <div style={{ display: "grid", gap: 20 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: 10,
                    background: "#e2e8f0",
                    color: "#0f172a",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {paidCategoryCounts.plansLabel}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: 10,
                    background: "#f1f5f9",
                    color: "#334155",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {paidCategoryCounts.objectivesLabel}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid #dbe3ef",
                  background: "#f8fafc",
                }}
              >
                <strong style={{ fontSize: 15, color: "#0f172a" }}>
                  {PAID_PLAN_RESULTS_SECTION_TITLE}
                </strong>
                <p className="ui-text-muted" style={{ margin: 0, fontSize: 13 }}>
                  {PAID_PLAN_RESULTS_SECTION_SUBTITLE}
                </p>
                {planResultsLoading ? (
                  <p className="ui-text-muted" style={{ margin: 0 }}>
                    Chargement des résultats de plans…
                  </p>
                ) : filteredPaidPayPlanResults.length === 0 ? (
                  <div className="commissions-empty-state" role="status">
                    <strong>{PAID_PLAN_RESULTS_EMPTY}</strong>
                  </div>
                ) : (
                  <div className="commissions-list">
                    {filteredPaidPayPlanResults.map((result) => (
                      <AppCard
                        key={`paid-${result.organizationId}-${result.accrualId}`}
                      >
                        <div className="commissions-list-head">
                          <div style={{ display: "grid", gap: 6 }}>
                            <strong style={{ fontSize: 17, color: "#0f172a" }}>
                              {result.beneficiaryPrimary}
                            </strong>
                            {result.beneficiarySecondary ? (
                              <span className="ui-text-muted">
                                {result.beneficiarySecondary}
                              </span>
                            ) : null}
                            <span className="ui-text-muted">
                              {result.planName}
                            </span>
                          </div>
                          <PayPlanStatusBadge status={result.status} />
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gap: 12,
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(140px, 1fr))",
                            marginTop: 12,
                          }}
                        >
                          <CommissionAmount
                            label="Commission"
                            amountLabel={formatCadPayPlan(result.amount)}
                          />
                          <div style={{ display: "grid", gap: 4 }}>
                            <span
                              className="ui-text-muted"
                              style={{ fontSize: 12 }}
                            >
                              Référence de paie
                            </span>
                            <strong
                              style={{
                                color: result.payrollReference
                                  ? "#0f172a"
                                  : "#9a3412",
                              }}
                            >
                              {payrollReferenceDisplayLabel({
                                payrollReference: result.payrollReference,
                              })}
                            </strong>
                          </div>
                          <div style={{ display: "grid", gap: 4 }}>
                            <span
                              className="ui-text-muted"
                              style={{ fontSize: 12 }}
                            >
                              Période de paie
                            </span>
                            <strong style={{ color: "#0f172a" }}>
                              {formatPayrollPeriodLabel({
                                periodStart: result.payrollPeriodStart,
                                periodEnd: result.payrollPeriodEnd,
                              }) || "—"}
                            </strong>
                          </div>
                          <div style={{ display: "grid", gap: 4 }}>
                            <span
                              className="ui-text-muted"
                              style={{ fontSize: 12 }}
                            >
                              Date de paie
                            </span>
                            <strong style={{ color: "#0f172a" }}>
                              {result.payrollPayDate
                                ? formatIsoDateFrCa(result.payrollPayDate)
                                : "—"}
                            </strong>
                          </div>
                          <div style={{ display: "grid", gap: 4 }}>
                            <span
                              className="ui-text-muted"
                              style={{ fontSize: 12 }}
                            >
                              {PAID_BY_CONFIRMED_BY_LABEL}
                            </span>
                            <strong style={{ color: "#0f172a" }}>
                              {result.paidByDisplay || "—"}
                            </strong>
                          </div>
                          <div style={{ display: "grid", gap: 4 }}>
                            <span
                              className="ui-text-muted"
                              style={{ fontSize: 12 }}
                            >
                              Confirmé le
                            </span>
                            <strong style={{ color: "#0f172a" }}>
                              {result.paidAt
                                ? formatFrDateTime(result.paidAt)
                                : "—"}
                            </strong>
                          </div>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <Link
                            href={withOrganizationId(
                          `/admin/commissions/plans/results/${result.accrualId}`,
                          result.organizationId
                        )}
                            className="tagora-dark-action tagora-page-navigation-button"
                          >
                            {PAID_PLAN_RESULT_CTA_LABEL}
                          </Link>
                        </div>
                      </AppCard>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                }}
              >
                <strong style={{ fontSize: 15, color: "#0f172a" }}>
                  {PAID_OBJECTIVE_COMMISSIONS_SECTION_TITLE}
                </strong>
                {filteredEntries.length === 0 ? (
                  <div className="commissions-empty-state" role="status">
                    <strong>{PAID_OBJECTIVE_COMMISSIONS_EMPTY}</strong>
                  </div>
                ) : (
                  <div className="commissions-list" style={{ gap: 18 }}>
                    {groupedEntries.map((group) => (
                      <div key={group.key} style={{ display: "grid", gap: 12 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                            alignItems: "center",
                            padding: "10px 12px",
                            borderRadius: 12,
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <strong style={{ fontSize: 16, color: "#0f172a" }}>
                            {group.label}
                          </strong>
                          <span
                            className="ui-text-muted"
                            style={{ fontWeight: 700 }}
                          >
                            {group.entries.length} commission
                            {group.entries.length > 1 ? "s" : ""}
                          </span>
                        </div>
                        {group.entries.map((entry) => (
                          <AppCard
                            key={entry.id}
                            className="commissions-list-item"
                          >
                            <div className="commissions-list-head">
                              <div style={{ display: "grid", gap: 6 }}>
                                <strong
                                  style={{ fontSize: 17, color: "#0f172a" }}
                                >
                                  {entry.assignee_label || entry.label}
                                </strong>
                                <p
                                  className="ui-text-muted"
                                  style={{ margin: 0 }}
                                >
                                  {entry.objective_title || "Objectif"} ·{" "}
                                  {entry.period_start} → {entry.period_end}
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
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(140px, 1fr))",
                                marginTop: 12,
                              }}
                            >
                              <CommissionAmount
                                label="Montant"
                                amountLabel={formatCad(entry.calculated_amount)}
                              />
                              {entry.paid_at ? (
                                <div style={{ display: "grid", gap: 4 }}>
                                  <span
                                    className="ui-text-muted"
                                    style={{ fontSize: 12 }}
                                  >
                                    Payée
                                  </span>
                                  <strong style={{ color: "#0f172a" }}>
                                    {new Date(entry.paid_at).toLocaleString(
                                      "fr-CA"
                                    )}
                                  </strong>
                                </div>
                              ) : null}
                            </div>
                          </AppCard>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : isPendingValidationWorkflow ? (
            <div style={{ display: "grid", gap: 20 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: 10,
                    background: "#e2e8f0",
                    color: "#0f172a",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {pendingValidationCounts.plansLabel}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: 10,
                    background: "#f1f5f9",
                    color: "#334155",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {pendingValidationCounts.objectivesLabel}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid #dbe3ef",
                  background: "#f8fafc",
                }}
              >
                <strong style={{ fontSize: 15, color: "#0f172a" }}>
                  {PENDING_PLAN_RESULTS_SECTION_TITLE}
                </strong>
                {planResultsLoading ? (
                  <p className="ui-text-muted" style={{ margin: 0 }}>
                    Chargement des résultats de plans…
                  </p>
                ) : pendingPayPlanResults.length === 0 ? (
                  <div className="commissions-empty-state" role="status">
                    <strong>{PENDING_PLAN_RESULTS_EMPTY}</strong>
                  </div>
                ) : (
                  <div className="commissions-list">
                    {pendingPayPlanResults.map((result) => (
                      <AppCard
                        key={`pending-${result.organizationId}-${result.accrualId}`}
                      >
                        <div className="commissions-list-head">
                          <div style={{ display: "grid", gap: 6 }}>
                            <strong style={{ fontSize: 17, color: "#0f172a" }}>
                              {result.beneficiaryPrimary}
                            </strong>
                            {result.beneficiarySecondary ? (
                              <span className="ui-text-muted">
                                {result.beneficiarySecondary}
                              </span>
                            ) : null}
                            <span className="ui-text-muted">
                              {result.planName}
                            </span>
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
                            label="Commission"
                            amountLabel={formatCadPayPlan(result.amount)}
                          />
                          <div style={{ display: "grid", gap: 4 }}>
                            <span
                              className="ui-text-muted"
                              style={{ fontSize: 12 }}
                            >
                              Date
                            </span>
                            <strong style={{ color: "#0f172a" }}>
                              {result.processedAt
                                ? formatFrDateTime(result.processedAt)
                                : "—"}
                            </strong>
                          </div>
                          <Link
                            href={withOrganizationId(
                          `/admin/commissions/plans/results/${result.accrualId}`,
                          result.organizationId
                        )}
                            className="tagora-dark-action tagora-page-navigation-button"
                          >
                            {PENDING_PLAN_RESULT_CTA_LABEL}
                          </Link>
                        </div>
                      </AppCard>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                }}
              >
                <strong style={{ fontSize: 15, color: "#0f172a" }}>
                  {PENDING_OBJECTIVE_COMMISSIONS_SECTION_TITLE}
                </strong>
                {filteredEntries.length === 0 ? (
                  <div className="commissions-empty-state" role="status">
                    <strong>{PENDING_OBJECTIVE_COMMISSIONS_EMPTY}</strong>
                  </div>
                ) : (
                  <div className="commissions-list" style={{ gap: 18 }}>
                    {groupedEntries.map((group) => (
                      <div key={group.key} style={{ display: "grid", gap: 12 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                            alignItems: "center",
                            padding: "10px 12px",
                            borderRadius: 12,
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <strong style={{ fontSize: 16, color: "#0f172a" }}>
                            {group.label}
                          </strong>
                          <span
                            className="ui-text-muted"
                            style={{ fontWeight: 700 }}
                          >
                            {group.entries.length} commission
                            {group.entries.length > 1 ? "s" : ""}
                          </span>
                        </div>
                        {group.entries.map((entry) => (
                          <AppCard
                            key={entry.id}
                            className="commissions-list-item"
                          >
                            <div className="commissions-list-head">
                              <div style={{ display: "grid", gap: 6 }}>
                                <strong
                                  style={{ fontSize: 17, color: "#0f172a" }}
                                >
                                  {entry.assignee_label || entry.label}
                                </strong>
                                <p
                                  className="ui-text-muted"
                                  style={{ margin: 0 }}
                                >
                                  {entry.objective_title || "Objectif"} ·{" "}
                                  {entry.period_start} → {entry.period_end}
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
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(140px, 1fr))",
                                marginTop: 12,
                              }}
                            >
                              <CommissionAmount
                                label="Montant"
                                amountLabel={formatCad(entry.calculated_amount)}
                              />
                              <div style={{ display: "grid", gap: 4 }}>
                                <span
                                  className="ui-text-muted"
                                  style={{ fontSize: 12 }}
                                >
                                  Base de calcul
                                </span>
                                <strong style={{ color: "#0f172a" }}>
                                  {formatCommissionBasisDisplay(
                                    entry.sales_basis_amount,
                                    entry.rule_id
                                      ? (rulesById[entry.rule_id]
                                          ?.commission_basis ?? null)
                                      : null
                                  )}
                                </strong>
                              </div>
                            </div>
                            <CommissionActionGroup
                              primary={
                                <button
                                  type="button"
                                  className="tagora-dark-action"
                                  disabled={actionKey != null}
                                  onClick={() =>
                                    void patchEntry(entry.id, "pay")
                                  }
                                >
                                  Marquer payée
                                </button>
                              }
                              secondary={
                                <button
                                  type="button"
                                  className="tagora-dark-outline-action"
                                  disabled={actionKey != null}
                                  onClick={() =>
                                    void patchEntry(entry.id, "cancel")
                                  }
                                >
                                  Annuler
                                </button>
                              }
                            />
                          </AppCard>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="commissions-empty-state" role="status">
              <strong>Aucune commission à afficher</strong>
              <p>
                Aucun résultat pour ce statut et ce vendeur. Changez le filtre
                ou revenez plus tard.
              </p>
            </div>
          ) : (
            <div className="commissions-list" style={{ gap: 18 }}>
              {groupedEntries.map((group) => (
                <div key={group.key} style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <strong style={{ fontSize: 16, color: "#0f172a" }}>
                      {group.label}
                    </strong>
                    <span className="ui-text-muted" style={{ fontWeight: 700 }}>
                      {group.entries.length} commission
                      {group.entries.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  {group.entries.map((entry) => (
                    <AppCard key={entry.id} className="commissions-list-item">
                      <div className="commissions-list-head">
                        <div style={{ display: "grid", gap: 6 }}>
                          <strong style={{ fontSize: 17, color: "#0f172a" }}>
                            {entry.assignee_label || entry.label}
                          </strong>
                          <p className="ui-text-muted" style={{ margin: 0 }}>
                            {entry.objective_title || "Objectif"} ·{" "}
                            {entry.period_start} → {entry.period_end}
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
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(140px, 1fr))",
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
                                ? (rulesById[entry.rule_id]?.commission_basis ??
                                  null)
                                : null
                            )}
                          </strong>
                        </div>
                        {entry.rule_id && rulesById[entry.rule_id] ? (
                          <div style={{ display: "grid", gap: 4 }}>
                            <span
                              className="ui-text-muted"
                              style={{ fontSize: 12 }}
                            >
                              Règle
                            </span>
                            <strong style={{ color: "#0f172a" }}>
                              {formatRuleTypeLabel(
                                rulesById[entry.rule_id].rule_type
                              )}{" "}
                              ·{" "}
                              {formatCommissionRuleValue(
                                rulesById[entry.rule_id]
                              )}
                            </strong>
                          </div>
                        ) : null}
                        {entry.validated_at ? (
                          <div style={{ display: "grid", gap: 4 }}>
                            <span
                              className="ui-text-muted"
                              style={{ fontSize: 12 }}
                            >
                              Validée
                            </span>
                            <strong style={{ color: "#0f172a" }}>
                              {new Date(entry.validated_at).toLocaleString(
                                "fr-CA"
                              )}
                            </strong>
                          </div>
                        ) : null}
                        {entry.paid_at ? (
                          <div style={{ display: "grid", gap: 4 }}>
                            <span
                              className="ui-text-muted"
                              style={{ fontSize: 12 }}
                            >
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
                              onClick={() =>
                                void patchEntry(entry.id, "validate")
                              }
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
          align-items: start;
        }
        :global(.commissions-panel-card.ui-section-card) {
          align-content: start;
          align-self: start;
        }
        :global(.commissions-panel-card .ui-section-card-body) {
          align-content: start;
          gap: 14px;
        }
        .commissions-anchor {
          width: 0;
          height: 0;
          margin: 0;
          padding: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .commissions-controls {
          display: grid;
          gap: 12px;
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #f8fafc;
        }
        .commissions-status-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .commissions-seller-filter {
          display: grid;
          gap: 6px;
          max-width: 360px;
        }
        .commissions-seller-filter span {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #64748b;
        }
        .commissions-empty-state {
          display: grid;
          gap: 8px;
          place-content: center;
          justify-items: center;
          text-align: center;
          min-height: 180px;
          padding: 28px 20px;
          border: 1px dashed #d1d9e6;
          border-radius: 14px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        }
        .commissions-empty-state strong {
          font-size: 16px;
          color: #0f172a;
        }
        .commissions-empty-state p {
          margin: 0;
          max-width: 360px;
          color: #64748b;
          line-height: 1.5;
          font-size: 14px;
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

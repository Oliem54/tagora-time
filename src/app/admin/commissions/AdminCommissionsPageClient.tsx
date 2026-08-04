"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
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

  const kpiCards = useMemo(
    () => [
      { label: "Objectifs actifs", value: String(summary?.activeObjectives ?? 0), valueIsCurrency: false },
      { label: "Objectifs atteints", value: String(summary?.achievedObjectives ?? 0), valueIsCurrency: false },
      { label: "Objectifs en retard", value: String(summary?.behindObjectives ?? 0), valueIsCurrency: false },
      {
        label: "Commissions estimees",
        value: formatCad(summary?.estimatedCommissions ?? 0),
        valueIsCurrency: true,
      },
      {
        label: "A valider",
        value: formatCad(summary?.pendingValidationCommissions ?? 0),
        valueIsCurrency: true,
      },
      {
        label: "Commissions payees",
        value: formatCad(summary?.paidCommissions ?? 0),
        valueIsCurrency: true,
      },
    ],
    [summary]
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
      setMessage(publish ? "Objectif publie." : "Objectif enregistre en brouillon.");
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
      setMessage("Realise mis a jour.");
      setMessageType("success");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur saisie realise.");
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
        title="Commissions"
        subtitle="Objectifs, regles, validation et paiement."
        showNavigation={false}
        navigation={<AdminCommissionsNavigation variant="commissions" />}
      />

      {message && messageType ? <FeedbackMessage message={message} type={messageType} /> : null}

      <Link href="/admin/commissions/acces-direction" className="admin-commissions-access-link">
        <AppCard tone="elevated" className="admin-commissions-access-card">
          <div className="admin-commissions-access-icon" aria-hidden>
            <KeyRound size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800 }}>Partage des livres de ventes</div>
            <p className="tagora-note" style={{ margin: "6px 0 0" }}>
              Configurer les personnes autorisées à consulter un livre, sans montants confidentiels.
            </p>
          </div>
          <span className="tagora-dark-action admin-commissions-access-cta">Ouvrir</span>
        </AppCard>
      </Link>

      <Link href="/admin/commissions/plans" className="admin-commissions-access-link">
        <AppCard tone="elevated" className="admin-commissions-access-card">
          <div>
            <div style={{ fontWeight: 800 }}>Plans de rémunération</div>
            <p className="tagora-note" style={{ margin: "6px 0 0" }}>
              Créer un modèle, configurer une version, affecter un représentant et calculer une commission.
            </p>
          </div>
          <span className="tagora-dark-action admin-commissions-access-cta">Ouvrir</span>
        </AppCard>
      </Link>

      <section className="admin-commissions-metric-grid">
        {kpiCards.map((card) => (
          <AdminCommissionsMetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            valueIsCurrency={card.valueIsCurrency}
          />
        ))}
      </section>

      <div className="commissions-toolbar">
        <button
          type="button"
          className="tagora-dark-action"
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          {showCreateForm ? "Fermer le formulaire" : "Nouvel objectif"}
        </button>
      </div>

      {showCreateForm ? (
        <SectionCard title="Creer un objectif" subtitle="Saisie admin finance (montants et regles).">
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
        <SectionCard title="Objectifs" subtitle="Performance par employe, representant ou equipe.">
          {objectives.length === 0 ? (
            <p className="ui-text-muted">Aucun objectif pour le moment.</p>
          ) : (
            <div className="commissions-list">
              {objectives.map((objective) => {
                const status = objective.computed_status ?? objective.status;
                return (
                  <AppCard key={objective.id} className="commissions-list-item">
                    <div className="commissions-list-head">
                      <div>
                        <strong>{objective.title}</strong>
                        <p className="ui-text-muted">
                          {assigneeLabel(objective)} · {objective.period_start} → {objective.period_end}
                        </p>
                      </div>
                      <StatusBadge
                        label={OBJECTIVE_STATUS_LABELS[status]}
                        tone={objectiveStatusTone(status)}
                      />
                    </div>
                    <div className="commissions-list-meta">
                      <span>Type de cible: {formatTargetTypeLabel(objective.target_type)}</span>
                      <span>Cible: {formatTargetValue(objective)}</span>
                      <span>Realise: {formatAchievedValue(objective)}</span>
                      <span>Progression: {objective.progress_percent ?? 0}%</span>
                      {(() => {
                        const summaryRules = summarizeObjectiveRulesForDisplay(
                          rulesByObjectiveId[objective.id] ?? []
                        );
                        return (
                          <>
                            <span>Mode: {summaryRules.ruleTypeLabel}</span>
                            <span>Base: {summaryRules.basisLabel}</span>
                            {summaryRules.ruleValueLabel !== "—" ? (
                              <span>Detail: {summaryRules.ruleValueLabel}</span>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                    <div className="commissions-list-actions">
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        disabled={actionKey != null}
                        onClick={() => void editObjective(objective)}
                      >
                        Modifier
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
                        onClick={() => void updateAchieved(objective)}
                      >
                        Saisir realise
                      </button>
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
                          Annuler objectif
                        </button>
                      ) : null}
                    </div>
                  </AppCard>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Commissions" subtitle="Estimees, a valider et payees.">
          {entries.length === 0 ? (
            <p className="ui-text-muted">Aucune commission calculee.</p>
          ) : (
            <div className="commissions-list">
              {entries.map((entry) => (
                <AppCard key={entry.id} className="commissions-list-item">
                  <div className="commissions-list-head">
                    <div>
                      <strong>{entry.label}</strong>
                      <p className="ui-text-muted">
                        {entry.objective_title || "Objectif"} · {entry.period_start} →{" "}
                        {entry.period_end}
                      </p>
                      {entry.assignee_label ? (
                        <p className="ui-text-muted">{entry.assignee_label}</p>
                      ) : null}
                    </div>
                    <StatusBadge
                      label={COMMISSION_STATUS_LABELS[entry.status]}
                      tone={commissionStatusTone(entry.status)}
                    />
                  </div>
                  <div className="commissions-list-meta">
                    {entry.rule_id && rulesById[entry.rule_id] ? (
                      <>
                        <span>
                          Mode: {formatRuleTypeLabel(rulesById[entry.rule_id].rule_type)}
                        </span>
                        <span>
                          Detail: {formatCommissionRuleValue(rulesById[entry.rule_id])}
                        </span>
                      </>
                    ) : null}
                    <span>
                      Base:{" "}
                      {formatCommissionBasisDisplay(
                        entry.sales_basis_amount,
                        entry.rule_id ? (rulesById[entry.rule_id]?.commission_basis ?? null) : null
                      )}
                    </span>
                    <span>Montant: {formatCad(entry.calculated_amount)}</span>
                    {entry.validated_at ? (
                      <span>Validee: {new Date(entry.validated_at).toLocaleString("fr-CA")}</span>
                    ) : null}
                    {entry.paid_at ? (
                      <span>Payee: {new Date(entry.paid_at).toLocaleString("fr-CA")}</span>
                    ) : null}
                  </div>
                  <div className="commissions-list-actions">
                    {entry.status === "estimated" ? (
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        disabled={actionKey != null}
                        onClick={() => void patchEntry(entry.id, "validate")}
                      >
                        Marquer a valider
                      </button>
                    ) : null}
                    {entry.status === "pending_validation" ? (
                      <button
                        type="button"
                        className="tagora-dark-action"
                        disabled={actionKey != null}
                        onClick={() => void patchEntry(entry.id, "pay")}
                      >
                        Marquer payee
                      </button>
                    ) : null}
                    {entry.status === "estimated" || entry.status === "pending_validation" ? (
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        disabled={actionKey != null}
                        onClick={() => void patchEntry(entry.id, "cancel")}
                      >
                        Annuler
                      </button>
                    ) : null}
                  </div>
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

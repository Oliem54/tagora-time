"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
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
  RULE_TYPE_LABELS,
  formatCad,
  firstDayOfMonthIsoLocal,
  todayIsoLocal,
  commissionStatusTone,
  objectiveStatusTone,
  type CommissionEntryRow,
  type CommissionsSummary,
  type SalesObjectiveRow,
} from "@/app/lib/commissions/commissions.shared";

type ChauffeurOption = {
  id: number;
  label: string;
};

type CreateFormState = {
  title: string;
  description: string;
  chauffeur_id: string;
  team_name: string;
  period_start: string;
  period_end: string;
  target_type: "amount" | "sales_count";
  target_amount: string;
  target_sales_count: string;
  rule_type: "fixed" | "percentage" | "tier_bonus";
  rule_name: string;
  fixed_amount: string;
  percentage_rate: string;
};

function emptyForm(): CreateFormState {
  return {
    title: "",
    description: "",
    chauffeur_id: "",
    team_name: "",
    period_start: firstDayOfMonthIsoLocal(),
    period_end: todayIsoLocal(),
    target_type: "amount",
    target_amount: "",
    target_sales_count: "",
    rule_type: "percentage",
    rule_name: "Commission principale",
    fixed_amount: "",
    percentage_rate: "5",
  };
}

function assigneeLabel(objective: SalesObjectiveRow) {
  if (objective.chauffeur_label?.trim()) return objective.chauffeur_label;
  if (objective.team_name?.trim()) return objective.team_name;
  return "Non assigne";
}

function targetLabel(objective: SalesObjectiveRow) {
  if (objective.target_type === "amount") return formatCad(objective.target_amount ?? 0);
  return `${objective.target_sales_count ?? 0} ventes`;
}

function achievedLabel(objective: SalesObjectiveRow) {
  if (objective.target_type === "amount") return formatCad(objective.achieved_amount ?? 0);
  return `${objective.achieved_sales_count ?? 0} ventes`;
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
  const [chauffeurs, setChauffeurs] = useState<ChauffeurOption[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(() => emptyForm());
  const [actionKey, setActionKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setMessageType(null);

    const [summaryRes, objectivesRes, entriesRes, chauffeursRes] = await Promise.all([
      commissionsFetch("/api/direction/commissions/summary"),
      commissionsFetch("/api/direction/commissions/objectives"),
      commissionsFetch("/api/direction/commissions/entries"),
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

    if (!summaryRes.ok || !objectivesRes.ok || !entriesRes.ok) {
      setSummary(null);
      setObjectives([]);
      setEntries([]);
      setMessage(
        summaryJson.error ||
          objectivesJson.error ||
          entriesJson.error ||
          "Impossible de charger le module commissions."
      );
      setMessageType("error");
    } else {
      setSummary(summaryJson.summary ?? null);
      setObjectives(Array.isArray(objectivesJson.objectives) ? objectivesJson.objectives : []);
      setEntries(Array.isArray(entriesJson.entries) ? entriesJson.entries : []);
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
      { label: "Objectifs actifs", value: String(summary?.activeObjectives ?? 0) },
      { label: "Objectifs atteints", value: String(summary?.achievedObjectives ?? 0) },
      { label: "Objectifs en retard", value: String(summary?.behindObjectives ?? 0) },
      { label: "Commissions estimees", value: formatCad(summary?.estimatedCommissions ?? 0) },
      { label: "A valider", value: formatCad(summary?.pendingValidationCommissions ?? 0) },
      { label: "Commissions payees", value: formatCad(summary?.paidCommissions ?? 0) },
    ],
    [summary]
  );

  async function createObjective(publish: boolean) {
    setSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const res = await commissionsFetch("/api/direction/commissions/objectives", {
        method: "POST",
        body: JSON.stringify({
          ...createForm,
          chauffeur_id: createForm.chauffeur_id ? Number(createForm.chauffeur_id) : null,
          target_amount: createForm.target_amount ? Number(createForm.target_amount) : null,
          target_sales_count: createForm.target_sales_count
            ? Number(createForm.target_sales_count)
            : null,
          achieved_amount: 0,
          achieved_sales_count: 0,
          publish,
          rules: [
            {
              rule_name: createForm.rule_name,
              rule_type: createForm.rule_type,
              fixed_amount:
                createForm.rule_type === "fixed" ? Number(createForm.fixed_amount || 0) : null,
              percentage_rate:
                createForm.rule_type === "percentage"
                  ? Number(createForm.percentage_rate || 0)
                  : null,
              tier_config:
                createForm.rule_type === "tier_bonus"
                  ? [{ threshold: 0, bonus_amount: Number(createForm.fixed_amount || 0) }]
                  : [],
            },
          ],
        }),
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
        title="Commissions & objectifs"
        subtitle="Administration finance : montants, regles, validation et paiement."
        showNavigation={false}
      />

      {message && messageType ? <FeedbackMessage message={message} type={messageType} /> : null}

      <Link href="/admin/commissions/acces-direction" className="admin-commissions-access-link">
        <AppCard tone="elevated" className="admin-commissions-access-card">
          <div className="admin-commissions-access-icon" aria-hidden>
            <KeyRound size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800 }}>Gerer acces Direction</div>
            <p className="tagora-note" style={{ margin: "6px 0 0" }}>
              Accorder ou revoquer la consultation operationnelle d un livre sans montants monetaires.
            </p>
          </div>
          <span className="tagora-dark-action admin-commissions-access-cta">Ouvrir</span>
        </AppCard>
      </Link>

      <section className="commissions-kpi-grid">
        {kpiCards.map((card) => (
          <AppCard key={card.label} className="commissions-kpi-card">
            <span className="tagora-label">{card.label}</span>
            <strong className="commissions-kpi-value">{card.value}</strong>
          </AppCard>
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
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    target_type: e.target.value === "sales_count" ? "sales_count" : "amount",
                  })
                }
              >
                <option value="amount">Montant ($)</option>
                <option value="sales_count">Nombre de ventes</option>
              </select>
            </label>
            {createForm.target_type === "amount" ? (
              <label className="tagora-field">
                <span className="tagora-label">Montant cible (CAD)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="tagora-input"
                  value={createForm.target_amount}
                  onChange={(e) => setCreateForm({ ...createForm, target_amount: e.target.value })}
                />
              </label>
            ) : (
              <label className="tagora-field">
                <span className="tagora-label">Nombre de ventes cible</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="tagora-input"
                  value={createForm.target_sales_count}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, target_sales_count: e.target.value })
                  }
                />
              </label>
            )}
            <label className="tagora-field">
              <span className="tagora-label">Regle de commission</span>
              <select
                className="tagora-input"
                value={createForm.rule_type}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    rule_type:
                      e.target.value === "percentage" || e.target.value === "tier_bonus"
                        ? e.target.value
                        : "fixed",
                  })
                }
              >
                {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {createForm.rule_type === "fixed" || createForm.rule_type === "tier_bonus" ? (
              <label className="tagora-field">
                <span className="tagora-label">
                  {createForm.rule_type === "fixed"
                    ? "Montant fixe (CAD)"
                    : "Bonus palier initial (CAD)"}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="tagora-input"
                  value={createForm.fixed_amount}
                  onChange={(e) => setCreateForm({ ...createForm, fixed_amount: e.target.value })}
                />
              </label>
            ) : null}
            {createForm.rule_type === "percentage" ? (
              <label className="tagora-field">
                <span className="tagora-label">Pourcentage (%)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="tagora-input"
                  value={createForm.percentage_rate}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, percentage_rate: e.target.value })
                  }
                />
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
                      <span>Cible: {targetLabel(objective)}</span>
                      <span>Realise: {achievedLabel(objective)}</span>
                      <span>Progression: {objective.progress_percent ?? 0}%</span>
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
                    <span>Base: {formatCad(entry.sales_basis_amount)}</span>
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
        .commissions-kpi-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .commissions-kpi-card {
          display: grid;
          gap: 8px;
        }
        .commissions-kpi-value {
          font-size: 1.35rem;
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
          .commissions-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
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

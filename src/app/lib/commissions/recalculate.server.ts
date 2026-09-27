import {
  calculateRuleCommission,
  computeProgressPercent,
  deriveObjectiveStatus,
  salesBasisForObjective,
} from "@/app/lib/commissions/calculate.server";
import {
  assigneeLabelFromObjective,
  loadChauffeurLabels,
  mapEntryRow,
  mapObjectiveRow,
  mapRuleRow,
} from "@/app/api/direction/commissions/_lib";
import { unpaidCommissionRemainder } from "@/app/lib/commissions/sales-ledger.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

export async function loadObjectiveCommissionBundle(
  supabase: AdminClient,
  objectiveId: string
) {
  const objectiveRes = await supabase
    .from("sales_objectives")
    .select("*")
    .eq("id", objectiveId)
    .maybeSingle();

  if (objectiveRes.error || !objectiveRes.data) {
    return { error: objectiveRes.error?.message ?? "Objectif introuvable." } as const;
  }

  const chauffeurId = Number((objectiveRes.data as Record<string, unknown>).chauffeur_id);
  const labelMap = await loadChauffeurLabels(
    supabase,
    Number.isFinite(chauffeurId) && chauffeurId > 0 ? [chauffeurId] : []
  );

  const objective = mapObjectiveRow(
    objectiveRes.data as Record<string, unknown>,
    Number.isFinite(chauffeurId) ? labelMap.get(chauffeurId) ?? null : null
  );

  const [rulesRes, entriesRes] = await Promise.all([
    supabase.from("commission_rules").select("*").eq("objective_id", objectiveId),
    supabase.from("commission_entries").select("*").eq("objective_id", objectiveId),
  ]);

  return {
    objective,
    rules: (rulesRes.data ?? []).map((row) => mapRuleRow(row as Record<string, unknown>)),
    entries: (entriesRes.data ?? []).map((row) => mapEntryRow(row as Record<string, unknown>)),
  } as const;
}

export async function recalculateObjectiveCommissions(
  supabase: AdminClient,
  objectiveId: string,
  todayIso: string
) {
  const bundle = await loadObjectiveCommissionBundle(supabase, objectiveId);
  if ("error" in bundle) {
    return { error: bundle.error, status: 404 as const };
  }

  const computedStatus = deriveObjectiveStatus(bundle.objective, todayIso);
  const persistedStatus =
    bundle.objective.status === "draft" || bundle.objective.status === "cancelled"
      ? bundle.objective.status
      : computedStatus;

  await supabase.from("sales_objectives").update({ status: persistedStatus }).eq("id", objectiveId);

  await supabase
    .from("commission_entries")
    .delete()
    .eq("objective_id", objectiveId)
    .eq("status", "estimated");

  const salesBasis = salesBasisForObjective(bundle.objective);
  const objectiveAchieved = computedStatus === "achieved";
  const assigneeLabel = assigneeLabelFromObjective(bundle.objective);

  const newEntries = bundle.rules
    .filter((rule) => rule.is_active)
    .map((rule) => {
      const fullAmount = calculateRuleCommission(rule, salesBasis, objectiveAchieved);
      const committedAmount = bundle.entries
        .filter(
          (entry) =>
            entry.rule_id === rule.id &&
            (entry.status === "paid" || entry.status === "pending_validation")
        )
        .reduce((sum, entry) => sum + entry.calculated_amount, 0);
      return {
        objective_id: objectiveId,
        rule_id: rule.id,
        chauffeur_id: bundle.objective.chauffeur_id,
        team_name: bundle.objective.team_name,
        label: `${rule.rule_name} — ${assigneeLabel}`,
        period_start: bundle.objective.period_start,
        period_end: bundle.objective.period_end,
        sales_basis_amount: salesBasis,
        calculated_amount: unpaidCommissionRemainder(fullAmount, committedAmount),
        status: "estimated" as const,
      };
    })
    .filter((entry) => entry.calculated_amount > 0);

  if (newEntries.length > 0) {
    const insertRes = await supabase.from("commission_entries").insert(newEntries).select("*");
    if (insertRes.error) {
      return { error: insertRes.error.message, status: 400 as const };
    }
  }

  const refreshed = await loadObjectiveCommissionBundle(supabase, objectiveId);
  if ("error" in refreshed) {
    return { error: refreshed.error, status: 404 as const };
  }

  return {
    objective: {
      ...refreshed.objective,
      status: persistedStatus,
      computed_status: persistedStatus,
      progress_percent: computeProgressPercent(refreshed.objective),
    },
    entries: refreshed.entries,
  } as const;
}

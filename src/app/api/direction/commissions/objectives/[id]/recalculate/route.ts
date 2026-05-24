import { NextRequest, NextResponse } from "next/server";
import {
  calculateRuleCommission,
  computeProgressPercent,
  deriveObjectiveStatus,
  salesBasisForObjective,
} from "@/app/lib/commissions/calculate.server";
import { todayIsoLocal } from "@/app/lib/commissions/commissions.shared";
import {
  assigneeLabelFromObjective,
  loadChauffeurLabels,
  mapObjectiveRow,
  mapRuleRow,
  mapEntryRow,
  requireCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

async function loadObjectiveBundle(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await params;
    const todayIso = todayIsoLocal();

    const bundle = await loadObjectiveBundle(supabase, id);
    if ("error" in bundle) {
      return NextResponse.json({ error: bundle.error }, { status: 404 });
    }

    const computed_status = deriveObjectiveStatus(bundle.objective, todayIso);
    const persistedStatus =
      bundle.objective.status === "draft" || bundle.objective.status === "cancelled"
        ? bundle.objective.status
        : computed_status;

    await supabase.from("sales_objectives").update({ status: persistedStatus }).eq("id", id);

    await supabase
      .from("commission_entries")
      .delete()
      .eq("objective_id", id)
      .eq("status", "estimated");

    const salesBasis = salesBasisForObjective(bundle.objective);
    const objectiveAchieved = computed_status === "achieved";
    const assigneeLabel = assigneeLabelFromObjective(bundle.objective);

    const newEntries = bundle.rules
      .filter((rule) => rule.is_active)
      .map((rule) => ({
        objective_id: id,
        rule_id: rule.id,
        chauffeur_id: bundle.objective.chauffeur_id,
        team_name: bundle.objective.team_name,
        label: `${rule.rule_name} — ${assigneeLabel}`,
        period_start: bundle.objective.period_start,
        period_end: bundle.objective.period_end,
        sales_basis_amount: salesBasis,
        calculated_amount: calculateRuleCommission(rule, salesBasis, objectiveAchieved),
        status: "estimated" as const,
      }))
      .filter((entry) => entry.calculated_amount > 0);

    if (newEntries.length > 0) {
      const insertRes = await supabase.from("commission_entries").insert(newEntries).select("*");
      if (insertRes.error) {
        return NextResponse.json({ error: insertRes.error.message }, { status: 400 });
      }
    }

    const refreshed = await loadObjectiveBundle(supabase, id);
    if ("error" in refreshed) {
      return NextResponse.json({ error: refreshed.error }, { status: 404 });
    }

    return NextResponse.json({
      objective: {
        ...refreshed.objective,
        status: persistedStatus,
        computed_status: persistedStatus,
        progress_percent: computeProgressPercent(refreshed.objective),
      },
      entries: refreshed.entries,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur recalcul commission." },
      { status: 500 }
    );
  }
}

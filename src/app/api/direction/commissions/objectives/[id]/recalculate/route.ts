import { NextRequest, NextResponse } from "next/server";
import {
  computeProgressPercent,
  deriveObjectiveStatus,
} from "@/app/lib/commissions/calculate.server";
import { buildEstimatedCommissionEntries } from "@/app/lib/commissions/commission-rules.server";
import { todayIsoLocal } from "@/app/lib/commissions/commissions.shared";
import {
  assigneeLabelFromObjective,
  loadChauffeurLabels,
  mapObjectiveRow,
  mapRuleRow,
  mapEntryRow,
  requireAdminFinanceCommissionsAccess,
  type CommissionsSupabaseClient,
} from "@/app/api/direction/commissions/_lib";
import { normalizeOrganizationUuid } from "@/app/lib/auth/organization-access.shared";

async function loadObjectiveBundle(
  supabase: CommissionsSupabaseClient,
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

  const record = objectiveRes.data as Record<string, unknown>;
  const chauffeurId = Number(record.chauffeur_id);
  const labelMap = await loadChauffeurLabels(
    supabase,
    Number.isFinite(chauffeurId) && chauffeurId > 0 ? [chauffeurId] : []
  );

  const objective = mapObjectiveRow(
    record,
    Number.isFinite(chauffeurId) ? labelMap.get(chauffeurId) ?? null : null
  );

  const [rulesRes, entriesRes] = await Promise.all([
    supabase.from("commission_rules").select("*").eq("objective_id", objectiveId),
    supabase.from("commission_entries").select("*").eq("objective_id", objectiveId),
  ]);

  if (rulesRes.error) {
    return { error: rulesRes.error.message } as const;
  }

  let rules;
  try {
    rules = (rulesRes.data ?? []).map((row) => mapRuleRow(row as Record<string, unknown>));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Regle de commission invalide.",
    } as const;
  }

  return {
    objective,
    organizationId: normalizeOrganizationUuid(record.organization_id),
    rules,
    entries: (entriesRes.data ?? []).map((row) => mapEntryRow(row as Record<string, unknown>)),
  } as const;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Human-triggered sync recalculation — authenticated client + RLS (no service_role).
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await params;
    const todayIso = todayIsoLocal();

    const bundle = await loadObjectiveBundle(supabase, id);
    if ("error" in bundle) {
      return NextResponse.json({ error: bundle.error }, { status: 404 });
    }

    if (!bundle.objective.chauffeur_id && !bundle.organizationId) {
      return NextResponse.json(
        {
          error:
            "Objectif d'equipe sans organization_id UUID — recalcul refuse.",
        },
        { status: 400 }
      );
    }

    const computed_status = deriveObjectiveStatus(bundle.objective, todayIso);
    const persistedStatus =
      bundle.objective.status === "draft" || bundle.objective.status === "cancelled"
        ? bundle.objective.status
        : computed_status;

    await supabase
      .from("sales_objectives")
      .update({ status: persistedStatus })
      .eq("id", id);

    await supabase
      .from("commission_entries")
      .delete()
      .eq("objective_id", id)
      .eq("status", "estimated");

    const objectiveAchieved = computed_status === "achieved";
    const assigneeLabel = assigneeLabelFromObjective(bundle.objective);

    let newEntries;
    try {
      newEntries = buildEstimatedCommissionEntries({
        objectiveId: id,
        objective: bundle.objective,
        rules: bundle.rules,
        objectiveAchieved,
        assigneeLabel,
      }).map((entry) => ({
        ...entry,
        organization_id: bundle.organizationId,
      }));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Regle de commission invalide." },
        { status: 400 }
      );
    }

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

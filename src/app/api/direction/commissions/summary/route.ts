import { NextRequest, NextResponse } from "next/server";
import {
  computeProgressPercent,
  deriveObjectiveStatus,
} from "@/app/lib/commissions/calculate.server";
import { todayIsoLocal, type CommissionsSummary } from "@/app/lib/commissions/commissions.shared";
import {
  loadChauffeurLabels,
  mapEntryRow,
  mapObjectiveRow,
  requireCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const todayIso = todayIsoLocal();

    const [objectivesRes, entriesRes] = await Promise.all([
      supabase
        .from("sales_objectives")
        .select("*")
        .neq("status", "cancelled")
        .order("period_end", { ascending: false }),
      supabase.from("commission_entries").select("*").neq("status", "cancelled"),
    ]);

    if (objectivesRes.error) {
      return NextResponse.json({ error: objectivesRes.error.message }, { status: 400 });
    }
    if (entriesRes.error) {
      return NextResponse.json({ error: entriesRes.error.message }, { status: 400 });
    }

    const chauffeurIds = (objectivesRes.data ?? [])
      .map((row) => Number((row as Record<string, unknown>).chauffeur_id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const labelMap = await loadChauffeurLabels(supabase, chauffeurIds);

    const objectives = (objectivesRes.data ?? []).map((row) => {
      const mapped = mapObjectiveRow(
        row as Record<string, unknown>,
        row.chauffeur_id ? labelMap.get(Number(row.chauffeur_id)) ?? null : null
      );
      const computed_status = deriveObjectiveStatus(mapped, todayIso);
      return {
        ...mapped,
        computed_status,
        progress_percent: computeProgressPercent(mapped),
      };
    });

    const entries = (entriesRes.data ?? []).map((row) => mapEntryRow(row as Record<string, unknown>));

    const summary: CommissionsSummary = {
      activeObjectives: objectives.filter(
        (item) => item.computed_status === "active" || item.computed_status === "partially_achieved"
      ).length,
      achievedObjectives: objectives.filter((item) => item.computed_status === "achieved").length,
      behindObjectives: objectives.filter((item) => item.computed_status === "behind").length,
      estimatedCommissions: entries
        .filter((item) => item.status === "estimated")
        .reduce((sum, item) => sum + item.calculated_amount, 0),
      pendingValidationCommissions: entries
        .filter((item) => item.status === "pending_validation")
        .reduce((sum, item) => sum + item.calculated_amount, 0),
      paidCommissions: entries
        .filter((item) => item.status === "paid")
        .reduce((sum, item) => sum + item.calculated_amount, 0),
    };

    return NextResponse.json({ summary, todayIso });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur summary." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  assigneeLabelFromObjective,
  loadChauffeurLabels,
  mapEntryRow,
  mapObjectiveRow,
  requireAdminFinanceCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("commission_entries")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const objectiveIds = Array.from(
      new Set((data ?? []).map((row) => String((row as Record<string, unknown>).objective_id)))
    );

    const objectivesRes =
      objectiveIds.length > 0
        ? await supabase.from("sales_objectives").select("*").in("id", objectiveIds)
        : { data: [], error: null };

    if (objectivesRes.error) {
      return NextResponse.json({ error: objectivesRes.error.message }, { status: 400 });
    }

    const chauffeurIds = (objectivesRes.data ?? [])
      .map((row) => Number((row as Record<string, unknown>).chauffeur_id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const labelMap = await loadChauffeurLabels(supabase, chauffeurIds);

    const objectiveMap = new Map<string, ReturnType<typeof mapObjectiveRow>>();
    for (const row of objectivesRes.data ?? []) {
      const record = row as Record<string, unknown>;
      const chauffeurId = Number(record.chauffeur_id);
      objectiveMap.set(
        String(record.id),
        mapObjectiveRow(
          record,
          Number.isFinite(chauffeurId) ? labelMap.get(chauffeurId) ?? null : null
        )
      );
    }

    const entries = (data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      const objective = objectiveMap.get(String(record.objective_id));
      return mapEntryRow(record, {
        objective_title: objective?.title ?? null,
        assignee_label: objective ? assigneeLabelFromObjective(objective) : null,
      });
    });

    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur commissions." },
      { status: 500 }
    );
  }
}

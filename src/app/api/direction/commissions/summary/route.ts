import { NextRequest, NextResponse } from "next/server";
import {
  mapDirectionObjectiveOperationalRow,
  requireCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import { todayIsoLocal } from "@/app/lib/commissions/commissions.shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const todayIso = todayIsoLocal();

    const objectivesRes = await supabase
      .from("direction_objectives_operational_view")
      .select("*")
      .neq("status", "cancelled")
      .order("period_end", { ascending: false });

    if (objectivesRes.error) {
      return NextResponse.json({ error: objectivesRes.error.message }, { status: 400 });
    }
    const objectives = (objectivesRes.data ?? []).map((row) =>
      mapDirectionObjectiveOperationalRow(row as Record<string, unknown>)
    );

    const summary = {
      activeObjectives: objectives.filter(
        (item) => item.status === "active" || item.status === "partially_achieved"
      ).length,
      achievedObjectives: objectives.filter((item) => item.status === "achieved").length,
      behindObjectives: objectives.filter((item) => item.status === "behind").length,
      pendingValidationEntries: objectives.reduce(
        (sum, item) => sum + item.entries_pending_validation,
        0
      ),
      paidEntries: objectives.reduce((sum, item) => sum + item.entries_paid, 0),
      totalEntries: objectives.reduce((sum, item) => sum + item.entries_count, 0),
    };

    return NextResponse.json({ summary, todayIso });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur summary." },
      { status: 500 }
    );
  }
}

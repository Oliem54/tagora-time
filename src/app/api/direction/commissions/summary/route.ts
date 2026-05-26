import { NextRequest, NextResponse } from "next/server";
import {
  computeProgressPercent,
  deriveObjectiveStatus,
} from "@/app/lib/commissions/calculate.server";
import {
  mapDirectionObjectiveOperationalRow,
  loadChauffeurLabels,
  mapEntryRow,
  mapObjectiveRow,
  requireCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import { hasAdminFinanceAccess } from "@/app/lib/auth/admin-finance";
import {
  todayIsoLocal,
  type CommissionsSummary,
} from "@/app/lib/commissions/commissions.shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const todayIso = todayIsoLocal();

    if (hasAdminFinanceAccess(user)) {
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
        const record = row as Record<string, unknown>;
        const chauffeurId = Number(record.chauffeur_id);
        const mapped = mapObjectiveRow(
          record,
          Number.isFinite(chauffeurId) ? labelMap.get(chauffeurId) ?? null : null
        );
        const computed_status = deriveObjectiveStatus(mapped, todayIso);
        return { ...mapped, computed_status, progress_percent: computeProgressPercent(mapped) };
      });

      const entries = (entriesRes.data ?? []).map((row) =>
        mapEntryRow(row as Record<string, unknown>)
      );

      const summary: CommissionsSummary = {
        activeObjectives: objectives.filter(
          (item) =>
            item.computed_status === "active" || item.computed_status === "partially_achieved"
        ).length,
        achievedObjectives: objectives.filter((item) => item.computed_status === "achieved")
          .length,
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
    }

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

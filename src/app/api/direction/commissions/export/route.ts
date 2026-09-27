import { NextRequest, NextResponse } from "next/server";
import {
  assigneeLabelFromObjective,
  loadChauffeurLabels,
  mapEntryRow,
  mapObjectiveRow,
  requireAdminFinanceCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import { COMMISSION_STATUS_LABELS } from "@/app/lib/commissions/commissions.shared";
import {
  actorMayUseCompany,
  buildCommissionPayrollCsv,
  businessCalendarDate,
  isPayrollExportStatus,
  readActorCompanyCodes,
} from "@/app/lib/commissions/sales-ledger.shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const periodStart = searchParams.get("period_start");
    const periodEnd = searchParams.get("period_end");
    const company = searchParams.get("company")?.trim().toLowerCase() || null;
    const includeEstimated = searchParams.get("include_estimated") === "1";

    const actorCompanies = readActorCompanyCodes({
      app_metadata: auth.user.app_metadata as Record<string, unknown> | undefined,
      user_metadata: auth.user.user_metadata as Record<string, unknown> | undefined,
    });
    if (company && !actorMayUseCompany(actorCompanies, company)) {
      return NextResponse.json({ error: "Acces refuse pour cette compagnie." }, { status: 403 });
    }

    let query = auth.supabase
      .from("commission_entries")
      .select("*")
      .order("period_start", { ascending: true });
    if (periodStart) query = query.gte("period_end", periodStart);
    if (periodEnd) query = query.lte("period_start", periodEnd);

    const entriesRes = await query;
    if (entriesRes.error) {
      return NextResponse.json({ error: entriesRes.error.message }, { status: 400 });
    }

    const entries = (entriesRes.data ?? [])
      .map((row) => mapEntryRow(row as Record<string, unknown>))
      .filter((entry) => entry.status !== "cancelled")
      .filter((entry) => includeEstimated || isPayrollExportStatus(entry.status));

    const objectiveIds = Array.from(new Set(entries.map((entry) => entry.objective_id)));
    const objectivesRes =
      objectiveIds.length > 0
        ? await auth.supabase.from("sales_objectives").select("*").in("id", objectiveIds)
        : { data: [], error: null };
    if (objectivesRes.error) {
      return NextResponse.json({ error: objectivesRes.error.message }, { status: 400 });
    }

    const chauffeurIds = (objectivesRes.data ?? [])
      .map((row) => Number((row as Record<string, unknown>).chauffeur_id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const labels = await loadChauffeurLabels(auth.supabase, chauffeurIds);
    const objectives = new Map<string, ReturnType<typeof mapObjectiveRow>>();
    for (const row of objectivesRes.data ?? []) {
      const record = row as Record<string, unknown>;
      const chauffeurId = Number(record.chauffeur_id);
      objectives.set(
        String(record.id),
        mapObjectiveRow(record, Number.isFinite(chauffeurId) ? labels.get(chauffeurId) ?? null : null)
      );
    }

    const rows = entries.flatMap((entry) => {
      const objective = objectives.get(entry.objective_id);
      const entryCompany = (objective?.company_context ?? "").trim().toLowerCase();
      if (company && entryCompany !== company) return [];
      if (actorCompanies.length > 0 && !actorMayUseCompany(actorCompanies, entryCompany || null)) {
        return [];
      }
      return [
        {
          company: objective?.company_context ?? "",
          employee: objective ? assigneeLabelFromObjective(objective) : entry.assignee_label ?? "",
          objective: objective?.title ?? entry.objective_title ?? "",
          periodStart: entry.period_start,
          periodEnd: entry.period_end,
          status: COMMISSION_STATUS_LABELS[entry.status] ?? entry.status,
          salesBasis: entry.sales_basis_amount,
          amount: entry.calculated_amount,
          validatedAt: entry.validated_at ?? "",
          paidAt: entry.paid_at ?? "",
          entryId: entry.id,
        },
      ];
    });

    const csv = buildCommissionPayrollCsv(rows);
    const filename = `commissions-paie-${businessCalendarDate()}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur export commissions." },
      { status: 500 }
    );
  }
}

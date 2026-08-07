import { NextRequest, NextResponse } from "next/server";
import {
  computeProgressPercent,
  deriveObjectiveStatus,
} from "@/app/lib/commissions/calculate.server";
import {
  loadChauffeurLabels,
  mapEntryRow,
  mapObjectiveRow,
  requireCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import { hasAdminFinanceAccess } from "@/app/lib/auth/admin-finance";
import { loadDirectionGrantedOperationalObjectives } from "@/app/lib/commissions/sales-book-grants.server";
import { resolvePayPlanOrganization } from "@/app/lib/commissions/generic-pay-plan.server";
import { decodeGenericPayPlanTrace } from "@/app/lib/commissions/generic-pay-plan.shared";
import { computePaidCommissionsKpiTotals } from "@/app/lib/commissions/paid-commissions-kpi.shared";
import {
  todayIsoLocal,
  type CommissionsSummary,
} from "@/app/lib/commissions/commissions.shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase, user, accessToken } = auth;

    const todayIso = todayIsoLocal();

    if (hasAdminFinanceAccess(user)) {
      const requestedOrganizationId =
        req.nextUrl.searchParams.get("organization_id");
      let activeOrganizationId: string | null = null;
      if (requestedOrganizationId != null && String(requestedOrganizationId).trim()) {
        const org = await resolvePayPlanOrganization({
          userId: user.id,
          accessToken,
          requestedOrganizationId,
        });
        if (!org.ok) {
          return NextResponse.json(
            { error: org.error },
            { status: org.status }
          );
        }
        activeOrganizationId = org.organizationId;
      }

      const [objectivesRes, entriesRes, paidAccrualsRes] = await Promise.all([
        supabase
          .from("sales_objectives")
          .select("*")
          .neq("status", "cancelled")
          .order("period_end", { ascending: false }),
        supabase
          .from("commission_entries")
          .select("*")
          .neq("status", "cancelled"),
        supabase
          .from("compensation_accruals")
          .select("id, label, status, calculated_amount, component")
          .eq("component", "commission")
          .eq("status", "paid"),
      ]);

      if (objectivesRes.error) {
        return NextResponse.json(
          { error: objectivesRes.error.message },
          { status: 400 }
        );
      }
      if (entriesRes.error) {
        return NextResponse.json(
          { error: entriesRes.error.message },
          { status: 400 }
        );
      }
      if (paidAccrualsRes.error) {
        return NextResponse.json(
          { error: paidAccrualsRes.error.message },
          { status: 400 }
        );
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
        return {
          ...mapped,
          computed_status,
          progress_percent: computeProgressPercent(mapped),
        };
      });

      const objectiveOrgById = new Map(
        objectives.map((item) => [
          item.id,
          String(item.organization_id || "")
            .trim()
            .toLowerCase(),
        ])
      );

      const entries = (entriesRes.data ?? []).map((row) =>
        mapEntryRow(row as Record<string, unknown>)
      );

      const scopedObjectives = activeOrganizationId
        ? objectives.filter(
            (item) =>
              String(item.organization_id || "")
                .trim()
                .toLowerCase() === activeOrganizationId
          )
        : objectives;

      const scopedObjectiveIds = new Set(scopedObjectives.map((item) => item.id));
      const scopedEntries = activeOrganizationId
        ? entries.filter((item) => scopedObjectiveIds.has(item.objective_id))
        : entries;

      const objectivePaidLines = scopedEntries.map((item) => ({
        organizationId:
          activeOrganizationId ||
          objectiveOrgById.get(item.objective_id) ||
          null,
        status: item.status,
        amount: item.calculated_amount,
      }));

      const planPaidLines = (paidAccrualsRes.data ?? []).map((row) => {
        const record = row as Record<string, unknown>;
        const trace = decodeGenericPayPlanTrace(record.label);
        return {
          organizationId: trace?.organization_id ?? null,
          status: String(record.status || ""),
          amount: Number(record.calculated_amount),
        };
      });

      const paidTotals = computePaidCommissionsKpiTotals({
        organizationId: activeOrganizationId || "",
        objectiveEntries: objectivePaidLines,
        planAccruals: planPaidLines,
      });

      // Sans organisation active résolue : conserver l’agrégat objectifs historique
      // et n’ajouter aucun plan (évite une somme cross-tenant de plans).
      const paidObjectiveTotal = activeOrganizationId
        ? paidTotals.paidObjectiveTotal
        : scopedEntries
            .filter((item) => item.status === "paid")
            .reduce((sum, item) => sum + item.calculated_amount, 0);
      const paidPlanTotal = activeOrganizationId
        ? paidTotals.paidPlanTotal
        : 0;
      const paidCombinedTotal = paidObjectiveTotal + paidPlanTotal;

      const summary: CommissionsSummary = {
        activeObjectives: scopedObjectives.filter(
          (item) =>
            item.computed_status === "active" ||
            item.computed_status === "partially_achieved"
        ).length,
        achievedObjectives: scopedObjectives.filter(
          (item) => item.computed_status === "achieved"
        ).length,
        behindObjectives: scopedObjectives.filter(
          (item) => item.computed_status === "behind"
        ).length,
        estimatedCommissions: scopedEntries
          .filter((item) => item.status === "estimated")
          .reduce((sum, item) => sum + item.calculated_amount, 0),
        pendingValidationCommissions: scopedEntries
          .filter((item) => item.status === "pending_validation")
          .reduce((sum, item) => sum + item.calculated_amount, 0),
        paidCommissions: paidCombinedTotal,
        paidObjectiveTotal,
        paidPlanTotal,
        paidCombinedTotal,
      };

      return NextResponse.json({
        summary,
        todayIso,
        organization_id: activeOrganizationId,
      });
    }

    const objectivesResult = await loadDirectionGrantedOperationalObjectives(
      supabase,
      user.id
    );
    const objectives = (
      objectivesResult === "forbidden" ? [] : objectivesResult
    ).filter((item) => item.status !== "cancelled");

    const summary = {
      activeObjectives: objectives.filter(
        (item) =>
          item.status === "active" || item.status === "partially_achieved"
      ).length,
      achievedObjectives: objectives.filter((item) => item.status === "achieved")
        .length,
      behindObjectives: objectives.filter((item) => item.status === "behind")
        .length,
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
      {
        error:
          error instanceof Error ? error.message : "Erreur serveur summary.",
      },
      { status: 500 }
    );
  }
}

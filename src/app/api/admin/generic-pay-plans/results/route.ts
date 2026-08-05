import { NextRequest, NextResponse } from "next/server";
import {
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";
import { decodeGenericPayPlanTrace } from "@/app/lib/commissions/generic-pay-plan.shared";
import {
  resolvePersistedListBeneficiary,
  toPersistedPayPlanResultItem,
} from "@/app/admin/commissions/recent-pay-plan-results.shared";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 80;

export async function GET(req: NextRequest) {
  const gate = await requireGenericPayPlanAdminAccess(req);
  if (!gate.ok) return gate.response;
  const permission = assertPayPlanPermission(
    gate.auth.user,
    "commission_calculation_review"
  );
  if (!permission.ok) {
    const audit = assertPayPlanPermission(gate.auth.user, "commission_audit_read");
    if (!audit.ok) {
      return NextResponse.json(
        {
          error: audit.error,
          diagnostic_code: "RESULTS_PERMISSION_DENIED",
        },
        { status: audit.status }
      );
    }
  }

  const organizationId = req.nextUrl.searchParams.get("organization_id");
  const templateIdFilter = String(
    req.nextUrl.searchParams.get("template_id") || ""
  ).trim();
  const org = await resolvePayPlanOrganization({
    userId: gate.auth.user.id,
    accessToken: gate.auth.accessToken,
    requestedOrganizationId: organizationId,
  });
  if (!org.ok) {
    return NextResponse.json(
      {
        error: org.error,
        diagnostic_code:
          org.status === 403
            ? "RESULTS_ORG_FORBIDDEN"
            : "RESULTS_ORG_UNRESOLVED",
      },
      { status: org.status }
    );
  }

  const { data: accruals, error } = await gate.auth.supabase
    .from("compensation_accruals")
    .select(
      "id, label, status, calculated_amount, sales_basis_amount, rule_name, created_at, updated_at"
    )
    .eq("component", "commission")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    return NextResponse.json(
      {
        error: "Lecture des résultats impossible.",
        diagnostic_code: "RESULTS_SUPABASE_QUERY_FAILED",
      },
      { status: 400 }
    );
  }

  const scanned = (accruals ?? []).length;
  const decoded = (accruals ?? [])
    .map((row) => {
      const trace = decodeGenericPayPlanTrace(row.label);
      if (!trace || trace.organization_id !== org.organizationId) return null;
      if (templateIdFilter && trace.template_id !== templateIdFilter) return null;
      return { row, trace };
    })
    .filter(
      (
        item
      ): item is {
        row: {
          id: string;
          label: string;
          status: string;
          calculated_amount: number;
          sales_basis_amount: number;
          rule_name: string;
          created_at: string;
          updated_at: string;
        };
        trace: NonNullable<ReturnType<typeof decodeGenericPayPlanTrace>>;
      } => item != null
    );

  const employeeIds = Array.from(
    new Set(
      decoded
        .map((item) => Number(item.trace.employee_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );

  // Aligné sur la fiche détail : id, nom, courriel, organization_id uniquement.
  const chauffeurById = new Map<
    number,
    {
      nom: string | null;
      courriel: string | null;
      organization_id: string | null;
    }
  >();
  if (employeeIds.length > 0) {
    const { data: chauffeurs } = await gate.auth.supabase
      .from("chauffeurs")
      .select("id, nom, courriel, organization_id")
      .eq("organization_id", org.organizationId)
      .in("id", employeeIds);
    for (const chauffeur of chauffeurs ?? []) {
      const id = Number(chauffeur.id);
      if (!Number.isInteger(id) || id <= 0) continue;
      chauffeurById.set(id, {
        nom: typeof chauffeur.nom === "string" ? chauffeur.nom : null,
        courriel:
          typeof chauffeur.courriel === "string" ? chauffeur.courriel : null,
        organization_id:
          typeof chauffeur.organization_id === "string"
            ? chauffeur.organization_id
            : null,
      });
    }
  }

  const results = decoded.map(({ row, trace }) => {
    const chauffeur = chauffeurById.get(Number(trace.employee_id));
    const beneficiary = resolvePersistedListBeneficiary({
      employeeId: trace.employee_id,
      nom: chauffeur?.nom ?? null,
      courriel: chauffeur?.courriel ?? null,
      sourceOrganizationId: chauffeur?.organization_id ?? null,
      expectedOrganizationId: org.organizationId,
    });
    return toPersistedPayPlanResultItem({
      accrualId: String(row.id),
      organizationId: org.organizationId,
      status: String(row.status || "calculated"),
      createdAt: String(row.created_at || ""),
      trace,
      beneficiary,
    });
  });

  return NextResponse.json({
    organization_id: org.organizationId,
    results,
    diagnostic_code:
      results.length === 0 ? "RESULTS_EMPTY_FOR_ORG" : "RESULTS_OK",
    meta: {
      scanned_accrual_rows: scanned,
      matched_for_organization: results.length,
    },
  });
}

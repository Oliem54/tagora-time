import { NextRequest, NextResponse } from "next/server";
import {
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";
import { decodeGenericPayPlanTrace } from "@/app/lib/commissions/generic-pay-plan.shared";
import { resolvePaidByDisplayName } from "@/app/lib/commissions/pay-plan-accrual-payment.shared";
import {
  resolvePersistedListBeneficiary,
  toPersistedPayPlanResultItem,
} from "@/app/admin/commissions/recent-pay-plan-results.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

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
      "id, label, status, calculated_amount, sales_basis_amount, rule_name, created_at, updated_at, paid_at, paid_by, payroll_reference, payroll_period_start, payroll_period_end, payroll_pay_date"
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
          paid_at: string | null;
          paid_by: string | null;
          payroll_reference: string | null;
          payroll_period_start: string | null;
          payroll_period_end: string | null;
          payroll_pay_date: string | null;
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

  const paidByIds = Array.from(
    new Set(
      decoded
        .map((item) =>
          typeof item.row.paid_by === "string" ? item.row.paid_by.trim() : ""
        )
        .filter(Boolean)
    )
  );
  const paidByDisplayById = new Map<string, string>();
  if (paidByIds.length > 0) {
    const admin = createAdminSupabaseClient();
    await Promise.all(
      paidByIds.map(async (userId) => {
        const { data, error: userError } = await admin.auth.admin.getUserById(
          userId
        );
        if (userError || !data.user) {
          paidByDisplayById.set(
            userId,
            resolvePaidByDisplayName({ userId })
          );
          return;
        }
        const meta = data.user.user_metadata ?? {};
        paidByDisplayById.set(
          userId,
          resolvePaidByDisplayName({
            userId,
            fullName:
              typeof meta.full_name === "string" ? meta.full_name : null,
            name: typeof meta.name === "string" ? meta.name : null,
            email: data.user.email ?? null,
          })
        );
      })
    );
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
    const paidBy =
      typeof row.paid_by === "string" && row.paid_by.trim()
        ? row.paid_by.trim()
        : null;
    return toPersistedPayPlanResultItem({
      accrualId: String(row.id),
      organizationId: org.organizationId,
      status: String(row.status || "calculated"),
      createdAt: String(row.created_at || ""),
      paidAt:
        typeof row.paid_at === "string" && row.paid_at.trim()
          ? row.paid_at.trim()
          : null,
      paidByDisplay: paidBy
        ? paidByDisplayById.get(paidBy) ||
          resolvePaidByDisplayName({ userId: paidBy })
        : null,
      payrollReference:
        typeof row.payroll_reference === "string" && row.payroll_reference.trim()
          ? row.payroll_reference.trim()
          : null,
      payrollPeriodStart:
        typeof row.payroll_period_start === "string" &&
        row.payroll_period_start.trim()
          ? row.payroll_period_start.trim()
          : null,
      payrollPeriodEnd:
        typeof row.payroll_period_end === "string" &&
        row.payroll_period_end.trim()
          ? row.payroll_period_end.trim()
          : null,
      payrollPayDate:
        typeof row.payroll_pay_date === "string" && row.payroll_pay_date.trim()
          ? row.payroll_pay_date.trim()
          : null,
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

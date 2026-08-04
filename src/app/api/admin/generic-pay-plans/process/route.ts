import { NextRequest, NextResponse } from "next/server";
import { processGenericPayPlanAssignment } from "@/app/lib/commissions/generic-pay-plan-engine.server";
import {
  asNumber,
  asObject,
  asText,
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gate = await requireGenericPayPlanAdminAccess(req);
  if (!gate.ok) return gate.response;

  const saleCreate = assertPayPlanPermission(
    gate.auth.user,
    "commission_sale_create"
  );
  const review = assertPayPlanPermission(
    gate.auth.user,
    "commission_calculation_review"
  );
  if (!saleCreate.ok && !review.ok) {
    return NextResponse.json(
      { error: "Permission insuffisante pour traiter une vente." },
      { status: 403 }
    );
  }

  const body = asObject(await req.json().catch(() => ({})));
  const org = await resolvePayPlanOrganization({
    userId: gate.auth.user.id,
    accessToken: gate.auth.accessToken,
    requestedOrganizationId: body.organization_id,
  });
  if (!org.ok) {
    return NextResponse.json({ error: org.error }, { status: org.status });
  }

  const assignmentId = asText(body.assignment_id);
  const saleAmount = asNumber(body.sale_amount);
  const soldAt = asText(body.sold_at);
  if (!assignmentId || saleAmount == null || !soldAt) {
    return NextResponse.json(
      { error: "Affectation, montant et date de vente sont requis." },
      { status: 400 }
    );
  }

  const result = await processGenericPayPlanAssignment({
    supabase: gate.auth.supabase,
    userId: gate.auth.user.id,
    organizationId: org.organizationId,
    assignmentId,
    saleAmount,
    soldAt,
    label: asText(body.label),
    externalReferenceSuffix: asText(body.external_reference_suffix),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(
    {
      event_id: result.eventId,
      accrual_id: result.accrualId,
      calculated_amount: result.calculatedAmount,
      basis_amount: result.basisAmount,
      rate_percent: result.ratePercent,
      fixed_amount: result.fixedAmount,
      explanation: result.explanation,
      trace: result.trace,
    },
    { status: 201 }
  );
}

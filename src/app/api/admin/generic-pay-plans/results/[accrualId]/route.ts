import { NextRequest, NextResponse } from "next/server";
import {
  asObject,
  asText,
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";
import { decodeGenericPayPlanTrace } from "@/app/lib/commissions/generic-pay-plan.shared";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accrualId: string }> };

export async function GET(req: NextRequest, context: Params) {
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
        { error: audit.error },
        { status: audit.status }
      );
    }
  }

  const { accrualId } = await context.params;
  const organizationId = req.nextUrl.searchParams.get("organization_id");
  const org = await resolvePayPlanOrganization({
    userId: gate.auth.user.id,
    accessToken: gate.auth.accessToken,
    requestedOrganizationId: organizationId,
  });
  if (!org.ok) {
    return NextResponse.json({ error: org.error }, { status: org.status });
  }

  const { data: accrual, error } = await gate.auth.supabase
    .from("compensation_accruals")
    .select("*")
    .eq("id", accrualId)
    .maybeSingle();
  if (error || !accrual) {
    return NextResponse.json({ error: "Résultat introuvable." }, { status: 404 });
  }

  const trace = decodeGenericPayPlanTrace(accrual.label);
  if (!trace || trace.organization_id !== org.organizationId) {
    return NextResponse.json({ error: "Résultat introuvable." }, { status: 404 });
  }

  const { data: event } = await gate.auth.supabase
    .from("compensation_events")
    .select("*")
    .eq("id", accrual.compensation_event_id)
    .maybeSingle();

  return NextResponse.json({
    organization_id: org.organizationId,
    accrual,
    event,
    trace,
  });
}

export async function PATCH(req: NextRequest, context: Params) {
  const gate = await requireGenericPayPlanAdminAccess(req);
  if (!gate.ok) return gate.response;
  const permission = assertPayPlanPermission(
    gate.auth.user,
    "commission_approve"
  );
  if (!permission.ok) {
    return NextResponse.json(
      { error: permission.error },
      { status: permission.status }
    );
  }

  const { accrualId } = await context.params;
  const body = asObject(await req.json().catch(() => ({})));
  const org = await resolvePayPlanOrganization({
    userId: gate.auth.user.id,
    accessToken: gate.auth.accessToken,
    requestedOrganizationId: body.organization_id,
  });
  if (!org.ok) {
    return NextResponse.json({ error: org.error }, { status: org.status });
  }

  const { data: accrual } = await gate.auth.supabase
    .from("compensation_accruals")
    .select("*")
    .eq("id", accrualId)
    .maybeSingle();
  if (!accrual) {
    return NextResponse.json({ error: "Résultat introuvable." }, { status: 404 });
  }
  const trace = decodeGenericPayPlanTrace(accrual.label);
  if (!trace || trace.organization_id !== org.organizationId) {
    return NextResponse.json({ error: "Résultat introuvable." }, { status: 404 });
  }
  if (accrual.status === "validated") {
    return NextResponse.json(
      { error: "Ce résultat est déjà validé et ne peut plus être modifié." },
      { status: 400 }
    );
  }

  const action = asText(body.action) || "validate";
  if (action !== "validate") {
    return NextResponse.json({ error: "Action non supportée." }, { status: 400 });
  }

  const { data: updated, error } = await gate.auth.supabase
    .from("compensation_accruals")
    .update({
      status: "validated",
      updated_by: gate.auth.user.id,
    })
    .eq("id", accrualId)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message || "Validation impossible." },
      { status: 400 }
    );
  }

  await gate.auth.supabase.from("compensation_accrual_status_history").insert([
    {
      accrual_id: accrualId,
      from_status: accrual.status,
      to_status: "validated",
      changed_by: gate.auth.user.id,
      reason: asText(body.reason) || "Validation humaine",
    },
  ]);

  return NextResponse.json({ accrual: updated, trace });
}

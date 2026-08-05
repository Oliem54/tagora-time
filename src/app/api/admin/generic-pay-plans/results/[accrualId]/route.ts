import { NextRequest, NextResponse } from "next/server";
import {
  asObject,
  asText,
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";
import {
  decodeGenericPayPlanTrace,
  resolvePayPlanBeneficiaryDisplay,
} from "@/app/lib/commissions/generic-pay-plan.shared";
import {
  buildAccrualPayHistoryRow,
  buildAccrualPayPatch,
  evaluateAccrualPayTransition,
  evaluateAccrualValidateTransition,
  permissionForAccrualAction,
} from "@/app/lib/commissions/pay-plan-accrual-payment.shared";

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

  const { data: chauffeur } = await gate.auth.supabase
    .from("chauffeurs")
    .select("id, nom, courriel, organization_id")
    .eq("id", trace.employee_id)
    .eq("organization_id", org.organizationId)
    .maybeSingle();

  const beneficiary = resolvePayPlanBeneficiaryDisplay({
    employeeId: trace.employee_id,
    displayName: typeof chauffeur?.nom === "string" ? chauffeur.nom : null,
    email: typeof chauffeur?.courriel === "string" ? chauffeur.courriel : null,
    sourceOrganizationId:
      typeof chauffeur?.organization_id === "string"
        ? chauffeur.organization_id
        : null,
    expectedOrganizationId: org.organizationId,
  });

  const paidBy =
    typeof accrual.paid_by === "string" && accrual.paid_by.trim()
      ? accrual.paid_by.trim()
      : null;
  const paidByDisplay = paidBy
    ? `Utilisateur ${paidBy.slice(0, 8)}…`
    : null;

  return NextResponse.json({
    organization_id: org.organizationId,
    accrual,
    event,
    trace,
    beneficiary,
    paid_by_display: paidByDisplay,
  });
}

export async function PATCH(req: NextRequest, context: Params) {
  const gate = await requireGenericPayPlanAdminAccess(req);
  if (!gate.ok) return gate.response;

  const { accrualId } = await context.params;
  const body = asObject(await req.json().catch(() => ({})));
  const actionRaw = asText(body.action) || "validate";
  if (actionRaw !== "validate" && actionRaw !== "pay") {
    return NextResponse.json({ error: "Action non supportée." }, { status: 400 });
  }
  const action = actionRaw;

  const permission = assertPayPlanPermission(
    gate.auth.user,
    permissionForAccrualAction(action)
  );
  if (!permission.ok) {
    return NextResponse.json(
      { error: permission.error },
      { status: permission.status }
    );
  }

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

  if (action === "pay") {
    const decision = evaluateAccrualPayTransition(accrual.status);
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.error },
        { status: decision.statusCode }
      );
    }

    if (decision.mode === "idempotent") {
      return NextResponse.json({
        accrual,
        trace,
        idempotent: true,
      });
    }

    const paidAtIso = new Date().toISOString();
    const patch = buildAccrualPayPatch({
      userId: gate.auth.user.id,
      paidAtIso,
    });

    const { data: updated, error } = await gate.auth.supabase
      .from("compensation_accruals")
      .update(patch)
      .eq("id", accrualId)
      .eq("status", "validated")
      .select("*")
      .maybeSingle();

    if (error || !updated) {
      return NextResponse.json(
        { error: error?.message || "Marquage payé impossible." },
        { status: 400 }
      );
    }

    await gate.auth.supabase.from("compensation_accrual_status_history").insert([
      buildAccrualPayHistoryRow({
        accrualId,
        userId: gate.auth.user.id,
        reason: asText(body.reason),
      }),
    ]);

    return NextResponse.json({ accrual: updated, trace, idempotent: false });
  }

  // action === "validate"
  const validateDecision = evaluateAccrualValidateTransition(accrual.status);
  if (!validateDecision.ok) {
    return NextResponse.json(
      { error: validateDecision.error },
      { status: validateDecision.statusCode }
    );
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

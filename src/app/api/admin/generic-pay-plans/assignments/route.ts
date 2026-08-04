import { NextRequest, NextResponse } from "next/server";
import { validateAssignmentIdentity } from "@/app/lib/commissions/generic-pay-plan-contracts";
import {
  asNumber,
  asObject,
  asText,
  assertEmployeeInOrganization,
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gate = await requireGenericPayPlanAdminAccess(req);
  if (!gate.ok) return gate.response;
  const permission = assertPayPlanPermission(
    gate.auth.user,
    "commission_plan_assign"
  );
  if (!permission.ok) {
    return NextResponse.json(
      { error: permission.error },
      { status: permission.status }
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

  const employeeId = Math.trunc(asNumber(body.employee_id) ?? 0);
  const versionId = asText(body.plan_version_id) || asText(body.version_id);
  const identity = validateAssignmentIdentity({
    employee_id: employeeId,
    organization_uuid: org.organizationId,
    version_id: versionId || "",
  });
  if (!identity.ok) {
    return NextResponse.json({ error: identity.error }, { status: 400 });
  }

  const employeeCheck = await assertEmployeeInOrganization({
    auth: gate.auth,
    employeeId,
    organizationId: org.organizationId,
  });
  if (!employeeCheck.ok) {
    return NextResponse.json(
      { error: employeeCheck.error },
      { status: employeeCheck.status }
    );
  }

  const { data: version } = await gate.auth.supabase
    .from("compensation_plan_versions")
    .select("id, organization_id, status")
    .eq("id", versionId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!version) {
    return NextResponse.json({ error: "Version introuvable." }, { status: 404 });
  }
  if (version.status !== "active") {
    return NextResponse.json(
      { error: "Activez la version avant d’affecter le plan." },
      { status: 400 }
    );
  }

  const effectiveFrom = asText(body.effective_from);
  if (!effectiveFrom) {
    return NextResponse.json(
      { error: "Date d’effet requise pour l’affectation." },
      { status: 400 }
    );
  }

  const { data, error } = await gate.auth.supabase
    .from("compensation_plan_assignments")
    .insert([
      {
        organization_id: org.organizationId,
        employee_id: employeeId,
        plan_version_id: versionId,
        status: "active",
        effective_from: effectiveFrom,
        effective_to: asText(body.effective_to),
        priority: Math.max(0, Math.trunc(asNumber(body.priority) ?? 0)),
        processing_frequency: asText(body.processing_frequency) || "per_sale",
        created_by: gate.auth.user.id,
      },
    ])
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Affectation impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({ assignment: data }, { status: 201 });
}

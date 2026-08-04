import { NextRequest, NextResponse } from "next/server";
import {
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

  const organizationId = req.nextUrl.searchParams.get("organization_id");
  const org = await resolvePayPlanOrganization({
    userId: gate.auth.user.id,
    accessToken: gate.auth.accessToken,
    requestedOrganizationId: organizationId,
  });
  if (!org.ok) {
    return NextResponse.json({ error: org.error }, { status: org.status });
  }

  const { data, error } = await gate.auth.supabase
    .from("chauffeurs")
    .select("id, nom, courriel, organization_id")
    .eq("organization_id", org.organizationId)
    .order("nom", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const employees = (data ?? []).map((row) => {
    const nom = typeof row.nom === "string" ? row.nom.trim() : "";
    const courriel = typeof row.courriel === "string" ? row.courriel.trim() : "";
    return {
      id: Number(row.id),
      label: nom || courriel || `Employé #${row.id}`,
      organization_id: row.organization_id,
    };
  });

  return NextResponse.json({
    organization_id: org.organizationId,
    employees,
  });
}

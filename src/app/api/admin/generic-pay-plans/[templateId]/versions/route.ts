import { NextRequest, NextResponse } from "next/server";
import {
  asNumber,
  asObject,
  asText,
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ templateId: string }> };

export async function POST(req: NextRequest, context: Params) {
  const gate = await requireGenericPayPlanAdminAccess(req);
  if (!gate.ok) return gate.response;
  const permission = assertPayPlanPermission(
    gate.auth.user,
    "commission_plan_template_manage"
  );
  if (!permission.ok) {
    return NextResponse.json(
      { error: permission.error },
      { status: permission.status }
    );
  }

  const { templateId } = await context.params;
  const body = asObject(await req.json().catch(() => ({})));
  const org = await resolvePayPlanOrganization({
    userId: gate.auth.user.id,
    accessToken: gate.auth.accessToken,
    requestedOrganizationId: body.organization_id,
  });
  if (!org.ok) {
    return NextResponse.json({ error: org.error }, { status: org.status });
  }

  const { data: template, error: templateError } = await gate.auth.supabase
    .from("compensation_plan_templates")
    .select("id, organization_id")
    .eq("id", templateId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();

  if (templateError || !template) {
    return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
  }

  const { data: latest } = await gate.auth.supabase
    .from("compensation_plan_versions")
    .select("version_number")
    .eq("template_id", templateId)
    .eq("organization_id", org.organizationId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber =
    asNumber(body.version_number) ??
    (typeof latest?.version_number === "number" ? latest.version_number + 1 : 1);

  if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
    return NextResponse.json(
      { error: "Numéro de version invalide." },
      { status: 400 }
    );
  }

  const { data, error } = await gate.auth.supabase
    .from("compensation_plan_versions")
    .insert([
      {
        organization_id: org.organizationId,
        template_id: templateId,
        version_number: versionNumber,
        status: "draft",
        effective_from: asText(body.effective_from),
        change_reason: asText(body.change_reason),
        created_by: gate.auth.user.id,
      },
    ])
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Création de version impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({ version: data }, { status: 201 });
}

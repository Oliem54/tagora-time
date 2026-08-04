import { NextRequest, NextResponse } from "next/server";
import {
  asObject,
  asText,
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";
import {
  validateAndNormalizeTemplateCode,
  validatePlanDisplayName,
} from "@/app/lib/commissions/generic-pay-plan.shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
    .from("compensation_plan_templates")
    .select(
      "id, organization_id, template_code, display_name, description, status, current_version_id, created_at, updated_at"
    )
    .eq("organization_id", org.organizationId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const templates = data ?? [];
  const withCounts = [];
  for (const template of templates) {
    const { data: versions } = await gate.auth.supabase
      .from("compensation_plan_versions")
      .select("id, version_number, status")
      .eq("template_id", template.id)
      .eq("organization_id", org.organizationId)
      .order("version_number", { ascending: false });

    const versionIds = (versions ?? []).map((row) => row.id);
    let assignmentCount = 0;
    if (versionIds.length > 0) {
      const { count } = await gate.auth.supabase
        .from("compensation_plan_assignments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.organizationId)
        .in("plan_version_id", versionIds);
      assignmentCount = count ?? 0;
    }

    const latest = versions?.[0];
    const versionLabel = latest
      ? `v${latest.version_number} (${latest.status})`
      : "Aucune version";

    withCounts.push({
      ...template,
      version_label: versionLabel,
      assignment_count: assignmentCount,
    });
  }

  return NextResponse.json({
    organization_id: org.organizationId,
    templates: withCounts,
  });
}

export async function POST(req: NextRequest) {
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

  const body = asObject(await req.json().catch(() => ({})));
  const org = await resolvePayPlanOrganization({
    userId: gate.auth.user.id,
    accessToken: gate.auth.accessToken,
    requestedOrganizationId: body.organization_id,
  });
  if (!org.ok) {
    return NextResponse.json({ error: org.error }, { status: org.status });
  }

  const name = validatePlanDisplayName(body.name ?? body.display_name);
  if (!name.ok) {
    return NextResponse.json({ error: name.error }, { status: 400 });
  }
  const code = validateAndNormalizeTemplateCode(body.code ?? body.template_code);
  if (!code.ok) {
    return NextResponse.json({ error: code.error }, { status: 400 });
  }

  const { data, error } = await gate.auth.supabase
    .from("compensation_plan_templates")
    .insert([
      {
        organization_id: org.organizationId,
        template_code: code.code,
        display_name: name.name,
        description: asText(body.description),
        status: "draft",
        created_by: gate.auth.user.id,
      },
    ])
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Création du modèle impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({ template: data }, { status: 201 });
}

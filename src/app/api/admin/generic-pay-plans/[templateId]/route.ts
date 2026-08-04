import { NextRequest, NextResponse } from "next/server";
import {
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ templateId: string }> };

export async function GET(req: NextRequest, context: Params) {
  const gate = await requireGenericPayPlanAdminAccess(req);
  if (!gate.ok) return gate.response;
  const permission = assertPayPlanPermission(
    gate.auth.user,
    "commission_calculation_review"
  );
  if (!permission.ok) {
    const manage = assertPayPlanPermission(
      gate.auth.user,
      "commission_plan_template_manage"
    );
    if (!manage.ok) {
      return NextResponse.json(
        { error: manage.error },
        { status: manage.status }
      );
    }
  }

  const { templateId } = await context.params;
  const organizationId = req.nextUrl.searchParams.get("organization_id");
  const org = await resolvePayPlanOrganization({
    userId: gate.auth.user.id,
    accessToken: gate.auth.accessToken,
    requestedOrganizationId: organizationId,
  });
  if (!org.ok) {
    return NextResponse.json({ error: org.error }, { status: org.status });
  }

  const { data: template, error } = await gate.auth.supabase
    .from("compensation_plan_templates")
    .select("*")
    .eq("id", templateId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();

  if (error || !template) {
    return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
  }

  const { data: versions } = await gate.auth.supabase
    .from("compensation_plan_versions")
    .select("*")
    .eq("template_id", templateId)
    .eq("organization_id", org.organizationId)
    .order("version_number", { ascending: false });

  const versionIds = (versions ?? []).map((row) => row.id);
  const { data: rules } = versionIds.length
    ? await gate.auth.supabase
        .from("compensation_rule_modules")
        .select("*")
        .in("version_id", versionIds)
        .eq("organization_id", org.organizationId)
        .order("priority", { ascending: true })
    : { data: [] as Record<string, unknown>[] };

  const ruleIds = (rules ?? []).map((row) => row.id);
  const { data: conditions } = ruleIds.length
    ? await gate.auth.supabase
        .from("compensation_rule_conditions")
        .select("*")
        .in("rule_module_id", ruleIds)
        .eq("organization_id", org.organizationId)
    : { data: [] as Record<string, unknown>[] };

  const { data: tiers } = ruleIds.length
    ? await gate.auth.supabase
        .from("compensation_rule_tiers")
        .select("*")
        .in("rule_module_id", ruleIds)
        .eq("organization_id", org.organizationId)
        .order("tier_order", { ascending: true })
    : { data: [] as Record<string, unknown>[] };

  const { data: assignments } = versionIds.length
    ? await gate.auth.supabase
        .from("compensation_plan_assignments")
        .select("*")
        .in("plan_version_id", versionIds)
        .eq("organization_id", org.organizationId)
        .order("created_at", { ascending: false })
    : { data: [] as Record<string, unknown>[] };

  return NextResponse.json({
    organization_id: org.organizationId,
    template,
    versions: versions ?? [],
    rules: rules ?? [],
    conditions: conditions ?? [],
    tiers: tiers ?? [],
    assignments: assignments ?? [],
  });
}

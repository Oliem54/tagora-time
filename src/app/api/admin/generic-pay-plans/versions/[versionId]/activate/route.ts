import { NextRequest, NextResponse } from "next/server";
import {
  asObject,
  asText,
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ versionId: string }> };

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

  const { versionId } = await context.params;
  const body = asObject(await req.json().catch(() => ({})));
  const org = await resolvePayPlanOrganization({
    userId: gate.auth.user.id,
    accessToken: gate.auth.accessToken,
    requestedOrganizationId: body.organization_id,
  });
  if (!org.ok) {
    return NextResponse.json({ error: org.error }, { status: org.status });
  }

  const { data: version, error } = await gate.auth.supabase
    .from("compensation_plan_versions")
    .select("*")
    .eq("id", versionId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();

  if (error || !version) {
    return NextResponse.json({ error: "Version introuvable." }, { status: 404 });
  }
  if (version.status !== "draft") {
    return NextResponse.json(
      { error: "Seule une version brouillon peut être activée." },
      { status: 400 }
    );
  }

  const effectiveFrom =
    asText(body.effective_from) ||
    (typeof version.effective_from === "string" ? version.effective_from : null);
  if (!effectiveFrom) {
    return NextResponse.json(
      { error: "Une date d’effet est requise pour activer." },
      { status: 400 }
    );
  }

  const { count: ruleCount } = await gate.auth.supabase
    .from("compensation_rule_modules")
    .select("id", { count: "exact", head: true })
    .eq("version_id", versionId)
    .eq("organization_id", org.organizationId);

  if (!ruleCount) {
    return NextResponse.json(
      { error: "Ajoutez au moins une règle avant l’activation." },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await gate.auth.supabase
    .from("compensation_plan_versions")
    .update({
      status: "active",
      effective_from: effectiveFrom,
      activated_by: gate.auth.user.id,
    })
    .eq("id", versionId)
    .eq("organization_id", org.organizationId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message || "Activation impossible." },
      { status: 400 }
    );
  }

  await gate.auth.supabase
    .from("compensation_plan_templates")
    .update({
      status: "active",
      current_version_id: versionId,
    })
    .eq("id", version.template_id)
    .eq("organization_id", org.organizationId);

  return NextResponse.json({ version: updated });
}

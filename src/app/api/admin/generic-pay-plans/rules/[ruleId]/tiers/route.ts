import { NextRequest, NextResponse } from "next/server";
import {
  asNumber,
  asObject,
  assertPayPlanPermission,
  requireGenericPayPlanAdminAccess,
  resolvePayPlanOrganization,
} from "@/app/lib/commissions/generic-pay-plan.server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ruleId: string }> };

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

  const { ruleId } = await context.params;
  const body = asObject(await req.json().catch(() => ({})));
  const org = await resolvePayPlanOrganization({
    userId: gate.auth.user.id,
    accessToken: gate.auth.accessToken,
    requestedOrganizationId: body.organization_id,
  });
  if (!org.ok) {
    return NextResponse.json({ error: org.error }, { status: org.status });
  }

  const { data: rule } = await gate.auth.supabase
    .from("compensation_rule_modules")
    .select("id, organization_id, version_id, rule_kind")
    .eq("id", ruleId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!rule) {
    return NextResponse.json({ error: "Règle introuvable." }, { status: 404 });
  }

  const { data: version } = await gate.auth.supabase
    .from("compensation_plan_versions")
    .select("status, is_immutable")
    .eq("id", rule.version_id)
    .maybeSingle();
  if (!version || version.status !== "draft" || version.is_immutable) {
    return NextResponse.json(
      { error: "Impossible de modifier une version active." },
      { status: 400 }
    );
  }

  const thresholdFrom = asNumber(body.threshold_from) ?? 0;
  const ratePercent = asNumber(body.rate_percent);
  const amount = asNumber(body.amount);
  const tierOrder = Math.max(0, Math.trunc(asNumber(body.tier_order) ?? 0));

  if (thresholdFrom < 0) {
    return NextResponse.json({ error: "Seuil invalide." }, { status: 400 });
  }
  if (rule.rule_kind === "percentage_of_eligible_sales") {
    if (ratePercent == null || ratePercent < 0 || ratePercent > 100) {
      return NextResponse.json({ error: "Taux de palier invalide." }, { status: 400 });
    }
  } else if (amount == null || amount < 0) {
    return NextResponse.json({ error: "Montant de palier invalide." }, { status: 400 });
  }

  const { data, error } = await gate.auth.supabase
    .from("compensation_rule_tiers")
    .insert([
      {
        organization_id: org.organizationId,
        rule_module_id: ruleId,
        tier_order: tierOrder,
        threshold_from: thresholdFrom,
        rate_percent:
          rule.rule_kind === "percentage_of_eligible_sales" ? ratePercent : null,
        amount: rule.rule_kind === "fixed_amount_per_unit" ? amount : null,
      },
    ])
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Création de palier impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({ tier: data }, { status: 201 });
}

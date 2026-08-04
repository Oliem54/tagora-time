import { NextRequest, NextResponse } from "next/server";
import { assertRuleKindIsNotEmployeeIdentifier } from "@/app/lib/commissions/generic-pay-plan-contracts";
import {
  asNumber,
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

  const { data: version } = await gate.auth.supabase
    .from("compensation_plan_versions")
    .select("id, organization_id, status, is_immutable")
    .eq("id", versionId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();

  if (!version) {
    return NextResponse.json({ error: "Version introuvable." }, { status: 404 });
  }
  if (version.status !== "draft" || version.is_immutable) {
    return NextResponse.json(
      { error: "Impossible de modifier une version active. Créez une nouvelle version." },
      { status: 400 }
    );
  }

  const ruleKind = asText(body.rule_kind) || "percentage_of_eligible_sales";
  const kindCheck = assertRuleKindIsNotEmployeeIdentifier(ruleKind);
  if (!kindCheck.ok) {
    return NextResponse.json({ error: kindCheck.error }, { status: 400 });
  }
  if (
    ruleKind !== "percentage_of_eligible_sales" &&
    ruleKind !== "fixed_amount_per_unit"
  ) {
    return NextResponse.json(
      { error: "Choisissez un pourcentage ou un montant fixe." },
      { status: 400 }
    );
  }

  const displayName =
    asText(body.display_name) ||
    (ruleKind === "fixed_amount_per_unit"
      ? "Montant fixe"
      : "Pourcentage des ventes");

  const ratePercent = asNumber(body.rate_percent);
  const amount = asNumber(body.amount);
  if (ruleKind === "percentage_of_eligible_sales") {
    if (ratePercent == null || ratePercent < 0 || ratePercent > 100) {
      return NextResponse.json({ error: "Taux invalide." }, { status: 400 });
    }
  } else if (amount == null || amount < 0) {
    return NextResponse.json({ error: "Montant fixe invalide." }, { status: 400 });
  }

  const { data, error } = await gate.auth.supabase
    .from("compensation_rule_modules")
    .insert([
      {
        organization_id: org.organizationId,
        version_id: versionId,
        rule_kind: ruleKind,
        display_name: displayName,
        priority: Math.max(0, Math.trunc(asNumber(body.priority) ?? 0)),
        amount: ruleKind === "fixed_amount_per_unit" ? amount : null,
        rate_percent:
          ruleKind === "percentage_of_eligible_sales" ? ratePercent : null,
        configuration: {},
      },
    ])
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Création de règle impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({ rule: data }, { status: 201 });
}

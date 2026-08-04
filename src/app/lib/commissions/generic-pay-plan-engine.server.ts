import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildQaExternalReference,
  calculateGenericPayPlanAmount,
  encodeGenericPayPlanTrace,
  type GenericPayPlanTrace,
} from "@/app/lib/commissions/generic-pay-plan.shared";

type ProcessInput = {
  supabase: SupabaseClient;
  userId: string;
  organizationId: string;
  assignmentId: string;
  saleAmount: number;
  soldAt: string;
  label?: string | null;
  externalReferenceSuffix?: string | null;
};

export type ProcessGenericPayPlanResult =
  | {
      ok: true;
      eventId: string;
      accrualId: string;
      calculatedAmount: number;
      basisAmount: number;
      ratePercent: number | null;
      fixedAmount: number | null;
      explanation: string;
      trace: GenericPayPlanTrace;
    }
  | { ok: false; status: number; error: string };

export async function processGenericPayPlanAssignment(
  input: ProcessInput
): Promise<ProcessGenericPayPlanResult> {
  const { data: assignment, error: assignmentError } = await input.supabase
    .from("compensation_plan_assignments")
    .select(
      "id, organization_id, employee_id, plan_version_id, status, effective_from, effective_to"
    )
    .eq("id", input.assignmentId)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return { ok: false, status: 404, error: "Affectation introuvable." };
  }
  if (assignment.organization_id !== input.organizationId) {
    return { ok: false, status: 403, error: "Ressource inaccessible." };
  }
  if (assignment.status !== "active") {
    return {
      ok: false,
      status: 400,
      error: "Seule une affectation active peut être traitée.",
    };
  }

  const soldAt = input.soldAt.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soldAt)) {
    return { ok: false, status: 400, error: "Date de vente invalide." };
  }
  if (soldAt < String(assignment.effective_from)) {
    return {
      ok: false,
      status: 400,
      error: "La vente est avant la date d’effet de l’affectation.",
    };
  }
  if (assignment.effective_to && soldAt > String(assignment.effective_to)) {
    return {
      ok: false,
      status: 400,
      error: "La vente est après la fin de l’affectation.",
    };
  }

  const { data: version, error: versionError } = await input.supabase
    .from("compensation_plan_versions")
    .select("id, organization_id, template_id, version_number, status")
    .eq("id", assignment.plan_version_id)
    .maybeSingle();

  if (versionError || !version) {
    return { ok: false, status: 404, error: "Version de plan introuvable." };
  }
  if (version.organization_id !== input.organizationId) {
    return { ok: false, status: 403, error: "Ressource inaccessible." };
  }
  if (version.status !== "active") {
    return {
      ok: false,
      status: 400,
      error: "La version du plan doit être active pour le calcul.",
    };
  }

  const { data: template, error: templateError } = await input.supabase
    .from("compensation_plan_templates")
    .select("id, organization_id, template_code, display_name")
    .eq("id", version.template_id)
    .maybeSingle();

  if (templateError || !template) {
    return { ok: false, status: 404, error: "Modèle de plan introuvable." };
  }
  if (template.organization_id !== input.organizationId) {
    return { ok: false, status: 403, error: "Ressource inaccessible." };
  }

  const { data: rules, error: rulesError } = await input.supabase
    .from("compensation_rule_modules")
    .select("id, organization_id, rule_kind, display_name, amount, rate_percent, priority")
    .eq("version_id", version.id)
    .eq("organization_id", input.organizationId)
    .order("priority", { ascending: true })
    .limit(1);

  if (rulesError || !rules?.length) {
    return {
      ok: false,
      status: 400,
      error: "Aucune règle calculable sur cette version.",
    };
  }
  const rule = rules[0];

  const { data: conditions } = await input.supabase
    .from("compensation_rule_conditions")
    .select("id, condition_kind, minimum_volume")
    .eq("rule_module_id", rule.id)
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: true })
    .limit(1);

  const { data: tiers } = await input.supabase
    .from("compensation_rule_tiers")
    .select("id, tier_order, threshold_from, amount, rate_percent")
    .eq("rule_module_id", rule.id)
    .eq("organization_id", input.organizationId)
    .order("tier_order", { ascending: true })
    .limit(1);

  const condition = conditions?.[0] ?? null;
  const tier = tiers?.[0] ?? null;

  const calc = calculateGenericPayPlanAmount({
    ruleKind: String(rule.rule_kind),
    saleAmount: input.saleAmount,
    ratePercent:
      typeof rule.rate_percent === "number" ? Number(rule.rate_percent) : null,
    fixedAmount: typeof rule.amount === "number" ? Number(rule.amount) : null,
    minimumVolume:
      condition && typeof condition.minimum_volume === "number"
        ? Number(condition.minimum_volume)
        : null,
    tierThresholdFrom:
      tier && typeof tier.threshold_from === "number"
        ? Number(tier.threshold_from)
        : null,
    tierRatePercent:
      tier && typeof tier.rate_percent === "number"
        ? Number(tier.rate_percent)
        : null,
    tierAmount:
      tier && typeof tier.amount === "number" ? Number(tier.amount) : null,
  });

  if (!calc.ok) {
    return { ok: false, status: 400, error: calc.error };
  }
  if (!calc.eligible) {
    return { ok: false, status: 400, error: calc.explanation };
  }

  const externalReference = buildQaExternalReference(
    input.externalReferenceSuffix || String(assignment.id).slice(0, 8)
  );

  const { data: event, error: eventError } = await input.supabase
    .from("compensation_events")
    .insert([
      {
        event_type: "sale",
        status: "active",
        sale_state: "sold",
        chauffeur_id: assignment.employee_id,
        amount: input.saleAmount,
        sold_at: soldAt,
        label: input.label?.trim() || `Vente ${template.display_name}`,
        external_reference: externalReference,
        notes: null,
        created_by: input.userId,
        updated_by: input.userId,
      },
    ])
    .select("id")
    .single();

  if (eventError || !event) {
    return {
      ok: false,
      status: 400,
      error: eventError?.message || "Création de l’événement impossible.",
    };
  }

  const processedAt = new Date().toISOString();
  const trace: GenericPayPlanTrace = {
    template_id: String(template.id),
    template_code: String(template.template_code),
    template_name: String(template.display_name),
    version_id: String(version.id),
    version_number: Number(version.version_number),
    rule_module_id: String(rule.id),
    rule_kind: String(rule.rule_kind),
    rule_name: String(rule.display_name),
    assignment_id: String(assignment.id),
    employee_id: Number(assignment.employee_id),
    organization_id: input.organizationId,
    basis_amount: calc.basisAmount,
    rate_percent: calc.ratePercent,
    fixed_amount: calc.fixedAmount,
    calculated_amount: calc.calculatedAmount,
    event_id: String(event.id),
    accrual_id: "",
    processed_at: processedAt,
  };

  const { data: accrual, error: accrualError } = await input.supabase
    .from("compensation_accruals")
    .insert([
      {
        compensation_event_id: event.id,
        component: "commission",
        rule_name: String(rule.display_name),
        label: encodeGenericPayPlanTrace(trace),
        sales_basis_amount: calc.basisAmount,
        calculated_amount: calc.calculatedAmount,
        status: "under_review",
        created_by: input.userId,
        updated_by: input.userId,
      },
    ])
    .select("id")
    .single();

  if (accrualError || !accrual) {
    return {
      ok: false,
      status: 400,
      error: accrualError?.message || "Création du résultat impossible.",
    };
  }

  trace.accrual_id = String(accrual.id);

  await input.supabase
    .from("compensation_accruals")
    .update({
      label: encodeGenericPayPlanTrace(trace),
      updated_by: input.userId,
    })
    .eq("id", accrual.id);

  await input.supabase.from("compensation_accrual_status_history").insert([
    {
      accrual_id: accrual.id,
      from_status: null,
      to_status: "under_review",
      changed_by: input.userId,
      reason: "Calcul générique pay plan",
    },
  ]);

  await input.supabase
    .from("compensation_events")
    .update({
      notes: encodeGenericPayPlanTrace(trace),
      updated_by: input.userId,
    })
    .eq("id", event.id);

  return {
    ok: true,
    eventId: String(event.id),
    accrualId: String(accrual.id),
    calculatedAmount: calc.calculatedAmount,
    basisAmount: calc.basisAmount,
    ratePercent: calc.ratePercent,
    fixedAmount: calc.fixedAmount,
    explanation: calc.explanation,
    trace,
  };
}

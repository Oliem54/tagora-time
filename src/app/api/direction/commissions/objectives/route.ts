import { NextRequest, NextResponse } from "next/server";
import {
  normalizeTargetType,
} from "@/app/lib/commissions/calculate.server";
import { todayIsoLocal } from "@/app/lib/commissions/commissions.shared";
import {
  computeProgressPercent,
  deriveObjectiveStatus,
} from "@/app/lib/commissions/calculate.server";
import {
  getUserDisplayName,
  loadChauffeurLabels,
  mapDirectionObjectiveOperationalRow,
  mapObjectiveRow,
  requireAdminFinanceCommissionsAccess,
  requireCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import { hasAdminFinanceAccess } from "@/app/lib/auth/admin-finance";
import { loadDirectionGrantedOperationalObjectives } from "@/app/lib/commissions/sales-book-grants.server";

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRuleInput(raw: Record<string, unknown>) {
  const rule_type =
    raw.rule_type === "percentage" || raw.rule_type === "tier_bonus"
      ? raw.rule_type
      : "fixed";
  return {
    rule_name: asText(raw.rule_name) ?? "Commission",
    rule_type,
    fixed_amount: rule_type === "fixed" ? asNumber(raw.fixed_amount) : null,
    percentage_rate: rule_type === "percentage" ? asNumber(raw.percentage_rate) : null,
    tier_config: rule_type === "tier_bonus" && Array.isArray(raw.tier_config) ? raw.tier_config : [],
    achievement_bonus_amount: asNumber(raw.achievement_bonus_amount),
    is_active: raw.is_active !== false,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;
    const todayIso = todayIsoLocal();

    if (hasAdminFinanceAccess(user)) {
      const { data, error } = await supabase
        .from("sales_objectives")
        .select("*")
        .order("period_end", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const chauffeurIds = (data ?? [])
        .map((row) => Number((row as Record<string, unknown>).chauffeur_id))
        .filter((id) => Number.isFinite(id) && id > 0);
      const labelMap = await loadChauffeurLabels(supabase, chauffeurIds);

      const objectives = (data ?? []).map((row) => {
        const record = row as Record<string, unknown>;
        const chauffeurId = Number(record.chauffeur_id);
        const mapped = mapObjectiveRow(
          record,
          Number.isFinite(chauffeurId) ? labelMap.get(chauffeurId) ?? null : null
        );
        return {
          ...mapped,
          computed_status: deriveObjectiveStatus(mapped, todayIso),
          progress_percent: computeProgressPercent(mapped),
        };
      });

      return NextResponse.json({ objectives, todayIso });
    }

    const objectivesResult = await loadDirectionGrantedOperationalObjectives(supabase, user.id);
    const objectives = objectivesResult === "forbidden" ? [] : objectivesResult;

    return NextResponse.json({ objectives, todayIso });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur objectifs." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = asText(body.title);
    const period_start = asText(body.period_start);
    const period_end = asText(body.period_end);
    const target_type = normalizeTargetType(body.target_type);
    const chauffeur_id = asNumber(body.chauffeur_id);
    const team_name = asText(body.team_name);

    if (!title || !period_start || !period_end || !target_type) {
      return NextResponse.json({ error: "Champs requis manquants." }, { status: 400 });
    }
    if (!chauffeur_id && !team_name) {
      return NextResponse.json(
        { error: "Assignez un employe ou une equipe." },
        { status: 400 }
      );
    }

    const target_amount = target_type === "amount" ? asNumber(body.target_amount) : null;
    const target_sales_count =
      target_type === "sales_count" ? Math.trunc(asNumber(body.target_sales_count) ?? 0) : null;

    if (target_type === "amount" && (!target_amount || target_amount <= 0)) {
      return NextResponse.json({ error: "Montant cible invalide." }, { status: 400 });
    }
    if (target_type === "sales_count" && (!target_sales_count || target_sales_count <= 0)) {
      return NextResponse.json({ error: "Nombre de ventes cible invalide." }, { status: 400 });
    }

    const publish = body.publish === true;
    const actorName = getUserDisplayName(user);

    const objectivePayload = {
      title,
      description: asText(body.description),
      chauffeur_id: chauffeur_id ? Math.trunc(chauffeur_id) : null,
      team_name,
      period_start,
      period_end,
      target_type,
      target_amount,
      target_sales_count,
      achieved_amount: asNumber(body.achieved_amount) ?? 0,
      achieved_sales_count: Math.trunc(asNumber(body.achieved_sales_count) ?? 0),
      status: publish ? "active" : "draft",
      company_context: asText(body.company_context),
      created_by: user.id,
      created_by_name: actorName,
      updated_by: user.id,
      updated_by_name: actorName,
    };

    const insertRes = await supabase
      .from("sales_objectives")
      .insert([objectivePayload])
      .select("*")
      .single();

    if (insertRes.error || !insertRes.data) {
      return NextResponse.json({ error: insertRes.error?.message ?? "Creation impossible." }, { status: 400 });
    }

    const objectiveId = String((insertRes.data as Record<string, unknown>).id);
    const rulesInput = Array.isArray(body.rules) ? body.rules : [];
    const parsedRules = rulesInput
      .filter((item) => item && typeof item === "object")
      .map((item) => parseRuleInput(item as Record<string, unknown>));

    if (parsedRules.length > 0) {
      const rulesPayload = parsedRules.map((rule) => ({
        ...rule,
        objective_id: objectiveId,
      }));
      const rulesRes = await supabase.from("commission_rules").insert(rulesPayload);
      if (rulesRes.error) {
        return NextResponse.json(
          {
            error: rulesRes.error.message,
            warning: "Objectif cree mais regles de commission non enregistrees.",
            objective: insertRes.data,
          },
          { status: 400 }
        );
      }
    }

    const objectiveOperational = await supabase
      .from("direction_objectives_operational_view")
      .select("*")
      .eq("id", objectiveId)
      .maybeSingle();

    if (objectiveOperational.error || !objectiveOperational.data) {
      return NextResponse.json(
        { error: objectiveOperational.error?.message ?? "Objectif cree mais vue operationnelle inaccessible." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      objective: mapDirectionObjectiveOperationalRow(
        objectiveOperational.data as Record<string, unknown>
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur creation objectif." },
      { status: 500 }
    );
  }
}

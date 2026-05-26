import { NextRequest, NextResponse } from "next/server";
import {
  normalizeTargetType,
} from "@/app/lib/commissions/calculate.server";
import {
  getUserDisplayName,
  mapDirectionObjectiveOperationalRow,
  requireAdminFinanceCommissionsAccess,
  requireCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";

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

type DirectionObjectiveSupabase = {
  from: (table: "direction_objectives_operational_view") => {
    select: (columns: "*") => {
      eq: (column: "id", value: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
};

async function loadDirectionObjective(
  supabase: DirectionObjectiveSupabase,
  objectiveId: string
) {
  const objectiveRes = await supabase
    .from("direction_objectives_operational_view")
    .select("*")
    .eq("id", objectiveId)
    .maybeSingle();

  if (objectiveRes.error || !objectiveRes.data) {
    return { error: objectiveRes.error?.message ?? "Objectif introuvable." } as const;
  }

  return {
    objective: mapDirectionObjectiveOperationalRow(
      objectiveRes.data as Record<string, unknown>
    ),
  } as const;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await params;
    const bundle = await loadDirectionObjective(
      supabase as unknown as DirectionObjectiveSupabase,
      id
    );
    if ("error" in bundle) {
      return NextResponse.json({ error: bundle.error }, { status: 404 });
    }

    return NextResponse.json(bundle);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur objectif." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const actorName = getUserDisplayName(user);

    const patch: Record<string, unknown> = {
      updated_by: user.id,
      updated_by_name: actorName,
    };

    if (body.title !== undefined) patch.title = asText(body.title);
    if (body.description !== undefined) patch.description = asText(body.description);
    if (body.team_name !== undefined) patch.team_name = asText(body.team_name);
    if (body.company_context !== undefined) patch.company_context = asText(body.company_context);
    if (body.period_start !== undefined) patch.period_start = asText(body.period_start);
    if (body.period_end !== undefined) patch.period_end = asText(body.period_end);
    if (body.chauffeur_id !== undefined) {
      const parsed = asNumber(body.chauffeur_id);
      patch.chauffeur_id = parsed ? Math.trunc(parsed) : null;
    }
    if (body.target_type !== undefined) {
      const targetType = normalizeTargetType(body.target_type);
      if (targetType) patch.target_type = targetType;
    }
    if (body.target_amount !== undefined) {
      patch.target_amount = asNumber(body.target_amount);
    }
    if (body.target_sales_count !== undefined) {
      patch.target_sales_count = Math.trunc(asNumber(body.target_sales_count) ?? 0);
    }
    if (body.achieved_amount !== undefined) {
      patch.achieved_amount = asNumber(body.achieved_amount) ?? 0;
    }
    if (body.achieved_sales_count !== undefined) {
      patch.achieved_sales_count = Math.trunc(asNumber(body.achieved_sales_count) ?? 0);
    }
    if (body.status !== undefined && typeof body.status === "string") {
      patch.status = body.status;
    }
    if (body.publish === true) patch.status = "active";

    const updateRes = await supabase
      .from("sales_objectives")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (updateRes.error || !updateRes.data) {
      return NextResponse.json(
        { error: updateRes.error?.message ?? "Mise a jour impossible." },
        { status: 400 }
      );
    }

    const objectiveOperational = await supabase
      .from("direction_objectives_operational_view")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (objectiveOperational.error || !objectiveOperational.data) {
      return NextResponse.json(
        { error: objectiveOperational.error?.message ?? "Objectif mis a jour mais vue operationnelle inaccessible." },
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
      { error: error instanceof Error ? error.message : "Erreur serveur mise a jour." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;
    const { id } = await params;

    const updateRes = await supabase
      .from("sales_objectives")
      .update({
        status: "cancelled",
        updated_by: user.id,
        updated_by_name: getUserDisplayName(user),
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (updateRes.error || !updateRes.data) {
      return NextResponse.json(
        { error: updateRes.error?.message ?? "Annulation impossible." },
        { status: 400 }
      );
    }

    await supabase
      .from("commission_entries")
      .update({ status: "cancelled" })
      .eq("objective_id", id)
      .in("status", ["estimated", "pending_validation"]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur annulation." },
      { status: 500 }
    );
  }
}

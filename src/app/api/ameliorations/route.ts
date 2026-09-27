import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  IMPROVEMENT_STATUS_OPTIONS,
  LOCAL_IMPROVEMENT_INTAKE_CLOSED_MESSAGE,
  type ImprovementStatus,
} from "@/app/lib/improvements";

function isImprovementStatus(value: unknown): value is ImprovementStatus {
  return typeof value === "string" && IMPROVEMENT_STATUS_OPTIONS.includes(value as ImprovementStatus);
}

function formatDbError(error: { code?: string | null; message: string; details?: string | null; hint?: string | null }) {
  return {
    code: error.code ?? null,
    dbMessage: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    if (role !== "admin") {
      return NextResponse.json({ error: "Acces reserve aux admins." }, { status: 403 });
    }

    const statusParam = req.nextUrl.searchParams.get("status");
    const statusFilter = statusParam && statusParam !== "tous" ? statusParam : null;
    const scopeParam = req.nextUrl.searchParams.get("scope") ?? "actives";
    const scope =
      scopeParam === "archive" || scopeParam === "tous" || scopeParam === "actives"
        ? scopeParam
        : "actives";

    if (statusFilter && !isImprovementStatus(statusFilter)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    let query = supabase
      .from("app_improvements")
      .select(
        "id, created_at, updated_at, treated_at, deleted_at, deleted_by, archived_at, archived_by, module, priority, title, description, status, created_by_email, created_by_role"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (scope === "actives") {
      query = query.is("archived_at", null).is("deleted_at", null);
    } else if (scope === "archive") {
      query = query.not("archived_at", "is", null).is("deleted_at", null);
    } else {
      query = query.is("deleted_at", null);
    }

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[ameliorations][GET] select failed", error);
      return NextResponse.json(
        {
          error: "Impossible de charger les ameliorations.",
          ...formatDbError(error),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, items: data ?? [] });
  } catch (error) {
    console.error("[ameliorations][GET] unexpected error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur chargement ameliorations." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  return NextResponse.json(
    { error: LOCAL_IMPROVEMENT_INTAKE_CLOSED_MESSAGE },
    { status: 403 }
  );
}

export async function PATCH(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    if (role !== "admin") {
      return NextResponse.json({ error: "Acces reserve aux admins." }, { status: 403 });
    }

    const body = (await req.json()) as { id?: unknown; status?: unknown };
    const id = Number(body.id);
    const status = body.status;

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    }

    if (!isImprovementStatus(status)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const payload: Record<string, unknown> = {
      status,
      updated_at: nowIso,
      /* Refus workflow (supprimee) : pas de deleted_at, la suppression logique est une autre action. */
      treated_at: status === "traitee" ? nowIso : null,
    };

    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from("app_improvements")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("[ameliorations][PATCH] update failed", { id, status, error });
      return NextResponse.json(
        { error: "Impossible de mettre a jour le statut.", ...formatDbError(error) },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ameliorations][PATCH] unexpected error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur mise a jour statut." },
      { status: 500 }
    );
  }
}

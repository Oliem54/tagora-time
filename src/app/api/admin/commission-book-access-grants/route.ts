import { NextRequest, NextResponse } from "next/server";
import {
  loadChauffeurLabels,
  requireAdminFinanceCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import { validateAuthorizedViewerAuthUser } from "@/app/lib/commissions/commission-book-authorized-viewers.shared";
import {
  mapCommissionBookAccessGrantRecord,
} from "@/app/lib/commissions/sales-book-grants.server";

export const dynamic = "force-dynamic";

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

function parseActiveFilter(value: string | null) {
  if (value == null || value === "" || value === "all") return "all" as const;
  if (value === "true" || value === "active") return "active" as const;
  if (value === "false" || value === "revoked") return "revoked" as const;
  return null;
}

async function resolveAuthorizedViewerUserId(
  supabase: ReturnType<typeof import("@/app/lib/supabase/admin").createAdminSupabaseClient>,
  viewerUserId: string
) {
  const { data, error } = await supabase.auth.admin.getUserById(viewerUserId);
  if (error || !data.user) {
    return { ok: false as const, error: "Personne autorisée introuvable." };
  }

  const validation = validateAuthorizedViewerAuthUser(data.user);
  if (!validation.ok) {
    return { ok: false as const, error: validation.error };
  }

  return { ok: true as const, user: data.user, role: validation.role };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const activeFilter = parseActiveFilter(new URL(req.url).searchParams.get("active"));
    if (activeFilter == null) {
      return NextResponse.json(
        { error: "Filtre active invalide (all, active, revoked)." },
        { status: 400 }
      );
    }

    let query = supabase
      .from("commission_book_access_grants")
      .select("*")
      .order("created_at", { ascending: false });

    if (activeFilter === "active") {
      query = query.is("revoked_at", null);
    } else if (activeFilter === "revoked") {
      query = query.not("revoked_at", "is", null);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const ownerIds = Array.from(
      new Set(
        (data ?? [])
          .map((row) =>
            Math.trunc(Number((row as { owner_chauffeur_id?: unknown }).owner_chauffeur_id))
          )
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );
    const labelMap = await loadChauffeurLabels(supabase, ownerIds);

    const grants = (data ?? []).map((row) =>
      mapCommissionBookAccessGrantRecord(
        row as Record<string, unknown>,
        labelMap.get(
          Math.trunc(Number((row as { owner_chauffeur_id?: unknown }).owner_chauffeur_id))
        ) ?? null
      )
    );

    return NextResponse.json({ grants });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur grants." },
      { status: 500 }
    );
  }
}

export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "Révocation via PATCH sans identifiant interdite. Utilisez PATCH /api/admin/commission-book-access-grants/{grantId} avec { revoke: true }.",
    },
    { status: 405 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const ownerChauffeurId = asNumber(body.owner_chauffeur_id);
    const viewerUserId = asText(body.viewer_user_id);
    const notes = asText(body.notes);
    const expiresAt = asText(body.expires_at);

    if (ownerChauffeurId == null || ownerChauffeurId <= 0 || !viewerUserId) {
      return NextResponse.json(
        { error: "owner_chauffeur_id et viewer_user_id sont requis." },
        { status: 400 }
      );
    }

    const ownerRes = await supabase
      .from("chauffeurs")
      .select("id, actif, auth_user_id")
      .eq("id", Math.trunc(ownerChauffeurId))
      .maybeSingle();

    if (ownerRes.error || !ownerRes.data) {
      return NextResponse.json({ error: "Employe proprietaire introuvable." }, { status: 404 });
    }

    const ownerRecord = ownerRes.data as {
      actif?: boolean | null;
      auth_user_id?: string | null;
    };
    const ownerAuthUserId =
      typeof ownerRecord.auth_user_id === "string" ? ownerRecord.auth_user_id.trim() : "";
    if (ownerRecord.actif !== true || !ownerAuthUserId) {
      return NextResponse.json(
        {
          error: "L'employé sélectionné doit être actif et lié à un compte portail.",
        },
        { status: 400 }
      );
    }

    const viewerResolution = await resolveAuthorizedViewerUserId(supabase, viewerUserId);
    if (!viewerResolution.ok) {
      return NextResponse.json({ error: viewerResolution.error }, { status: 400 });
    }

    const duplicateRes = await supabase
      .from("commission_book_access_grants")
      .select("id")
      .eq("owner_chauffeur_id", Math.trunc(ownerChauffeurId))
      .eq("viewer_user_id", viewerUserId)
      .is("revoked_at", null)
      .maybeSingle();

    if (duplicateRes.error) {
      return NextResponse.json({ error: duplicateRes.error.message }, { status: 400 });
    }
    if (duplicateRes.data) {
      return NextResponse.json(
        { error: "Un accès actif existe déjà pour ce livre et cette personne autorisée." },
        { status: 409 }
      );
    }

    const insertRes = await supabase
      .from("commission_book_access_grants")
      .insert([
        {
          owner_chauffeur_id: Math.trunc(ownerChauffeurId),
          viewer_user_id: viewerUserId,
          // Temporaire jusqu'à migration viewer_role admin/direction (contrainte SQL V1).
          viewer_role: "direction",
          granted_by_admin_id: user.id,
          can_view: true,
          can_edit: false,
          expires_at: expiresAt,
          notes,
        },
      ])
      .select("*")
      .single();

    if (insertRes.error || !insertRes.data) {
      return NextResponse.json(
        { error: insertRes.error?.message ?? "Creation du grant impossible." },
        { status: 400 }
      );
    }

    const ownerLabelMap = await loadChauffeurLabels(supabase, [Math.trunc(ownerChauffeurId)]);

    return NextResponse.json({
      grant: mapCommissionBookAccessGrantRecord(
        insertRes.data as Record<string, unknown>,
        ownerLabelMap.get(Math.trunc(ownerChauffeurId)) ?? null
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur creation grant." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  extractRoleFromUser,
} from "@/app/lib/account-requests.server";
import {
  loadChauffeurLabels,
  requireAdminFinanceCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import {
  mapCommissionBookAccessGrantRecord,
} from "@/app/lib/commissions/sales-book-grants.server";
import { getUserRole } from "@/app/lib/auth/roles";

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

async function resolveDirectionViewerUserId(
  supabase: ReturnType<typeof import("@/app/lib/supabase/admin").createAdminSupabaseClient>,
  viewerUserId: string
) {
  const { data, error } = await supabase.auth.admin.getUserById(viewerUserId);
  if (error || !data.user) {
    return { ok: false as const, error: "Utilisateur Direction introuvable." };
  }

  const role = getUserRole(data.user) ?? extractRoleFromUser(data.user);
  if (role !== "direction") {
    return { ok: false as const, error: "Le viewer doit etre un utilisateur Direction." };
  }

  return { ok: true as const, user: data.user };
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
          .map((row) => Math.trunc(Number((row as { owner_chauffeur_id?: unknown }).owner_chauffeur_id)))
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
      .select("id")
      .eq("id", Math.trunc(ownerChauffeurId))
      .maybeSingle();

    if (ownerRes.error || !ownerRes.data) {
      return NextResponse.json({ error: "Employe proprietaire introuvable." }, { status: 404 });
    }

    const viewerResolution = await resolveDirectionViewerUserId(supabase, viewerUserId);
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
        { error: "Un acces actif existe deja pour cet employe et cet utilisateur Direction." },
        { status: 409 }
      );
    }

    const insertRes = await supabase
      .from("commission_book_access_grants")
      .insert([
        {
          owner_chauffeur_id: Math.trunc(ownerChauffeurId),
          viewer_user_id: viewerUserId,
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

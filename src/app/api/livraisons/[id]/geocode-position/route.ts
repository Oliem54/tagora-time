import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { buildUpdateStamp } from "@/app/lib/livraisons/audit-stamp.server";

type Body = { latitude?: unknown; longitude?: unknown };

/**
 * Mise a jour des seules coordonnees GPS (evite d'ecraser adresse via inline-stop).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: { message: "Authentification requise." } }, { status: 401 });
    }
    if (!hasUserPermission(user, "livraisons")) {
      return NextResponse.json({ error: { message: "Acces refuse." } }, { status: 403 });
    }
    if (role !== "direction" && role !== "admin") {
      return NextResponse.json(
        { error: { message: "Action reservee a la direction/admin." } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const livraisonId = Number(id);
    if (!Number.isFinite(livraisonId) || livraisonId <= 0) {
      return NextResponse.json({ error: { message: "Identifiant invalide." } }, { status: 400 });
    }

    const body = (await req.json()) as Body;
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: { message: "Latitude/longitude invalides." } },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const firstRes = await supabase
      .from("livraisons_planifiees")
      .update({ latitude: lat, longitude: lng, ...buildUpdateStamp(user) })
      .eq("id", livraisonId)
      .select("id, latitude, longitude, updated_by_user_id, updated_by_name, updated_at")
      .maybeSingle();

    let data: Record<string, unknown> | null = firstRes.data as Record<string, unknown> | null;
    let error = firstRes.error;

    // Fallback si les colonnes d'audit n'existent pas encore.
    if (
      error &&
      (error.code === "42703" ||
        (typeof error.message === "string" &&
          error.message.toLowerCase().includes("column") &&
          (error.message.toLowerCase().includes("updated_by") ||
            error.message.toLowerCase().includes("updated_at") ||
            error.message.toLowerCase().includes("schema cache"))))
    ) {
      console.warn(
        "[api/livraisons/[id]/geocode-position] audit columns missing, retrying without stamp",
        { livraisonId, code: error.code, message: error.message }
      );
      const retry = await supabase
        .from("livraisons_planifiees")
        .update({ latitude: lat, longitude: lng })
        .eq("id", livraisonId)
        .select("id, latitude, longitude")
        .maybeSingle();
      data = retry.data as Record<string, unknown> | null;
      error = retry.error;
    }

    if (error) {
      console.error("[api/livraisons/[id]/geocode-position] db error", {
        livraisonId,
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        { error: { message: error.message, code: error.code } },
        { status: 400 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: { message: "Aucune ligne mise a jour (id ou RLS)." } },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur.";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}

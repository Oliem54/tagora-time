import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { requireDirectionOrAdmin } from "@/app/api/disponibilites/_lib";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireDirectionOrAdmin(req);
    if (!access.ok) return access.response;

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Identifiant d'indisponibilite vehicule manquant." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("vehicule_unavailabilities")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: access.user.id,
      })
      .eq("id", id)
      .eq("status", "active")
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Annulation de l'indisponibilite impossible." },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Indisponibilite active introuvable ou deja annulee." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, row: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur serveur lors de l'annulation de l'indisponibilite vehicule.",
      },
      { status: 500 }
    );
  }
}

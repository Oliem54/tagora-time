import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/app/lib/timeclock-api.server";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req, "terrain");

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.response.error },
        { status: auth.response.status }
      );
    }

    const body = (await req.json()) as {
      sortie_id?: unknown;
      completed?: unknown;
    };
    const sortieId = Number(body.sortie_id);
    const completed = body.completed === true;

    if (!Number.isFinite(sortieId) || sortieId <= 0) {
      return NextResponse.json({ error: "La sortie est invalide." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("sorties_terrain")
      .update({
        terrain_sheet_completed: completed,
        terrain_sheet_completed_at: completed ? new Date().toISOString() : null,
      })
      .eq("id", sortieId)
      .eq("user_id", auth.user.id)
      .select("id, terrain_sheet_completed, terrain_sheet_completed_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, sortie: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur confirmation fiche terrain.",
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  parseNumericCoordinate,
  requireAuthenticatedUser,
  resolveCompanyContext,
} from "@/app/lib/timeclock-api";

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
      latitude?: unknown;
      longitude?: unknown;
      company_context?: unknown;
      notes?: unknown;
    };

    const latitude = parseNumericCoordinate(body.latitude);
    const longitude = parseNumericCoordinate(body.longitude);
    const companyContext = resolveCompanyContext(auth.user, body.company_context);

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "Les coordonnees GPS sont obligatoires." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data: latestEvent } = await supabase
      .from("horodateur_events")
      .select("id, event_type")
      .eq("user_id", auth.user.id)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; event_type: string }>();

    if (!latestEvent || latestEvent.event_type === "quart_fin") {
      return NextResponse.json(
        { error: "Aucun quart actif a fermer." },
        { status: 409 }
      );
    }

    const { data: punchEvent, error } = await supabase
      .from("horodateur_events")
      .insert([
        {
          user_id: auth.user.id,
          event_type: "quart_fin",
          company_context: companyContext,
          source_module: "timeclock_api",
          notes: String(body.notes ?? "").trim() || null,
          metadata: {
            latitude,
            longitude,
            closed_from_event_id: latestEvent.id,
          },
        },
      ])
      .select("id, event_type, occurred_at, company_context, metadata")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, punch_event: punchEvent });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors du pointage de sortie.",
      },
      { status: 500 }
    );
  }
}

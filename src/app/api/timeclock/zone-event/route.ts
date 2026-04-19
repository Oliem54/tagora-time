import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  parseNumericCoordinate,
  requireAuthenticatedUser,
  resolveCompanyContext,
} from "@/app/lib/timeclock-api.server";

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
      event?: unknown;
      latitude?: unknown;
      longitude?: unknown;
      recorded_at?: unknown;
      company_context?: unknown;
    };

    const eventType =
      body.event === "zone_exit" ? "zone_exit" : body.event === "zone_entry" ? "zone_entry" : null;
    const latitude = parseNumericCoordinate(body.latitude);
    const longitude = parseNumericCoordinate(body.longitude);
    const recordedAt =
      typeof body.recorded_at === "string" && body.recorded_at
        ? body.recorded_at
        : new Date().toISOString();
    const companyContext = resolveCompanyContext(auth.user, body.company_context);

    if (!eventType) {
      return NextResponse.json({ error: "Evenement de zone invalide." }, { status: 400 });
    }

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "Les coordonnees GPS sont obligatoires." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data: zoneEvent, error } = await supabase
      .from("horodateur_events")
      .insert([
        {
          user_id: auth.user.id,
          event_type: eventType,
          occurred_at: recordedAt,
          company_context: companyContext,
          source_module: "zone_detector",
          metadata: {
            latitude,
            longitude,
          },
        },
      ])
      .select("id, event_type, occurred_at, metadata")
      .single();

    if (error) {
      throw error;
    }

    const message =
      eventType === "zone_entry"
        ? "Viens-tu travailler ?"
        : "As-tu fini de travailler ou pars-tu sur le terrain ?";

    await supabase.from("sms_alerts_log").insert([
      {
        user_id: auth.user.id,
        company_context: companyContext,
        alert_type: eventType,
        message,
        status: "queued",
        related_table: "horodateur_events",
        related_id: zoneEvent.id,
        metadata: {
          expected_answers:
            eventType === "zone_entry"
              ? ["yes_start_work", "no", "already_working", "other_comment"]
              : ["finish_work", "go_terrain", "other_comment"],
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      zone_event: zoneEvent,
      follow_up_message: message,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de l evenement de zone.",
      },
      { status: 500 }
    );
  }
}

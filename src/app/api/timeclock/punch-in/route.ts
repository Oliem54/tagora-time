import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  isWithinRadiusMeters,
  isWithinScheduledWindow,
  parseNumericCoordinate,
  requireAuthenticatedUser,
  resolveCompanyContext,
} from "@/app/lib/timeclock-api";

type ChauffeurConfigRow = {
  id: number;
  primary_company: string | null;
  work_zone_type: string | null;
  work_zone_latitude: number | null;
  work_zone_longitude: number | null;
  work_zone_radius_m: number | null;
  schedule_start: string | null;
  schedule_end: string | null;
  auto_start_enabled: boolean | null;
};

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
      device_type?: unknown;
      latitude?: unknown;
      longitude?: unknown;
      qr_token?: unknown;
      company_context?: unknown;
      notes?: unknown;
    };

    const deviceType = body.device_type === "qr" ? "qr" : "desktop";
    const latitude = parseNumericCoordinate(body.latitude);
    const longitude = parseNumericCoordinate(body.longitude);
    const qrToken = String(body.qr_token ?? "").trim() || null;
    const companyContext = resolveCompanyContext(auth.user, body.company_context);

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "Les coordonnees GPS sont obligatoires." },
        { status: 400 }
      );
    }

    if (deviceType === "qr" && !qrToken) {
      return NextResponse.json(
        { error: "Le jeton QR est obligatoire pour ce mode de pointage." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const chauffeurId = Number(auth.user.app_metadata?.chauffeur_id ?? auth.user.user_metadata?.chauffeur_id);
    let chauffeurConfig: ChauffeurConfigRow | null = null;

    if (Number.isFinite(chauffeurId)) {
      const { data } = await supabase
        .from("chauffeurs")
        .select(
          "id, primary_company, work_zone_type, work_zone_latitude, work_zone_longitude, work_zone_radius_m, schedule_start, schedule_end, auto_start_enabled"
        )
        .eq("id", chauffeurId)
        .maybeSingle<ChauffeurConfigRow>();

      chauffeurConfig = data ?? null;
    }

    const { data: latestEvent } = await supabase
      .from("horodateur_events")
      .select("id, event_type, occurred_at")
      .eq("user_id", auth.user.id)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; event_type: string; occurred_at: string }>();

    if (
      latestEvent &&
      latestEvent.event_type !== "quart_fin" &&
      latestEvent.event_type !== "authorization_refused"
    ) {
      return NextResponse.json(
        { error: "Un quart semble deja ouvert pour cet utilisateur." },
        { status: 409 }
      );
    }

    const inSchedule = isWithinScheduledWindow(
      new Date(),
      chauffeurConfig?.schedule_start,
      chauffeurConfig?.schedule_end
    );
    const inZone = isWithinRadiusMeters({
      originLatitude: chauffeurConfig?.work_zone_latitude ?? null,
      originLongitude: chauffeurConfig?.work_zone_longitude ?? null,
      latitude,
      longitude,
      radiusMeters: chauffeurConfig?.work_zone_radius_m ?? null,
    });

    if (!inSchedule || !inZone) {
      const requestType = !inSchedule ? "early_start" : "out_of_zone_punch";
      const justification =
        !inSchedule
          ? "Pointage hors horaire detecte."
          : "Pointage hors zone detecte.";

      const { data: authorizationRequest, error: authorizationError } =
        await supabase
          .from("authorization_requests")
          .insert([
            {
              user_id: auth.user.id,
              chauffeur_id: Number.isFinite(chauffeurId) ? chauffeurId : null,
              company_context: companyContext,
              request_type: requestType,
              requested_value: {
                device_type: deviceType,
                latitude,
                longitude,
                qr_token_present: Boolean(qrToken),
              },
              justification,
            },
          ])
          .select("id, status")
          .single();

      if (authorizationError) {
        throw authorizationError;
      }

      await supabase.from("horodateur_events").insert([
        {
          user_id: auth.user.id,
          event_type: "authorization_requested",
          company_context: companyContext,
          source_module: "timeclock_api",
          notes: justification,
          metadata: {
            authorization_request_id: authorizationRequest.id,
            device_type: deviceType,
            latitude,
            longitude,
          },
        },
      ]);

      return NextResponse.json({
        success: false,
        authorization_required: true,
        authorization_request: authorizationRequest,
      });
    }

    const { data: punchEvent, error: punchError } = await supabase
      .from("horodateur_events")
      .insert([
        {
          user_id: auth.user.id,
          event_type: "quart_debut",
          company_context: companyContext,
          source_module: "timeclock_api",
          notes: String(body.notes ?? "").trim() || null,
          metadata: {
            device_type: deviceType,
            latitude,
            longitude,
            qr_token_present: Boolean(qrToken),
            auto_start_enabled: chauffeurConfig?.auto_start_enabled ?? false,
          },
        },
      ])
      .select("id, event_type, occurred_at, company_context, metadata")
      .single();

    if (punchError) {
      throw punchError;
    }

    return NextResponse.json({
      success: true,
      punch_event: punchEvent,
      auto_start_enabled: chauffeurConfig?.auto_start_enabled ?? false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors du pointage d entree.",
      },
      { status: 500 }
    );
  }
}

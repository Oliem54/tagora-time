import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  isGpsStatus,
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
      latitude?: unknown;
      longitude?: unknown;
      speed_kmh?: unknown;
      gps_status?: unknown;
      activity_label?: unknown;
      sortie_id?: unknown;
      livraison_id?: unknown;
      horodateur_event_id?: unknown;
      intervention_label?: unknown;
      company_context?: unknown;
      metadata?: Record<string, unknown>;
    };

    const latitude = parseNumericCoordinate(body.latitude);
    const longitude = parseNumericCoordinate(body.longitude);
    const speedKmh = Number(body.speed_kmh ?? 0);
    const gpsStatus = isGpsStatus(body.gps_status) ? body.gps_status : "actif";
    const companyContext = resolveCompanyContext(auth.user, body.company_context);
    const chauffeurId = Number(auth.user.app_metadata?.chauffeur_id ?? auth.user.user_metadata?.chauffeur_id);

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "Les coordonnees GPS sont obligatoires." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("gps_positions")
      .insert([
        {
          user_id: auth.user.id,
          chauffeur_id: Number.isFinite(chauffeurId) ? chauffeurId : null,
          company_context: companyContext,
          company_directory_context:
            auth.user.app_metadata?.company_directory_context ??
            auth.user.user_metadata?.company_directory_context ??
            null,
          latitude,
          longitude,
          speed_kmh: Number.isFinite(speedKmh) ? speedKmh : 0,
          gps_status: gpsStatus,
          activity_label: String(body.activity_label ?? "").trim() || null,
          sortie_id: Number(body.sortie_id) || null,
          livraison_id: Number(body.livraison_id) || null,
          horodateur_event_id:
            typeof body.horodateur_event_id === "string"
              ? body.horodateur_event_id
              : null,
          intervention_label:
            String(body.intervention_label ?? "").trim() || null,
          metadata: body.metadata ?? {},
        },
      ])
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const uid = auth.user.id;
    console.info("[gps-positions]", "position_saved", {
      userIdPrefix: uid.length > 8 ? `${uid.slice(0, 8)}…` : uid,
      companyContext,
      lat: Math.round(latitude * 1e5) / 1e5,
      lng: Math.round(longitude * 1e5) / 1e5,
      positionId:
        data && typeof data === "object" && "id" in data
          ? String((data as { id?: unknown }).id ?? "")
          : null,
    });

    const { data: currentState } = await supabase
      .from("horodateur_current_state")
      .select("current_state, has_open_exception")
      .eq("employee_id", Number.isFinite(chauffeurId) ? chauffeurId : -1)
      .maybeSingle<{ current_state?: string | null; has_open_exception?: boolean | null }>();

    if (
      currentState?.has_open_exception === true &&
      (currentState.current_state === "en_quart" ||
        currentState.current_state === "en_pause" ||
        currentState.current_state === "en_diner")
    ) {
      console.info("[gps-positions]", "gps_position_saved_for_pending_shift", {
        userIdPrefix: uid.length > 8 ? `${uid.slice(0, 8)}…` : uid,
        state: currentState.current_state,
      });
    }

    return NextResponse.json({ success: true, position: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur enregistrement GPS.",
      },
      { status: 500 }
    );
  }
}

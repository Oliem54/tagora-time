import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  buildLatestGpsBaseStatus,
  normalizeGpsBase,
} from "@/app/lib/gps-base-detection";
import {
  buildPersistableGpsBaseEvents,
  shouldPersistGpsBaseEvent,
} from "@/app/lib/gps-base-events";
import {
  isGpsStatus,
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

    const [basesRes, previousPositionRes] = await Promise.all([
      supabase
        .from("gps_bases")
        .select("id, nom, latitude, longitude, rayon_m, company_context, type_base")
        .eq("company_context", companyContext),
      supabase
        .from("gps_positions")
        .select("id, user_id, chauffeur_id, company_context, latitude, longitude, recorded_at")
        .eq("user_id", auth.user.id)
        .neq("id", data.id)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const bases = (basesRes.data ?? [])
      .map((row) => normalizeGpsBase(row as Record<string, unknown>))
      .filter((row) => row != null);
    const previousPosition = previousPositionRes.data
      ? {
          id: String(previousPositionRes.data.id ?? ""),
          user_id:
            typeof previousPositionRes.data.user_id === "string"
              ? previousPositionRes.data.user_id
              : null,
          chauffeur_id:
            typeof previousPositionRes.data.chauffeur_id === "string" ||
            typeof previousPositionRes.data.chauffeur_id === "number"
              ? previousPositionRes.data.chauffeur_id
              : null,
          company_context:
            previousPositionRes.data.company_context === "oliem_solutions" ||
            previousPositionRes.data.company_context === "titan_produits_industriels"
              ? previousPositionRes.data.company_context
              : null,
          latitude: Number(previousPositionRes.data.latitude),
          longitude: Number(previousPositionRes.data.longitude),
          recorded_at:
            typeof previousPositionRes.data.recorded_at === "string"
              ? previousPositionRes.data.recorded_at
              : null,
        }
      : null;
    const currentPosition = {
      id: String(data.id ?? ""),
      user_id: typeof data.user_id === "string" ? data.user_id : null,
      chauffeur_id:
        typeof data.chauffeur_id === "string" || typeof data.chauffeur_id === "number"
          ? data.chauffeur_id
          : null,
      company_context:
        data.company_context === "oliem_solutions" ||
        data.company_context === "titan_produits_industriels"
          ? data.company_context
          : null,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      recorded_at: typeof data.recorded_at === "string" ? data.recorded_at : null,
    };
    const baseDetection = buildLatestGpsBaseStatus(
      previousPosition ? [previousPosition, currentPosition] : [currentPosition],
      bases
    );
    const baseEventCandidates = buildPersistableGpsBaseEvents({
      gpsPositionId: currentPosition.id,
      userId: currentPosition.user_id,
      chauffeurId: currentPosition.chauffeur_id,
      companyContext: currentPosition.company_context,
      latitude: currentPosition.latitude,
      longitude: currentPosition.longitude,
      status: baseDetection,
    });
    const persistedEvents =
      baseEventCandidates.length === 0
        ? []
        : (
            await Promise.all(
              baseEventCandidates.map(async (candidate) => {
                const { data: lastEvent, error: lastEventError } = await supabase
                  .from("gps_base_events")
                  .select("id, event_type, base_id, occurred_at")
                  .eq("user_id", auth.user.id)
                  .eq("base_id", candidate.base_id)
                  .eq("event_type", candidate.event_type)
                  .order("occurred_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (lastEventError) {
                  throw lastEventError;
                }

                return shouldPersistGpsBaseEvent(candidate, lastEvent) ? candidate : null;
              })
            )
          ).filter((candidate) => candidate != null);

    if (persistedEvents.length > 0) {
      const { error: baseEventsInsertError } = await supabase
        .from("gps_base_events")
        .upsert(persistedEvents, {
          onConflict: "gps_position_id,event_type,base_id",
          ignoreDuplicates: true,
        });

      if (baseEventsInsertError) {
        throw baseEventsInsertError;
      }
    }

    return NextResponse.json({
      success: true,
      position: data,
      base_detection: {
        state: baseDetection.state,
        current_base: baseDetection.current_base,
        previous_base: baseDetection.previous_base,
        latest_event: baseDetection.latest_event,
        events: baseDetection.timeline.flatMap((entry) => entry.events),
        persisted_events: persistedEvents,
      },
    });
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

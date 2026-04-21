import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  parseNumericCoordinate,
  requireAuthenticatedUser,
  resolveCompanyContext,
} from "@/app/lib/timeclock-api.server";
import { createEmployeePunch } from "@/app/lib/horodateur-v1/service";
import {
  eventOccurredAt,
  legacyErrorResponse,
  mapPunchResultToLegacyEvent,
  parseOptionalOccurredAt,
  toCanonicalEventFromLegacyZone,
  toLegacyZoneEvent,
} from "../_legacy-wrapper";

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
      notes?: unknown;
    };

    const eventType = body.event === "zone_exit" || body.event === "zone_entry" ? body.event : null;
    const latitude = parseNumericCoordinate(body.latitude);
    const longitude = parseNumericCoordinate(body.longitude);
    const occurredAt = parseOptionalOccurredAt(body.recorded_at) ?? new Date().toISOString();
    const companyContext = resolveCompanyContext(auth.user, body.company_context);
    const canonicalEventType = toCanonicalEventFromLegacyZone(eventType);

    if (!eventType || !canonicalEventType) {
      return NextResponse.json({ error: "Evenement de zone invalide." }, { status: 400 });
    }

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "Les coordonnees GPS sont obligatoires." },
        { status: 400 }
      );
    }

    const result = await createEmployeePunch({
      actorUserId: auth.user.id,
      eventType: canonicalEventType,
      occurredAt,
      note:
        typeof body.notes === "string" && body.notes.trim()
          ? body.notes.trim()
          : null,
      companyContext,
    });
    const punchEvent = mapPunchResultToLegacyEvent(result, {
      companyContext,
      metadata: {
        latitude,
        longitude,
      },
    });
    const zoneEvent = {
      ...punchEvent,
      event_type: toLegacyZoneEvent(result.event.event_type) ?? eventType,
      occurred_at: eventOccurredAt(result.event),
    };

    const message =
      eventType === "zone_entry"
        ? "Viens-tu travailler ?"
        : "As-tu fini de travailler ou pars-tu sur le terrain ?";

    const supabase = createAdminSupabaseClient();
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
      exception: result.exception,
      current_state: result.currentState,
      shift: result.shift,
    });
  } catch (error) {
    return legacyErrorResponse(error, "Erreur lors de l evenement de zone.");
  }
}

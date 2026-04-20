import { NextRequest, NextResponse } from "next/server";
import {
  parseNumericCoordinate,
  requireAuthenticatedUser,
  resolveCompanyContext,
} from "@/app/lib/timeclock-api.server";
import {
  createEmployeePunch,
  getEmployeeDashboardSnapshotByAuthUserId,
} from "@/app/lib/horodateur-v1/service";
import {
  legacyErrorResponse,
  mapPunchResultToLegacyEvent,
  normalizeLegacyNote,
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
      latitude?: unknown;
      longitude?: unknown;
      company_context?: unknown;
      notes?: unknown;
    };

    const latitude = parseNumericCoordinate(body.latitude);
    const longitude = parseNumericCoordinate(body.longitude);
    const companyContext = resolveCompanyContext(auth.user, body.company_context);
    const note = normalizeLegacyNote(body.notes);

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "Les coordonnees GPS sont obligatoires." },
        { status: 400 }
      );
    }

    const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);
    const currentState = snapshot.currentState?.current_state ?? "hors_quart";
    if (
      currentState !== "en_quart" &&
      currentState !== "en_pause" &&
      currentState !== "en_diner"
    ) {
      return NextResponse.json(
        { error: "Aucun quart actif a fermer." },
        { status: 409 }
      );
    }

    const result = await createEmployeePunch({
      actorUserId: auth.user.id,
      eventType: "punch_out",
      note,
      companyContext,
    });

    return NextResponse.json({
      success: true,
      punch_event: mapPunchResultToLegacyEvent(result, {
        companyContext,
        metadata: {
          latitude,
          longitude,
        },
      }),
      exception: result.exception,
      current_state: result.currentState,
      shift: result.shift,
    });
  } catch (error) {
    return legacyErrorResponse(error, "Erreur lors du pointage de sortie.");
  }
}

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
  mapLegacyAuthorizationFromException,
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
    const note = normalizeLegacyNote(body.notes);

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

    const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);
    const currentState = snapshot.currentState?.current_state ?? "hors_quart";
    if (
      currentState === "en_quart" ||
      currentState === "en_pause" ||
      currentState === "en_diner"
    ) {
      return NextResponse.json(
        { error: "Un quart semble deja ouvert pour cet utilisateur." },
        { status: 409 }
      );
    }

    const result = await createEmployeePunch({
      actorUserId: auth.user.id,
      eventType: "punch_in",
      note,
      companyContext,
    });

    if (result.exception) {
      return NextResponse.json({
        success: false,
        authorization_required: true,
        authorization_request: mapLegacyAuthorizationFromException(
          result.event,
          result.exception
        ),
        punch_event: mapPunchResultToLegacyEvent(result, {
          companyContext,
          metadata: {
            device_type: deviceType,
            latitude,
            longitude,
            qr_token_present: Boolean(qrToken),
          },
        }),
        exception: result.exception,
      });
    }

    return NextResponse.json({
      success: true,
      authorization_required: false,
      punch_event: mapPunchResultToLegacyEvent(result, {
        companyContext,
        metadata: {
          device_type: deviceType,
          latitude,
          longitude,
          qr_token_present: Boolean(qrToken),
          auto_start_enabled: false,
        },
      }),
      auto_start_enabled: false,
      current_state: result.currentState,
      shift: result.shift,
    });
  } catch (error) {
    return legacyErrorResponse(error, "Erreur lors du pointage d entree.");
  }
}

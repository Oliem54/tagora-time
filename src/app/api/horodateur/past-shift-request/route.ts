import { NextRequest, NextResponse } from "next/server";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  normalizeEventForApi,
  normalizeNonEmptyString,
  requireEmployeeHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import { evaluateEmployeeWebPunchGps } from "@/app/lib/horodateur-gps-punch.server";
import {
  createEmployeePastShiftRequest,
  getEmployeeDashboardSnapshotByAuthUserId,
} from "@/app/lib/horodateur-v1/service";
import { parseNumericCoordinate } from "@/app/lib/timeclock-api.shared";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireEmployeeHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json()) as {
      date?: unknown;
      startTime?: unknown;
      endTime?: unknown;
      breakMinutes?: unknown;
      note?: unknown;
      companyContext?: unknown;
      latitude?: unknown;
      longitude?: unknown;
    };

    const date = normalizeNonEmptyString(body.date);
    const startTime = normalizeNonEmptyString(body.startTime);
    const endTime = normalizeNonEmptyString(body.endTime);
    const note = normalizeNonEmptyString(body.note);

    if (!date || !startTime || !endTime) {
      return buildHorodateurValidationErrorResponse({
        error: "date, startTime et endTime sont obligatoires.",
        code: "past_shift_fields_required",
        route: "/api/horodateur/past-shift-request",
      });
    }

    if (!note) {
      return buildHorodateurValidationErrorResponse({
        error: "Une raison est obligatoire pour une demande d heures passées.",
        code: "past_shift_note_required",
        route: "/api/horodateur/past-shift-request",
      });
    }

    const breakMinutes =
      body.breakMinutes === undefined || body.breakMinutes === null
        ? 0
        : Number(body.breakMinutes);

    if (!Number.isFinite(breakMinutes) || breakMinutes < 0) {
      return buildHorodateurValidationErrorResponse({
        error: "breakMinutes invalide.",
        code: "invalid_break_minutes",
        route: "/api/horodateur/past-shift-request",
      });
    }

    const preSnapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);
    const punchCompany = preSnapshot.employee.primaryCompany;
    if (!punchCompany) {
      return buildHorodateurValidationErrorResponse({
        error: "Compagnie de travail introuvable pour cette demande.",
        code: "missing_company_context",
        route: "/api/horodateur/past-shift-request",
      });
    }

    const requestLatitude = parseNumericCoordinate(body.latitude);
    const requestLongitude = parseNumericCoordinate(body.longitude);
    const hasRequestGps =
      requestLatitude != null && requestLongitude != null;

    let webGps:
      | {
          latitude: number;
          longitude: number;
          zoneValidated: boolean;
          matchedBaseName: string | null;
        }
      | undefined;
    let gpsUnavailable = false;

    if (hasRequestGps) {
      const gpsEval = await evaluateEmployeeWebPunchGps({
        latitude: body.latitude,
        longitude: body.longitude,
        companyContext: punchCompany,
        punchGpsMode: "retroactive_request",
      });

      if (gpsEval.ok) {
        webGps = {
          latitude: gpsEval.latitude,
          longitude: gpsEval.longitude,
          zoneValidated: gpsEval.zoneValidated,
          matchedBaseName: gpsEval.matchedBaseName,
        };
      } else if (
        requestLatitude != null &&
        requestLongitude != null &&
        gpsEval.code === "GPS_NOT_CONFIGURED"
      ) {
        webGps = {
          latitude: requestLatitude,
          longitude: requestLongitude,
          zoneValidated: false,
          matchedBaseName: null,
        };
      } else {
        gpsUnavailable = true;
      }
    } else {
      gpsUnavailable = true;
    }

    const result = await createEmployeePastShiftRequest({
      actorUserId: auth.user.id,
      date,
      startTime,
      endTime,
      breakMinutes,
      note,
      companyContext: punchCompany,
      webGps,
      gpsUnavailable,
    });

    const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);

    return NextResponse.json({
      ok: true,
      success: true,
      workDate: result.workDate,
      shiftId: result.shift.id,
      createdEvents: result.createdEvents.map((item) => normalizeEventForApi(item)),
      exception: result.exception,
      employee: snapshot.employee,
      currentState: snapshot.currentState,
      shift: snapshot.todayShift,
      weeklyProjection: snapshot.weeklyProjection,
      pendingExceptions: snapshot.pendingExceptions,
      latenessContext: snapshot.latenessContext,
      gpsUnavailable,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/horodateur/past-shift-request",
    });
  }
}

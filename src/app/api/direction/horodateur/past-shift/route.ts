import { NextRequest, NextResponse } from "next/server";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  normalizeDirectionCompanyContext,
  normalizeEventForApi,
  normalizeNonEmptyString,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import {
  createDirectionPastShift,
  getWeeklyProjection,
} from "@/app/lib/horodateur-v1/service";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json()) as {
      employeeId?: unknown;
      date?: unknown;
      startTime?: unknown;
      endTime?: unknown;
      breakMinutes?: unknown;
      note?: unknown;
      companyContext?: unknown;
    };

    const employeeId = Number(body.employeeId);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return buildHorodateurValidationErrorResponse({
        error: "employeeId invalide.",
        code: "invalid_employee_id",
        route: "/api/direction/horodateur/past-shift",
      });
    }

    const date = normalizeNonEmptyString(body.date);
    const startTime = normalizeNonEmptyString(body.startTime);
    const endTime = normalizeNonEmptyString(body.endTime);
    const note = normalizeNonEmptyString(body.note);

    if (!date || !startTime || !endTime) {
      return buildHorodateurValidationErrorResponse({
        error: "date, startTime et endTime sont obligatoires.",
        code: "past_shift_fields_required",
        route: "/api/direction/horodateur/past-shift",
      });
    }

    if (!note) {
      return buildHorodateurValidationErrorResponse({
        error: "note est obligatoire pour une action direction.",
        code: "past_shift_note_required",
        route: "/api/direction/horodateur/past-shift",
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
        route: "/api/direction/horodateur/past-shift",
      });
    }

    const result = await createDirectionPastShift({
      actorUserId: auth.user.id,
      employeeId,
      date,
      startTime,
      endTime,
      breakMinutes,
      note,
      companyContext: normalizeDirectionCompanyContext(body.companyContext),
    });

    const weeklyProjection = await getWeeklyProjection(employeeId);

    return NextResponse.json({
      ok: true,
      success: true,
      workDate: result.workDate,
      shiftId: result.shift.id,
      shift: result.shift,
      createdEvents: result.createdEvents.map((item) => normalizeEventForApi(item)),
      weeklyProjection,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/past-shift",
    });
  }
}

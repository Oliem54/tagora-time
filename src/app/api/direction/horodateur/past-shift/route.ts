import { NextRequest, NextResponse } from "next/server";
import { createPastShiftForEmployee } from "@/app/lib/horodateur-v1/service";
import { getEventOccurredAt } from "@/app/lib/horodateur-v1/rules";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  normalizeDirectionCompanyContext,
  normalizeNonEmptyString,
  parseOptionalWorkDate,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";

function parseRequiredTimeHHMM(value: unknown, fieldLabel: string) {
  if (typeof value !== "string" || !value.trim()) {
    return {
      ok: false as const,
      error: `${fieldLabel} est obligatoire (format HH:MM).`,
      code: "missing_time",
    };
  }

  const normalized = value.trim();
  if (!/^\d{1,2}:\d{2}$/.test(normalized)) {
    return {
      ok: false as const,
      error: `${fieldLabel} invalide (format HH:MM attendu).`,
      code: "invalid_time",
    };
  }

  return {
    ok: true as const,
    value: normalized,
  };
}

function parseOptionalBreakMinutes(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: 0 };
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return {
      ok: false as const,
      error: "La pause doit etre un nombre de minutes positif ou zero.",
      code: "invalid_break_minutes",
    };
  }

  return {
    ok: true as const,
    value: Math.floor(numeric),
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json()) as {
      employeeId?: unknown;
      workDate?: unknown;
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

    const workDateValidation = parseOptionalWorkDate(body.workDate);
    if (!workDateValidation.ok) {
      return buildHorodateurValidationErrorResponse({
        error: workDateValidation.error,
        code: workDateValidation.code,
        route: "/api/direction/horodateur/past-shift",
      });
    }

    if (!workDateValidation.value) {
      return buildHorodateurValidationErrorResponse({
        error: "workDate est obligatoire (YYYY-MM-DD).",
        code: "missing_work_date",
        route: "/api/direction/horodateur/past-shift",
      });
    }

    const startTimeValidation = parseRequiredTimeHHMM(body.startTime, "startTime");
    if (!startTimeValidation.ok) {
      return buildHorodateurValidationErrorResponse({
        error: startTimeValidation.error,
        code: startTimeValidation.code,
        route: "/api/direction/horodateur/past-shift",
      });
    }

    const endTimeValidation = parseRequiredTimeHHMM(body.endTime, "endTime");
    if (!endTimeValidation.ok) {
      return buildHorodateurValidationErrorResponse({
        error: endTimeValidation.error,
        code: endTimeValidation.code,
        route: "/api/direction/horodateur/past-shift",
      });
    }

    const note = normalizeNonEmptyString(body.note);
    if (!note) {
      return buildHorodateurValidationErrorResponse({
        error: "note est obligatoire pour un quart passe.",
        code: "missing_note",
        route: "/api/direction/horodateur/past-shift",
      });
    }

    const breakMinutesValidation = parseOptionalBreakMinutes(body.breakMinutes);
    if (!breakMinutesValidation.ok) {
      return buildHorodateurValidationErrorResponse({
        error: breakMinutesValidation.error,
        code: breakMinutesValidation.code,
        route: "/api/direction/horodateur/past-shift",
      });
    }

    const result = await createPastShiftForEmployee({
      actorUserId: auth.user.id,
      employeeId,
      workDate: workDateValidation.value,
      startTime: startTimeValidation.value,
      endTime: endTimeValidation.value,
      breakMinutes: breakMinutesValidation.value,
      note,
      companyContext: normalizeDirectionCompanyContext(body.companyContext),
    });

    return NextResponse.json({
      success: true,
      ok: true,
      message: `Quart passe enregistre pour le ${workDateValidation.value}.`,
      workedMinutes: result.workedMinutes,
      payableMinutes: result.payableMinutes,
      shift: result.shift,
      events: result.events.map((event) => ({
        id: event.id,
        event_type: event.event_type,
        occurred_at: getEventOccurredAt(event),
        status: event.status,
      })),
      currentState: result.currentState,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/past-shift",
    });
  }
}

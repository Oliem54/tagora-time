import { NextRequest, NextResponse } from "next/server";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  normalizeDirectionCompanyContext,
  normalizeEventForApi,
  normalizeNonEmptyString,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import {
  buildStaffRetroOccurredAtIso,
  isStaffRetroForgottenEventType,
  validateStaffRetroCorrectionInput,
} from "@/app/lib/horodateur-retro-correction.shared";
import { createStaffRetroCorrectionRequest } from "@/app/lib/horodateur-v1/service";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const { role } = await getAuthenticatedRequestUser(req);
    const actorRole = role === "admin" ? "admin" : "direction";

    const body = (await req.json()) as {
      employeeId?: unknown;
      date?: unknown;
      eventType?: unknown;
      time?: unknown;
      reason?: unknown;
      companyContext?: unknown;
    };

    const employeeId = Number(body.employeeId);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return buildHorodateurValidationErrorResponse({
        error: "employeeId invalide.",
        code: "invalid_employee_id",
        route: "/api/direction/horodateur/retro-correction",
      });
    }

    const date = normalizeNonEmptyString(body.date);
    const time = normalizeNonEmptyString(body.time);
    const reason = normalizeNonEmptyString(body.reason);

    if (!date || !time) {
      return buildHorodateurValidationErrorResponse({
        error: "date et time sont obligatoires.",
        code: "retro_correction_fields_required",
        route: "/api/direction/horodateur/retro-correction",
      });
    }

    if (!reason) {
      return buildHorodateurValidationErrorResponse({
        error: "Une raison est obligatoire pour une correction rétroactive.",
        code: "retro_correction_reason_required",
        route: "/api/direction/horodateur/retro-correction",
      });
    }

    if (!isStaffRetroForgottenEventType(body.eventType)) {
      return buildHorodateurValidationErrorResponse({
        error: "Type d oubli invalide.",
        code: "invalid_retro_correction_event_type",
        route: "/api/direction/horodateur/retro-correction",
      });
    }

    const parsed = validateStaffRetroCorrectionInput({ date, time });
    if (!parsed.ok) {
      return buildHorodateurValidationErrorResponse({
        error: parsed.error,
        code: parsed.code,
        route: "/api/direction/horodateur/retro-correction",
      });
    }

    const occurredAt = buildStaffRetroOccurredAtIso(date, time);
    if (!occurredAt) {
      return buildHorodateurValidationErrorResponse({
        error: "Date ou heure invalides.",
        code: "invalid_retro_correction_times",
        route: "/api/direction/horodateur/retro-correction",
      });
    }

    const result = await createStaffRetroCorrectionRequest({
      actorUserId: auth.user.id,
      actorRole,
      employeeId,
      eventType: body.eventType,
      occurredAt,
      timeLabel: time,
      reason,
      companyContext: normalizeDirectionCompanyContext(body.companyContext),
    });

    return NextResponse.json({
      ok: true,
      success: true,
      event: normalizeEventForApi(result.event),
      exception: result.exception,
      shift: result.shift,
      currentState: result.currentState,
      pendingAdminApproval: true,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/retro-correction",
    });
  }
}

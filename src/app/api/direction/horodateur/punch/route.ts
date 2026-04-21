import { NextRequest, NextResponse } from "next/server";
import {
  createDirectionPunch,
  getWeeklyProjection,
} from "@/app/lib/horodateur-v1/service";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  isHorodateurEventType,
  isHorodateurPhase1ExceptionType,
  normalizeDirectionCompanyContext,
  normalizeEventForApi,
  normalizeNonEmptyString,
  parseOptionalIsoDateTime,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json()) as {
      employeeId?: unknown;
      eventType?: unknown;
      occurredAt?: unknown;
      note?: unknown;
      companyContext?: unknown;
      metadata?: Record<string, unknown>;
      relatedEventId?: unknown;
      forcedExceptionType?: unknown;
    };

    const employeeId = Number(body.employeeId);

    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return buildHorodateurValidationErrorResponse({
        error: "employeeId invalide.",
        code: "invalid_employee_id",
        route: "/api/direction/horodateur/punch",
      });
    }

    if (!isHorodateurEventType(body.eventType)) {
      return buildHorodateurValidationErrorResponse({
        error: "Type d evenement invalide.",
        code: "invalid_event_type",
        route: "/api/direction/horodateur/punch",
      });
    }

    const note = normalizeNonEmptyString(body.note);
    if (!note) {
      return buildHorodateurValidationErrorResponse({
        error: "note est obligatoire pour une action direction.",
        code: "missing_note",
        route: "/api/direction/horodateur/punch",
      });
    }

    const occurredAtValidation = parseOptionalIsoDateTime(body.occurredAt);
    if (!occurredAtValidation.ok) {
      return buildHorodateurValidationErrorResponse({
        error: occurredAtValidation.error,
        code: occurredAtValidation.code,
        route: "/api/direction/horodateur/punch",
      });
    }

    const result = await createDirectionPunch({
      actorUserId: auth.user.id,
      employeeId,
      eventType: body.eventType,
      occurredAt: occurredAtValidation.value,
      note,
      companyContext: normalizeDirectionCompanyContext(body.companyContext),
      relatedEventId: normalizeNonEmptyString(body.relatedEventId),
      forcedExceptionType: isHorodateurPhase1ExceptionType(body.forcedExceptionType)
        ? body.forcedExceptionType
        : null,
    });

    const weeklyProjection = await getWeeklyProjection(result.event.employee_id);

    return NextResponse.json({
      success: true,
      ...result,
      event: normalizeEventForApi(result.event),
      weeklyProjection,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/punch",
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  isHorodateurEventType,
  normalizeDirectionCompanyContext,
  normalizeEventForApi,
  normalizeNonEmptyString,
  parseOptionalIsoDateTime,
  requireEmployeeHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import {
  createEmployeePunch,
  getEmployeeDashboardSnapshotByAuthUserId,
} from "@/app/lib/horodateur-v1/service";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireEmployeeHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);

    return NextResponse.json({
      success: true,
      employee: snapshot.employee,
      currentState: snapshot.currentState,
      shift: snapshot.todayShift,
      weeklyProjection: snapshot.weeklyProjection,
      pendingExceptions: snapshot.pendingExceptions,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/horodateur/punch",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireEmployeeHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json()) as {
      eventType?: unknown;
      occurredAt?: unknown;
      note?: unknown;
      companyContext?: unknown;
      metadata?: unknown;
      relatedEventId?: unknown;
      retroactive?: unknown;
    };

    const normalizedEventType =
      body.retroactive === true && !body.eventType
        ? "retroactive_entry"
        : body.eventType;

    if (!isHorodateurEventType(normalizedEventType)) {
      return buildHorodateurValidationErrorResponse({
        error: "Type d evenement invalide.",
        code: "invalid_event_type",
        route: "/api/horodateur/punch",
      });
    }

    const occurredAtValidation = parseOptionalIsoDateTime(body.occurredAt);
    if (!occurredAtValidation.ok) {
      return buildHorodateurValidationErrorResponse({
        error: occurredAtValidation.error,
        code: occurredAtValidation.code,
        route: "/api/horodateur/punch",
      });
    }

    const result = await createEmployeePunch({
      actorUserId: auth.user.id,
      eventType: normalizedEventType,
      occurredAt: occurredAtValidation.value,
      note: normalizeNonEmptyString(body.note),
      companyContext: normalizeDirectionCompanyContext(body.companyContext),
      relatedEventId: normalizeNonEmptyString(body.relatedEventId),
    });

    const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);

    return NextResponse.json({
      success: true,
      insertedEvent: normalizeEventForApi(result.event),
      exception: result.exception,
      employee: snapshot.employee,
      currentState: snapshot.currentState,
      shift: snapshot.todayShift,
      weeklyProjection: snapshot.weeklyProjection,
      pendingExceptions: snapshot.pendingExceptions,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/horodateur/punch",
    });
  }
}

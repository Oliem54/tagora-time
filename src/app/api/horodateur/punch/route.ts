import { NextRequest, NextResponse } from "next/server";
import {
  buildHorodateurErrorResponse,
  isHorodateurPhase1EventType,
  requireEmployeeHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import {
  createEmployeePunch,
  getEmployeeDashboardSnapshotByAuthUserId,
} from "@/app/lib/horodateur-v1/service";

function normalizeCompanyContext(value: unknown) {
  return value === "oliem_solutions" || value === "titan_produits_industriels"
    ? value
    : null;
}

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
    return buildHorodateurErrorResponse(error);
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
    };

    if (!isHorodateurPhase1EventType(body.eventType)) {
      return NextResponse.json(
        { error: "Type d evenement invalide." },
        { status: 400 }
      );
    }

    const result = await createEmployeePunch({
      actorUserId: auth.user.id,
      eventType: body.eventType,
      occurredAt:
        typeof body.occurredAt === "string" && body.occurredAt.trim()
          ? body.occurredAt
          : undefined,
      note:
        typeof body.note === "string" && body.note.trim()
          ? body.note.trim()
          : null,
      companyContext: normalizeCompanyContext(body.companyContext),
      relatedEventId:
        typeof body.relatedEventId === "string" && body.relatedEventId.trim()
          ? body.relatedEventId
          : null,
    });

    const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);

    return NextResponse.json({
      success: true,
      insertedEvent: {
        id: result.event.id,
        employee_id: result.event.employee_id,
        event_type: result.event.event_type,
        occurredAt: result.event.event_time ?? result.event.created_at ?? null,
        status: result.event.status,
        notes: result.event.note,
        work_date: result.event.work_date,
        week_start_date: result.event.week_start_date,
        created_at: result.event.created_at,
      },
      exception: result.exception,
      employee: snapshot.employee,
      currentState: snapshot.currentState,
      shift: snapshot.todayShift,
      weeklyProjection: snapshot.weeklyProjection,
      pendingExceptions: snapshot.pendingExceptions,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  getWeeklyProjection,
  refuseHorodateurException,
} from "@/app/lib/horodateur-v1/service";
import { buildHorodateurErrorResponse, requireDirectionHorodateurAccess } from "@/app/api/horodateur/_shared";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const body = (await req.json()) as {
      reviewNote?: unknown;
    };

    const result = await refuseHorodateurException({
      actorUserId: auth.user.id,
      exceptionId: id,
      reviewNote: typeof body.reviewNote === "string" ? body.reviewNote : "",
    });

    const weeklyProjection = await getWeeklyProjection(result.exception.employee_id);

    return NextResponse.json({
      success: true,
      ...result,
      event: {
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
      weeklyProjection,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error);
  }
}

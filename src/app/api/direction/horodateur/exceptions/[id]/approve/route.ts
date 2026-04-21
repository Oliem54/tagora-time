import { NextRequest, NextResponse } from "next/server";
import {
  approveHorodateurException,
  getWeeklyProjection,
} from "@/app/lib/horodateur-v1/service";
import {
  buildHorodateurErrorResponse,
  normalizeEventForApi,
  normalizeNonEmptyString,
  parseOptionalApprovedMinutes,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";

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
    const body = (await req.json().catch(() => ({}))) as {
      reviewNote?: unknown;
      approvedMinutes?: unknown;
    };

    const approvedMinutesValidation = parseOptionalApprovedMinutes(body.approvedMinutes);
    if (!approvedMinutesValidation.ok) {
      return NextResponse.json(
        {
          success: false,
          ok: false,
          error: approvedMinutesValidation.error,
          code: approvedMinutesValidation.code,
          route: "/api/direction/horodateur/exceptions/[id]/approve",
        },
        { status: 400 }
      );
    }

    const result = await approveHorodateurException({
      actorUserId: auth.user.id,
      exceptionId: id,
      reviewNote: normalizeNonEmptyString(body.reviewNote),
      approvedMinutes: approvedMinutesValidation.value,
    });

    const weeklyProjection = await getWeeklyProjection(result.exception.employee_id);

    return NextResponse.json({
      success: true,
      ...result,
      event: normalizeEventForApi(result.event),
      weeklyProjection,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/exceptions/[id]/approve",
    });
  }
}

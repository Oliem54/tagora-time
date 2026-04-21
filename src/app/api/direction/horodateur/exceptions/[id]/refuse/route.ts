import { NextRequest, NextResponse } from "next/server";
import {
  getWeeklyProjection,
  refuseHorodateurException,
} from "@/app/lib/horodateur-v1/service";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  normalizeEventForApi,
  normalizeNonEmptyString,
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
    };
    const reviewNote = normalizeNonEmptyString(body.reviewNote);
    if (!reviewNote) {
      return buildHorodateurValidationErrorResponse({
        error: "reviewNote est obligatoire pour un refus.",
        code: "missing_review_note",
        route: "/api/direction/horodateur/exceptions/[id]/refuse",
      });
    }

    const result = await refuseHorodateurException({
      actorUserId: auth.user.id,
      exceptionId: id,
      reviewNote,
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
      route: "/api/direction/horodateur/exceptions/[id]/refuse",
    });
  }
}

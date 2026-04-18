import { NextRequest, NextResponse } from "next/server";
import { listPendingExceptionsForDirection } from "@/app/lib/horodateur-v1/service";
import { buildHorodateurErrorResponse, requireDirectionHorodateurAccess } from "@/app/api/horodateur/_shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const exceptions = await listPendingExceptionsForDirection();

    return NextResponse.json({
      success: true,
      exceptions,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { listDirectionLiveBoard } from "@/app/lib/horodateur-v1/service";
import { buildHorodateurErrorResponse, requireDirectionHorodateurAccess } from "@/app/api/horodateur/_shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const board = await listDirectionLiveBoard();

    return NextResponse.json({
      success: true,
      board,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error);
  }
}

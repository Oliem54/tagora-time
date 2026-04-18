import { NextRequest, NextResponse } from "next/server";
import { refuseHorodateurException } from "@/app/lib/horodateur-v1/service";
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

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return buildHorodateurErrorResponse(error);
  }
}

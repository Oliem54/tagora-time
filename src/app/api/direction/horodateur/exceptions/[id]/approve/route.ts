import { NextRequest, NextResponse } from "next/server";
import { approveHorodateurException } from "@/app/lib/horodateur-v1/service";
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
      approvedMinutes?: unknown;
    };

    const approvedMinutes =
      typeof body.approvedMinutes === "number"
        ? body.approvedMinutes
        : typeof body.approvedMinutes === "string" && body.approvedMinutes.trim()
          ? Number(body.approvedMinutes)
          : null;

    const result = await approveHorodateurException({
      actorUserId: auth.user.id,
      exceptionId: id,
      reviewNote: typeof body.reviewNote === "string" ? body.reviewNote : null,
      approvedMinutes:
        approvedMinutes != null && Number.isFinite(approvedMinutes)
          ? approvedMinutes
          : null,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return buildHorodateurErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  requireEmployeeHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import { createForgottenArrivalAdjustment } from "@/app/lib/horodateur-v1/service";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireEmployeeHorodateurAccess(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json().catch(() => null)) as
      | { workDate?: unknown; time?: unknown; reason?: unknown }
      | null;
    const workDate = typeof body?.workDate === "string" ? body.workDate.trim() : "";
    const time = typeof body?.time === "string" ? body.time.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !/^\d{1,2}:\d{2}$/.test(time)) {
      return buildHorodateurValidationErrorResponse({
        error: "Indiquez la date réelle (AAAA-MM-JJ) et l'heure réelle (HH:MM).",
        code: "forgotten_arrival_invalid_input",
        route: "/api/horodateur/forgotten-arrival",
      });
    }

    const result = await createForgottenArrivalAdjustment({
      actorUserId: auth.user.id,
      workDate,
      timeLabel: time,
      reason,
    });

    return NextResponse.json({
      success: true,
      approvalRequired: true,
      status: "en_attente",
      alreadySubmitted: result.alreadySubmitted,
      summary: result.summary,
      audit: result.audit,
      exceptionId: result.exception?.id ?? null,
      adjustmentEventId: result.event.id,
      initialEventId: result.audit.initialEventId,
      createdSecondPunchIn: false,
      shiftRemainsOpen: result.audit.shiftRemainsOpen,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/horodateur/forgotten-arrival",
    });
  }
}

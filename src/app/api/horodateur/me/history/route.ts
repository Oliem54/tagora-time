import { NextRequest, NextResponse } from "next/server";
import { getEmployeeHistoryByAuthUserId } from "@/app/lib/horodateur-v1/service";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  parseOptionalWorkDate,
  requireEmployeeHorodateurAccess,
} from "../../_shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireEmployeeHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const workDateInput = req.nextUrl.searchParams.get("workDate");
    const parsedWorkDate = parseOptionalWorkDate(workDateInput);
    if (!parsedWorkDate.ok) {
      return buildHorodateurValidationErrorResponse({
        error: parsedWorkDate.error,
        code: parsedWorkDate.code,
        route: "/api/horodateur/me/history",
      });
    }

    const history = await getEmployeeHistoryByAuthUserId({
      authUserId: auth.user.id,
      workDate: parsedWorkDate.value,
    });

    return NextResponse.json({
      success: true,
      employee: history.employee,
      workDate: history.workDate,
      shift: history.shift,
      events: Array.isArray(history.events)
        ? history.events.map((event) => ({
            ...event,
            notes: event.notes ?? event.note ?? null,
            note: event.note ?? event.notes ?? null,
          }))
        : [],
      exceptions: history.exceptions,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/horodateur/me/history",
    });
  }
}

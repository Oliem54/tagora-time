import { NextRequest, NextResponse } from "next/server";
import { getEmployeeHistoryByAuthUserId } from "@/app/lib/horodateur-v1/service";
import { buildHorodateurErrorResponse, requireEmployeeHorodateurAccess } from "../../_shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireEmployeeHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const workDate = req.nextUrl.searchParams.get("workDate") ?? undefined;
    const history = await getEmployeeHistoryByAuthUserId({
      authUserId: auth.user.id,
      workDate,
    });

    return NextResponse.json({
      success: true,
      employee: history.employee,
      workDate: history.workDate,
      shift: history.shift,
      events: history.events,
      exceptions: history.exceptions,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  buildLocalPunchQaPayload,
  HORORA_LOCAL_PUNCH_QA_COOKIE,
  localPunchQaStateFromRequest,
} from "@/app/lib/horodateur-v1/local-punch-qa-fixture.shared";
import { getEmployeeHistoryByAuthUserId } from "@/app/lib/horodateur-v1/service";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  parseOptionalWorkDate,
  requireEmployeeHorodateurAccess,
} from "../../_shared";

export async function GET(req: NextRequest) {
  try {
    const localQa = localPunchQaStateFromRequest({
      hostname: req.nextUrl.hostname,
      cookie: req.cookies.get(HORORA_LOCAL_PUNCH_QA_COOKIE)?.value,
    });
    if (localQa) {
      return NextResponse.json(buildLocalPunchQaPayload(localQa, Date.now()).history);
    }

    const auth = await requireEmployeeHorodateurAccess(req, "view_own_hours");

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
            notes: event.notes ?? null,
            note: event.notes ?? null,
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

import { NextRequest, NextResponse } from "next/server";
import { formatIsoDateLocal } from "@/app/api/direction/effectifs/_lib";
import {
  getActiveLeaveForEmployeeOnDate,
  toLongLeavePublicBanner,
} from "@/app/lib/employee-leave-period.server";
import {
  buildLocalPunchQaPayload,
  HORORA_LOCAL_PUNCH_QA_COOKIE,
  localPunchQaStateFromRequest,
} from "@/app/lib/horodateur-v1/local-punch-qa-fixture.shared";
import { getEmployeeDashboardSnapshotByAuthUserId } from "@/app/lib/horodateur-v1/service";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { buildHorodateurErrorResponse, requireEmployeeHorodateurAccess } from "../_shared";

export async function GET(req: NextRequest) {
  try {
    const localQa = localPunchQaStateFromRequest({
      hostname: req.nextUrl.hostname,
      cookie: req.cookies.get(HORORA_LOCAL_PUNCH_QA_COOKIE)?.value,
    });
    if (localQa) {
      return NextResponse.json(buildLocalPunchQaPayload(localQa, Date.now()).me);
    }

    const auth = await requireEmployeeHorodateurAccess(req, "view_own_hours");

    if (!auth.ok) {
      return auth.response;
    }

    const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);
    const eid = snapshot.employee?.employeeId;
    let longLeave: ReturnType<typeof toLongLeavePublicBanner> | null = null;
    if (typeof eid === "number" && Number.isFinite(eid)) {
      const supabase = createAdminSupabaseClient();
      const row = await getActiveLeaveForEmployeeOnDate(
        supabase,
        eid,
        formatIsoDateLocal(new Date())
      );
      longLeave = row ? toLongLeavePublicBanner(row) : null;
    }

    return NextResponse.json({
      success: true,
      snapshot,
      employee: snapshot.employee,
      currentState: snapshot.currentState,
      shift: snapshot.todayShift,
      weeklyProjection: snapshot.weeklyProjection,
      pendingExceptions: snapshot.pendingExceptions,
      latenessContext: snapshot.latenessContext,
      longLeave,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/horodateur/me",
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { formatIsoDateLocal } from "@/app/api/direction/effectifs/_lib";
import {
  getActiveLeaveForEmployeeOnDate,
  toLongLeavePublicBanner,
} from "@/app/lib/employee-leave-period.server";
import { getEmployeeDashboardSnapshotByAuthUserId } from "@/app/lib/horodateur-v1/service";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { buildHorodateurErrorResponse, requireEmployeeHorodateurAccess } from "../_shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireEmployeeHorodateurAccess(req);

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
      longLeave,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/horodateur/me",
    });
  }
}

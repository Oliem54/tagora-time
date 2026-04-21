import { NextRequest, NextResponse } from "next/server";
import { getEmployeeDashboardSnapshotByAuthUserId } from "@/app/lib/horodateur-v1/service";
import { buildHorodateurErrorResponse, requireEmployeeHorodateurAccess } from "../_shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireEmployeeHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);

    return NextResponse.json({
      success: true,
      snapshot,
      employee: snapshot.employee,
      currentState: snapshot.currentState,
      shift: snapshot.todayShift,
      weeklyProjection: snapshot.weeklyProjection,
      pendingExceptions: snapshot.pendingExceptions,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/horodateur/me",
    });
  }
}

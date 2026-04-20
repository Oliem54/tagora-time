import { NextRequest, NextResponse } from "next/server";
import { listDirectionLiveBoard } from "@/app/lib/horodateur-v1/service";
import {
  buildHorodateurErrorResponse,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import { devInfo, logError } from "@/app/lib/logger";

const STATUS_ORDER: Record<string, number> = {
  en_pause: 0,
  en_diner: 1,
  en_quart: 2,
  en_anomalie: 3,
  hors_quart: 4,
  termine: 5,
};

function toNumberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapLiveBoardRow(item: Record<string, unknown>) {
  const currentState =
    typeof item.currentState === "string" && item.currentState.trim()
      ? item.currentState
      : "hors_quart";
  const hasOpenException = Boolean(item.hasOpenException);
  const weeklyTargetMinutes = toNumberOrZero(item.weeklyTargetMinutes);
  const weeklyProgressMinutes = toNumberOrZero(item.weeklyProgressMinutes);
  const minutesWorkedToday = toNumberOrZero(item.workedMinutes);
  const minutesPauseToday = toNumberOrZero(item.pauseMinutes);
  const employeeId = Number(item.employeeId);

  return {
    ...item,
    employeeId: Number.isFinite(employeeId) ? employeeId : null,
    employee_id: Number.isFinite(employeeId) ? employeeId : null,
    status: currentState,
    currentState,
    currentEventType:
      typeof item.lastEventType === "string" && item.lastEventType.trim()
        ? item.lastEventType
        : null,
    startedAt:
      typeof item.shiftStartAt === "string" && item.shiftStartAt.trim()
        ? item.shiftStartAt
        : null,
    minutesWorkedToday,
    minutesPauseToday,
    weeklyProgressMinutes,
    weeklyTargetMinutes,
    activeExceptionCount: hasOpenException ? 1 : 0,
    alertFlags: {
      hasOpenException,
      weeklyOvertime:
        weeklyTargetMinutes > 0 && weeklyProgressMinutes > weeklyTargetMinutes,
      missingSchedule: !item.scheduledStart || !item.scheduledEnd,
    },
    phone:
      typeof item.phoneNumber === "string" && item.phoneNumber.trim()
        ? item.phoneNumber
        : null,
    phoneNumber:
      typeof item.phoneNumber === "string" && item.phoneNumber.trim()
        ? item.phoneNumber
        : null,
    email:
      typeof item.email === "string" && item.email.trim() ? item.email : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    devInfo("horodateur-live", "start auth check", {
      route: "/api/direction/horodateur/live",
      method: req.method,
    });

    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    devInfo("horodateur-live", "start board load", {
      route: "/api/direction/horodateur/live",
      userId: auth.user.id,
    });

    const board = await listDirectionLiveBoard();
    const normalizedBoard = Array.isArray(board)
      ? board
          .map((item) => mapLiveBoardRow(item as Record<string, unknown>))
          .sort((a, b) => {
            if (a.alertFlags.hasOpenException !== b.alertFlags.hasOpenException) {
              return a.alertFlags.hasOpenException ? -1 : 1;
            }
            const orderA = STATUS_ORDER[a.currentState] ?? 99;
            const orderB = STATUS_ORDER[b.currentState] ?? 99;
            if (orderA !== orderB) {
              return orderA - orderB;
            }
            const nameA = typeof a.employeeName === "string" ? a.employeeName : "";
            const nameB = typeof b.employeeName === "string" ? b.employeeName : "";
            return nameA.localeCompare(nameB, "fr-CA");
          })
      : [];

    const groupedCounts = normalizedBoard.reduce<Record<string, number>>((acc, row) => {
      acc[row.currentState] = (acc[row.currentState] ?? 0) + 1;
      return acc;
    }, {});

    devInfo("horodateur-live", "success response", {
      route: "/api/direction/horodateur/live",
      boardCount: normalizedBoard.length,
    });

    return NextResponse.json({
      success: true,
      board: normalizedBoard,
      grouped: groupedCounts,
      ...(process.env.NODE_ENV !== "production"
        ? {
            debug: auth.debug,
          }
        : {}),
    });
  } catch (error) {
    logError("horodateur-live", "route failure", {
      route: "/api/direction/horodateur/live",
      raw: error,
    });

    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/live",
    });
  }
}

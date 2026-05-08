import { NextRequest, NextResponse } from "next/server";
import { isHorodateurInternalJobAuthorized } from "@/app/lib/internal-horodateur-cron-auth";
import {
  processExpectedPunchSmsNotifications,
  processLateEmployeeNotifications,
} from "@/app/lib/horodateur-v1/service";

async function run(req: NextRequest) {
  if (!isHorodateurInternalJobAuthorized(req)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 401 });
  }

  const [lateness, expectedPunchSms] = await Promise.all([
    processLateEmployeeNotifications(),
    processExpectedPunchSmsNotifications(),
  ]);
  return NextResponse.json({
    success: true,
    lateness,
    expectedPunchSms,
  });
}

/** Vercel Cron invoque en GET. */
export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

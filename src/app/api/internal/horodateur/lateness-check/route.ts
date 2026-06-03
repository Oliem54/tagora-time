import { NextRequest, NextResponse } from "next/server";
import { isHorodateurInternalJobAuthorized } from "@/app/lib/internal-horodateur-cron-auth";
import {
  processExpectedPunchSmsNotifications,
  processLateEmployeeNotifications,
  processMissingExpectedPunchEscalation,
} from "@/app/lib/horodateur-v1/service";

async function run(req: NextRequest) {
  if (!isHorodateurInternalJobAuthorized(req)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 401 });
  }

  // Expected punch d'abord : journalise dans sms_alerts_log avant le check retard
  // (évite un double SMS employé quart_debut le même jour).
  const expectedPunchSms = await processExpectedPunchSmsNotifications();
  const missingExpectedPunch = await processMissingExpectedPunchEscalation();
  const lateness = await processLateEmployeeNotifications();
  return NextResponse.json({
    success: true,
    lateness,
    expectedPunchSms,
    missingExpectedPunch,
  });
}

/** Vercel Cron invoque en GET. */
export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

import { NextRequest, NextResponse } from "next/server";
import { isHorodateurInternalJobAuthorized } from "@/app/lib/internal-horodateur-cron-auth";
import { processLateEmployeeNotifications } from "@/app/lib/horodateur-v1/service";

async function run(req: NextRequest) {
  if (!isHorodateurInternalJobAuthorized(req)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 401 });
  }

  const result = await processLateEmployeeNotifications();
  return NextResponse.json({ success: true, ...result });
}

/** Vercel Cron invoque en GET. */
export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

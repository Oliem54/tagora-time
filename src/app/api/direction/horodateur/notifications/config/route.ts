import { NextRequest, NextResponse } from "next/server";
import {
  getHorodateurDirectionAlertConfig,
  saveHorodateurDirectionAlertConfig,
} from "@/app/lib/horodateur-v1/service";
import {
  buildHorodateurErrorResponse,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const config = await getHorodateurDirectionAlertConfig();
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/notifications/config",
    });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json().catch(() => ({}))) as {
      emailEnabled?: boolean;
      smsEnabled?: boolean;
      reminderDelayMinutes?: number;
      directionEmails?: string[];
      directionSmsNumbers?: string[];
    };

    const config = await saveHorodateurDirectionAlertConfig({
      emailEnabled: body.emailEnabled !== false,
      smsEnabled: body.smsEnabled !== false,
      reminderDelayMinutes:
        typeof body.reminderDelayMinutes === "number" ? body.reminderDelayMinutes : 60,
      directionEmails: Array.isArray(body.directionEmails) ? body.directionEmails : [],
      directionSmsNumbers: Array.isArray(body.directionSmsNumbers)
        ? body.directionSmsNumbers
        : [],
    });

    return NextResponse.json({ success: true, config });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/notifications/config",
    });
  }
}

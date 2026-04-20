import { NextRequest, NextResponse } from "next/server";
import {
  listPendingExceptionsForDirection,
  processPendingExceptionReminders,
} from "@/app/lib/horodateur-v1/service";
import {
  buildHorodateurErrorResponse,
  normalizeEventForApi,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    await processPendingExceptionReminders();
    const exceptions = await listPendingExceptionsForDirection();

    return NextResponse.json({
      success: true,
      exceptions: Array.isArray(exceptions)
        ? exceptions.map((item) => ({
            ...item,
            direction_email_notified_at: item.direction_email_notified_at ?? null,
            direction_sms_notified_at: item.direction_sms_notified_at ?? null,
            direction_reminder_email_notified_at:
              item.direction_reminder_email_notified_at ?? null,
            direction_reminder_sms_notified_at:
              item.direction_reminder_sms_notified_at ?? null,
            event: normalizeEventForApi(
              item.event
                ? {
                    ...item.event,
                    occurred_at: item.event.occurredAt,
                    note: item.event.notes,
                    work_date: null,
                    week_start_date: null,
                  }
                : null
            ),
          }))
        : [],
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/direction/horodateur/exceptions",
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  listPendingExceptionsForDirection,
  processPendingExceptionReminders,
} from "@/app/lib/horodateur-v1/service";
import { buildHorodateurErrorResponse, requireDirectionHorodateurAccess } from "@/app/api/horodateur/_shared";

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
            event: item.event
              ? {
                  id: item.event.id,
                  employee_id: item.event.employee_id,
                  event_type: item.event.event_type,
                  occurredAt: item.event.occurredAt,
                  status: item.event.status,
                  notes: item.event.notes,
                }
              : null,
          }))
        : [],
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error);
  }
}

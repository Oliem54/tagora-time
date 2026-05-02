import { NextRequest, NextResponse } from "next/server";
import {
  buildHorodateurErrorResponse,
  requireDirectionHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import { getDirectionAlertConfig } from "@/app/lib/horodateur-v1/repository";
import { saveHorodateurDirectionAlertConfig } from "@/app/lib/horodateur-v1/service";
import type { HorodateurDirectionAlertConfigRecord } from "@/app/lib/horodateur-v1/types";

const ROUTE = "/api/direction/horodateur/notifications/config";

const MISSING_INFRASTRUCTURE_MESSAGE =
  "Configuration des notifications à compléter";

const MISSING_INFRASTRUCTURE_CODE = "horodateur_notification_config_unavailable";

/** Réponse tableau de bord (alignée sur AlertConfig client + métadonnées). */
export type HorodateurNotificationConfigApiPayload = Pick<
  HorodateurDirectionAlertConfigRecord,
  | "email_enabled"
  | "sms_enabled"
  | "reminder_delay_minutes"
  | "direction_emails"
  | "direction_sms_numbers"
> & {
  configured: boolean;
  timezone: string;
};

function normalizeStringList(values: string[] | null | undefined): string[] {
  return Array.from(
    new Set((values ?? []).map((item) => String(item ?? "").trim()).filter(Boolean))
  );
}

function defaultNotificationConfigPayload(): HorodateurNotificationConfigApiPayload {
  return {
    email_enabled: false,
    sms_enabled: false,
    reminder_delay_minutes: 60,
    direction_emails: [],
    direction_sms_numbers: [],
    configured: false,
    timezone: "America/Toronto",
  };
}

function toApiPayloadFromRow(
  row: HorodateurDirectionAlertConfigRecord
): HorodateurNotificationConfigApiPayload {
  return {
    email_enabled: row.email_enabled !== false,
    sms_enabled: row.sms_enabled !== false,
    reminder_delay_minutes: Math.max(
      5,
      Math.floor(Number(row.reminder_delay_minutes) || 60)
    ),
    direction_emails: normalizeStringList(row.direction_emails),
    direction_sms_numbers: normalizeStringList(row.direction_sms_numbers),
    configured: true,
    timezone: "America/Toronto",
  };
}

function logNotificationConfigCaughtError(options: {
  phase: string;
  error: unknown;
}) {
  const rec =
    options.error &&
    typeof options.error === "object" &&
    !Array.isArray(options.error)
      ? (options.error as Record<string, unknown>)
      : null;
  const asError = options.error instanceof Error ? options.error : null;

  const message =
    (typeof rec?.message === "string" && rec.message.trim()
      ? rec.message
      : null) ??
    asError?.message ??
    (options.error !== undefined ? String(options.error) : "");

  console.error("[horodateur-notification-config]", options.phase, ROUTE, {
    message,
    code: typeof rec?.code === "string" ? rec.code : null,
    details: typeof rec?.details === "string" ? rec.details : null,
    hint: typeof rec?.hint === "string" ? rec.hint : null,
    stack: typeof asError?.stack === "string" ? asError.stack : null,
  });
}

function isMissingInfrastructureError(error: unknown): boolean {
  const rec =
    error && typeof error === "object" && !Array.isArray(error)
      ? (error as Record<string, unknown>)
      : null;
  const code = String(rec?.code ?? "").toLowerCase();
  const blob = [rec?.message, rec?.details, rec?.hint]
    .filter((part) => typeof part === "string")
    .join(" ")
    .toLowerCase();

  if (!blob.includes("horodateur_direction_alert_config")) {
    return false;
  }

  if (
    blob.includes("does not exist") ||
    blob.includes("n'existe pas") ||
    blob.includes("could not find") ||
    blob.includes("not found")
  ) {
    return true;
  }

  if (code === "42p01" || code === "pgrst205" || code === "pgrst301") {
    return true;
  }

  return false;
}

function infrastructureErrorResponseJson() {
  return {
    success: false as const,
    ok: false as const,
    error: MISSING_INFRASTRUCTURE_MESSAGE,
    code: MISSING_INFRASTRUCTURE_CODE,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    try {
      const row = await getDirectionAlertConfig();
      const config = row ? toApiPayloadFromRow(row) : defaultNotificationConfigPayload();
      return NextResponse.json({ success: true, config });
    } catch (dbError) {
      logNotificationConfigCaughtError({ phase: "GET.load", error: dbError });

      if (isMissingInfrastructureError(dbError)) {
        return NextResponse.json(infrastructureErrorResponseJson(), {
          status: 503,
        });
      }

      throw dbError;
    }
  } catch (error) {
    logNotificationConfigCaughtError({ phase: "GET.fatal", error });

    return buildHorodateurErrorResponse(error, {
      route: ROUTE,
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

    const rowInput = {
      email_enabled: body.emailEnabled !== false,
      sms_enabled: body.smsEnabled !== false,
      reminder_delay_minutes:
        typeof body.reminderDelayMinutes === "number" ? body.reminderDelayMinutes : 60,
      directionEmails: Array.isArray(body.directionEmails) ? body.directionEmails : [],
      directionSmsNumbers: Array.isArray(body.directionSmsNumbers)
        ? body.directionSmsNumbers
        : [],
    };

    try {
      const persisted = await saveHorodateurDirectionAlertConfig({
        emailEnabled: rowInput.email_enabled,
        smsEnabled: rowInput.sms_enabled,
        reminderDelayMinutes: rowInput.reminder_delay_minutes,
        directionEmails: rowInput.directionEmails,
        directionSmsNumbers: rowInput.directionSmsNumbers,
      });

      const config = toApiPayloadFromRow(persisted);
      return NextResponse.json({ success: true, config });
    } catch (persistError) {
      logNotificationConfigCaughtError({
        phase: "PUT.persist",
        error: persistError,
      });

      if (isMissingInfrastructureError(persistError)) {
        return NextResponse.json(infrastructureErrorResponseJson(), {
          status: 503,
        });
      }

      throw persistError;
    }
  } catch (error) {
    logNotificationConfigCaughtError({ phase: "PUT.fatal", error });

    return buildHorodateurErrorResponse(error, {
      route: ROUTE,
    });
  }
}

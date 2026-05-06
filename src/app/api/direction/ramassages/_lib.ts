import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedRequestUser,
  getRequestAccessToken,
} from "@/app/lib/account-requests.server";
import { isJwtExplicitlyAal1Only } from "@/app/lib/auth/jwt-access-token";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export type RamassageAlertConfig = {
  pickupReminderEnabled: boolean;
  pickupReminderAlert1DelayHours: number;
  pickupReminderAlert2DelayHours: number;
  pickupReminderRecurringDelayHours: number;
  pickupReminderNotifyDirectionAdminEmail: boolean;
  pickupReminderNotifyClientEmail: boolean;
  pickupReminderNotifyClientSms: boolean;
};

export async function requireDirectionOrAdmin(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentification requise." }, { status: 401 }),
    };
  }
  if (role !== "direction" && role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Acces reserve a la direction/admin." }, { status: 403 }),
    };
  }
  const token = getRequestAccessToken(req).token;
  if (isJwtExplicitlyAal1Only(token)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "Vérification en deux étapes requise. Complétez le MFA puis réessayez.",
          code: "MFA_AAL2_REQUIRED",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, user, role, supabase: createAdminSupabaseClient() };
}

export async function requireAdmin(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentification requise." }, { status: 401 }),
    };
  }
  if (role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Acces reserve aux admins." }, { status: 403 }),
    };
  }
  const token = getRequestAccessToken(req).token;
  if (isJwtExplicitlyAal1Only(token)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "Vérification en deux étapes requise. Complétez le MFA puis réessayez.",
          code: "MFA_AAL2_REQUIRED",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, user, role, supabase: createAdminSupabaseClient() };
}

export async function getRamassageAlertConfig(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<RamassageAlertConfig> {
  const { data } = await supabase
    .from("direction_ramassage_alert_config")
    .select(
      [
        "pickup_reminder_enabled",
        "pickup_reminder_alert_1_delay_hours",
        "pickup_reminder_alert_2_delay_hours",
        "pickup_reminder_recurring_delay_hours",
        "pickup_reminder_notify_direction_admin_email",
        "pickup_reminder_notify_client_email",
        "pickup_reminder_notify_client_sms",
      ].join(",")
    )
    .eq("config_key", "default")
    .maybeSingle();

  return {
    pickupReminderEnabled:
      (data as { pickup_reminder_enabled?: boolean } | null)?.pickup_reminder_enabled !== false,
    pickupReminderAlert1DelayHours: Math.max(
      1,
      Number(
        (data as { pickup_reminder_alert_1_delay_hours?: number } | null)
          ?.pickup_reminder_alert_1_delay_hours ?? 48
      )
    ),
    pickupReminderAlert2DelayHours: Math.max(
      1,
      Number(
        (data as { pickup_reminder_alert_2_delay_hours?: number } | null)
          ?.pickup_reminder_alert_2_delay_hours ?? 36
      )
    ),
    pickupReminderRecurringDelayHours: Math.max(
      1,
      Number(
        (data as { pickup_reminder_recurring_delay_hours?: number } | null)
          ?.pickup_reminder_recurring_delay_hours ?? 36
      )
    ),
    pickupReminderNotifyDirectionAdminEmail:
      (data as { pickup_reminder_notify_direction_admin_email?: boolean } | null)
        ?.pickup_reminder_notify_direction_admin_email !== false,
    pickupReminderNotifyClientEmail:
      (data as { pickup_reminder_notify_client_email?: boolean } | null)
        ?.pickup_reminder_notify_client_email !== false,
    pickupReminderNotifyClientSms:
      (data as { pickup_reminder_notify_client_sms?: boolean } | null)
        ?.pickup_reminder_notify_client_sms !== false,
  };
}

export function dayDiff(todayIso: string, expectedDateIso: string) {
  const a = new Date(`${todayIso}T00:00:00`);
  const b = new Date(`${expectedDateIso}T00:00:00`);
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function parseClientContact(row: Record<string, unknown>) {
  const email =
    (typeof row.courriel_client === "string" && row.courriel_client) ||
    (typeof row.email_client === "string" && row.email_client) ||
    (typeof row.courriel === "string" && row.courriel) ||
    "";
  const phone =
    (typeof row.telephone_client === "string" && row.telephone_client) ||
    (typeof row.telephone === "string" && row.telephone) ||
    "";
  return {
    email: email.trim(),
    phone: phone.trim(),
  };
}

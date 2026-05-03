import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedRequestUser,
  getRequestAccessToken,
} from "@/app/lib/account-requests.server";
import { isJwtExplicitlyAal1Only } from "@/app/lib/auth/jwt-access-token";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export type RamassageAlertConfig = {
  delayDays: number;
  warningDays: number;
  emailEnabled: boolean;
  smsEnabled: boolean;
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
    .select("delay_days, warning_days, email_enabled, sms_enabled")
    .eq("config_key", "default")
    .maybeSingle();

  return {
    delayDays: Math.max(1, Number((data as { delay_days?: number } | null)?.delay_days ?? 2)),
    warningDays: Math.max(0, Number((data as { warning_days?: number } | null)?.warning_days ?? 1)),
    emailEnabled: (data as { email_enabled?: boolean } | null)?.email_enabled !== false,
    smsEnabled: (data as { sms_enabled?: boolean } | null)?.sms_enabled !== false,
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

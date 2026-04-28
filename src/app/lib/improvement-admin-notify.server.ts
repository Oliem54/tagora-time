import "server-only";

import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { extractRoleFromUser } from "@/app/lib/account-requests.server";
import { isValidEmail } from "@/app/lib/account-requests.shared";
import { sendSmsToPhone } from "@/app/lib/notifications";

const LOG_PREFIX = "[improvements-notify]";

type PreferenceRow = {
  improvements_email_notifications_enabled: boolean;
  improvements_sms_notifications_enabled: boolean;
  improvements_notification_email: string | null;
  improvements_notification_phone: string | null;
};

export type NewImprovementNotifyPayload = {
  id: number;
  title: string;
  module: string;
  priority: string;
  description: string;
  created_by_email: string | null;
  created_by_role: string | null;
  created_at: string;
};

function buildAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
}

async function sendResendImprovementEmail(to: string, subject: string, text: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.error(LOG_PREFIX, "email_config_missing", {
      hasApiKey: Boolean(apiKey),
      hasFromEmail: Boolean(fromEmail),
    });
    return;
  }

  if (!isValidEmail(fromEmail) || !isValidEmail(to)) {
    console.error(LOG_PREFIX, "invalid_email", { fromEmail, to });
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      console.error(LOG_PREFIX, "resend_failed", {
        status: response.status,
        body: raw.slice(0, 500),
      });
    }
  } catch (e) {
    console.error(LOG_PREFIX, "resend_error", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifyAdminsNewImprovement(payload: NewImprovementNotifyPayload) {
  const supabase = createAdminSupabaseClient();
  const baseUrl = buildAppBaseUrl();
  const ameliorationsUrl = baseUrl ? `${baseUrl}/ameliorations` : "/ameliorations";

  const admins: Array<{ id: string; email: string | undefined }> = [];
  let page = 1;
  const perPage = 200;

  try {
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error(LOG_PREFIX, "list_users_failed", { message: error.message });
        return;
      }
      const users = data?.users ?? [];
      for (const u of users) {
        if (extractRoleFromUser(u) === "admin") {
          admins.push({ id: u.id, email: u.email });
        }
      }
      if (users.length < perPage) break;
      page += 1;
    }
  } catch (e) {
    console.error(LOG_PREFIX, "list_users_unexpected", {
      message: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  if (admins.length === 0) {
    console.info(LOG_PREFIX, "no_admin_users");
    return;
  }

  const userIds = admins.map((a) => a.id);
  const { data: prefRows, error: prefError } = await supabase
    .from("admin_improvement_notification_preferences")
    .select(
      "user_id, improvements_email_notifications_enabled, improvements_sms_notifications_enabled, improvements_notification_email, improvements_notification_phone"
    )
    .in("user_id", userIds);

  if (prefError) {
    console.error(LOG_PREFIX, "preferences_select_failed", {
      code: prefError.code,
      message: prefError.message,
    });
  }

  const prefByUser = new Map<string, PreferenceRow>();
  const preferenceRows = prefError ? [] : (prefRows ?? []);
  for (const row of preferenceRows) {
    const uid = row.user_id as string;
    prefByUser.set(uid, {
      improvements_email_notifications_enabled: Boolean(
        row.improvements_email_notifications_enabled
      ),
      improvements_sms_notifications_enabled: Boolean(
        row.improvements_sms_notifications_enabled
      ),
      improvements_notification_email: (row.improvements_notification_email as string | null) ?? null,
      improvements_notification_phone: (row.improvements_notification_phone as string | null) ?? null,
    });
  }

  const subject = "Nouvelle amélioration soumise - TAGORA Time";
  const dateLabel = new Date(payload.created_at).toLocaleString("fr-CA");
  const textBody = [
    `Titre : ${payload.title}`,
    `Module : ${payload.module}`,
    `Priorité : ${payload.priority}`,
    "",
    "Description :",
    payload.description,
    "",
    `Soumise par : ${payload.created_by_email ?? "—"}`,
    `Rôle : ${payload.created_by_role ?? "—"}`,
    `Date : ${dateLabel}`,
    "",
    `Voir les améliorations : ${ameliorationsUrl}`,
  ].join("\n");

  const htmlBody = `
    <h2>Nouvelle amélioration</h2>
    <p><strong>Titre :</strong> ${escapeHtml(payload.title)}</p>
    <p><strong>Module :</strong> ${escapeHtml(payload.module)}</p>
    <p><strong>Priorité :</strong> ${escapeHtml(payload.priority)}</p>
    <p><strong>Description :</strong></p>
    <pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(payload.description)}</pre>
    <p><strong>Soumise par :</strong> ${escapeHtml(payload.created_by_email ?? "—")}</p>
    <p><strong>Rôle :</strong> ${escapeHtml(payload.created_by_role ?? "—")}</p>
    <p><strong>Date :</strong> ${escapeHtml(dateLabel)}</p>
    <p><a href="${escapeHtml(ameliorationsUrl)}">Ouvrir /ameliorations</a></p>
  `;

  const smsBody = `Nouvelle amélioration TAGORA Time : ${payload.title.slice(0, 80)}${payload.title.length > 80 ? "…" : ""}. Module : ${payload.module}. Voir /ameliorations.`;

  for (const admin of admins) {
    const prefs = prefByUser.get(admin.id);
    const emailEnabled = prefs?.improvements_email_notifications_enabled ?? true;
    const smsEnabled = prefs?.improvements_sms_notifications_enabled ?? false;
    const emailTo =
      (prefs?.improvements_notification_email?.trim() || admin.email || "").trim() || null;
    const phoneTo = prefs?.improvements_notification_phone?.trim() || null;

    if (emailEnabled && emailTo && isValidEmail(emailTo)) {
      await sendResendImprovementEmail(emailTo, subject, textBody, htmlBody);
    } else if (emailEnabled) {
      console.info(LOG_PREFIX, "email_skipped_invalid_or_missing", { userId: admin.id });
    }

    if (smsEnabled && phoneTo) {
      const smsResult = await sendSmsToPhone({ phone: phoneTo, body: smsBody });
      if (!smsResult.sent && !smsResult.skipped) {
        console.error(LOG_PREFIX, "sms_failed", {
          userId: admin.id,
          reason: smsResult.reason,
        });
      }
    }
  }
}

import "server-only";

import { isValidEmail } from "@/app/lib/account-requests.shared";
import {
  createMissingCommunicationTemplateAlert,
  trySendCommunicationEmployeeEmail,
  trySendCommunicationEmployeeSms,
} from "@/app/lib/communication-templates.server";
import { buildPublicUrl } from "@/app/lib/email/templates";
import { sendSmsToPhone } from "@/app/lib/notifications";
import { resolveResendFromEmail } from "@/app/lib/resend-email";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

const LOG = "[employee-schedule-notify]";

export type EmployeeNotifyChannelStatus =
  | "sent"
  | "skipped_no_recipient"
  | "skipped_invalid_email"
  | "failed"
  | "skipped_not_configured";

/** Colonnes chauffeurs comparées pour détecter un changement d’horaire (hors effectifs, nom, etc.). */
export const CHAUFFEUR_SCHEDULE_SNAPSHOT_KEYS = [
  "weekly_schedule_config",
  "schedule_start",
  "schedule_end",
  "scheduled_work_days",
  "planned_daily_hours",
  "planned_weekly_hours",
  "pause_minutes",
  "expected_breaks_count",
  "break_1_label",
  "break_1_minutes",
  "break_1_paid",
  "break_2_label",
  "break_2_minutes",
  "break_2_paid",
  "break_3_label",
  "break_3_minutes",
  "break_3_paid",
  "break_am_enabled",
  "break_am_time",
  "break_am_minutes",
  "break_am_paid",
  "lunch_enabled",
  "lunch_time",
  "lunch_minutes",
  "lunch_paid",
  "break_pm_enabled",
  "break_pm_time",
  "break_pm_minutes",
  "break_pm_paid",
  "default_weekly_hours",
  "schedule_active",
] as const;

function stableValueString(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "object" && !Array.isArray(value)) {
    try {
      const o = value as Record<string, unknown>;
      const keys = Object.keys(o).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${stableValueString(o[k])}`).join(",")}}`;
    } catch {
      return JSON.stringify(value);
    }
  }
  if (Array.isArray(value)) {
    const sorted = [...value].map((v) => String(v)).sort();
    return `[${sorted.join(",")}]`;
  }
  return JSON.stringify(value);
}

export function scheduleSnapshotFromRow(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const parts: string[] = [];
  for (const key of CHAUFFEUR_SCHEDULE_SNAPSHOT_KEYS) {
    parts.push(`${key}=${stableValueString(row[key])}`);
  }
  return parts.join("|");
}

export function hasScheduleSnapshotChanged(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): boolean {
  return scheduleSnapshotFromRow(before) !== scheduleSnapshotFromRow(after);
}

async function sendResendToEmployee(
  to: string | null | undefined,
  subject: string,
  textBody: string,
  htmlBody: string
): Promise<EmployeeNotifyChannelStatus> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmailResolution = resolveResendFromEmail(process.env.RESEND_FROM_EMAIL);
  const fromEmail = fromEmailResolution.fromEmail;

  if (!to || !String(to).trim()) {
    console.info(LOG, "courriel employé absent", { to: to ?? null });
    return "skipped_no_recipient";
  }

  const trimmed = String(to).trim().toLowerCase();
  if (!isValidEmail(trimmed)) {
    console.warn(LOG, "courriel employé invalide", { to: trimmed });
    return "skipped_invalid_email";
  }

  if (!apiKey || !fromEmail) {
    console.error(LOG, "email_config_missing", {
      hasApiKey: Boolean(apiKey),
      hasFromEmail: Boolean(fromEmail),
    });
    return "skipped_not_configured";
  }

  if (!isValidEmail(fromEmail)) {
    return "skipped_not_configured";
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
        to: [trimmed],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      console.error(LOG, "resend_failed", {
        status: response.status,
        body: raw.slice(0, 500),
      });
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error(LOG, "resend_error", {
      message: e instanceof Error ? e.message : String(e),
    });
    return "failed";
  }
}

const SMS_SCHEDULE_UPDATED =
  "TAGORA Time : votre horaire a été mis à jour. Veuillez consulter votre nouvel horaire dans l'application.";

const SMS_SHIFT_UPDATED =
  "TAGORA Time : un quart de travail a été ajouté ou modifié. Veuillez consulter votre horaire.";

const SMS_REQUEST_APPROVED =
  "TAGORA Time : votre demande d'horaire a été approuvée. Consultez votre horaire.";

const SMS_REQUEST_REJECTED =
  "TAGORA Time : votre demande d'horaire a été refusée. Consultez le détail dans l'application.";

export type EmployeeScheduleNotifyResult = {
  emailStatus: EmployeeNotifyChannelStatus;
  smsStatus: EmployeeNotifyChannelStatus;
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailScheduleUpdatedHtml(
  nom: string | null,
  link: string | null,
  bodyLines: { line1: string; line2: string }
) {
  const name = nom?.trim() || "Bonjour";
  const linkBlock = link
    ? `<p style="margin:16px 0;"><a href="${escapeHtml(link)}" style="color:#1d4ed8;font-weight:700;">Consulter mon horaire dans TAGORA Time</a></p><p style="font-size:12px;color:#64748b;">${escapeHtml(link)}</p>`
    : `<p style="color:#64748b;font-size:13px;">Ouvrez TAGORA Time pour consulter votre horaire.</p>`;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;padding:16px;">
<p>${escapeHtml(name)},</p>
<p>${escapeHtml(bodyLines.line1)}</p>
<p>${escapeHtml(bodyLines.line2)}</p>
${linkBlock}
<p style="margin-top:24px;font-size:13px;color:#64748b;">Merci.<br/>TAGORA Time</p>
</body></html>`;
}

/**
 * Après enregistrement d’horaire par direction/admin — ne bloque pas la sauvegarde.
 */
export async function notifyEmployeeScheduleUpdated(options: {
  employeeId: number;
  nom: string | null;
  email: string | null | undefined;
  phone: string | null | undefined;
}): Promise<EmployeeScheduleNotifyResult> {
  const link = buildPublicUrl("/employe/effectifs") ?? buildPublicUrl("/employe/dashboard");
  const nom = options.nom;
  const subject = "Votre horaire TAGORA Time a été mis à jour";
  const text = `${nom?.trim() ? `${nom.trim()},\n\n` : ""}Votre horaire de travail a été mis à jour.\n\nVeuillez consulter votre nouvel horaire dans TAGORA Time.\n\n${link ? `Lien : ${link}\n\n` : ""}Merci.\nTAGORA Time`;
  const html = emailScheduleUpdatedHtml(nom, link, {
    line1: "Votre horaire de travail a été mis à jour.",
    line2: "Veuillez consulter votre nouvel horaire dans TAGORA Time.",
  });

  let emailStatus: EmployeeNotifyChannelStatus = "skipped_no_recipient";
  let smsStatus: EmployeeNotifyChannelStatus = "skipped_no_recipient";

  let admin: ReturnType<typeof createAdminSupabaseClient> | null = null;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    admin = null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const tplVars: Record<string, string | undefined> = {
    employee_name: nom?.trim() ?? "",
    dashboard_url: link ?? "",
    app_url: baseUrl,
  };

  const emailTpl = await trySendCommunicationEmployeeEmail({
    supabase: admin,
    templateKey: "employee_schedule_updated_email",
    audience: "employee",
    variables: tplVars,
    toEmail: options.email,
  });

  if (emailTpl.usedTemplate) {
    if (!options.email?.trim()) {
      emailStatus = "skipped_no_recipient";
    } else if (emailTpl.skipped) {
      emailStatus = "skipped_no_recipient";
    } else if (emailTpl.ok) {
      emailStatus = "sent";
    } else {
      emailStatus = "failed";
    }
  } else {
    if (admin) {
      await createMissingCommunicationTemplateAlert(
        admin,
        "employee_schedule_updated_email",
        "email",
        "employee"
      );
    }
    try {
      emailStatus = await sendResendToEmployee(options.email, subject, text, html);
    } catch (e) {
      console.error(LOG, "email_unexpected", {
        employeeId: options.employeeId,
        message: e instanceof Error ? e.message : String(e),
      });
      emailStatus = "failed";
    }
  }

  const smsTpl = await trySendCommunicationEmployeeSms({
    supabase: admin,
    templateKey: "employee_schedule_updated_sms",
    audience: "employee",
    variables: tplVars,
    phone: options.phone,
  });

  if (smsTpl.usedTemplate) {
    if (smsTpl.sent) {
      smsStatus = "sent";
    } else if (smsTpl.skipped) {
      smsStatus =
        options.phone?.trim() ? "skipped_not_configured" : "skipped_no_recipient";
    } else {
      smsStatus = "failed";
    }
  } else {
    if (admin) {
      await createMissingCommunicationTemplateAlert(
        admin,
        "employee_schedule_updated_sms",
        "sms",
        "employee"
      );
    }
    try {
      const sms = await sendSmsToPhone({
        phone: options.phone,
        body: SMS_SCHEDULE_UPDATED,
      });
      if (sms.skipped) {
        if (sms.reason === "sms_recipient_missing") {
          console.info(LOG, "téléphone employé absent", { employeeId: options.employeeId });
          smsStatus = "skipped_no_recipient";
        } else if (sms.reason === "sms_not_configured") {
          smsStatus = "skipped_not_configured";
        } else {
          smsStatus = "skipped_no_recipient";
        }
      } else if (sms.sent) {
        smsStatus = "sent";
      } else {
        smsStatus = "failed";
      }
    } catch (e) {
      console.error(LOG, "sms_unexpected", {
        employeeId: options.employeeId,
        message: e instanceof Error ? e.message : String(e),
      });
      smsStatus = "failed";
    }
  }

  console.info(LOG, "schedule_updated_summary", {
    employeeId: options.employeeId,
    email: options.email ?? null,
    phone: options.phone ? "[redacted]" : null,
    scheduleChanged: true,
    emailStatus,
    smsStatus,
  });

  return { emailStatus, smsStatus };
}

/** Quart / plage liée à l’employé (si appelé depuis un flux métier futur). */
export async function notifyEmployeeShiftUpdated(options: {
  employeeId: number;
  nom: string | null;
  email: string | null | undefined;
  phone: string | null | undefined;
}): Promise<EmployeeScheduleNotifyResult> {
  const link = buildPublicUrl("/employe/effectifs") ?? buildPublicUrl("/employe/dashboard");
  const subject = "Votre horaire TAGORA Time a été mis à jour";
  const text = `${options.nom?.trim() ? `${options.nom.trim()},\n\n` : ""}Un quart de travail a été ajouté ou modifié. Veuillez consulter votre horaire dans TAGORA Time.\n\n${link ? `Lien : ${link}\n\n` : ""}Merci.\nTAGORA Time`;
  const html = emailScheduleUpdatedHtml(options.nom, link, {
    line1: "Un quart de travail a été ajouté ou modifié.",
    line2: "Veuillez consulter votre horaire dans TAGORA Time.",
  });

  let emailStatus: EmployeeNotifyChannelStatus = "skipped_no_recipient";
  let smsStatus: EmployeeNotifyChannelStatus = "skipped_no_recipient";

  let admin: ReturnType<typeof createAdminSupabaseClient> | null = null;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    admin = null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const tplVars: Record<string, string | undefined> = {
    employee_name: options.nom?.trim() ?? "",
    dashboard_url: link ?? "",
    app_url: baseUrl,
  };

  const emailTpl = await trySendCommunicationEmployeeEmail({
    supabase: admin,
    templateKey: "employee_shift_updated_email",
    audience: "employee",
    variables: tplVars,
    toEmail: options.email,
  });

  if (emailTpl.usedTemplate) {
    if (!options.email?.trim()) {
      emailStatus = "skipped_no_recipient";
    } else if (emailTpl.skipped) {
      emailStatus = "skipped_no_recipient";
    } else if (emailTpl.ok) {
      emailStatus = "sent";
    } else {
      emailStatus = "failed";
    }
  } else {
    if (admin) {
      await createMissingCommunicationTemplateAlert(
        admin,
        "employee_shift_updated_email",
        "email",
        "employee"
      );
    }
    try {
      emailStatus = await sendResendToEmployee(options.email, subject, text, html);
    } catch (e) {
      console.error(LOG, "shift_email_unexpected", {
        employeeId: options.employeeId,
        message: String(e),
      });
      emailStatus = "failed";
    }
  }

  const smsTpl = await trySendCommunicationEmployeeSms({
    supabase: admin,
    templateKey: "employee_shift_updated_sms",
    audience: "employee",
    variables: tplVars,
    phone: options.phone,
  });

  if (smsTpl.usedTemplate) {
    if (smsTpl.sent) {
      smsStatus = "sent";
    } else if (smsTpl.skipped) {
      smsStatus = options.phone?.trim() ? "skipped_not_configured" : "skipped_no_recipient";
    } else {
      smsStatus = "failed";
    }
  } else {
    if (admin) {
      await createMissingCommunicationTemplateAlert(
        admin,
        "employee_shift_updated_sms",
        "sms",
        "employee"
      );
    }
    try {
      const sms = await sendSmsToPhone({ phone: options.phone, body: SMS_SHIFT_UPDATED });
      if (sms.skipped) {
        if (sms.reason === "sms_recipient_missing") {
          console.info(LOG, "téléphone employé absent", { employeeId: options.employeeId });
          smsStatus = "skipped_no_recipient";
        } else if (sms.reason === "sms_not_configured") {
          smsStatus = "skipped_not_configured";
        } else {
          smsStatus = "skipped_no_recipient";
        }
      } else if (sms.sent) {
        smsStatus = "sent";
      } else {
        smsStatus = "failed";
      }
    } catch (e) {
      console.error(LOG, "shift_sms_unexpected", {
        employeeId: options.employeeId,
        message: String(e),
      });
      smsStatus = "failed";
    }
  }

  console.info(LOG, "shift_updated_summary", {
    employeeId: options.employeeId,
    emailStatus,
    smsStatus,
  });

  return { emailStatus, smsStatus };
}

export async function notifyEmployeeScheduleRequestReviewed(options: {
  employeeId: number;
  nom: string | null;
  email: string | null | undefined;
  phone: string | null | undefined;
  approved: boolean;
}): Promise<EmployeeScheduleNotifyResult> {
  const link = buildPublicUrl("/employe/effectifs") ?? buildPublicUrl("/employe/dashboard");
  const approved = options.approved;
  const subject = approved
    ? "Votre demande TAGORA Time a été approuvée"
    : "Votre demande TAGORA Time a été refusée";
  const bodySms = approved ? SMS_REQUEST_APPROVED : SMS_REQUEST_REJECTED;
  const intro = approved
    ? "Votre demande d'horaire a été approuvée. Consultez votre horaire dans TAGORA Time."
    : "Votre demande d'horaire a été refusée. Consultez le détail dans l'application TAGORA Time.";
  const text = `${options.nom?.trim() ? `${options.nom.trim()},\n\n` : ""}${intro}\n\n${link ? `Lien : ${link}\n\n` : ""}TAGORA Time`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a;">
<p>${escapeHtml(options.nom?.trim() || "Bonjour")},</p>
<p>${escapeHtml(intro)}</p>
${link ? `<p><a href="${escapeHtml(link)}">Ouvrir TAGORA Time</a></p>` : ""}
<p style="color:#64748b;font-size:13px;">TAGORA Time</p>
</body></html>`;

  let emailStatus: EmployeeNotifyChannelStatus = "skipped_no_recipient";
  let smsStatus: EmployeeNotifyChannelStatus = "skipped_no_recipient";

  let admin: ReturnType<typeof createAdminSupabaseClient> | null = null;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    admin = null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const tplVars: Record<string, string | undefined> = {
    employee_name: options.nom?.trim() ?? "",
    dashboard_url: link ?? "",
    app_url: baseUrl,
    decision_note: "",
  };

  const emailKey = approved
    ? "schedule_request_approved_employee_email"
    : "schedule_request_rejected_employee_email";
  const smsKey = approved
    ? "schedule_request_approved_employee_sms"
    : "schedule_request_rejected_employee_sms";

  const emailTpl = await trySendCommunicationEmployeeEmail({
    supabase: admin,
    templateKey: emailKey,
    audience: "employee",
    variables: tplVars,
    toEmail: options.email,
  });

  if (emailTpl.usedTemplate) {
    if (!options.email?.trim()) {
      emailStatus = "skipped_no_recipient";
    } else if (emailTpl.skipped) {
      emailStatus = "skipped_no_recipient";
    } else if (emailTpl.ok) {
      emailStatus = "sent";
    } else {
      emailStatus = "failed";
    }
  } else {
    if (admin) {
      await createMissingCommunicationTemplateAlert(admin, emailKey, "email", "employee");
    }
    try {
      emailStatus = await sendResendToEmployee(options.email, subject, text, html);
    } catch (e) {
      console.error(LOG, "request_review_email_unexpected", {
        employeeId: options.employeeId,
        message: String(e),
      });
      emailStatus = "failed";
    }
  }

  const smsTpl = await trySendCommunicationEmployeeSms({
    supabase: admin,
    templateKey: smsKey,
    audience: "employee",
    variables: tplVars,
    phone: options.phone,
  });

  if (smsTpl.usedTemplate) {
    if (smsTpl.sent) {
      smsStatus = "sent";
    } else if (smsTpl.skipped) {
      smsStatus = options.phone?.trim() ? "skipped_not_configured" : "skipped_no_recipient";
    } else {
      smsStatus = "failed";
    }
  } else {
    if (admin) {
      await createMissingCommunicationTemplateAlert(admin, smsKey, "sms", "employee");
    }
    try {
      const sms = await sendSmsToPhone({ phone: options.phone, body: bodySms });
      if (sms.skipped) {
        if (sms.reason === "sms_recipient_missing") {
          console.info(LOG, "téléphone employé absent", { employeeId: options.employeeId });
          smsStatus = "skipped_no_recipient";
        } else if (sms.reason === "sms_not_configured") {
          smsStatus = "skipped_not_configured";
        } else {
          smsStatus = "skipped_no_recipient";
        }
      } else if (sms.sent) {
        smsStatus = "sent";
      } else {
        smsStatus = "failed";
      }
    } catch (e) {
      console.error(LOG, "request_review_sms_unexpected", {
        employeeId: options.employeeId,
        message: String(e),
      });
      smsStatus = "failed";
    }
  }

  console.info(LOG, "request_reviewed_summary", {
    employeeId: options.employeeId,
    approved,
    emailStatus,
    smsStatus,
  });

  return { emailStatus, smsStatus };
}

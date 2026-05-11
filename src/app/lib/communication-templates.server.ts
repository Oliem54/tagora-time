import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { APP_ALERT_CATEGORY } from "@/app/lib/app-alerts.shared";
import { insertAppAlert } from "@/app/lib/app-alerts.server";
import { isValidEmail } from "@/app/lib/account-requests.shared";
import {
  COMMUNICATION_PREVIEW_SAMPLE,
  type CommunicationAudience,
  type CommunicationChannel,
} from "@/app/lib/communication-templates.shared";
import { normalizeDirectionAlertRecipients, sendDirectionSmsAlert, sendSmsToPhone } from "@/app/lib/notifications";
import { resolveResendFromEmail } from "@/app/lib/resend-email";

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export type AppCommunicationTemplateRow = {
  id: string;
  template_key: string;
  category: string;
  channel: CommunicationChannel;
  audience: CommunicationAudience;
  name: string;
  description: string | null;
  subject: string | null;
  body: string;
  active: boolean;
  variables: unknown;
  default_subject: string | null;
  default_body: string | null;
  is_system: boolean;
  implementation_status: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Remplace les variables {{name}}. Valeurs manquantes → chaîne vide (SMS court) ou placeholder.
 */
export function renderCommunicationTemplate(
  template: string,
  variables: Record<string, string | undefined>,
  options?: { escapeValuesAsHtml?: boolean; missingPlaceholder?: string }
): string {
  const missing = options?.missingPlaceholder ?? "";
  return template.replace(VAR_RE, (_m, key: string) => {
    const v = variables[key];
    if (v === undefined || v === null || v === "") {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[communication-template] variable absente", key);
      }
      return missing;
    }
    const raw = String(v);
    return options?.escapeValuesAsHtml ? escapeHtml(raw) : raw;
  });
}

function textToSimpleEmailHtml(text: string): string {
  const lines = text.split("\n");
  const inner = lines
    .map((line) => `<p style="margin:0 0 8px 0;">${escapeHtml(line)}</p>`)
    .join("");
  return `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a;line-height:1.5;">${inner}<p style="margin-top:16px;font-size:13px;color:#64748b;">TAGORA Time</p></body></html>`;
}

export async function getCommunicationTemplate(
  supabase: SupabaseClient,
  templateKey: string,
  channel: CommunicationChannel,
  audience: CommunicationAudience
): Promise<AppCommunicationTemplateRow | null> {
  const { data, error } = await supabase
    .from("app_communication_templates")
    .select("*")
    .eq("template_key", templateKey)
    .eq("channel", channel)
    .eq("audience", audience)
    .maybeSingle();
  if (error) {
    console.warn("[communication-templates]", error.message);
    return null;
  }
  return data as AppCommunicationTemplateRow | null;
}

export async function createMissingCommunicationTemplateAlert(
  supabase: SupabaseClient,
  templateKey: string,
  channel: CommunicationChannel,
  audience: CommunicationAudience
) {
  const dedupeKey = `communication_missing:${templateKey}:${channel}:${audience}`;
  await insertAppAlert(supabase, {
    category: APP_ALERT_CATEGORY.communication_template,
    priority: "high",
    title: "Modèle de communication manquant ou désactivé",
    body: `Le modèle ${templateKey} (${channel}, ${audience}) est absent, inactif ou incomplet. Un envoi de secours minimal a été utilisé.`,
    sourceModule: "communications",
    dedupeKey,
    metadata: { templateKey, channel, audience },
  });
}

type DirectionEmailResult = {
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  recipients: string[];
};

/**
 * Envoi Resend multi-destinataires (même logique que les alertes direction).
 */
export async function sendTemplatedDirectionEmail(options: {
  recipients?: string[];
  subject: string;
  textBody: string;
  htmlBody: string;
  enabled?: boolean;
}): Promise<DirectionEmailResult> {
  if (options.enabled === false) {
    return { ok: true, skipped: true, reason: "email_disabled", recipients: [] };
  }

  const { validRecipients } = normalizeDirectionAlertRecipients(options.recipients);
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmailResolution = resolveResendFromEmail(process.env.RESEND_FROM_EMAIL);
  const fromEmail = fromEmailResolution.fromEmail;

  if (!apiKey || !fromEmail) {
    return {
      ok: false,
      skipped: true,
      reason: "email_config_missing",
      recipients: validRecipients,
    };
  }

  if (validRecipients.length === 0) {
    return {
      ok: false,
      skipped: true,
      reason: "no_valid_recipients",
      recipients: [],
    };
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
        to: validRecipients,
        subject: options.subject,
        text: options.textBody,
        html: options.htmlBody,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      return {
        ok: false,
        skipped: false,
        reason: raw.slice(0, 400),
        recipients: validRecipients,
      };
    }

    return { ok: true, skipped: false, reason: null, recipients: validRecipients };
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      reason: e instanceof Error ? e.message : "send_failed",
      recipients: validRecipients,
    };
  }
}

/**
 * Charge le modèle, rend les variables ; si actif et corps non vide, envoie.
 * Sinon retourne usedTemplate: false pour déclencher le fallback appelant.
 */
export async function trySendCommunicationDirectionEmail(options: {
  supabase: SupabaseClient | null;
  templateKey: string;
  audience: CommunicationAudience;
  variables: Record<string, string | undefined>;
  recipientEmails?: string[];
  enabled?: boolean;
}): Promise<{
  result: DirectionEmailResult;
  usedTemplate: boolean;
}> {
  if (!options.supabase) {
    return {
      result: { ok: false, skipped: true, reason: "no_admin_client", recipients: [] },
      usedTemplate: false,
    };
  }

  const row = await getCommunicationTemplate(
    options.supabase,
    options.templateKey,
    "email",
    options.audience
  );

  if (!row || !row.active || !String(row.body ?? "").trim()) {
    return {
      result: { ok: false, skipped: true, reason: "template_missing", recipients: [] },
      usedTemplate: false,
    };
  }

  const subject = renderCommunicationTemplate(row.subject ?? "", options.variables, {
    escapeValuesAsHtml: true,
  });
  const textBody = renderCommunicationTemplate(row.body, options.variables, {
    escapeValuesAsHtml: false,
  });
  const htmlBody = textToSimpleEmailHtml(textBody);

  const result = await sendTemplatedDirectionEmail({
    recipients: options.recipientEmails,
    subject: subject.trim() || "TAGORA Time",
    textBody,
    htmlBody,
    enabled: options.enabled,
  });

  return { result, usedTemplate: true };
}

export async function trySendCommunicationDirectionSms(options: {
  supabase: SupabaseClient | null;
  templateKey: string;
  audience: CommunicationAudience;
  variables: Record<string, string | undefined>;
  recipientSmsNumbers?: string[];
  enabled?: boolean;
}): Promise<{
  result: Awaited<ReturnType<typeof sendDirectionSmsAlert>>;
  usedTemplate: boolean;
}> {
  if (!options.supabase) {
    return {
      result: {
        sent: false,
        skipped: true,
        reason: "no_admin_client",
        recipients: [],
      },
      usedTemplate: false,
    };
  }

  const row = await getCommunicationTemplate(
    options.supabase,
    options.templateKey,
    "sms",
    options.audience
  );

  if (!row || !row.active || !String(row.body ?? "").trim()) {
    return {
      result: {
        sent: false,
        skipped: true,
        reason: "template_missing",
        recipients: [],
      },
      usedTemplate: false,
    };
  }

  const body = renderCommunicationTemplate(row.body, options.variables, {
    escapeValuesAsHtml: false,
  });

  const result = await sendDirectionSmsAlert(
    { body },
    {
      enabled: options.enabled,
      recipients: options.recipientSmsNumbers,
    }
  );

  return { result, usedTemplate: true };
}

export async function trySendCommunicationEmployeeEmail(options: {
  supabase: SupabaseClient | null;
  templateKey: string;
  audience: CommunicationAudience;
  variables: Record<string, string | undefined>;
  toEmail: string | null | undefined;
}): Promise<{ ok: boolean; skipped: boolean; usedTemplate: boolean }> {
  const to = options.toEmail?.trim().toLowerCase();
  if (!to || !isValidEmail(to)) {
    return { ok: false, skipped: true, usedTemplate: false };
  }

  if (!options.supabase) {
    return { ok: false, skipped: true, usedTemplate: false };
  }

  const row = await getCommunicationTemplate(
    options.supabase,
    options.templateKey,
    "email",
    options.audience
  );

  if (!row || !row.active || !String(row.body ?? "").trim()) {
    return { ok: false, skipped: true, usedTemplate: false };
  }

  const subject = renderCommunicationTemplate(row.subject ?? "", options.variables, {
    escapeValuesAsHtml: true,
  });
  const textBody = renderCommunicationTemplate(row.body, options.variables, {
    escapeValuesAsHtml: false,
  });
  const htmlBody = textToSimpleEmailHtml(textBody);

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmailResolution = resolveResendFromEmail(process.env.RESEND_FROM_EMAIL);
  const fromEmail = fromEmailResolution.fromEmail;

  if (!apiKey || !fromEmail) {
    return { ok: false, skipped: true, usedTemplate: true };
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
        subject: subject.trim() || "TAGORA Time",
        text: textBody,
        html: htmlBody,
      }),
    });

    if (!response.ok) {
      return { ok: false, skipped: false, usedTemplate: true };
    }
    return { ok: true, skipped: false, usedTemplate: true };
  } catch {
    return { ok: false, skipped: false, usedTemplate: true };
  }
}

export async function trySendCommunicationEmployeeSms(options: {
  supabase: SupabaseClient | null;
  templateKey: string;
  audience: CommunicationAudience;
  variables: Record<string, string | undefined>;
  phone: string | null | undefined;
}): Promise<{ sent: boolean; skipped: boolean; usedTemplate: boolean }> {
  if (!options.supabase) {
    return { sent: false, skipped: true, usedTemplate: false };
  }

  const row = await getCommunicationTemplate(
    options.supabase,
    options.templateKey,
    "sms",
    options.audience
  );

  if (!row || !row.active || !String(row.body ?? "").trim()) {
    return { sent: false, skipped: true, usedTemplate: false };
  }

  const body = renderCommunicationTemplate(row.body, options.variables, {
    escapeValuesAsHtml: false,
  });

  const sms = await sendSmsToPhone({ phone: options.phone, body });
  return {
    sent: sms.sent,
    skipped: sms.skipped,
    usedTemplate: true,
  };
}

export function buildPreviewVariableMap(
  overrides?: Record<string, string>
): Record<string, string> {
  return { ...COMMUNICATION_PREVIEW_SAMPLE, ...overrides };
}

/** Prévisualisation courriel (sujet + texte + HTML simple) avec données exemples. */
export function previewCommunicationTemplate(
  row: AppCommunicationTemplateRow,
  variableOverrides?: Record<string, string>
) {
  const vars = buildPreviewVariableMap(variableOverrides);
  const subject = renderCommunicationTemplate(row.subject ?? "", vars, {
    escapeValuesAsHtml: true,
  });
  const textBody = renderCommunicationTemplate(row.body, vars, {
    escapeValuesAsHtml: false,
  });
  return {
    subject: subject.trim() || "(sans sujet)",
    textBody,
    htmlBody: textToSimpleEmailHtml(textBody),
  };
}

export function getTemplateFallback(
  templateKey: string,
  channel: CommunicationChannel
): { subject: string | null; body: string } | null {
  void channel;
  const fallbacks: Record<string, { subject: string | null; body: string }> = {
    horodateur_exception_created_direction_email: {
      subject: "TAGORA Time — Exception horodateur à traiter",
      body: "Une exception horodateur requiert votre attention. Consultez l’horodateur direction.",
    },
    horodateur_exception_created_direction_sms: {
      subject: null,
      body: "TAGORA Time : exception horodateur à traiter. Consultez l’application.",
    },
  };
  return fallbacks[templateKey] ?? null;
}

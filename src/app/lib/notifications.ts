import "server-only";

import {
  getCompanyLabel,
  isValidEmail,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import type { HorodateurPhase1EmployeeProfile } from "@/app/lib/horodateur-v1/types";
import {
  getHorodateurQuickActionActorUserId,
  issueHorodateurExceptionQuickActionPair,
  resolvePublicAppBaseUrl,
} from "@/app/lib/horodateur-exception-quick-action.server";
import {
  normalizePhoneNumber,
  normalizePhoneToTwilioE164,
} from "@/app/lib/timeclock-api.shared";
import {
  createMissingCommunicationTemplateAlert,
  trySendCommunicationDirectionEmail,
  trySendCommunicationDirectionSms,
  trySendCommunicationEmployeeEmail,
  trySendCommunicationEmployeeSms,
} from "@/app/lib/communication-templates.server";
import { resolveResendFromEmail } from "@/app/lib/resend-email";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type DirectionAlertClassification = "informative" | "direction_action_required";
type DirectionAlertDetailValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<unknown>
  | Record<string, unknown>;

type DirectionAlertPayload = {
  alertType: string;
  classification: DirectionAlertClassification;
  subject: string;
  summary: string;
  requesterLabel?: string;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  company?: AccountRequestCompany | string | null;
  requestedAt?: string | null;
  requestId?: string | number | null;
  details?: Record<string, DirectionAlertDetailValue>;
  managementUrl?: string | null;
  managementLabel?: string | null;
  /** URLs absolues (jeton inclus) — exception horodateur uniquement. */
  quickApproveUrl?: string | null;
  quickRejectUrl?: string | null;
};

type DirectionAlertResult = {
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  recipients: string[];
  invalidRecipients: string[];
  providerMessageId: string | null;
};

type AccountRequestNotificationPayload = {
  requestId: string;
  fullName: string;
  email: string;
  phone: string | null;
  company: AccountRequestCompany;
  requestedRole: string;
  requestedPermissions: string[];
  portalSource: string;
  message: string | null;
  createdAt: string;
  managementUrl?: string | null;
};

type AuthorizationRequestNotificationPayload = {
  requestId: string;
  requestType: string;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterPhone: string | null;
  company: AccountRequestCompany | string | null;
  justification: string | null;
  requestedValue: Record<string, unknown>;
  requestedAt: string;
  managementUrl?: string | null;
};

type DeliveryTrackingSmsPayload = {
  clientName: string | null;
  phone: string;
  trackingUrl: string;
  statusLabel: string;
  companyLabel: string;
};

type DirectionSmsResult = {
  sent: boolean;
  skipped: boolean;
  reason: string | null;
  recipients: string[];
};

type DirectionAlertDeliveryOptions = {
  enabled?: boolean;
  recipients?: string[];
};

type HorodateurExceptionNotificationPayload = {
  exceptionId: string;
  employeeName: string | null;
  employeeEmail: string | null;
  employeePhone?: string | null;
  employeeNote?: string | null;
  company?: AccountRequestCompany | string | null;
  exceptionType: string;
  reasonLabel: string;
  occurredAt: string | null;
  requestedAt: string;
  managementUrl?: string | null;
};

type HorodateurLatenessNotificationPayload = {
  employeeName: string | null;
  employeePhone: string | null;
  scheduledStartAt: string;
  detectedAt: string;
  managementUrl?: string | null;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  employeeSmsEnabled?: boolean;
  recipientEmails?: string[];
  recipientSmsNumbers?: string[];
};

const DIRECTION_ALERT_LOG_PREFIX = "[direction-alert]";
const HORODATEUR_PUNCH_SMS_LOG = "[horodateur-punch-sms]";
const DEFAULT_DIRECTION_ALERT_TIMEZONE = "America/Toronto";
const AUTHORIZATION_REQUEST_TYPE_LABELS: Record<string, string> = {
  early_start: "Début de quart hors horaire",
  out_of_zone_punch: "Pointage hors zone",
  lunch_shift_change: "Modification de pause ou dîner",
  manual_punch_override: "Correction manuelle de pointage",
  time_extension: "Prolongement de temps",
};

function logDirectionAlertStep(step: string, details: Record<string, unknown>) {
  console.info(DIRECTION_ALERT_LOG_PREFIX, step, details);
}

function formatAlertDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone:
      process.env.DIRECTION_ALERT_TIMEZONE ?? DEFAULT_DIRECTION_ALERT_TIMEZONE,
  }).format(parsed);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDetailValue(value: DirectionAlertDetailValue) {
  if (value == null || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Oui" : "Non";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function humanizeKey(value: string) {
  return value
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function splitFullName(fullName: string) {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      firstName: "-",
      lastName: "-",
    };
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "-",
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "-",
  };
}

export function normalizeDirectionAlertRecipients(rawValues?: string[]) {
  const recipients =
    rawValues && rawValues.length > 0
      ? rawValues.map((item) => item.trim().toLowerCase()).filter(Boolean)
      : (process.env.DIRECTION_ALERT_EMAILS ?? "")
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);

  const validRecipients: string[] = [];
  const invalidRecipients: string[] = [];

  for (const recipient of recipients) {
    if (isValidEmail(recipient)) {
      validRecipients.push(recipient);
      continue;
    }

    console.warn(DIRECTION_ALERT_LOG_PREFIX, "recipient_invalid", {
      recipient,
      reason: "failed_server_email_format_validation",
    });
    invalidRecipients.push(recipient);
  }

  return {
    validRecipients: Array.from(new Set(validRecipients)),
    invalidRecipients: Array.from(new Set(invalidRecipients)),
  };
}

export function normalizeDirectionSmsRecipients(rawValues?: string[]) {
  const recipients =
    rawValues && rawValues.length > 0
      ? rawValues
      : (
          process.env.DIRECTION_ALERT_SMS_NUMBERS ??
          process.env.DIRECTION_ALERT_PHONES ??
          ""
        ).split(",");

  return Array.from(new Set(recipients.map((item) => normalizePhoneNumber(item)).filter(Boolean)));
}

function buildManagementUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const baseUrl = resolvePublicAppBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${baseUrl}${normalizedPath}`;
}

function getTagoraTransactionalLogoUrl() {
  const baseUrl = resolvePublicAppBaseUrl();
  return baseUrl ? `${baseUrl}/logo.png` : null;
}

function buildDirectionAlertText(payload: DirectionAlertPayload) {
  const lines = [
    "TAGORA Time — Alerte direction",
    "",
    payload.subject,
    "",
    `Résumé : ${payload.summary}`,
    "",
    `Type d’alerte : ${payload.alertType}`,
    `Classification : ${payload.classification}`,
    `${payload.requesterLabel ?? "Demandeur"} : ${payload.requesterName ?? "-"}`,
    `Courriel : ${payload.requesterEmail ?? "-"}`,
    `Téléphone : ${payload.requesterPhone ?? "-"}`,
    `Compagnie : ${
      typeof payload.company === "string"
        ? getCompanyLabel(payload.company as AccountRequestCompany)
        : "-"
    }`,
    `Date et heure : ${formatAlertDateTime(payload.requestedAt)}`,
    `Identifiant : ${payload.requestId ?? "-"}`,
    "",
    "Détails :",
  ];

  for (const [label, rawValue] of Object.entries(payload.details ?? {})) {
    lines.push(`- ${label} : ${formatDetailValue(rawValue)}`);
  }

  if (payload.managementUrl) {
    lines.push("");
    lines.push(`${payload.managementLabel ?? "Lien de gestion"} :`);
    lines.push(payload.managementUrl);
  }

  if (payload.quickApproveUrl && payload.quickRejectUrl) {
    lines.push("");
    lines.push("Actions rapides (24 h) — si les boutons HTML ne s’affichent pas :");
    lines.push(`Approuver : ${payload.quickApproveUrl}`);
    lines.push(`Refuser : ${payload.quickRejectUrl}`);
  } else if (payload.alertType === "horodateur_exception") {
    lines.push("");
    lines.push(
      "Les liens sécurisés Approuver / Refuser n’ont pas pu être inclus dans ce message."
    );
    lines.push(
      "Vérifiez NEXT_PUBLIC_APP_URL (ou APP_PUBLIC_BASE_URL / déploiement Vercel), la table horodateur_exception_action_tokens, et les journaux [horodateur-exception-quick-action-links-missing]."
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("TAGORA Time — Oliem Solutions");

  return lines.join("\n");
}

function buildDirectionAlertHtml(payload: DirectionAlertPayload) {
  const logoUrl = getTagoraTransactionalLogoUrl();

  const rows = [
    ["Type d’alerte", payload.alertType],
    ["Classification", payload.classification],
    [payload.requesterLabel ?? "Demandeur", payload.requesterName ?? "-"],
    ["Courriel", payload.requesterEmail ?? "-"],
    ["Téléphone", payload.requesterPhone ?? "-"],
    [
      "Compagnie",
      typeof payload.company === "string"
        ? getCompanyLabel(payload.company as AccountRequestCompany)
        : "-",
    ],
    ["Date et heure", formatAlertDateTime(payload.requestedAt)],
    ["Identifiant", payload.requestId ?? "-"],
  ]
    .map(
      ([label, value]) => `
        <tr>
          <td width="38%" valign="top" style="padding:10px 12px;border:1px solid #e2e8f0;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(String(label))}</td>
          <td valign="top" style="padding:10px 12px;border:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#334155;">${escapeHtml(String(value ?? "-"))}</td>
        </tr>
      `
    )
    .join("");

  const detailRows = Object.entries(payload.details ?? {})
    .map(
      ([label, rawValue]) => `
        <tr>
          <td width="38%" valign="top" style="padding:10px 12px;border:1px solid #e2e8f0;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(label)}</td>
          <td valign="top" style="padding:10px 12px;border:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#334155;white-space:pre-wrap;">${escapeHtml(
            formatDetailValue(rawValue)
          )}</td>
        </tr>
      `
    )
    .join("");

  const managementUrl = payload.managementUrl;
  const managementLabel = escapeHtml(
    payload.managementLabel ?? "Ouvrir l’horodateur direction"
  );
  const approveU = payload.quickApproveUrl;
  const rejectU = payload.quickRejectUrl;

  const quickLinksMissingBanner =
    payload.alertType === "horodateur_exception" && (!approveU || !rejectU)
      ? `
            <tr>
              <td style="padding:8px 28px 8px 28px;">
                <div style="border:1px solid #f59e0b;background-color:#fffbeb;border-radius:10px;padding:16px 18px;">
                  <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#92400e;">Liens Approuver / Refuser non disponibles</p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#78350f;">Les jetons d’action rapide n’ont pas pu être générés ou enregistrés. Consultez les journaux serveur marqués <strong>[horodateur-exception-quick-action-links-missing]</strong> (URL publique, Supabase, table <code style="font-size:12px;">horodateur_exception_action_tokens</code>). Vous pouvez toujours traiter l’exception depuis l’horodateur direction ci-dessous.</p>
                </div>
              </td>
            </tr>`
      : "";

  const quickActionsBlock =
    approveU && rejectU
      ? `
            <tr>
              <td style="padding:16px 28px 4px 28px;">
                <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0f172a;">Actions rapides</p>
                <p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#64748b;">Liens sécurisés à usage unique — expirent après 24 h.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:0 0 10px 0;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                        <tr>
                          <td bgcolor="#15803d" style="background-color:#15803d;border-radius:8px;">
                            <a href="${escapeHtml(approveU)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px;">Approuver l’exception</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 10px 0;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                        <tr>
                          <td bgcolor="#b91c1c" style="background-color:#b91c1c;border-radius:8px;">
                            <a href="${escapeHtml(rejectU)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px;">Refuser l’exception</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#475569;font-weight:700;">Si les boutons ne fonctionnent pas, copiez-collez ces liens :</p>
                <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#334155;font-weight:700;">Approuver</p>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;word-break:break-all;overflow-wrap:anywhere;color:#0f172a;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:12px 14px;margin:0 0 12px 0;">${escapeHtml(approveU)}</div>
                <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#334155;font-weight:700;">Refuser</p>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;word-break:break-all;overflow-wrap:anywhere;color:#0f172a;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:12px 14px;margin:0 0 12px 0;">${escapeHtml(rejectU)}</div>
                ${
                  managementUrl
                    ? `<p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#334155;font-weight:700;">Ouvrir l’horodateur direction</p>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;word-break:break-all;overflow-wrap:anywhere;color:#0f172a;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:12px 14px;margin:0;">${escapeHtml(managementUrl)}</div>`
                    : ""
                }
              </td>
            </tr>`
      : "";

  const ctaRows =
    quickLinksMissingBanner +
    quickActionsBlock +
    (managementUrl
      ? `
            <tr>
              <td style="padding:20px 28px 8px 28px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td bgcolor="#1d4ed8" style="background-color:#1d4ed8;border-radius:8px;">
                      <a href="${escapeHtml(managementUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border:1px solid #1d4ed8;border-radius:8px;">${managementLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px 28px;">
                <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#475569;">Si le bouton ne fonctionne pas, copiez-collez ce lien :</p>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;word-break:break-all;overflow-wrap:anywhere;color:#0f172a;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:12px 14px;">${escapeHtml(managementUrl)}</div>
              </td>
            </tr>`
      : "");

  const logoCell = logoUrl
    ? `<td valign="top" width="132" style="padding:0 20px 0 0;">
                        <img src="${escapeHtml(logoUrl)}" alt="TAGORA Time" width="112" height="auto" border="0" style="display:block;max-width:112px;height:auto;border:0;outline:none;text-decoration:none;" />
                      </td>`
    : "";

  const titleCellStyle = logoUrl ? "padding:0;" : "padding:0;width:100%;";

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta charset="utf-8" />
    <title>${escapeHtml(payload.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background-color:#f1f5f9;">
      <tr>
        <td align="center" bgcolor="#f1f5f9" style="padding:28px 16px;background-color:#f1f5f9;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e2e8f0;">
            <tr>
              <td bgcolor="#1e3a5f" style="background-color:#1e3a5f;padding:24px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    ${logoCell}
                    <td valign="middle" style="${titleCellStyle}">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#cbd5e1;margin:0 0 8px 0;">TAGORA Time — Direction</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;font-weight:700;color:#ffffff;margin:0;">${escapeHtml(payload.subject)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#334155;">${escapeHtml(payload.summary)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 8px 28px;">
                <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0f172a;">Synthèse</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">
                  <tbody>${rows}</tbody>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 8px 28px;">
                <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0f172a;">Détails complets</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;">
                  <tbody>${
                    detailRows ||
                    `<tr>
                    <td colspan="2" style="padding:10px 12px;border:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#475569;">Aucun détail supplémentaire.</td>
                  </tr>`
                  }</tbody>
                </table>
              </td>
            </tr>
            ${ctaRows}
          </table>
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;max-width:600px;width:100%;">
            <tr>
              <td align="center" bgcolor="#f1f5f9" style="padding:18px 12px 0 12px;background-color:#f1f5f9;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#64748b;">TAGORA Time — Oliem Solutions</p>
                <p style="margin:6px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#64748b;">Courriel transactionnel — ne pas répondre directement à cette adresse</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendDirectionAlert(
  payload: DirectionAlertPayload,
  options?: DirectionAlertDeliveryOptions
): Promise<DirectionAlertResult> {
  logDirectionAlertStep("received", {
    alertType: payload.alertType,
    classification: payload.classification,
    requestId: payload.requestId ?? null,
    requestedAt: payload.requestedAt ?? null,
  });

  if (payload.classification !== "direction_action_required") {
    logDirectionAlertStep("skipped_informative", {
      alertType: payload.alertType,
      requestId: payload.requestId ?? null,
    });

    return {
      ok: true,
      skipped: true,
      reason: "informative_event",
      recipients: [],
      invalidRecipients: [],
      providerMessageId: null,
    };
  }

  if (options?.enabled === false) {
    logDirectionAlertStep("email_disabled", {
      alertType: payload.alertType,
      requestId: payload.requestId ?? null,
    });

    return {
      ok: true,
      skipped: true,
      reason: "email_disabled",
      recipients: [],
      invalidRecipients: [],
      providerMessageId: null,
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmailResolution = resolveResendFromEmail(process.env.RESEND_FROM_EMAIL);
  const fromEmail = fromEmailResolution.fromEmail;
  const { validRecipients, invalidRecipients } =
    normalizeDirectionAlertRecipients(options?.recipients);
  const managementUrl = buildManagementUrl(payload.managementUrl);

  if (invalidRecipients.length > 0) {
    console.warn(DIRECTION_ALERT_LOG_PREFIX, "invalid_recipients_detected", {
      alertType: payload.alertType,
      invalidRecipients,
    });
  }

  if (!apiKey || !fromEmail) {
    console.error(DIRECTION_ALERT_LOG_PREFIX, "email_config_missing", {
      alertType: payload.alertType,
      hasApiKey: Boolean(apiKey),
      hasFromEmail: Boolean(fromEmail),
      fromEmailReason: fromEmailResolution.reason,
      fromEmailDiagnostics: fromEmailResolution.diagnostics,
      recipientsConfigured: validRecipients.length > 0,
    });

    return {
      ok: false,
      skipped: true,
      reason: "email_config_missing",
      recipients: validRecipients,
      invalidRecipients,
      providerMessageId: null,
    };
  }

  if (validRecipients.length === 0) {
    console.error(DIRECTION_ALERT_LOG_PREFIX, "no_valid_recipients", {
      alertType: payload.alertType,
      configuredRecipients: process.env.DIRECTION_ALERT_EMAILS ?? "",
      invalidRecipients,
    });

    return {
      ok: false,
      skipped: true,
      reason: "no_valid_recipients",
      recipients: [],
      invalidRecipients,
      providerMessageId: null,
    };
  }

  logDirectionAlertStep("send_attempt", {
    alertType: payload.alertType,
    requestId: payload.requestId ?? null,
    recipients: validRecipients,
  });

  let resendHttpStatus: number | null = null;
  let resendResponseBody: string | null = null;

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
        subject: payload.subject,
        text: buildDirectionAlertText({
          ...payload,
          managementUrl,
        }),
        html: buildDirectionAlertHtml({
          ...payload,
          managementUrl,
        }),
      }),
    });

    const rawBody = await response.text();
    let providerMessageId: string | null = null;
    let parsedBody: Record<string, unknown> | null = null;

    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
        providerMessageId =
          typeof parsedBody.id === "string" ? parsedBody.id : null;
      } catch {
        parsedBody = null;
      }
    }

    if (!response.ok) {
      resendHttpStatus = response.status;
      resendResponseBody = rawBody;
      throw new Error(
        `Resend email failed (${response.status} ${response.statusText}): ${
          rawBody || "empty response body"
        }`
      );
    }

    logDirectionAlertStep("send_success", {
      alertType: payload.alertType,
      requestId: payload.requestId ?? null,
      recipients: validRecipients,
      providerMessageId,
      provider: "resend",
      providerResponse: parsedBody,
    });

    return {
      ok: true,
      skipped: false,
      reason: null,
      recipients: validRecipients,
      invalidRecipients,
      providerMessageId,
    };
  } catch (error) {
    const errRecord = error as Record<string, unknown> & {
      statusCode?: unknown;
      status?: unknown;
      response?: unknown;
    };
    const message =
      error instanceof Error ? error.message : String(errRecord.message ?? error);
    const statusCode =
      resendHttpStatus ??
      (typeof errRecord.statusCode === "number" ? errRecord.statusCode : null) ??
      (typeof errRecord.status === "number" ? errRecord.status : null);
    const status =
      typeof errRecord.status === "number" && errRecord.status !== statusCode
        ? errRecord.status
        : statusCode;
    let providerResponse: unknown =
      errRecord.response ?? errRecord.body ?? errRecord.data ?? null;
    if (resendResponseBody) {
      try {
        providerResponse = JSON.parse(resendResponseBody) as unknown;
      } catch {
        providerResponse = resendResponseBody;
      }
    }

    const details = {
      message,
      statusCode,
      status,
      providerResponse,
      recipients: validRecipients,
    };
    console.error(
      `${DIRECTION_ALERT_LOG_PREFIX} send_failure ${JSON.stringify(details)}`
    );

    return {
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "direction_alert_send_failed",
      recipients: validRecipients,
      invalidRecipients,
      providerMessageId: null,
    };
  }
}

export async function sendDirectionSmsAlert(payload: {
  body: string;
}, options?: DirectionAlertDeliveryOptions): Promise<DirectionSmsResult> {
  if (options?.enabled === false) {
    console.info(DIRECTION_ALERT_LOG_PREFIX, "sms_disabled", {});

    return {
      sent: false,
      skipped: true,
      reason: "sms_disabled",
      recipients: [],
    };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const recipients = normalizeDirectionSmsRecipients(options?.recipients);

  if (!accountSid || !authToken || !fromNumber) {
    const payload = {
      hasAccountSid: Boolean(accountSid),
      hasAuthToken: Boolean(authToken),
      hasFromNumber: Boolean(fromNumber),
    };
    console.warn(DIRECTION_ALERT_LOG_PREFIX, "sms_config_missing", payload);

    return {
      sent: false,
      skipped: true,
      reason: "sms_not_configured",
      recipients,
    };
  }

  if (recipients.length === 0) {
    console.warn(DIRECTION_ALERT_LOG_PREFIX, "sms_recipients_missing", {});

    return {
      sent: false,
      skipped: true,
      reason: "sms_recipients_missing",
      recipients: [],
    };
  }

  try {
    await Promise.all(
      recipients.map(async (recipient) => {
        const body = new URLSearchParams({
          To: recipient,
          From: fromNumber,
          Body: payload.body,
        });

        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(
                `${accountSid}:${authToken}`
              ).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Twilio SMS failed for ${recipient}: ${errorText}`);
        }
      })
    );

    console.info(DIRECTION_ALERT_LOG_PREFIX, "sms_send_success", {
      recipientCount: recipients.length,
    });

    return {
      sent: true,
      skipped: false,
      reason: null,
      recipients,
    };
  } catch (error) {
    console.error(DIRECTION_ALERT_LOG_PREFIX, "sms_send_failure", {
      recipients,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return {
      sent: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "direction_sms_send_failed",
      recipients,
    };
  }
}

function formatHorodateurPunchSmsDateTime(iso: string | null | undefined) {
  if (!iso) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("fr-CA", {
      timeZone: DEFAULT_DIRECTION_ALERT_TIMEZONE,
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** SMS direction apres pointage horodateur employe (hors fil exception deja notifiee). */
export async function notifyDirectionHorodateurPunchSms(payload: {
  employeeName: string | null;
  eventLabelFr: string;
  occurredAt: string | null;
  company: AccountRequestCompany | null;
  smsEnabled: boolean;
  recipientSmsNumbers: string[];
}): Promise<DirectionSmsResult> {
  const companyLabel = payload.company
    ? getCompanyLabel(payload.company)
    : "Compagnie inconnue";
  const when = formatHorodateurPunchSmsDateTime(payload.occurredAt);
  const name = (payload.employeeName ?? "Employe").trim() || "Employe";
  const body = [
    "TAGORA Time — pointage",
    `${name} — ${payload.eventLabelFr}`,
    when,
    companyLabel,
  ]
    .filter(Boolean)
    .join("\n");

  console.info(HORODATEUR_PUNCH_SMS_LOG, "attempt", {
    eventLabel: payload.eventLabelFr,
    smsEnabled: payload.smsEnabled,
    recipientCount: payload.recipientSmsNumbers.length,
    hasOccurredAt: Boolean(payload.occurredAt),
  });

  const result = await sendDirectionSmsAlert(
    { body },
    {
      enabled: payload.smsEnabled,
      recipients: payload.recipientSmsNumbers,
    }
  );

  console.info(HORODATEUR_PUNCH_SMS_LOG, "result", {
    sent: result.sent,
    skipped: result.skipped,
    reason: result.reason,
    recipientCount: result.recipients.length,
  });

  return result;
}

type EmployeePunchSmsResult = {
  sent: boolean;
  skipped: boolean;
  reason: string | null;
  recipient: string | null;
};

/**
 * SMS personnel employe apres pointage (telephone fiche chauffeur uniquement — jamais DIRECTION_ALERT_SMS_NUMBERS).
 */
export async function notifyEmployeeHorodateurPunchSms(payload: {
  employeeId: number;
  employeeName: string | null;
  phoneRaw: string | null | undefined;
  eventType: string;
  eventLabelFr: string;
  occurredAt: string | null;
  company: AccountRequestCompany | null;
  preferenceEnabled: boolean;
}): Promise<EmployeePunchSmsResult> {
  const phoneE164 = normalizePhoneToTwilioE164(payload.phoneRaw);
  const phonePresent = Boolean(phoneE164);

  const logBase = {
    sms_target_type: "employee" as const,
    employee_id: payload.employeeId,
    event_type: payload.eventType,
    phone_present: phonePresent,
    preference_enabled: payload.preferenceEnabled,
  };

  if (!payload.preferenceEnabled) {
    console.info("[horodateur-employee-sms]", {
      ...logBase,
      sms_skipped: true,
      reason: "preference_disabled",
    });
    return {
      sent: false,
      skipped: true,
      reason: "preference_disabled",
      recipient: null,
    };
  }

  if (!phonePresent) {
    console.warn("[horodateur-employee-sms]", {
      ...logBase,
      sms_skipped: true,
      reason: "phone_missing_or_invalid_e164",
    });
    return {
      sent: false,
      skipped: true,
      reason: "sms_recipient_missing",
      recipient: null,
    };
  }

  const companyLabel = payload.company ? getCompanyLabel(payload.company) : "";
  const when = formatHorodateurPunchSmsDateTime(payload.occurredAt);
  const bodyText = [
    "TAGORA Time — votre pointage",
    payload.eventLabelFr,
    when,
    companyLabel,
  ]
    .filter(Boolean)
    .join("\n");

  console.info("[horodateur-employee-sms]", { ...logBase, sms_attempt: true });

  const result = await sendSmsToPhone({ phone: phoneE164, body: bodyText });

  if (result.sent) {
    console.info("[horodateur-employee-sms]", {
      ...logBase,
      sms_sent: true,
      to_suffix: phoneE164.length > 4 ? phoneE164.slice(-4) : null,
    });
  } else if (result.skipped) {
    console.warn("[horodateur-employee-sms]", {
      ...logBase,
      sms_skipped: true,
      reason: result.reason,
    });
  } else {
    console.error("[horodateur-employee-sms]", {
      ...logBase,
      sms_failed: true,
      reason: result.reason,
    });
  }

  return {
    sent: result.sent,
    skipped: result.skipped,
    reason: result.reason,
    recipient: result.recipient,
  };
}

export async function sendSmsToPhone(payload: {
  phone: string | null | undefined;
  body: string;
}) {
  const normalizedPhone = normalizePhoneToTwilioE164(payload.phone ?? "");
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!normalizedPhone) {
    return {
      sent: false,
      skipped: true,
      reason: "sms_recipient_missing",
      recipient: null,
    } as const;
  }

  if (!accountSid || !authToken || !fromNumber) {
    return {
      sent: false,
      skipped: true,
      reason: "sms_not_configured",
      recipient: normalizedPhone,
    } as const;
  }

  try {
    const body = new URLSearchParams({
      To: normalizedPhone,
      From: fromNumber,
      Body: payload.body,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${accountSid}:${authToken}`
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Twilio SMS failed: ${errorText}`);
    }

    return {
      sent: true,
      skipped: false,
      reason: null,
      recipient: normalizedPhone,
    } as const;
  } catch (error) {
    console.error(DIRECTION_ALERT_LOG_PREFIX, "employee_sms_send_failure", {
      recipient: normalizedPhone,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return {
      sent: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "employee_sms_send_failed",
      recipient: normalizedPhone,
    } as const;
  }
}

function buildHorodateurExceptionDirectionSmsBody(options: {
  isReminder: boolean;
  employeeName: string | null | undefined;
  noteShort: string | null;
  quickPair: { approveUrl: string; rejectUrl: string } | null;
  openUrl: string | null;
}) {
  const head = options.isReminder ? "TAGORA Time (rappel)" : "TAGORA Time";
  const name = options.employeeName?.trim() || "employé";
  const parts: string[] = [`${head} : exception horodateur de ${name}.`];
  if (options.noteShort) {
    parts.push(`Note : ${options.noteShort}`);
  }
  if (options.quickPair?.approveUrl) {
    parts.push(`Approuver : ${options.quickPair.approveUrl}`);
  }
  if (options.quickPair?.rejectUrl) {
    parts.push(`Refuser : ${options.quickPair.rejectUrl}`);
  }
  if (options.openUrl && /^https?:\/\//i.test(options.openUrl)) {
    parts.push(`Horodateur : ${options.openUrl}`);
  }
  return parts.join(" ");
}

function truncateHorodateurSmsNote(text: string, max: number) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

export async function notifyEmployeeHorodateurExceptionDecision(options: {
  employee: HorodateurPhase1EmployeeProfile;
  outcome: "approved" | "rejected";
  exceptionId: string;
}): Promise<{ emailStatus: string; smsStatus: string }> {
  const { employee, outcome, exceptionId } = options;
  const logPrefix = "[horodateur-exception-employee-notify]";
  const baseUrl = resolvePublicAppBaseUrl();
  const linkLine = baseUrl ? `${baseUrl}/employe/horodateur` : "/employe/horodateur";
  const { firstName } = splitFullName(employee.fullName ?? "");

  let admin: ReturnType<typeof createAdminSupabaseClient> | null = null;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    admin = null;
  }

  const emailKey =
    outcome === "approved"
      ? "horodateur_exception_approved_employee_email"
      : "horodateur_exception_rejected_employee_email";
  const smsKey =
    outcome === "approved"
      ? "horodateur_exception_approved_employee_sms"
      : "horodateur_exception_rejected_employee_sms";

  const templateVars: Record<string, string | undefined> = {
    employee_name: employee.fullName ?? firstName,
    employee_email: employee.email ?? "",
    employee_phone: employee.phoneNumber ?? "",
    action_url: linkLine,
    app_url: baseUrl ?? "",
    decision_note: "",
  };

  const emailTry = await trySendCommunicationEmployeeEmail({
    supabase: admin,
    templateKey: emailKey,
    audience: "employee",
    variables: templateVars,
    toEmail: employee.email,
  });

  let emailStatus = "skipped";
  const email = employee.email?.trim().toLowerCase() ?? "";

  if (emailTry.usedTemplate) {
    if (!email || !isValidEmail(email)) {
      emailStatus = "no_valid_email";
    } else if (emailTry.skipped) {
      emailStatus = "skipped";
    } else if (emailTry.ok) {
      emailStatus = "sent";
    } else {
      emailStatus = "error";
    }
  } else {
    if (admin) {
      await createMissingCommunicationTemplateAlert(admin, emailKey, "email", "employee");
    }

    const subject =
      outcome === "approved"
        ? "Votre exception horodateur a été approuvée"
        : "Votre exception horodateur a été refusée";

    const textBody =
      outcome === "approved"
        ? `Bonjour ${firstName},\n\nVotre demande d'exception horodateur a été approuvée.\n\nVeuillez consulter votre horodateur dans TAGORA Time.\n\n${linkLine}`
        : `Bonjour ${firstName},\n\nVotre demande d'exception horodateur a été refusée.\n\nVeuillez consulter le détail dans TAGORA Time.\n\n${linkLine}`;

    const htmlBody = `<p>Bonjour ${escapeHtml(firstName)},</p><p>${
      outcome === "approved"
        ? "Votre demande d’exception horodateur a été <strong>approuvée</strong>."
        : "Votre demande d’exception horodateur a été <strong>refusée</strong>."
    }</p><p>Veuillez consulter votre horodateur dans TAGORA Time.</p><p><a href="${escapeHtml(linkLine)}">${escapeHtml(linkLine)}</a></p>`;

    if (email && isValidEmail(email)) {
      const apiKey = process.env.RESEND_API_KEY;
      const fromEmailResolution = resolveResendFromEmail(process.env.RESEND_FROM_EMAIL);
      const fromEmail = fromEmailResolution.fromEmail;
      if (apiKey && fromEmail) {
        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [email],
              subject,
              text: textBody,
              html: `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a;">${htmlBody}</body></html>`,
            }),
          });
          if (!response.ok) {
            const raw = await response.text();
            throw new Error(`Resend ${response.status}: ${raw}`);
          }
          emailStatus = "sent";
        } catch (error) {
          emailStatus = "error";
          console.error(logPrefix, {
            exceptionId,
            employeeId: employee.employeeId,
            outcome,
            email,
            emailStatus,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        emailStatus = "email_config_missing";
        console.error(logPrefix, {
          exceptionId,
          employeeId: employee.employeeId,
          outcome,
          email,
          emailStatus,
        });
      }
    } else {
      emailStatus = "no_valid_email";
    }
  }

  const smsTry = await trySendCommunicationEmployeeSms({
    supabase: admin,
    templateKey: smsKey,
    audience: "employee",
    variables: templateVars,
    phone: employee.phoneNumber,
  });

  let smsStatus = "skipped";
  if (smsTry.usedTemplate) {
    if (smsTry.sent) smsStatus = "sent";
    else if (smsTry.skipped) smsStatus = "skipped";
    else smsStatus = "error";
  } else {
    if (admin) {
      await createMissingCommunicationTemplateAlert(admin, smsKey, "sms", "employee");
    }
    const horodateurUrl = baseUrl ? `${baseUrl}/employe/horodateur` : "";
    const smsBody =
      outcome === "approved"
        ? `TAGORA Time : votre exception horodateur a été approuvée. Consultez votre horodateur.${horodateurUrl ? ` ${horodateurUrl}` : ""}`
        : `TAGORA Time : votre exception horodateur a été refusée. Consultez votre horodateur.${horodateurUrl ? ` ${horodateurUrl}` : ""}`;

    try {
      const smsResult = await sendSmsToPhone({
        phone: employee.phoneNumber,
        body: smsBody,
      });
      if (smsResult.sent) smsStatus = "sent";
      else if (smsResult.skipped) smsStatus = smsResult.reason ?? "skipped";
      else smsStatus = smsResult.reason ?? "error";
    } catch (error) {
      smsStatus = "error";
      console.error(logPrefix, {
        exceptionId,
        employeeId: employee.employeeId,
        outcome,
        smsStatus,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.info(logPrefix, {
    exceptionId,
    employeeId: employee.employeeId,
    outcome,
    email: email || null,
    emailStatus,
    smsStatus,
  });

  return { emailStatus, smsStatus };
}

export async function notifyDirectionOfHorodateurException(
  payload: HorodateurExceptionNotificationPayload & {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    recipientEmails?: string[];
    recipientSmsNumbers?: string[];
    isReminder?: boolean;
  }
) {
  const managementUrl = payload.managementUrl ?? "/direction/horodateur";
  const formattedOccurredAt = formatAlertDateTime(payload.occurredAt);
  const formattedRequestedAt = formatAlertDateTime(payload.requestedAt);
  const emailSubject = payload.isReminder
    ? "TAGORA Time — Rappel : exception horodateur à traiter"
    : "TAGORA Time — Exception horodateur à traiter";

  let quickPair: { approveUrl: string; rejectUrl: string } | null = null;
  let quickPairIssueMessage: string | null = null;
  try {
    quickPair = await issueHorodateurExceptionQuickActionPair(payload.exceptionId);
  } catch (error) {
    quickPairIssueMessage = error instanceof Error ? error.message : String(error);
    console.error("[horodateur-exception-quick-action]", "issue_failed", {
      exceptionId: payload.exceptionId,
      message: quickPairIssueMessage,
    });
  }

  const employeeNote =
    payload.employeeNote && payload.employeeNote.trim()
      ? payload.employeeNote.trim()
      : null;

  const phoneRaw = payload.employeePhone?.trim();
  const phoneDisplay = phoneRaw && phoneRaw.length > 0 ? phoneRaw : "-";

  const companyLabel =
    payload.company && typeof payload.company === "string" && payload.company !== "all"
      ? getCompanyLabel(payload.company as AccountRequestCompany)
      : "-";

  const directionLink = buildManagementUrl(managementUrl) ?? managementUrl;
  const resolvedBaseUrl = resolvePublicAppBaseUrl();
  const rawNextPublic = process.env.NEXT_PUBLIC_APP_URL?.trim() || null;
  const actionUrl =
    directionLink && /^https?:\/\//i.test(directionLink)
      ? directionLink
      : resolvedBaseUrl
        ? `${resolvedBaseUrl}${managementUrl.startsWith("/") ? managementUrl : `/${managementUrl}`}`
        : managementUrl;

  if (!quickPair) {
    console.error("[horodateur-exception-quick-action-links-missing]", {
      exceptionId: payload.exceptionId,
      appUrl: resolvedBaseUrl,
      rawNextPublicAppUrl: rawNextPublic,
      hasActorUuid: Boolean(getHorodateurQuickActionActorUserId()),
      tokenError: quickPairIssueMessage,
      message: !resolvedBaseUrl
        ? "Aucune URL publique résolue (NEXT_PUBLIC_APP_URL / APP_PUBLIC_BASE_URL / VERCEL_URL) — impossible de construire les liens Approuver / Refuser."
        : quickPairIssueMessage ??
          "issueHorodateurExceptionQuickActionPair returned null (voir tokenError).",
    });
  }

  /**
   * Toujours utiliser le HTML transactionnel riche (boutons Approuver / Refuser).
   * Le module Communications (texte seul) masquait ces actions dans le courriel.
   */
  const emailResult = await sendDirectionAlert(
    {
      alertType: "horodateur_exception",
      classification: "direction_action_required",
      subject: emailSubject,
      summary:
        payload.isReminder
          ? "Une exception horodateur est toujours en attente d’approbation et requiert un suivi de la direction."
          : "Une exception horodateur est en attente d’approbation et requiert une intervention rapide de la direction.",
      requesterLabel: "Employé",
      requesterName: payload.employeeName,
      requesterEmail: payload.employeeEmail,
      requesterPhone: phoneDisplay === "-" ? null : phoneDisplay,
      company: payload.company ?? null,
      requestedAt: payload.requestedAt,
      requestId: payload.exceptionId,
      managementUrl,
      managementLabel: "Ouvrir l’horodateur direction",
      quickApproveUrl: quickPair?.approveUrl ?? null,
      quickRejectUrl: quickPair?.rejectUrl ?? null,
      details: {
        Employé: payload.employeeName,
        Courriel: payload.employeeEmail ?? "-",
        Téléphone: phoneDisplay,
        Compagnie: companyLabel,
        "Type d’exception": payload.exceptionType,
        "Motif système": payload.reasonLabel,
        "Note employé": employeeNote ?? "Aucune note fournie.",
        "Heure de l’événement": formattedOccurredAt,
        "Heure de création (demande)": formattedRequestedAt,
        "Identifiant exception": payload.exceptionId,
        "Type d’envoi": payload.isReminder ? "Rappel" : "Notification initiale",
      },
    },
    {
      enabled: payload.emailEnabled,
      recipients: payload.recipientEmails,
    }
  );

  const noteForSms = employeeNote
    ? truncateHorodateurSmsNote(employeeNote, 80)
    : null;

  const smsOpenUrl =
    actionUrl && /^https?:\/\//i.test(actionUrl) ? actionUrl : null;

  if (
    resolvedBaseUrl &&
    (resolvedBaseUrl.includes("localhost") || resolvedBaseUrl.includes("127.0.0.1"))
  ) {
    console.warn("[horodateur-exception-sms-localhost]", {
      exceptionId: payload.exceptionId,
      resolvedAppUrl: resolvedBaseUrl,
      message:
        "L’URL publique pointe vers localhost — les liens du SMS ne fonctionneront pas sur un téléphone externe (localhost = l’appareil lui-même). Pour tester sur cellulaire : tunnel public HTTPS (ex. cloudflared), puis NEXT_PUBLIC_APP_URL=https://.... ; redémarrer ; créer une nouvelle exception.",
    });
  }

  const smsBody = buildHorodateurExceptionDirectionSmsBody({
    isReminder: Boolean(payload.isReminder),
    employeeName: payload.employeeName ?? payload.employeeEmail,
    noteShort: noteForSms,
    quickPair,
    openUrl: smsOpenUrl,
  });

  const smsResult = await sendDirectionSmsAlert(
    { body: smsBody },
    {
      enabled: payload.smsEnabled,
      recipients: payload.recipientSmsNumbers,
    }
  );

  return {
    email: emailResult,
    sms: smsResult,
  };
}

export async function notifyHorodateurLateness(
  payload: HorodateurLatenessNotificationPayload
) {
  const managementUrl = payload.managementUrl ?? "/direction/horodateur";
  const formattedScheduledStart = formatAlertDateTime(payload.scheduledStartAt);
  const formattedDetectedAt = formatAlertDateTime(payload.detectedAt);

  const email = await sendDirectionAlert(
    {
      alertType: "horodateur_lateness",
      classification: "direction_action_required",
      subject: "TAGORA Time — Retard horodateur signalé",
      summary:
        "Un employé n’a pas commencé son quart à l’heure prévue et requiert un suivi rapide de la direction.",
      requesterLabel: "Employé",
      requesterName: payload.employeeName,
      requesterPhone: payload.employeePhone,
      requestedAt: payload.detectedAt,
      requestId: `${payload.employeeName ?? "employe"}-${payload.scheduledStartAt}`,
      managementUrl,
      managementLabel: "Ouvrir l’horodateur direction",
      details: {
        Employé: payload.employeeName,
        Téléphone: payload.employeePhone,
        "Heure prévue": formattedScheduledStart,
        "Heure actuelle": formattedDetectedAt,
        "Type d’alerte": "Retard employé",
      },
    },
    {
      enabled: payload.emailEnabled,
      recipients: payload.recipientEmails,
    }
  );

  const directionSms = await sendDirectionSmsAlert(
    {
      body: [
        "Retard horodateur TAGORA",
        `Employe: ${payload.employeeName ?? "-"}`,
        `Prevu: ${formattedScheduledStart}`,
        `Actuel: ${formattedDetectedAt}`,
        `Lien: ${buildManagementUrl(managementUrl) ?? managementUrl}`,
      ].join(" | "),
    },
    {
      enabled: payload.smsEnabled,
      recipients: payload.recipientSmsNumbers,
    }
  );

  const employeeSms =
    payload.employeeSmsEnabled === false
      ? {
          sent: false,
          skipped: true,
          reason: "employee_sms_disabled",
          recipient: normalizePhoneNumber(payload.employeePhone ?? ""),
        }
      : await sendSmsToPhone({
          phone: payload.employeePhone,
          body: [
            "TAGORA Time",
            `Votre quart devait commencer a ${formattedScheduledStart}.`,
            `Heure actuelle: ${formattedDetectedAt}.`,
            "Si vous etes en route ou si une correction est requise, contactez la direction.",
          ].join(" "),
        });

  return {
    email,
    directionSms,
    employeeSms,
  };
}

export async function notifyDirectionOfAccountRequest(
  payload: AccountRequestNotificationPayload
) {
  const { firstName, lastName } = splitFullName(payload.fullName);

  return sendDirectionAlert({
    alertType: "account_request",
    classification: "direction_action_required",
    subject: "TAGORA Time — Nouvelle demande de compte",
    summary:
      "Une nouvelle demande de compte a été enregistrée et requiert une intervention de la direction.",
    requesterLabel: "Demandeur",
    requesterName: payload.fullName,
    requesterEmail: payload.email,
    requesterPhone: payload.phone,
    company: payload.company,
    requestedAt: payload.createdAt,
    requestId: payload.requestId,
    managementUrl: payload.managementUrl ?? "/direction/demandes-comptes",
    managementLabel: "Ouvrir les demandes de comptes",
    details: {
      Prénom: firstName,
      Nom: lastName,
      Courriel: payload.email,
      Téléphone: payload.phone,
      Compagnie: getCompanyLabel(payload.company),
      "Poste ou role demande":
        payload.requestedRole === "direction" ? "Direction" : "Employé",
      "Portail source":
        payload.portalSource === "direction" ? "Direction" : "Employé",
      "Permissions demandees":
        payload.requestedPermissions.length > 0
          ? payload.requestedPermissions.join(", ")
          : "-",
      Message: payload.message,
      "Date et heure de la demande": formatAlertDateTime(payload.createdAt),
      "Identifiant de la demande": payload.requestId,
    },
  });
}

function getAuthorizationRequestPresentation(requestType: string) {
  const label =
    AUTHORIZATION_REQUEST_TYPE_LABELS[requestType] ?? humanizeKey(requestType);

  if (requestType === "time_extension") {
    return {
      label,
      subject: "TAGORA Time — Demande de prolongement de temps",
      summary:
        "Un employé a soumis une demande de prolongement de temps qui requiert une approbation de la direction.",
    };
  }

  return {
    label,
    subject: "TAGORA Time — Demande d’autorisation",
    summary:
      "Une demande nécessitant une validation ou une intervention de la direction a été enregistrée.",
  };
}

function normalizeAuthorizationRequestDetails(
  requestType: string,
  requestedValue: Record<string, unknown>
) {
  const baseEntries = Object.entries(requestedValue).map(([key, value]) => {
    if (key === "planned_start" || key === "start_time" || key === "heure_debut") {
      return ["Heure de début prévue", value] as const;
    }

    if (key === "planned_end" || key === "end_time" || key === "heure_fin") {
      return ["Heure de fin prévue", value] as const;
    }

    if (
      key === "extra_duration" ||
      key === "additional_duration" ||
      key === "duration_requested"
    ) {
      return ["Durée supplémentaire demandée", value] as const;
    }

    if (key === "task" || key === "task_name") {
      return ["Tâche liée", value] as const;
    }

    if (key === "delivery_id" || key === "livraison_id") {
      return ["Livraison liée", value] as const;
    }

    if (key === "dossier_id") {
      return ["Dossier lié", value] as const;
    }

    if (key === "date") {
      return ["Date", value] as const;
    }

    if (key === "reason") {
      return ["Motif", value] as const;
    }

    if (key === "device_type") {
      return ["Type d’appareil", value] as const;
    }

    if (key === "qr_token_present") {
      return ["Jeton QR présent", value] as const;
    }

    if (key === "latitude") {
      return ["Latitude", value] as const;
    }

    if (key === "longitude") {
      return ["Longitude", value] as const;
    }

    return [humanizeKey(key), value] as const;
  });

  if (baseEntries.length === 0 && requestType === "time_extension") {
    return {
      Date: "-",
      "Heure de début prévue": "-",
      "Heure de fin prévue": "-",
      "Durée supplémentaire demandée": "-",
    };
  }

  return Object.fromEntries(baseEntries);
}

export async function notifyDirectionOfAuthorizationRequest(
  payload: AuthorizationRequestNotificationPayload
) {
  const presentation = getAuthorizationRequestPresentation(payload.requestType);

  return sendDirectionAlert({
    alertType:
      payload.requestType === "time_extension"
        ? "time_extension_request"
        : "authorization_request",
    classification: "direction_action_required",
    subject: presentation.subject,
    summary: presentation.summary,
    requesterLabel: "Employé",
    requesterName: payload.requesterName,
    requesterEmail: payload.requesterEmail,
    requesterPhone: payload.requesterPhone,
    company: payload.company,
    requestedAt: payload.requestedAt,
    requestId: payload.requestId,
    managementUrl: payload.managementUrl,
    managementLabel: "Ouvrir la supervision direction",
    details: {
      "Type de demande": presentation.label,
      Employé: payload.requesterName,
      Courriel: payload.requesterEmail,
      Téléphone: payload.requesterPhone,
      Compagnie:
        typeof payload.company === "string"
          ? getCompanyLabel(payload.company as AccountRequestCompany)
          : "-",
      Justification: payload.justification,
      "Date et heure de la demande": formatAlertDateTime(payload.requestedAt),
      "Identifiant de la demande": payload.requestId,
      ...normalizeAuthorizationRequestDetails(
        payload.requestType,
        payload.requestedValue
      ),
    },
  });
}

export async function sendDeliveryTrackingSms(
  payload: DeliveryTrackingSmsPayload
) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return {
      sent: false,
      skipped: true,
      reason: "sms_not_configured",
    } as const;
  }

  const salutation = payload.clientName?.trim()
    ? `Bonjour ${payload.clientName.trim()}`
    : "Bonjour";
  const smsText = `${salutation}, votre livraison est ${payload.statusLabel.toLowerCase()} avec ${payload.companyLabel}. Suivi en direct : ${payload.trackingUrl}`;

  const body = new URLSearchParams({
    To: payload.phone,
    From: fromNumber,
    Body: smsText,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twilio SMS failed: ${errorText}`);
  }

  return {
    sent: true,
    skipped: false,
    reason: null,
  } as const;
}

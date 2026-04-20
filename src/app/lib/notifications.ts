import "server-only";

import {
  getCompanyLabel,
  isValidEmail,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { normalizePhoneNumber } from "@/app/lib/timeclock-api.shared";

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
const DEFAULT_DIRECTION_ALERT_TIMEZONE = "America/Toronto";
const AUTHORIZATION_REQUEST_TYPE_LABELS: Record<string, string> = {
  early_start: "Debut de quart hors horaire",
  out_of_zone_punch: "Pointage hors zone",
  lunch_shift_change: "Modification de pause ou diner",
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

  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone:
      process.env.DIRECTION_ALERT_TIMEZONE ?? DEFAULT_DIRECTION_ALERT_TIMEZONE,
  }).format(new Date(value));
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

function normalizeDirectionAlertRecipients(rawValues?: string[]) {
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

function normalizeDirectionSmsRecipients(rawValues?: string[]) {
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (!baseUrl) {
    return null;
  }

  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${baseUrl}${normalizedPath}`;
}

function buildDirectionAlertText(payload: DirectionAlertPayload) {
  const lines = [
    "Alerte direction - TAGORA Time",
    "",
    `Type d alerte: ${payload.alertType}`,
    `Classification: ${payload.classification}`,
    `Resume: ${payload.summary}`,
    "",
    `${payload.requesterLabel ?? "Demandeur"}: ${payload.requesterName ?? "-"}`,
    `Courriel: ${payload.requesterEmail ?? "-"}`,
    `Telephone: ${payload.requesterPhone ?? "-"}`,
    `Compagnie: ${
      typeof payload.company === "string"
        ? getCompanyLabel(payload.company as AccountRequestCompany)
        : "-"
    }`,
    `Date et heure: ${formatAlertDateTime(payload.requestedAt)}`,
    `Identifiant: ${payload.requestId ?? "-"}`,
    "",
    "Details:",
  ];

  for (const [label, rawValue] of Object.entries(payload.details ?? {})) {
    lines.push(`- ${label}: ${formatDetailValue(rawValue)}`);
  }

  if (payload.managementUrl) {
    lines.push("");
    lines.push(
      `${payload.managementLabel ?? "Lien de gestion"}: ${payload.managementUrl}`
    );
  }

  return lines.join("\n");
}

function buildDirectionAlertHtml(payload: DirectionAlertPayload) {
  const rows = [
    ["Type d alerte", payload.alertType],
    ["Classification", payload.classification],
    [payload.requesterLabel ?? "Demandeur", payload.requesterName ?? "-"],
    ["Courriel", payload.requesterEmail ?? "-"],
    ["Telephone", payload.requesterPhone ?? "-"],
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
          <td style="padding:10px 12px;border:1px solid #dbe4f0;background:#f8fafc;font-weight:700;">${escapeHtml(String(label))}</td>
          <td style="padding:10px 12px;border:1px solid #dbe4f0;">${escapeHtml(String(value ?? "-"))}</td>
        </tr>
      `
    )
    .join("");

  const detailRows = Object.entries(payload.details ?? {})
    .map(
      ([label, rawValue]) => `
        <tr>
          <td style="padding:10px 12px;border:1px solid #dbe4f0;background:#f8fafc;font-weight:700;">${escapeHtml(label)}</td>
          <td style="padding:10px 12px;border:1px solid #dbe4f0;white-space:pre-wrap;">${escapeHtml(
            formatDetailValue(rawValue)
          )}</td>
        </tr>
      `
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#f3f6fb;padding:24px;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe4f0;border-radius:16px;overflow:hidden;">
        <div style="padding:24px 28px;background:#0f2948;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">TAGORA Time</div>
          <h1 style="margin:10px 0 0;font-size:24px;line-height:1.3;">${escapeHtml(
            payload.subject
          )}</h1>
        </div>
        <div style="padding:24px 28px;">
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">${escapeHtml(
            payload.summary
          )}</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 22px;">
            <tbody>${rows}</tbody>
          </table>
          <h2 style="margin:0 0 12px;font-size:18px;">Details complets</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tbody>${detailRows || `
              <tr>
                <td style="padding:10px 12px;border:1px solid #dbe4f0;">Aucun detail supplementaire.</td>
              </tr>
            `}</tbody>
          </table>
          ${
            payload.managementUrl
              ? `
                <div style="margin-top:22px;">
                  <a href="${escapeHtml(payload.managementUrl)}" style="display:inline-block;background:#0f2948;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">
                    ${escapeHtml(payload.managementLabel ?? "Ouvrir la page de gestion")}
                  </a>
                </div>
              `
              : ""
          }
        </div>
      </div>
    </div>
  `;
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
  const fromEmail = process.env.RESEND_FROM_EMAIL;
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

  if (!isValidEmail(fromEmail)) {
    console.error(DIRECTION_ALERT_LOG_PREFIX, "invalid_from_email", {
      alertType: payload.alertType,
      fromEmail,
    });

    return {
      ok: false,
      skipped: true,
      reason: "invalid_from_email",
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
    console.error(DIRECTION_ALERT_LOG_PREFIX, "send_failure", {
      alertType: payload.alertType,
      requestId: payload.requestId ?? null,
      recipients: validRecipients,
      invalidRecipients,
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });

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
    console.info(DIRECTION_ALERT_LOG_PREFIX, "sms_config_missing", {
      hasAccountSid: Boolean(accountSid),
      hasAuthToken: Boolean(authToken),
      hasFromNumber: Boolean(fromNumber),
    });

    return {
      sent: false,
      skipped: true,
      reason: "sms_not_configured",
      recipients,
    };
  }

  if (recipients.length === 0) {
    console.info(DIRECTION_ALERT_LOG_PREFIX, "sms_recipients_missing", {});

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

export async function sendSmsToPhone(payload: {
  phone: string | null | undefined;
  body: string;
}) {
  const normalizedPhone = normalizePhoneNumber(payload.phone ?? "");
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
  const reminderPrefix = payload.isReminder ? "Rappel - " : "";

  const emailResult = await sendDirectionAlert({
    alertType: "horodateur_exception",
    classification: "direction_action_required",
    subject: `${reminderPrefix}Exception horodateur en attente - TAGORA Time`,
    summary:
      payload.isReminder
        ? "Une exception horodateur est toujours en attente d approbation et requiert un suivi de la direction."
        : "Une exception horodateur est en attente d approbation et requiert une intervention rapide de la direction.",
    requesterLabel: "Employe",
    requesterName: payload.employeeName,
    requesterEmail: payload.employeeEmail,
    requestedAt: payload.requestedAt,
    requestId: payload.exceptionId,
    managementUrl,
    managementLabel: "Ouvrir l horodateur direction",
    details: {
      Employe: payload.employeeName,
      Courriel: payload.employeeEmail,
      "Type d exception": payload.exceptionType,
      Motif: payload.reasonLabel,
        "Heure de l evenement": formattedOccurredAt,
        "Heure de creation": formattedRequestedAt,
        "Identifiant de l exception": payload.exceptionId,
        "Type d envoi": payload.isReminder ? "Rappel" : "Notification initiale",
      },
    }, {
      enabled: payload.emailEnabled,
      recipients: payload.recipientEmails,
    });

  const smsResult = await sendDirectionSmsAlert({
    body: [
      payload.isReminder ? "Rappel horodateur TAGORA" : "Alerte horodateur TAGORA",
      `Employe: ${payload.employeeName ?? payload.employeeEmail ?? "-"}`,
      `Type: ${payload.exceptionType}`,
      `Motif: ${payload.reasonLabel}`,
      `Quand: ${formattedOccurredAt}`,
      `Lien: ${buildManagementUrl(managementUrl) ?? managementUrl}`,
    ].join(" | "),
  }, {
    enabled: payload.smsEnabled,
    recipients: payload.recipientSmsNumbers,
  });

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
      subject: "Retard horodateur detecte - TAGORA Time",
      summary:
        "Un employe n a pas commence son quart a l heure prevue et requiert un suivi rapide de la direction.",
      requesterLabel: "Employe",
      requesterName: payload.employeeName,
      requesterPhone: payload.employeePhone,
      requestedAt: payload.detectedAt,
      requestId: `${payload.employeeName ?? "employe"}-${payload.scheduledStartAt}`,
      managementUrl,
      managementLabel: "Ouvrir l horodateur direction",
      details: {
        Employe: payload.employeeName,
        Telephone: payload.employeePhone,
        "Heure prevue": formattedScheduledStart,
        "Heure actuelle": formattedDetectedAt,
        "Type d alerte": "Retard employe",
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
    subject: "Nouvelle demande de compte - TAGORA Time",
    summary:
      "Une nouvelle demande de compte a ete enregistree et requiert une intervention de la direction.",
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
      Prenom: firstName,
      Nom: lastName,
      Courriel: payload.email,
      Telephone: payload.phone,
      Compagnie: getCompanyLabel(payload.company),
      "Poste ou role demande":
        payload.requestedRole === "direction" ? "Direction" : "Employe",
      "Portail source":
        payload.portalSource === "direction" ? "Direction" : "Employe",
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
      subject: "Nouvelle demande de prolongement de temps - TAGORA Time",
      summary:
        "Un employe a soumis une demande de prolongement de temps qui requiert une approbation de la direction.",
    };
  }

  return {
    label,
    subject: "Nouvelle demande d autorisation - TAGORA Time",
    summary:
      "Une demande necessitant une validation ou une intervention de la direction a ete enregistree.",
  };
}

function normalizeAuthorizationRequestDetails(
  requestType: string,
  requestedValue: Record<string, unknown>
) {
  const baseEntries = Object.entries(requestedValue).map(([key, value]) => {
    if (key === "planned_start" || key === "start_time" || key === "heure_debut") {
      return ["Heure de debut prevue", value] as const;
    }

    if (key === "planned_end" || key === "end_time" || key === "heure_fin") {
      return ["Heure de fin prevue", value] as const;
    }

    if (
      key === "extra_duration" ||
      key === "additional_duration" ||
      key === "duration_requested"
    ) {
      return ["Duree supplementaire demandee", value] as const;
    }

    if (key === "task" || key === "task_name") {
      return ["Tache liee", value] as const;
    }

    if (key === "delivery_id" || key === "livraison_id") {
      return ["Livraison liee", value] as const;
    }

    if (key === "dossier_id") {
      return ["Dossier lie", value] as const;
    }

    if (key === "date") {
      return ["Date", value] as const;
    }

    if (key === "reason") {
      return ["Motif", value] as const;
    }

    if (key === "device_type") {
      return ["Type d appareil", value] as const;
    }

    if (key === "qr_token_present") {
      return ["Jeton QR present", value] as const;
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
      "Heure de debut prevue": "-",
      "Heure de fin prevue": "-",
      "Duree supplementaire demandee": "-",
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
    requesterLabel: "Employe",
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
      Employe: payload.requesterName,
      Courriel: payload.requesterEmail,
      Telephone: payload.requesterPhone,
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

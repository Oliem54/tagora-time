import "server-only";

import { isValidEmail } from "@/app/lib/account-requests.shared";
import {
  buildDeliveryTrackingUrl,
  resolveDeliveryCompanyLabel,
} from "@/app/lib/delivery-tracking";
import { resolveResendFromEmail } from "@/app/lib/resend-email";

export type EnRouteNotifyPayload = {
  clientName: string | null;
  phone: string | null;
  email: string | null;
  trackingUrl: string;
  companyLabel: string;
  estimatedArrival: string | null;
  estimatedMinutes: number | null;
};

export type ChannelResult =
  | { sent: boolean; skipped: boolean; reason: string | null }
  | { sent: true; skipped: false; reason: null };

function buildEtaLine(payload: EnRouteNotifyPayload) {
  if (payload.estimatedArrival?.trim()) {
    return `Arrivee estimee vers ${payload.estimatedArrival.trim()}.`;
  }
  if (
    payload.estimatedMinutes != null &&
    Number.isFinite(payload.estimatedMinutes) &&
    payload.estimatedMinutes > 0
  ) {
    return `Arrivee estimee dans environ ${Math.round(payload.estimatedMinutes)} minutes.`;
  }
  return "Nous vous confirmons que notre livreur est en route.";
}

export function resolveClientEmailFromRecord(
  record: Record<string, unknown> | null | undefined
): string | null {
  if (!record) return null;
  const keys = [
    "courriel",
    "email",
    "courriel_client",
    "email_client",
    "courriel_contact",
    "contact_email",
  ];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && isValidEmail(value.trim())) {
      return value.trim().toLowerCase();
    }
  }
  return null;
}

export async function sendDeliveryEnRouteSms(
  payload: EnRouteNotifyPayload
): Promise<ChannelResult> {
  if (!payload.phone?.trim()) {
    return { sent: false, skipped: true, reason: "missing_client_phone" };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { sent: false, skipped: true, reason: "sms_not_configured" };
  }

  const salutation = payload.clientName?.trim()
    ? `Bonjour ${payload.clientName.trim()}`
    : "Bonjour";
  const etaLine = buildEtaLine(payload);
  const smsText = `${salutation}, notre livreur est en route avec ${payload.companyLabel}. ${etaLine} Suivi en direct : ${payload.trackingUrl}`;

  const body = new URLSearchParams({
    To: payload.phone.trim(),
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

  return { sent: true, skipped: false, reason: null };
}

export async function sendDeliveryEnRouteEmail(
  payload: EnRouteNotifyPayload
): Promise<ChannelResult> {
  if (!payload.email?.trim()) {
    return { sent: false, skipped: true, reason: "missing_client_email" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmailResolution = resolveResendFromEmail(process.env.RESEND_FROM_EMAIL);
  const fromEmail = fromEmailResolution.fromEmail;

  if (!apiKey || !fromEmail) {
    return { sent: false, skipped: true, reason: "email_not_configured" };
  }

  const salutation = payload.clientName?.trim()
    ? `Bonjour ${payload.clientName.trim()},`
    : "Bonjour,";
  const etaLine = buildEtaLine(payload);
  const subject = `${payload.companyLabel} — votre livreur est en route`;
  const text = `${salutation}

${etaLine}

Suivez votre livraison en direct : ${payload.trackingUrl}

Merci,
${payload.companyLabel}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [payload.email.trim()],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Resend email failed (${response.status}): ${raw}`);
  }

  return { sent: true, skipped: false, reason: null };
}

export async function notifyClientEnRoute(input: {
  livraison: {
    client: string | null;
    client_phone: string | null;
    company_context: string | null;
    tracking_enabled: boolean | null;
  };
  trackingToken: string;
  dossier: Record<string, unknown> | null;
  estimatedArrival: string | null;
  estimatedMinutes: number | null;
}) {
  const trackingEnabled = input.livraison.tracking_enabled ?? true;
  const trackingUrl = buildDeliveryTrackingUrl(input.trackingToken);
  const companyLabel = resolveDeliveryCompanyLabel(input.livraison.company_context);
  const email =
    resolveClientEmailFromRecord(input.dossier) ??
    resolveClientEmailFromRecord(input.livraison as Record<string, unknown>);

  const payload: EnRouteNotifyPayload = {
    clientName: input.livraison.client,
    phone: input.livraison.client_phone,
    email,
    trackingUrl,
    companyLabel,
    estimatedArrival: input.estimatedArrival,
    estimatedMinutes: input.estimatedMinutes,
  };

  let sms: ChannelResult = {
    sent: false,
    skipped: true,
    reason: "tracking_disabled",
  };
  let emailResult: ChannelResult = {
    sent: false,
    skipped: true,
    reason: "tracking_disabled",
  };

  if (trackingEnabled) {
    if (payload.phone) {
      try {
        sms = await sendDeliveryEnRouteSms(payload);
      } catch {
        sms = { sent: false, skipped: false, reason: "sms_send_failed" };
      }
    } else {
      sms = { sent: false, skipped: true, reason: "missing_client_phone" };
    }

    if (payload.email) {
      try {
        emailResult = await sendDeliveryEnRouteEmail(payload);
      } catch {
        emailResult = { sent: false, skipped: false, reason: "email_send_failed" };
      }
    } else {
      emailResult = { sent: false, skipped: true, reason: "missing_client_email" };
    }
  }

  return { trackingUrl, sms, email: emailResult };
}

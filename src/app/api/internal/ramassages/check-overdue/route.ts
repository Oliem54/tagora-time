import { NextRequest, NextResponse } from "next/server";
import {
  getRamassageAlertConfig,
  parseClientContact,
  requireDirectionOrAdmin,
} from "@/app/api/direction/ramassages/_lib";
import { isHorodateurInternalJobAuthorized } from "@/app/lib/internal-horodateur-cron-auth";
import { listDirectionAlertRecipients } from "@/app/lib/horodateur-v1/repository";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type PickupRow = Record<string, string | number | null | undefined>;
type ExistingReminderRow = {
  pickup_id: number;
  alert_sequence_number: number;
  sent_at: string | null;
};

const STOPPED_STATUSES = new Set([
  "livree",
  "ramassee",
  "ramasse",
  "completee",
  "complete",
  "annulee",
  "annule",
  "a_replanifier",
  "replanifiee",
  "replanifie",
]);

function isMissingPickupReminderAlertsTable(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const msg = String(error.message || "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    msg.includes("pickup_reminder_alerts") && msg.includes("schema cache") ||
    msg.includes("relation") && msg.includes("pickup_reminder_alerts") && msg.includes("does not exist")
  );
}

function computeDelayHours(expectedDate: string, expectedTime: string | null | undefined) {
  const safeTime = typeof expectedTime === "string" && expectedTime.trim() ? expectedTime : "00:00";
  const expectedTs = new Date(`${expectedDate}T${safeTime}:00`);
  if (Number.isNaN(expectedTs.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - expectedTs.getTime()) / (1000 * 60 * 60)));
}

function clientSubjectForSequence(sequenceNumber: number) {
  if (sequenceNumber === 1) return "Votre commande est toujours en attente de ramassage";
  if (sequenceNumber === 2) return "Rappel - votre commande est toujours disponible pour ramassage";
  return "Dernier rappel - commande toujours en attente de ramassage";
}

function clientBodyForSequence(sequenceNumber: number, commande: string, expectedDate: string) {
  if (sequenceNumber === 1) {
    return [
      "Bonjour,",
      "",
      `Notre systeme indique que votre commande etait prevue pour ramassage le ${expectedDate}, mais qu'elle n'a pas encore ete ramassee.`,
      "",
      "Votre commande est toujours disponible.",
      "",
      "Merci de communiquer avec nous pour confirmer votre ramassage ou replanifier une nouvelle date.",
      "",
      `Commande : ${commande}`,
      "",
      "Merci,",
      "L'equipe TAGORA / Oliem",
    ].join("\n");
  }
  if (sequenceNumber === 2) {
    return [
      "Bonjour,",
      "",
      `Nous vous rappelons que votre commande ${commande} est toujours en attente de ramassage depuis le ${expectedDate}.`,
      "",
      "Merci de communiquer avec nous afin de confirmer votre ramassage ou de replanifier une nouvelle date.",
      "",
      "Merci,",
      "L'equipe TAGORA / Oliem",
    ].join("\n");
  }
  return [
    "Bonjour,",
    "",
    `Votre commande ${commande} est toujours en attente de ramassage depuis le ${expectedDate}.`,
    "",
    "Merci de communiquer avec nous rapidement afin de confirmer votre ramassage ou de replanifier une nouvelle date.",
    "",
    "Merci,",
    "L'equipe TAGORA / Oliem",
  ].join("\n");
}

function clientSmsForSequence(sequenceNumber: number, commande: string, expectedDate: string) {
  if (sequenceNumber === 1) {
    return `Bonjour, votre commande ${commande} est toujours en attente de ramassage. Elle etait prevue le ${expectedDate}. Merci de nous contacter pour confirmer ou replanifier votre ramassage. TAGORA/Oliem`;
  }
  if (sequenceNumber === 2) {
    return `Rappel TAGORA/Oliem : votre commande ${commande} est toujours disponible pour ramassage depuis le ${expectedDate}. Merci de nous contacter pour confirmer ou replanifier.`;
  }
  return `Dernier rappel TAGORA/Oliem : votre commande ${commande} est toujours en attente de ramassage depuis le ${expectedDate}. Merci de nous contacter rapidement pour confirmer ou replanifier.`;
}

function internalSubjectForSequence(sequenceNumber: number) {
  if (sequenceNumber === 1) return "Ramassage non confirme - relance 24 h";
  if (sequenceNumber === 2) return "Ramassage toujours non confirme - relance 36 h";
  return "Ramassage non confirme - relance recurrente 36 h";
}

function internalBodyForSequence(options: {
  pickup: PickupRow;
  delayHours: number;
  sequenceNumber: number;
  appUrl: string;
}) {
  const delayDays = Math.floor(options.delayHours / 24);
  const commande = String(
    options.pickup.numero_commande || options.pickup.commande || options.pickup.reference || options.pickup.id || "-"
  );
  const facture = String(options.pickup.numero_facture || options.pickup.facture || "-");
  const status = String(options.pickup.statut || "-");
  const moduleLink = `${options.appUrl.replace(/\/$/, "")}/direction/ramassages`;
  return [
    "Un ramassage prevu n'a pas ete confirme.",
    "",
    `Numero de commande : ${commande}`,
    `Facture : ${facture}`,
    `Client : ${String(options.pickup.client || "-")}`,
    `Date prevue de ramassage : ${String(options.pickup.date_livraison || "-")}`,
    `Retard actuel : ${delayDays} jour(s) (${options.delayHours} h)`,
    `Niveau de relance : ${options.sequenceNumber}`,
    `Statut actuel : ${status}`,
    "Action recommandee : confirmer ou replanifier.",
    `Lien module ramassage/livraison : ${moduleLink}`,
  ].join("\n");
}

function resolveNextSequenceNumber(options: {
  delayHours: number;
  alert1Hours: number;
  alert2Hours: number;
  recurringHours: number;
  hasSequence1: boolean;
  hasSequence2: boolean;
  lastSequence: number;
  lastSentAt: string | null;
}) {
  if (options.delayHours >= options.alert1Hours && !options.hasSequence1) return 1;
  if (options.delayHours >= options.alert2Hours && !options.hasSequence2) return 2;
  if (!options.hasSequence2 || options.delayHours < options.alert2Hours) return null;
  const nextSequence = Math.max(3, options.lastSequence + 1);
  if (!options.lastSentAt) return nextSequence;
  const lastTs = Date.parse(options.lastSentAt);
  if (Number.isNaN(lastTs)) return nextSequence;
  const elapsed = Date.now() - lastTs;
  return elapsed >= options.recurringHours * 60 * 60 * 1000 ? nextSequence : null;
}

async function sendEmail(options: {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIRECTION_ALERT_FROM_EMAIL ?? "Tagora <noreply@tagora.local>";
  if (!apiKey || options.to.length === 0) {
    return { sent: false, skipped: true, messageId: null, error: "email_not_configured_or_missing_to" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: options.to,
      cc: options.cc && options.cc.length > 0 ? options.cc : undefined,
      subject: options.subject,
      text: options.text,
    }),
  });
  if (!response.ok) {
    return { sent: false, skipped: false, messageId: null, error: await response.text() };
  }
  const payload = (await response.json().catch(() => ({}))) as { id?: string };
  return { sent: true, skipped: false, messageId: payload.id ?? null, error: null };
}

async function sendClientSms(toPhone: string, text: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber || !toPhone.trim()) {
    return { sent: false, skipped: true, messageId: null, error: "sms_not_configured_or_missing_phone" };
  }
  const payload = new URLSearchParams({ To: toPhone.trim(), From: fromNumber, Body: text });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload,
  });
  if (!response.ok) {
    return { sent: false, skipped: false, messageId: null, error: await response.text() };
  }
  const body = (await response.json().catch(() => ({}))) as { sid?: string };
  return { sent: true, skipped: false, messageId: body.sid ?? null, error: null };
}

export async function POST(req: NextRequest) {
  try {
    const isInternal = isHorodateurInternalJobAuthorized(req);
    let supabase = createAdminSupabaseClient();
    if (!isInternal) {
      const auth = await requireDirectionOrAdmin(req);
      if (!auth.ok) return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
      supabase = auth.supabase;
    }

    const config = await getRamassageAlertConfig(supabase);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { data, error } = await supabase
      .from("livraisons_planifiees")
      .select("id, client, date_livraison, heure_prevue, statut, numero_commande, commande, reference, numero_facture, facture, courriel_client, email_client, courriel, telephone_client, telephone")
      .eq("type_operation", "ramassage_client");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const pending = ((data ?? []) as PickupRow[]).filter((row) => {
      const status = String(row.statut || "").toLowerCase();
      return Boolean(row.date_livraison) && !STOPPED_STATUSES.has(status);
    });
    if (!config.pickupReminderEnabled || pending.length === 0) {
      return NextResponse.json({
        success: true,
        overdueCount: 0,
        generatedAlerts: [],
        config,
        deliveries: {
          directionEmail: { sent: 0, skipped: true },
          clientEmail: { sent: 0, skipped: true },
          clientSms: { sent: 0, skipped: true },
        },
      });
    }

    const pickupIds = pending.map((p) => Number(p.id)).filter((id) => Number.isFinite(id));
    const { data: existingAlerts, error: existingError } = await supabase
      .from("pickup_reminder_alerts")
      .select("pickup_id, alert_sequence_number, sent_at")
      .in("pickup_id", pickupIds.length > 0 ? pickupIds : [-1]);
    if (existingError && !isMissingPickupReminderAlertsTable(existingError)) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    const existingByPickup = new Map<number, ExistingReminderRow[]>();
    for (const row of (existingAlerts ?? []) as ExistingReminderRow[]) {
      const list = existingByPickup.get(row.pickup_id) ?? [];
      list.push(row);
      existingByPickup.set(row.pickup_id, list);
    }

    const directionRecipients = await listDirectionAlertRecipients();
    const directionCcEmails = config.pickupReminderNotifyDirectionAdminEmail
      ? Array.from(
          new Set(
            directionRecipients
              .filter((r) => r.isDirectionAlertRecipient && r.alertEmailEnabled)
              .map((r) => r.email)
              .filter((v): v is string => Boolean(v))
          )
        )
      : [];

    let directionEmailSent = 0;
    let clientEmailSent = 0;
    let clientSmsSent = 0;
    const generatedAlerts: Array<{ pickupId: number; sequence: number; delayHours: number }> = [];

    for (const pickup of pending) {
      const pickupId = Number(pickup.id);
      const expectedDate = String(pickup.date_livraison || "");
      if (!Number.isFinite(pickupId) || !expectedDate) continue;

      const delayHours = computeDelayHours(
        expectedDate,
        typeof pickup.heure_prevue === "string" ? pickup.heure_prevue : null
      );
      const existing = (existingByPickup.get(pickupId) ?? []).sort(
        (a, b) => a.alert_sequence_number - b.alert_sequence_number
      );
      const last = existing[existing.length - 1];
      const nextSequence = resolveNextSequenceNumber({
        delayHours,
        alert1Hours: config.pickupReminderAlert1DelayHours,
        alert2Hours: config.pickupReminderAlert2DelayHours,
        recurringHours: config.pickupReminderRecurringDelayHours,
        hasSequence1: existing.some((r) => r.alert_sequence_number === 1),
        hasSequence2: existing.some((r) => r.alert_sequence_number === 2),
        lastSequence: last?.alert_sequence_number ?? 0,
        lastSentAt: last?.sent_at ?? null,
      });
      if (!nextSequence) continue;

      const contact = parseClientContact(pickup as Record<string, unknown>);
      const commande = String(pickup.numero_commande || pickup.commande || pickup.reference || pickup.id || "-");

      const internalEmail = directionCcEmails.length
        ? await sendEmail({
            to: directionCcEmails,
            subject: internalSubjectForSequence(nextSequence),
            text: internalBodyForSequence({ pickup, delayHours, sequenceNumber: nextSequence, appUrl }),
          })
        : { sent: false, skipped: true, messageId: null, error: null };

      const clientEmail =
        config.pickupReminderNotifyClientEmail && contact.email
          ? await sendEmail({
              to: [contact.email],
              cc: directionCcEmails,
              subject: clientSubjectForSequence(nextSequence),
              text: clientBodyForSequence(nextSequence, commande, expectedDate),
            })
          : { sent: false, skipped: true, messageId: null, error: null };

      const clientSms =
        config.pickupReminderNotifyClientSms && contact.phone
          ? await sendClientSms(contact.phone, clientSmsForSequence(nextSequence, commande, expectedDate))
          : { sent: false, skipped: true, messageId: null, error: null };

      await supabase.from("pickup_reminder_alerts").insert({
        pickup_id: pickupId,
        alert_sequence_number: nextSequence,
        alert_type: nextSequence <= 2 ? `initial_${nextSequence}` : "recurring_36h",
        scheduled_pickup_date: expectedDate,
        sent_at: new Date().toISOString(),
        to_email: config.pickupReminderNotifyClientEmail && contact.email ? contact.email : null,
        cc_emails: directionCcEmails,
        to_phone: config.pickupReminderNotifyClientSms && contact.phone ? contact.phone : null,
        email_status: clientEmail.sent ? "sent" : clientEmail.skipped ? "skipped" : "failed",
        sms_status: clientSms.sent ? "sent" : clientSms.skipped ? "skipped" : "failed",
        provider_email_message_id: clientEmail.messageId,
        provider_sms_message_id: clientSms.messageId,
        error_message: [clientEmail.error, clientSms.error].filter(Boolean).join(" | ") || null,
      });

      if (internalEmail.sent) directionEmailSent += 1;
      if (clientEmail.sent) clientEmailSent += 1;
      if (clientSms.sent) clientSmsSent += 1;

      generatedAlerts.push({ pickupId, sequence: nextSequence, delayHours });
    }

    return NextResponse.json({
      success: true,
      overdueCount: pending.length,
      generatedAlerts,
      config,
      recipients: { directionCcEmails },
      deliveries: {
        directionEmail: { sent: directionEmailSent, skipped: false },
        clientEmail: { sent: clientEmailSent, skipped: false },
        clientSms: { sent: clientSmsSent, skipped: false },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur interne check overdue." },
      { status: 500 }
    );
  }
}

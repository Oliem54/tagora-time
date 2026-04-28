import { NextRequest, NextResponse } from "next/server";
import { getRamassageAlertConfig, requireDirectionOrAdmin, dayDiff } from "@/app/api/direction/ramassages/_lib";
import { isHorodateurInternalJobAuthorized } from "@/app/lib/internal-horodateur-cron-auth";
import { listDirectionAlertRecipients } from "@/app/lib/horodateur-v1/repository";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

async function sendInternalEmail(recipients: string[], subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIRECTION_ALERT_FROM_EMAIL ?? "Tagora <noreply@tagora.local>";
  if (!apiKey || recipients.length === 0) return { sent: 0, skipped: true };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      text,
    }),
  });
  return { sent: response.ok ? recipients.length : 0, skipped: !response.ok };
}

async function sendInternalSms(numbers: string[], text: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber || numbers.length === 0) {
    return { sent: 0, skipped: true };
  }
  let sent = 0;
  for (const to of numbers) {
    const payload = new URLSearchParams({
      To: to,
      From: fromNumber,
      Body: text,
    });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
    });
    if (response.ok) sent += 1;
  }
  return { sent, skipped: false };
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
    const todayIso = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("livraisons_planifiees")
      .select("id, client, date_livraison, statut")
      .eq("type_operation", "ramassage_client");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const overdue = (data ?? []).filter((row) => {
      const status = String(row.statut || "").toLowerCase();
      if (["livree", "ramassee", "ramasse"].includes(status)) return false;
      const expected = String(row.date_livraison || "");
      if (!expected) return false;
      return dayDiff(todayIso, expected) >= config.delayDays;
    });

    const recipients = await listDirectionAlertRecipients();
    const recipientEmails = recipients
      .filter((r) => r.isDirectionAlertRecipient && r.alertEmailEnabled)
      .map((r) => r.email)
      .filter((v): v is string => Boolean(v));
    const recipientSms = recipients
      .filter((r) => r.isDirectionAlertRecipient && r.alertSmsEnabled)
      .map((r) => r.phoneNumber)
      .filter((v): v is string => Boolean(v));

    const subject = `[TAGORA] ${overdue.length} ramassage(s) en retard`;
    const message = overdue.length
      ? `Ramassages en retard detectes (${overdue.length}) au ${todayIso}. Consultez /direction/ramassages pour agir rapidement.`
      : `Aucun ramassage en retard detecte au ${todayIso}.`;
    const emailDelivery = config.emailEnabled
      ? await sendInternalEmail(recipientEmails, subject, message)
      : { sent: 0, skipped: true };
    const smsDelivery = config.smsEnabled
      ? await sendInternalSms(recipientSms, message)
      : { sent: 0, skipped: true };

    return NextResponse.json({
      success: true,
      overdueCount: overdue.length,
      overdue,
      config,
      recipients: {
        emails: recipientEmails,
        smsNumbers: recipientSms,
      },
      deliveries: {
        email: emailDelivery,
        sms: smsDelivery,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur interne check overdue." },
      { status: 500 }
    );
  }
}

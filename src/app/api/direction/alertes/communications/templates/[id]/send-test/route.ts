import { NextRequest, NextResponse } from "next/server";
import { isValidEmail } from "@/app/lib/account-requests.shared";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import {
  buildPreviewVariableMap,
  renderCommunicationTemplate,
  sendTemplatedDirectionEmail,
  type AppCommunicationTemplateRow,
} from "@/app/lib/communication-templates.server";
import { sendSmsToPhone } from "@/app/lib/notifications";
import { normalizePhoneNumber } from "@/app/lib/timeclock-api.shared";
import { resolveResendFromEmail } from "@/app/lib/resend-email";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TEST_PREFIX = "TEST TAGORA Time\n\n";

function textToSimpleEmailHtml(text: string): string {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const lines = text.split("\n");
  const inner = lines
    .map((line) => `<p style="margin:0 0 8px 0;">${escapeHtml(line)}</p>`)
    .join("");
  return `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a;line-height:1.5;">${inner}<p style="margin-top:16px;font-size:13px;color:#64748b;">TAGORA Time — envoi de test</p></body></html>`;
}

type SendTestBody = {
  email?: string | null;
  phone?: string | null;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (role !== "admin" && role !== "direction") {
    return NextResponse.json(
      { error: "Accès réservé à la direction et aux administrateurs." },
      { status: 403 }
    );
  }

  let body: SendTestBody = {};
  try {
    body = (await req.json()) as SendTestBody;
  } catch {
    body = {};
  }

  const { id } = await context.params;
  const supabase = createAdminSupabaseClient();
  const { data: row, error } = await supabase
    .from("app_communication_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
  }

  const r = row as AppCommunicationTemplateRow;
  const vars = buildPreviewVariableMap();

  if (r.channel === "email") {
    const to = (body.email?.trim() || user.email || "").trim().toLowerCase();
    if (!to || !isValidEmail(to)) {
      return NextResponse.json(
        { error: "Courriel de destination invalide ou manquant." },
        { status: 400 }
      );
    }

    const subjectBase = renderCommunicationTemplate(r.subject ?? "", vars, {
      escapeValuesAsHtml: true,
    }).trim() || "TAGORA Time";
    const textBody =
      TEST_PREFIX +
      renderCommunicationTemplate(r.body, vars, { escapeValuesAsHtml: false });
    const htmlBody = textToSimpleEmailHtml(textBody);

    const fromResolution = resolveResendFromEmail(process.env.RESEND_FROM_EMAIL);
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !fromResolution.fromEmail) {
      return NextResponse.json(
        { error: "Configuration courriel (Resend) incomplète." },
        { status: 503 }
      );
    }

    const result = await sendTemplatedDirectionEmail({
      recipients: [to],
      subject: `TEST — ${subjectBase}`.slice(0, 998),
      textBody,
      htmlBody,
    });

    if (!result.ok && !result.skipped) {
      return NextResponse.json(
        { error: result.reason ?? "Échec d'envoi du courriel de test." },
        { status: 502 }
      );
    }
    if (result.skipped) {
      return NextResponse.json(
        { error: result.reason ?? "Envoi ignoré." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, channel: "email", recipient: to });
  }

  if (r.channel === "sms") {
    const rawPhone = (body.phone?.trim() || "").trim();
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : "";
    if (!phone) {
      return NextResponse.json(
        { error: "Numéro de téléphone requis pour le test SMS." },
        { status: 400 }
      );
    }

    const smsBody =
      TEST_PREFIX + renderCommunicationTemplate(r.body, vars, { escapeValuesAsHtml: false });

    const sms = await sendSmsToPhone({ phone, body: smsBody });
    if (sms.skipped) {
      return NextResponse.json(
        { error: sms.reason === "sms_not_configured" ? "SMS non configuré (Twilio)." : "Envoi SMS ignoré." },
        { status: 503 }
      );
    }
    if (!sms.sent) {
      return NextResponse.json({ error: "Échec d'envoi du SMS de test." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, channel: "sms", recipient: phone });
  }

  return NextResponse.json({ error: "Canal non supporté." }, { status: 400 });
}

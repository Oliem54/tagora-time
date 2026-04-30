import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { isValidEmail } from "@/app/lib/account-requests.shared";
import { resolveResendFromEmail } from "@/app/lib/resend-email";

const LOG_PREFIX = "[resend-test]";

export async function POST(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    if (role !== "admin") {
      return NextResponse.json({ error: "Acces reserve aux administrateurs." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { to?: unknown };
    const to = String(body.to ?? "").trim().toLowerCase();

    if (!to || !isValidEmail(to)) {
      return NextResponse.json({ error: "Adresse destinataire invalide." }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmailResolution = resolveResendFromEmail(process.env.RESEND_FROM_EMAIL);
    const fromEmail = fromEmailResolution.fromEmail;

    if (!apiKey || !fromEmail) {
      console.error(LOG_PREFIX, "config_invalid", {
        hasApiKey: Boolean(apiKey),
        hasFromEmail: Boolean(fromEmail),
        fromEmailReason: fromEmailResolution.reason,
        fromEmailDiagnostics: fromEmailResolution.diagnostics,
      });
      return NextResponse.json(
        { error: "Configuration courriel invalide (RESEND)." },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: "TAGORA Time - Test courriel Resend",
        text: "Test Resend TAGORA Time: envoi de verification reussi.",
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error(LOG_PREFIX, "send_failed", {
        status: response.status,
        body: raw.slice(0, 500),
      });
      return NextResponse.json(
        { error: "Echec envoi Resend.", status: response.status },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur serveur test Resend.",
      },
      { status: 500 }
    );
  }
}

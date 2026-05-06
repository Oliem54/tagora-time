import { NextRequest, NextResponse } from "next/server";
import { parseClientContact, requireDirectionOrAdmin } from "@/app/api/direction/ramassages/_lib";

async function sendEmailReminder(to: string, subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DIRECTION_ALERT_FROM_EMAIL ?? "Tagora <noreply@tagora.local>";
  if (!apiKey) return { sent: false, skipped: true, reason: "email_not_configured" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) {
    const body = await response.text();
    return { sent: false, skipped: false, reason: `email_failed:${body}` };
  }
  return { sent: true, skipped: false, reason: null };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireDirectionOrAdmin(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const { id } = await params;
    const pickupId = Number(id);
    if (!Number.isFinite(pickupId) || pickupId <= 0) {
      return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    }

    const { data: pickup, error } = await supabase
      .from("livraisons_planifiees")
      .select("*")
      .eq("id", pickupId)
      .eq("type_operation", "ramassage_client")
      .maybeSingle<Record<string, unknown>>();
    if (error || !pickup) {
      return NextResponse.json({ error: "Ramassage introuvable." }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as { message?: string };
    const reminderText =
      body.message?.trim() ||
      `Bonjour, nous vous rappelons votre ramassage prevu le ${String(pickup.date_livraison || "-")}. Merci de confirmer votre disponibilite.`;

    const contact = parseClientContact(pickup);
    const subject = `Relance ramassage ${String(pickup.numero_commande || pickup.id || "")}`.trim();

    const emailResult = contact.email
      ? await sendEmailReminder(contact.email, subject, reminderText)
      : { sent: false, skipped: true, reason: "email_missing" };
    const existingNotes = typeof pickup.notes === "string" ? pickup.notes : "";
    const stamp = new Date().toISOString();
    const noteLine = `[${stamp}] Relance client (courriel seulement) par ${user.email ?? user.id} | email=${emailResult.sent ? "ok" : emailResult.reason}`;
    const notes = existingNotes ? `${existingNotes}\n${noteLine}` : noteLine;
    await supabase.from("livraisons_planifiees").update({ notes }).eq("id", pickupId);

    return NextResponse.json({ success: true, emailResult });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur relance." },
      { status: 500 }
    );
  }
}

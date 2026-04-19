import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { normalizePhoneNumber } from "@/app/lib/timeclock-api.shared";

type ChauffeurPhoneRow = {
  id: number;
  phone_number: string | null;
  primary_company: string | null;
};

type SmsAlertRow = {
  id: string;
  user_id: string | null;
  company_context: string | null;
  related_table: string | null;
  related_id: string | null;
  metadata: Record<string, unknown> | null;
};

export async function POST(req: NextRequest) {
  try {
    const expectedToken =
      process.env.SMS_WEBHOOK_TOKEN ?? process.env.TAGORA_SMS_WEBHOOK_TOKEN;
    const receivedToken = req.headers.get("x-tagora-webhook-token");
    const isProd = process.env.NODE_ENV === "production";

    if (isProd) {
      if (!expectedToken?.trim()) {
        return NextResponse.json(
          { error: "Configuration webhook SMS manquante." },
          { status: 503 }
        );
      }
      if (receivedToken !== expectedToken) {
        return NextResponse.json({ error: "Webhook refuse." }, { status: 403 });
      }
    } else if (expectedToken && receivedToken !== expectedToken) {
      return NextResponse.json({ error: "Webhook refuse." }, { status: 403 });
    }

    const body = (await req.json()) as {
      from?: unknown;
      message?: unknown;
    };

    const from = normalizePhoneNumber(body.from);
    const message = String(body.message ?? "").trim();

    if (!from || !message) {
      return NextResponse.json({ error: "Payload SMS invalide." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: chauffeurs, error: chauffeurError } = await supabase
      .from("chauffeurs")
      .select("id, phone_number, primary_company")
      .not("phone_number", "is", null)
      .limit(5000);

    if (chauffeurError) {
      throw chauffeurError;
    }

    const chauffeur = (chauffeurs ?? []).find((item) => {
      const normalized = normalizePhoneNumber((item as ChauffeurPhoneRow).phone_number);
      return normalized === from;
    }) as ChauffeurPhoneRow | undefined;

    if (!chauffeur) {
      return NextResponse.json({ error: "Aucun employe ne correspond a ce numero." }, { status: 404 });
    }

    const { data: activeAlert, error: activeAlertError } = await supabase
      .from("sms_alerts_log")
      .select("id, user_id, company_context, related_table, related_id, metadata")
      .eq("chauffeur_id", chauffeur.id)
      .in("status", ["queued", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SmsAlertRow>();

    if (activeAlertError) {
      throw activeAlertError;
    }

    if (activeAlert) {
      await supabase
        .from("sms_alerts_log")
        .update({
          status: "acknowledged",
          acknowledged_at: new Date().toISOString(),
          metadata: {
            ...(activeAlert.metadata ?? {}),
            inbound_message: message,
            inbound_phone: from,
          },
        })
        .eq("id", activeAlert.id);
    }

    await supabase.from("sms_alerts_log").insert([
      {
        user_id: activeAlert?.user_id ?? null,
        chauffeur_id: chauffeur.id,
        company_context:
          activeAlert?.company_context ??
          chauffeur.primary_company ??
          "oliem_solutions",
        alert_type: "sms_inbound",
        message,
        status: "acknowledged",
        related_table: activeAlert?.related_table ?? "sms_alerts_log",
        related_id: activeAlert?.related_id ?? activeAlert?.id ?? null,
        metadata: {
          source_phone: from,
          active_alert_id: activeAlert?.id ?? null,
        },
        acknowledged_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({
      success: true,
      matched_chauffeur_id: chauffeur.id,
      active_alert_id: activeAlert?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur reception SMS.",
      },
      { status: 500 }
    );
  }
}

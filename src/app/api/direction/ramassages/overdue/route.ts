import { NextRequest, NextResponse } from "next/server";
import {
  dayDiff,
  getRamassageAlertConfig,
  parseClientContact,
  requireAdmin,
  requireDirectionOrAdmin,
} from "@/app/api/direction/ramassages/_lib";

type Row = Record<string, string | number | null | undefined>;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireDirectionOrAdmin(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const config = await getRamassageAlertConfig(supabase);
    const todayIso = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("livraisons_planifiees")
      .select("*")
      .eq("type_operation", "ramassage_client")
      .order("date_livraison", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = (data ?? []) as Row[];
    const pending = rows.filter((item) => {
      const rawStatus = String(item.statut || "").toLowerCase();
      return !["livree", "ramassee", "ramasse"].includes(rawStatus);
    });

    const items = pending
      .map((item) => {
        const expectedDate = String(item.date_livraison || "");
        const diffDays = expectedDate ? dayDiff(todayIso, expectedDate) : 0;
        const isOverdue = diffDays >= config.delayDays;
        const isNearLimit = !isOverdue && diffDays >= Math.max(0, config.delayDays - config.warningDays);
        const severity = isOverdue ? "overdue" : isNearLimit ? "warning" : "normal";
        const { email, phone } = parseClientContact(item as Record<string, unknown>);
        return {
          id: Number(item.id),
          client: String(item.client || item.nom_client || ""),
          commande: String(item.numero_commande || item.commande || item.reference || ""),
          facture: String(item.numero_facture || item.facture || ""),
          expectedDate,
          diffDays,
          lateDays: Math.max(0, diffDays - config.delayDays + 1),
          status: String(item.statut || ""),
          phone,
          email,
          severity,
        };
      })
      .filter((item) => item.severity !== "normal")
      .sort((a, b) => b.diffDays - a.diffDays);

    return NextResponse.json({
      config,
      todayIso,
      items,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur overdue." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const body = (await req.json().catch(() => ({}))) as {
      delayDays?: number;
      warningDays?: number;
      emailEnabled?: boolean;
      smsEnabled?: boolean;
    };

    const delayDays = Math.max(1, Math.floor(Number(body.delayDays ?? 2)));
    const warningDays = Math.max(0, Math.floor(Number(body.warningDays ?? 1)));
    const emailEnabled = body.emailEnabled !== false;
    const smsEnabled = body.smsEnabled !== false;

    const { error } = await supabase.from("direction_ramassage_alert_config").upsert({
      config_key: "default",
      delay_days: delayDays,
      warning_days: warningDays,
      email_enabled: emailEnabled,
      sms_enabled: smsEnabled,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      config: { delayDays, warningDays, emailEnabled, smsEnabled },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur config overdue." },
      { status: 500 }
    );
  }
}

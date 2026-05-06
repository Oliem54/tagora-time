import { NextRequest, NextResponse } from "next/server";
import {
  getRamassageAlertConfig,
  parseClientContact,
  requireAdmin,
  requireDirectionOrAdmin,
} from "@/app/api/direction/ramassages/_lib";

type Row = Record<string, string | number | null | undefined>;

function computeDelayHours(expectedDate: string, expectedTime: string | null | undefined) {
  if (!expectedDate) {
    return 0;
  }
  const safeTime = typeof expectedTime === "string" && expectedTime.trim() ? expectedTime : "00:00";
  const expectedTs = new Date(`${expectedDate}T${safeTime}:00`);
  const nowTs = new Date();
  if (Number.isNaN(expectedTs.getTime())) {
    return 0;
  }
  return Math.max(0, Math.floor((nowTs.getTime() - expectedTs.getTime()) / (1000 * 60 * 60)));
}

function resolveAlertLevel(delayHours: number, config: Awaited<ReturnType<typeof getRamassageAlertConfig>>) {
  const level2Hours = config.pickupReminderAlert2DelayHours;
  const level1Hours = config.pickupReminderAlert1DelayHours;
  if (delayHours >= level2Hours) {
    return Math.max(
      2,
      2 + Math.floor((delayHours - level2Hours) / config.pickupReminderRecurringDelayHours)
    );
  }
  if (delayHours >= level1Hours) return 1 as const;
  return 0 as const;
}

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
      return ![
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
      ].includes(rawStatus);
    });

    const items = pending
      .map((item) => {
        const expectedDate = String(item.date_livraison || "");
        const delayHours = computeDelayHours(
          expectedDate,
          typeof item.heure_prevue === "string" ? item.heure_prevue : null
        );
        const currentAlertLevel = resolveAlertLevel(delayHours, config);
        const diffDays = Math.floor(delayHours / 24);
        const severity = currentAlertLevel > 0 ? "overdue" : "normal";
        const { email, phone } = parseClientContact(item as Record<string, unknown>);
        return {
          id: Number(item.id),
          client: String(item.client || item.nom_client || ""),
          commande: String(item.numero_commande || item.commande || item.reference || ""),
          facture: String(item.numero_facture || item.facture || ""),
          expectedDate,
          diffDays,
          delayHours,
          lateDays: diffDays,
          currentAlertLevel: Number(currentAlertLevel || 0),
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
      pickupReminderEnabled?: boolean;
      pickupReminderAlert1DelayHours?: number;
      pickupReminderAlert2DelayHours?: number;
      pickupReminderRecurringDelayHours?: number;
      pickupReminderNotifyDirectionAdminEmail?: boolean;
      pickupReminderNotifyClientEmail?: boolean;
      pickupReminderNotifyClientSms?: boolean;
    };

    const pickupReminderEnabled = body.pickupReminderEnabled !== false;
    const pickupReminderAlert1DelayHours = Math.max(
      1,
      Math.floor(Number(body.pickupReminderAlert1DelayHours ?? 48))
    );
    const pickupReminderAlert2DelayHours = Math.max(
      1,
      Math.floor(Number(body.pickupReminderAlert2DelayHours ?? 36))
    );
    const pickupReminderRecurringDelayHours = Math.max(
      1,
      Math.floor(Number(body.pickupReminderRecurringDelayHours ?? 36))
    );
    const pickupReminderNotifyDirectionAdminEmail =
      body.pickupReminderNotifyDirectionAdminEmail !== false;
    const pickupReminderNotifyClientEmail =
      body.pickupReminderNotifyClientEmail !== false;
    const pickupReminderNotifyClientSms =
      body.pickupReminderNotifyClientSms !== false;

    const { error } = await supabase.from("direction_ramassage_alert_config").upsert({
      config_key: "default",
      pickup_reminder_enabled: pickupReminderEnabled,
      pickup_reminder_alert_1_delay_hours: pickupReminderAlert1DelayHours,
      pickup_reminder_alert_2_delay_hours: pickupReminderAlert2DelayHours,
      pickup_reminder_recurring_delay_hours: pickupReminderRecurringDelayHours,
      pickup_reminder_notify_direction_admin_email:
        pickupReminderNotifyDirectionAdminEmail,
      pickup_reminder_notify_client_email: pickupReminderNotifyClientEmail,
      pickup_reminder_notify_client_sms: pickupReminderNotifyClientSms,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      config: {
        pickupReminderEnabled,
        pickupReminderAlert1DelayHours,
        pickupReminderAlert2DelayHours,
        pickupReminderRecurringDelayHours,
        pickupReminderNotifyDirectionAdminEmail,
        pickupReminderNotifyClientEmail,
        pickupReminderNotifyClientSms,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur config overdue." },
      { status: 500 }
    );
  }
}

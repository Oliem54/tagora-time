import { NextRequest, NextResponse } from "next/server";
import {
  getRamassageAlertConfig,
  requireDirectionOrAdmin,
} from "@/app/api/direction/ramassages/_lib";

type AnyRow = Record<string, unknown>;
type ReminderRow = {
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

function computeDelayHours(expectedDate: string, expectedTime: string | null | undefined) {
  const safeTime = typeof expectedTime === "string" && expectedTime.trim() ? expectedTime : "00:00";
  const expectedTs = new Date(`${expectedDate}T${safeTime}:00`);
  if (Number.isNaN(expectedTs.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - expectedTs.getTime()) / (1000 * 60 * 60)));
}

function pickString(row: AnyRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return "";
}

function pickDateValue(row: AnyRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function pickNumber(row: AnyRow, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function startsWithInsensitive(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

function isMissingPickupReminderAlertsTable(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const msg = String(error.message || "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    msg.includes("pickup_reminder_alerts") && msg.includes("schema cache") ||
    msg.includes("relation") && msg.includes("pickup_reminder_alerts") && msg.includes("does not exist")
  );
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireDirectionOrAdmin(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const params = req.nextUrl.searchParams;
    const statusFilter = (params.get("status") || "").trim().toLowerCase();
    const startDate = (params.get("startDate") || "").trim();
    const endDate = (params.get("endDate") || "").trim();
    const clientQuery = (params.get("client") || "").trim();
    const overdueOnly = params.get("overdueOnly") === "true";
    const needsReminderOnly = params.get("needsReminderOnly") === "true";

    const config = await getRamassageAlertConfig(supabase);

    const { data, error } = await supabase
      .from("livraisons_planifiees")
      .select("*")
      .order("date_livraison", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (Array.isArray(data) && data.length > 0) {
      console.log(
        "[ramassages-en-attente] Colonnes disponibles livraisons_planifiees:",
        Object.keys((data[0] ?? {}) as Record<string, unknown>)
      );
    }

    const allRows = (data ?? []) as unknown as AnyRow[];
    const mapped = allRows
      .map((rowRecord) => {
        const pickupId = pickString(rowRecord, ["id"]);
        const numericPickupId = Number(pickupId);
        const commandeNumero =
          pickString(rowRecord, [
            "numero_commande",
            "no_commande",
            "numero",
            "reference",
            "reference_commande",
            "bon_commande",
            "numero_facture",
            "facture",
            "invoice_number",
          ]) || pickupId.slice(0, 8);
        const clientName = pickString(rowRecord, [
          "client",
          "client_nom",
          "nom_client",
          "customer_name",
          "nom",
          "entreprise",
          "company",
        ]);
        const clientEmail = pickString(rowRecord, [
          "client_email",
          "courriel_client",
          "courriel",
          "email",
          "customer_email",
        ]);
        const clientPhone = pickString(rowRecord, [
          "client_phone",
          "telephone_client",
          "telephone",
          "phone",
          "tel",
          "customer_phone",
        ]);
        const scheduledPickupDate = pickDateValue(rowRecord, [
          "date_prevue_ramassage",
          "date_ramassage_prevue",
          "scheduled_pickup_date",
          "date_prevue",
          "date_livraison",
          "date",
        ]);
        const scheduledPickupTime = pickString(rowRecord, [
          "heure_prevue_ramassage",
          "heure_ramassage",
          "scheduled_pickup_time",
          "heure_prevue",
          "heure",
          "time",
        ]);
        const status =
          pickString(rowRecord, [
            "statut",
            "status",
            "etat",
          ]) || "en_attente";
        const statusLower = status.toLowerCase();
        const typeValue = pickString(rowRecord, [
          "type",
          "type_operation",
          "mode",
          "categorie",
        ]).toLowerCase();
        const isPickup =
          typeValue.includes("ramassage") ||
          typeValue.includes("pickup") ||
          statusLower.includes("ramassage");

        return {
          raw: rowRecord,
          pickupId,
          numericPickupId,
          commandeNumero,
          clientName,
          clientEmail,
          clientPhone,
          scheduledPickupDate,
          scheduledPickupTime,
          status,
          statusLower,
          isPickup,
          updatedAt: pickString(rowRecord, ["updated_at", "updatedAt", "modified_at", "date_modification"]),
          notes: pickString(rowRecord, ["notes", "note", "internal_note"]),
        };
      })
      .filter((item) => item.pickupId.length > 0)
      .filter((item) => {
        if (item.isPickup) return true;
        return !STOPPED_STATUSES.has(item.statusLower) && item.scheduledPickupDate !== null;
      });

    const pickupIds = mapped
      .map((item) => item.numericPickupId)
      .filter((id) => Number.isFinite(id));

    const { data: remindersData, error: remindersError } = await supabase
      .from("pickup_reminder_alerts")
      .select("pickup_id, alert_sequence_number, sent_at")
      .in("pickup_id", pickupIds.length > 0 ? pickupIds : [-1]);
    if (remindersError && !isMissingPickupReminderAlertsTable(remindersError)) {
      return NextResponse.json({ error: remindersError.message }, { status: 400 });
    }

    const remindersByPickup = new Map<number, ReminderRow[]>();
    for (const reminder of (remindersData ?? []) as ReminderRow[]) {
      const list = remindersByPickup.get(reminder.pickup_id) ?? [];
      list.push(reminder);
      remindersByPickup.set(reminder.pickup_id, list);
    }

    const enriched = mapped.map((item) => {
      const pickupId = item.numericPickupId || 0;
      const status = item.statusLower;
      const expectedDate = item.scheduledPickupDate ?? "";
      const delayHours = expectedDate
        ? computeDelayHours(expectedDate, item.scheduledPickupTime || "")
        : 0;
      const daysOverdue = Math.floor(delayHours / 24);
      const isOverdue = delayHours >= config.pickupReminderAlert1DelayHours && !STOPPED_STATUSES.has(status);
      const reminders = [...(remindersByPickup.get(pickupId) ?? [])].sort(
        (a, b) => a.alert_sequence_number - b.alert_sequence_number
      );
      const reminderCount = reminders.length;
      const lastReminder = reminders[reminders.length - 1] ?? null;
      const lastReminderAt = lastReminder?.sent_at ?? null;
      const lastReminderSequence = lastReminder?.alert_sequence_number ?? 0;
      const needsReminderToday =
        !STOPPED_STATUSES.has(status) &&
        delayHours >= config.pickupReminderAlert1DelayHours &&
        (
          reminderCount === 0 ||
          (lastReminderAt
            ? Date.now() - Date.parse(lastReminderAt) >=
              config.pickupReminderRecurringDelayHours * 60 * 60 * 1000
            : true)
        );

      const nextReminderAt = (() => {
        if (STOPPED_STATUSES.has(status) || !expectedDate) return null;
        if (reminderCount === 0) {
          const due = new Date(`${expectedDate}T00:00:00`);
          due.setHours(due.getHours() + config.pickupReminderAlert1DelayHours);
          return due.toISOString();
        }
        if (lastReminderAt) {
          const due = new Date(lastReminderAt);
          due.setHours(due.getHours() + config.pickupReminderRecurringDelayHours);
          return due.toISOString();
        }
        return null;
      })();

      const actionRecommended = STOPPED_STATUSES.has(status)
        ? "Aucune action"
        : isOverdue
          ? "Relancer ou replanifier"
          : "Suivi normal";

      return {
        id: pickupId,
        commandeNumero: item.commandeNumero,
        clientName: item.clientName,
        clientEmail: item.clientEmail,
        clientPhone: item.clientPhone,
        scheduledPickupDate: expectedDate,
        hoursOverdue: delayHours,
        daysOverdue,
        status,
        isOverdue,
        needsReminderToday,
        lastReminderAt,
        nextReminderAt,
        reminderCount,
        lastReminderSequence,
        recommendedAction: actionRecommended,
        updatedAt: item.updatedAt,
      };
    });

    const filtered = enriched
      .filter((item) => (startDate ? item.scheduledPickupDate >= startDate : true))
      .filter((item) => (endDate ? item.scheduledPickupDate <= endDate : true))
      .filter((item) => (clientQuery ? startsWithInsensitive(item.clientName, clientQuery) : true))
      .filter((item) => (statusFilter ? item.status === statusFilter : true))
      .filter((item) => (overdueOnly ? item.isOverdue : true))
      .filter((item) => (needsReminderOnly ? item.needsReminderToday : true))
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        if (a.needsReminderToday !== b.needsReminderToday) return a.needsReminderToday ? -1 : 1;
        const aMissingContact = !a.clientEmail && !a.clientPhone;
        const bMissingContact = !b.clientEmail && !b.clientPhone;
        if (aMissingContact !== bMissingContact) return aMissingContact ? -1 : 1;
        return b.hoursOverdue - a.hoursOverdue;
      });

    const summary = {
      totalPending: enriched.filter((item) => !STOPPED_STATUSES.has(item.status)).length,
      totalOverdue: enriched.filter((item) => item.isOverdue).length,
      totalNeedsReminderToday: enriched.filter((item) => item.needsReminderToday).length,
      totalRescheduleRecommended: enriched.filter((item) => item.recommendedAction.includes("replanifier")).length,
      totalClientNotified: enriched.filter((item) => item.reminderCount > 0).length,
    };

    return NextResponse.json({ summary, items: filtered });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur ramassages en attente." },
      { status: 500 }
    );
  }
}

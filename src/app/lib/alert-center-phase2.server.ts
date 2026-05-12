import "server-only";

import { addDaysLocal, formatIsoDateLocal } from "@/app/api/direction/effectifs/_lib";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Phase2QueueRow = {
  id: string;
  label: string;
  description: string;
  href: string;
  count: number;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  source: "journal" | "derived";
};

/** Liens « Ouvrir » : journal échecs + détail aligné sur les agrégats Phase 2 (livraisons livrées côté compteurs). */
function hrefPhase2TechnicalQueue(queueId: "echecs-notifications" | "notes-mentions-erreur"): string {
  return `/direction/alertes?journal=failed&phase2Queue=${encodeURIComponent(queueId)}`;
}

async function safeCount(
  query: PromiseLike<{ count: number | null; error: { message?: string } | null }>
): Promise<number> {
  try {
    const { count, error } = await Promise.resolve(query);
    if (error) return 0;
    return typeof count === "number" && Number.isFinite(count) ? Math.max(0, count) : 0;
  } catch {
    return 0;
  }
}

/**
 * Agrège les compteurs phase 2 : journal app_alerts + sources dérivées (sans retirer les envois existants).
 */
export async function aggregateAlertCenterPhase2(
  supabase: SupabaseClient
): Promise<{
  appAlertsOpen: number;
  appAlertsFailed: number;
  appAlertsCriticalOpen: number;
  failedJournalDeliveries: number;
  failedSmsAlertsLog: number;
  failedInternalMentionEmail: number;
  derivedDeliveryIncidentsOpen: number;
  derivedHorodateurExceptionsPending: number;
  derivedEmployeeExpensePending: number;
  derivedTitanPendingReview: number;
  derivedLivraisonOverdueApprox: number;
  queues: Phase2QueueRow[];
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const returnCheckIso = formatIsoDateLocal(addDaysLocal(today, 3));

  const [
    appAlertsOpen,
    appAlertsFailed,
    appAlertsCriticalOpen,
    failedJournalDeliveries,
    failedSmsAlertsLog,
    failedInternalMentionEmail,
    derivedDeliveryIncidentsOpen,
    derivedHorodateurExceptionsPending,
    derivedEmployeeExpensePending,
    derivedTitanPendingReview,
    derivedLivraisonOverdueApprox,
    derivedEmployeeReturnIn3Days,
  ] = await Promise.all([
    safeCount(
      supabase
        .from("app_alerts")
        .select("*", { count: "exact", head: true })
        .eq("status", "open")
    ),
    safeCount(
      supabase
        .from("app_alerts")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed")
    ),
    safeCount(
      supabase
        .from("app_alerts")
        .select("*", { count: "exact", head: true })
        .eq("priority", "critical")
        .in("status", ["open", "failed"])
    ),
    safeCount(
      supabase
        .from("app_alert_deliveries")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", new Date(Date.now() - 90 * 864e5).toISOString())
    ),
    safeCount(
      supabase
        .from("sms_alerts_log")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", new Date(Date.now() - 90 * 864e5).toISOString())
    ),
    safeCount(
      supabase
        .from("internal_mentions")
        .select("*", { count: "exact", head: true })
        .eq("status", "erreur_email")
        .gte("created_at", new Date(Date.now() - 90 * 864e5).toISOString())
    ),
    safeCount(
      supabase
        .from("delivery_incidents")
        .select("*", { count: "exact", head: true })
        .eq("status", "open")
    ),
    safeCount(
      supabase
        .from("horodateur_exceptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "en_attente")
    ),
    safeCount(
      supabase
        .from("employe_depenses")
        .select("*", { count: "exact", head: true })
        .in("statut", ["soumis", "en_attente", "pending"])
    ),
    safeCount(supabase.from("temps_titan").select("*", { count: "exact", head: true }).eq("id", -1)),
    safeCount(
      supabase
        .from("livraisons_planifiees")
        .select("*", { count: "exact", head: true })
        .eq("statut", "en_retard")
    ),
    safeCount(
      supabase
        .from("employee_leave_periods")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .eq("expected_return_date", returnCheckIso)
    ),
  ]);

  const failedTechChannels = failedJournalDeliveries + failedSmsAlertsLog;
  const appAlertsActionableCount = appAlertsOpen + appAlertsFailed;

  const queues: Phase2QueueRow[] = [
    {
      id: "journal-app-alerts",
      label: "Alertes (journal unifié)",
      description: "Entrées ouvertes ou en échec technique dans app_alerts.",
      href: "/direction/alertes",
      count: appAlertsActionableCount,
      priority: "high",
      category: "Système",
      source: "journal",
    },
    {
      id: "depenses-employe",
      label: "Dépenses employé à traiter",
      description: "Demandes en attente (table employe_depenses si présente).",
      href: "/direction/ressources",
      count: derivedEmployeeExpensePending,
      priority: "high",
      category: "Dépenses",
      source: "derived",
    },
    {
      id: "incidents-livraison",
      label: "Incidents / dommages (livraison)",
      description: "Incidents ouverts liés aux livraisons.",
      href: "/direction/livraisons",
      count: derivedDeliveryIncidentsOpen,
      priority: "critical",
      category: "Livraisons / Ramassages",
      source: "derived",
    },
    {
      id: "notes-mentions-erreur",
      label: "Notes internes — erreur courriel",
      description: "Mentions internes en erreur d’envoi.",
      href: hrefPhase2TechnicalQueue("notes-mentions-erreur"),
      count: failedInternalMentionEmail,
      priority: "medium",
      category: "Employés",
      source: "derived",
    },
    {
      id: "echecs-notifications",
      label: "Échecs SMS / courriel (canaux techniques)",
      description: "app_alert_deliveries et sms_alerts_log (90 jours).",
      href: hrefPhase2TechnicalQueue("echecs-notifications"),
      count: failedTechChannels,
      priority: "high",
      category: "Système",
      source: "derived",
    },
    {
      id: "horodateur-exceptions",
      label: "Exceptions horodateur en attente",
      description: "Exceptions à traiter.",
      href: "/direction/horodateur",
      count: derivedHorodateurExceptionsPending,
      priority: "high",
      category: "Horodateur",
      source: "derived",
    },
    {
      id: "employee-leave-return-soon",
      label: "Retours employés à vérifier (≈ 3 jours)",
      description: "Congés prolongés avec date de retour prévue dans 3 jours.",
      href: "/direction/ressources/employes",
      count: derivedEmployeeReturnIn3Days,
      priority: "medium",
      category: "Employés",
      source: "derived",
    },
    {
      id: "livraisons-retard",
      label: "Livraisons signalées en retard",
      description: "Comptage statut en_retard si disponible.",
      href: "/direction/livraisons",
      count: derivedLivraisonOverdueApprox,
      priority: "high",
      category: "Livraisons / Ramassages",
      source: "derived",
    },
    {
      id: "titan-validation",
      label: "Refacturation Titan à valider",
      description: "Lignes temps_titan non validées (schéma dépendant).",
      href: "/direction/temps-titan",
      count: derivedTitanPendingReview,
      priority: "high",
      category: "Refacturation Titan",
      source: "derived",
    },
  ];

  return {
    appAlertsOpen,
    appAlertsFailed,
    appAlertsCriticalOpen,
    failedJournalDeliveries,
    failedSmsAlertsLog,
    failedInternalMentionEmail,
    derivedDeliveryIncidentsOpen,
    derivedHorodateurExceptionsPending,
    derivedEmployeeExpensePending,
    derivedTitanPendingReview,
    derivedLivraisonOverdueApprox,
    queues,
  };
}

import { NextRequest, NextResponse } from "next/server";
import { aggregateAlertCenterPhase2 } from "@/app/lib/alert-center-phase2.server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { countPendingAppImprovements } from "@/app/lib/app-improvements-pending.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Agrège phase 1 (files existantes) + phase 2 (journal app_alerts + sources dérivées).
 * Les envois Resend/Twilio historiques ne sont pas modifiés ; les échecs sont comptés via
 * app_alert_deliveries, sms_alerts_log et internal_mentions (erreur_email).
 */
export async function GET(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (role !== "admin" && role !== "direction") {
    return NextResponse.json(
      { error: "Acces reserve a la direction et aux administrateurs." },
      { status: 403 }
    );
  }

  const supabase = createAdminSupabaseClient();

  const [accountsResult, improvementsResult, effectifsResult, phase2] = await Promise.all([
    supabase
      .from("account_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    countPendingAppImprovements(),
    supabase
      .from("effectifs_employee_schedule_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    aggregateAlertCenterPhase2(supabase),
  ]);

  const accountRequests =
    !accountsResult.error && accountsResult.count != null
      ? Math.max(0, accountsResult.count)
      : 0;
  const improvements = improvementsResult.hadError ? 0 : Math.max(0, improvementsResult.count);
  const effectifsScheduleRequests =
    !effectifsResult.error && effectifsResult.count != null
      ? Math.max(0, effectifsResult.count)
      : 0;

  const openSum = accountRequests + improvements + effectifsScheduleRequests;

  const failedTotal =
    phase2.failedJournalDeliveries +
    phase2.failedSmsAlertsLog +
    phase2.failedInternalMentionEmail;

  const criticalUntreatedTotal = phase2.appAlertsCriticalOpen;

  const phase2OpenQueuesSum =
    phase2.appAlertsOpen +
    phase2.appAlertsFailed +
    phase2.derivedDeliveryIncidentsOpen +
    phase2.derivedHorodateurExceptionsPending +
    phase2.derivedEmployeeExpensePending +
    phase2.derivedTitanPendingReview +
    phase2.derivedLivraisonOverdueApprox;

  /** Les alertes critiques ouvertes sont déjà incluses dans appAlertsOpen / files phase 2. */
  const badgeTotal = openSum + phase2OpenQueuesSum + failedTotal;

  return NextResponse.json({
    open: {
      accountRequests,
      improvements,
      effectifsScheduleRequests,
      sum: openSum,
      phase2OpenSum: phase2OpenQueuesSum,
    },
    failed: {
      total: failedTotal,
      smsOrEmail: failedTotal,
      journal: phase2.failedJournalDeliveries,
      smsLog: phase2.failedSmsAlertsLog,
      internalMentionEmail: phase2.failedInternalMentionEmail,
    },
    criticalUntreated: {
      total: criticalUntreatedTotal,
    },
    phase2: {
      queues: phase2.queues,
      appAlertsOpen: phase2.appAlertsOpen,
      appAlertsFailed: phase2.appAlertsFailed,
      derived: {
        deliveryIncidentsOpen: phase2.derivedDeliveryIncidentsOpen,
        horodateurExceptionsPending: phase2.derivedHorodateurExceptionsPending,
        employeeExpensePending: phase2.derivedEmployeeExpensePending,
        titanPendingReview: phase2.derivedTitanPendingReview,
        livraisonEnRetard: phase2.derivedLivraisonOverdueApprox,
      },
    },
    badgeTotal,
    hadErrors: {
      accounts: Boolean(accountsResult.error),
      improvements: improvementsResult.hadError,
      effectifsSchedule: Boolean(effectifsResult.error),
    },
  });
}

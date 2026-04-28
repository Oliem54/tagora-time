import "server-only";

import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

const OPEN_LIKE_STATUSES = [
  "en_attente",
  "en_traitement",
  "new",
  "nouveau",
  "pending",
  "a_traiter",
  "open",
];

/**
 * Compte les suggestions a traiter (nouvelles / non finalisees).
 * Essais en cascade: statuts ouverts, treated_at nul, reviewed_at nul, 7 jours.
 */
export async function countPendingAppImprovements(): Promise<{
  count: number;
  hadError: boolean;
}> {
  const supabase = createAdminSupabaseClient();

  try {
    const statusQuery = await supabase
      .from("app_improvements")
      .select("*", { count: "exact", head: true })
      .in("status", OPEN_LIKE_STATUSES)
      .is("archived_at", null)
      .is("deleted_at", null);

    if (!statusQuery.error && statusQuery.count != null) {
      return { count: statusQuery.count, hadError: false };
    }

    const treatedQuery = await supabase
      .from("app_improvements")
      .select("*", { count: "exact", head: true })
      .is("treated_at", null)
      .is("archived_at", null)
      .is("deleted_at", null);

    if (!treatedQuery.error && treatedQuery.count != null) {
      return { count: treatedQuery.count, hadError: false };
    }

    const reviewedQuery = await supabase
      .from("app_improvements")
      .select("*", { count: "exact", head: true })
      .is("reviewed_at", null)
      .is("deleted_at", null);

    if (!reviewedQuery.error && reviewedQuery.count != null) {
      return { count: reviewedQuery.count, hadError: false };
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recent = await supabase
      .from("app_improvements")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo.toISOString())
      .is("archived_at", null)
      .is("deleted_at", null);

    if (!recent.error && recent.count != null) {
      return { count: recent.count, hadError: false };
    }

    return { count: 0, hadError: true };
  } catch {
    return { count: 0, hadError: true };
  }
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppAlertCategory } from "@/app/lib/app-alerts.shared";

export type InsertAppAlertInput = {
  category: AppAlertCategory | string;
  priority: "critical" | "high" | "medium" | "low";
  /** Par défaut open ; failed pour les alertes d'échec technique. */
  status?: "open" | "failed";
  title: string;
  body?: string | null;
  linkHref?: string | null;
  sourceModule: string;
  refTable?: string | null;
  refId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
  employeeId?: number | null;
  companyKey?: string | null;
};

/**
 * Insère une alerte dans le journal (idempotent si dedupeKey fourni et unique).
 */
export async function insertAppAlert(
  supabase: SupabaseClient,
  input: InsertAppAlertInput
): Promise<{ id: string | null; skippedDuplicate: boolean; error?: string }> {
  const row = {
    category: input.category,
    priority: input.priority,
    status: input.status ?? "open",
    title: input.title,
    body: input.body ?? null,
    link_href: input.linkHref ?? null,
    source_module: input.sourceModule,
    ref_table: input.refTable ?? null,
    ref_id: input.refId ?? null,
    metadata: input.metadata ?? {},
    dedupe_key: input.dedupeKey ?? null,
    employee_id: input.employeeId ?? null,
    company_key: input.companyKey ?? null,
  };

  const { data, error } = await supabase
    .from("app_alerts")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    if (
      error.code === "23505" ||
      (error.message ?? "").toLowerCase().includes("duplicate") ||
      (error.message ?? "").toLowerCase().includes("unique")
    ) {
      return { id: null, skippedDuplicate: true };
    }
    return { id: null, skippedDuplicate: false, error: error.message };
  }

  return {
    id: typeof data?.id === "string" ? data.id : null,
    skippedDuplicate: false,
  };
}

/** Alerte encore visible au centre (ouverte ou échec technique). */
export async function findOpenAppAlertIdByDedupeKey(
  supabase: SupabaseClient,
  dedupeKey: string
): Promise<string | null> {
  const { data } = await supabase
    .from("app_alerts")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .in("status", ["open", "failed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

/**
 * Incrémente failure_count et fusionne des champs metadata sur une alerte open/failed existante.
 */
export async function bumpAppAlertByDedupeKey(
  supabase: SupabaseClient,
  dedupeKey: string,
  mergeMetadata: Record<string, unknown>
): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_alerts")
    .select("id, metadata")
    .eq("dedupe_key", dedupeKey)
    .in("status", ["open", "failed"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; metadata: Record<string, unknown> | null }>();

  if (error || !data?.id) {
    return false;
  }

  const meta = { ...(data.metadata ?? {}) };
  const prev = Number(meta.failure_count ?? 1);
  meta.failure_count = prev + 1;
  Object.assign(meta, mergeMetadata);

  const { error: upErr } = await supabase.from("app_alerts").update({ metadata: meta }).eq("id", data.id);

  return !upErr;
}

export type RecordAppAlertDeliveryInput = {
  alertId?: string | null;
  channel: "email" | "sms" | "push" | "system";
  provider: string;
  status: "pending" | "sent" | "failed" | "skipped";
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Après MFA réussi : clôturer les alertes bruyantes (sans AAL2, échecs répétés), pas les alertes lifecycle (enabled/disabled).
 */
export async function markOpenMfaSecurityAlertsHandled(
  supabase: SupabaseClient,
  params: { userId: string; handledByUserId: string }
): Promise<void> {
  const now = new Date().toISOString();
  const closableEvents = ["mfa_access_blocked", "mfa_verify_failed_repeated"] as const;

  for (const event of closableEvents) {
    const { error } = await supabase
      .from("app_alerts")
      .update({
        status: "handled",
        handled_at: now,
        handled_by: params.handledByUserId,
      })
      .eq("source_module", "security_mfa")
      .contains("metadata", { kind: "mfa_audit", userId: params.userId, event })
      .in("status", ["open", "failed"]);

    if (error) {
      console.warn("[app_alerts] mark_mfa_handled", event, error.message);
    }
  }
}

export async function recordAppAlertDelivery(
  supabase: SupabaseClient,
  input: RecordAppAlertDeliveryInput
): Promise<void> {
  const { error } = await supabase.from("app_alert_deliveries").insert({
    alert_id: input.alertId ?? null,
    channel: input.channel,
    provider: input.provider,
    status: input.status,
    error_message: input.errorMessage ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) {
    console.warn("[app_alert_deliveries]", error.message);
  }
}

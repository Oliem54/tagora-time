import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { APP_ALERT_CATEGORY } from "@/app/lib/app-alerts.shared";
import {
  findOpenAppAlertIdByDedupeKey,
  insertAppAlert,
  recordAppAlertDelivery,
  type InsertAppAlertInput,
} from "@/app/lib/app-alerts.server";

export { findOpenAppAlertIdByDedupeKey };

async function recordDossierInterventionDefaultDeliveries(
  supabase: SupabaseClient,
  alertId: string | null
) {
  if (!alertId) return;
  await recordAppAlertDelivery(supabase, {
    alertId,
    channel: "email",
    provider: "resend",
    status: "skipped",
    metadata: { note: "dual_write_journal_sans_hook_envoi" },
  });
  await recordAppAlertDelivery(supabase, {
    alertId,
    channel: "sms",
    provider: "twilio",
    status: "skipped",
    metadata: { note: "dual_write_journal_sans_hook_envoi" },
  });
  await recordAppAlertDelivery(supabase, {
    alertId,
    channel: "system",
    provider: "internal",
    status: "sent",
    metadata: { note: "journal_centre_alertes" },
  });
}

/** Parse les lignes type_intervention:depense du champ description dossiers. */
export function parseDossierDescriptionMeta(description: string | null): Record<string, string> {
  const meta: Record<string, string> = {};
  const lines = (description ?? "").split("\n");
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return meta;
}

export async function getChauffeurIdForAuthUser(
  supabase: SupabaseClient,
  authUserId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("chauffeurs")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle<{ id: number }>();
  if (error || !data?.id) return null;
  return data.id;
}

export async function getChauffeurCompanyKey(
  supabase: SupabaseClient,
  employeeId: number
): Promise<string | null> {
  const { data } = await supabase
    .from("chauffeurs")
    .select("primary_company")
    .eq("id", employeeId)
    .maybeSingle<{ primary_company: string | null }>();
  const c = data?.primary_company?.trim();
  if (c === "oliem_solutions" || c === "titan_produits_industriels") {
    return c;
  }
  return null;
}

type HorodateurNotifyBundle = {
  email: {
    ok: boolean;
    skipped?: boolean;
    reason?: string | null;
    recipients?: string[];
  };
  sms: {
    sent: boolean;
    skipped?: boolean;
    reason?: string | null;
    recipients?: string[];
  };
};

/**
 * Enregistre les livraisons logiques email / sms / internal pour une alerte horodateur.
 */
export async function recordDeliveriesFromHorodateurDirectionNotify(
  supabase: SupabaseClient,
  alertId: string | null,
  nr: HorodateurNotifyBundle
) {
  if (!alertId) return;

  await recordAppAlertDelivery(supabase, {
    alertId,
    channel: "email",
    provider: "resend",
    status: nr.email.skipped ? "skipped" : nr.email.ok ? "sent" : "failed",
    errorMessage: nr.email.ok || nr.email.skipped ? null : (nr.email.reason ?? null),
    metadata: { recipients: nr.email.recipients ?? [] },
  });

  await recordAppAlertDelivery(supabase, {
    alertId,
    channel: "sms",
    provider: "twilio",
    status: nr.sms.skipped ? "skipped" : nr.sms.sent ? "sent" : "failed",
    errorMessage: nr.sms.sent || nr.sms.skipped ? null : (nr.sms.reason ?? null),
    metadata: { recipients: nr.sms.recipients ?? [] },
  });

  await recordAppAlertDelivery(supabase, {
    alertId,
    channel: "system",
    provider: "internal",
    status: "sent",
    metadata: { note: "journal_centre_alertes" },
  });
}

export async function dualWriteDossierIntervention(params: {
  supabase: SupabaseClient;
  dossierId: number;
  description: string;
  nom: string;
  client: string | null;
  employeeId: number | null;
  companyKey: string | null;
}) {
  const { supabase, dossierId, description, nom, client, employeeId, companyKey } = params;
  const meta = parseDossierDescriptionMeta(description);
  const typeRaw = (meta["type_intervention"] ?? "").toLowerCase();

  const baseBodyLines = [
    `Référence : ${nom}`,
    client ? `Client / contexte : ${client}` : null,
    meta["depense_montant"] ? `Montant : ${meta["depense_montant"]}` : null,
    meta["depense_categorie"] ? `Catégorie dépense : ${meta["depense_categorie"]}` : null,
    meta["livraison_id"] && meta["livraison_id"] !== "-"
      ? `Mission / opération # : ${meta["livraison_id"]}`
      : null,
    meta["date_heure"] ? `Date / heure : ${meta["date_heure"]}` : null,
    meta["contact_nom"] ? `Contact : ${meta["contact_nom"]}` : null,
    `Employé (chauffeur id) : ${employeeId ?? "—"}`,
  ].filter(Boolean) as string[];

  const linkBase = employeeId
    ? `/direction/ressources/employes/${employeeId}#depenses-employe`
    : `/direction/ressources`;

  if (typeRaw === "depense") {
    const input: InsertAppAlertInput = {
      category: APP_ALERT_CATEGORY.employee_expense,
      priority: "high",
      title: "Nouvelle dépense employé à traiter",
      body: baseBodyLines.join("\n"),
      linkHref: linkBase,
      sourceModule: "employe_dossiers",
      refTable: "dossiers",
      refId: String(dossierId),
      dedupeKey: `employee_expense:${dossierId}`,
      employeeId,
      companyKey,
      metadata: { dossierId, type: "depense" },
    };
    const ins = await insertAppAlert(supabase, input);
    if (ins.id) await recordDossierInterventionDefaultDeliveries(supabase, ins.id);
    return ins;
  }

  if (typeRaw === "incident") {
    const input: InsertAppAlertInput = {
      category: APP_ALERT_CATEGORY.delivery_incident,
      priority: "critical",
      title: "Incident / dommage à vérifier",
      body: [
        ...baseBodyLines,
        meta["incident_urgence"] ? `Urgence : ${meta["incident_urgence"]}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      linkHref: `/employe/dossiers/${dossierId}`,
      sourceModule: "employe_dossiers",
      refTable: "dossiers",
      refId: String(dossierId),
      dedupeKey: `incident_damage:${dossierId}`,
      employeeId,
      companyKey,
      metadata: { dossierId, type: "incident" },
    };
    const ins = await insertAppAlert(supabase, input);
    if (ins.id) await recordDossierInterventionDefaultDeliveries(supabase, ins.id);
    return ins;
  }

  if (typeRaw === "note_interne") {
    const preview = description.split("\n---\n")[0]?.trim() || description.slice(0, 400);
    const input: InsertAppAlertInput = {
      category: APP_ALERT_CATEGORY.mission_internal_note,
      priority: "medium",
      title: "Nouvelle note interne à consulter",
      body: [...baseBodyLines, `Note : ${preview}`].join("\n"),
      linkHref: `/employe/dossiers/${dossierId}`,
      sourceModule: "employe_dossiers",
      refTable: "dossiers",
      refId: String(dossierId),
      dedupeKey: `internal_note:${dossierId}`,
      employeeId,
      companyKey,
      metadata: { dossierId, type: "note_interne" },
    };
    const ins = await insertAppAlert(supabase, input);
    if (ins.id) await recordDossierInterventionDefaultDeliveries(supabase, ins.id);
    return ins;
  }

  return { id: null as string | null, skippedDuplicate: false as boolean };
}

export async function dualWriteLivraisonDeliveryIncident(params: {
  supabase: SupabaseClient;
  incidentId: string;
  livraisonId: number;
  category: string;
  description: string | null;
}) {
  const { supabase, incidentId, livraisonId, category, description } = params;
  return insertAppAlert(supabase, {
    category: APP_ALERT_CATEGORY.delivery_incident,
    priority: "critical",
    title: "Incident livraison (retour terrain)",
    body: [
      `Livraison #${livraisonId}`,
      `Catégorie : ${category}`,
      description ? `Description : ${description}` : null,
      `Incident id : ${incidentId}`,
    ]
      .filter(Boolean)
      .join("\n"),
    linkHref: `/direction/livraisons`,
    sourceModule: "livraisons",
    refTable: "delivery_incidents",
    refId: incidentId,
    dedupeKey: `delivery_incident:${incidentId}`,
    metadata: { livraisonId, incidentId },
  });
}

export async function dualWriteHorodateurExceptionCreated(params: {
  supabase: SupabaseClient;
  exceptionId: string;
  employeeId: number;
  companyKey: string | null;
  employeeName: string | null;
  reasonLabel: string;
  employeeNote: string | null;
  exceptionType: string;
  occurredAt: string | null;
}) {
  const {
    supabase,
    exceptionId,
    employeeId,
    companyKey,
    employeeName,
    reasonLabel,
    employeeNote,
    exceptionType,
    occurredAt,
  } = params;

  const body = [
    `Employé : ${employeeName ?? `#${employeeId}`}`,
    `Type : ${exceptionType}`,
    `Motif système : ${reasonLabel}`,
    `Note employé : ${employeeNote?.trim() ? employeeNote.trim() : "Aucune"}`,
    occurredAt ? `Heure événement : ${occurredAt}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return insertAppAlert(supabase, {
    category: APP_ALERT_CATEGORY.horodateur_exception,
    priority: "high",
    title: "Exception horodateur à traiter",
    body,
    linkHref: "/direction/horodateur",
    sourceModule: "horodateur",
    refTable: "horodateur_exceptions",
    refId: exceptionId,
    dedupeKey: `horodateur_exception:${exceptionId}`,
    employeeId,
    companyKey,
    metadata: { exceptionId },
  });
}

export async function markHorodateurExceptionAppAlertHandled(
  supabase: SupabaseClient,
  exceptionId: string,
  handledByUserId: string | null,
  outcome: "approved" | "rejected"
) {
  const dedupeKey = `horodateur_exception:${exceptionId}`;
  const nextStatus = outcome === "approved" ? "handled" : "cancelled";
  const { error } = await supabase
    .from("app_alerts")
    .update({
      status: nextStatus,
      handled_at: new Date().toISOString(),
      handled_by: handledByUserId,
    })
    .eq("dedupe_key", dedupeKey)
    .eq("status", "open");

  if (error) {
    console.warn("[app_alerts] mark_horodateur_handled", error.message);
  }
}

export async function logNotificationFailureAppAlert(params: {
  supabase: SupabaseClient;
  sourceModule: string;
  sourceId: string;
  channel: "email" | "sms";
  errorMessage: string;
  recipient?: string | null;
}) {
  const { supabase, sourceModule, sourceId, channel, errorMessage, recipient } = params;
  const dedupeKey = `notification_failure:${sourceModule}:${sourceId}:${channel}`;

  return insertAppAlert(supabase, {
    category: APP_ALERT_CATEGORY.notification_failure,
    priority: "high",
    status: "failed",
    title: "Échec d’envoi notification",
    body: [
      `Canal : ${channel}`,
      `Destinataire : ${recipient ?? "—"}`,
      `Erreur : ${errorMessage}`,
      `Source : ${sourceModule} / ${sourceId}`,
    ].join("\n"),
    sourceModule,
    refTable: sourceModule,
    refId: sourceId,
    dedupeKey,
    metadata: { channel, recipient },
  });
}

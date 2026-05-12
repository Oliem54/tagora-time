import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type AppAlertRow = {
  id: string;
  created_at: string;
  category: string;
  priority: string;
  status: string;
  title: string;
  body: string | null;
  link_href: string | null;
  source_module: string;
  employee_id: number | null;
  company_key: string | null;
  handled_at: string | null;
  metadata: Record<string, unknown> | null;
  dedupe_key: string | null;
};

type ChauffeurMini = { id: number; nom: string | null; prenom: string | null };

type JournalItemPayload = {
  id: string;
  createdAt: string;
  category: string;
  priority: string;
  status: string;
  title: string;
  message: string | null;
  employeeLabel: string;
  employeeId: number | null;
  companyKey: string | null;
  emailDelivery: string;
  smsDelivery: string;
  linkHref: string | null;
  sourceModule: string;
  handledAt: string | null;
  dedupeKey?: string | null;
  failureCount?: number | null;
};

function iso90DaysAgo(): string {
  return new Date(Date.now() - 90 * 864e5).toISOString();
}

function metaSnippet(metadata: unknown): string {
  if (metadata == null || (typeof metadata === "object" && metadata !== null && Object.keys(metadata as object).length === 0)) {
    return "";
  }
  try {
    return typeof metadata === "string" ? metadata : JSON.stringify(metadata);
  } catch {
    return String(metadata);
  }
}

function labelChauffeur(map: Map<number, ChauffeurMini>, employeeId: number | null): string {
  if (employeeId == null) return "—";
  const ch = map.get(employeeId);
  if (!ch) return `Employé #${employeeId}`;
  const name = [ch.prenom, ch.nom].filter(Boolean).join(" ").trim();
  return name || `Employé #${employeeId}`;
}

/**
 * Lignes du journal alignées sur les agrégats Phase 2 (échecs techniques hors seule table app_alerts).
 */
async function buildPhase2QueueJournalItems(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  queue: "echecs-notifications" | "notes-mentions-erreur"
): Promise<JournalItemPayload[]> {
  const since = iso90DaysAgo();

  if (queue === "notes-mentions-erreur") {
    const { data: mentions, error } = await supabase
      .from("internal_mentions")
      .select(
        "id, entity_type, entity_id, message, email_error, mentioned_email, mentioned_name, created_at"
      )
      .eq("status", "erreur_email")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      throw new Error(error.message);
    }
    return (mentions ?? []).map((m) => {
      const id = Number((m as { id: number }).id);
      const parts = [
        (m as { message?: string }).message,
        (m as { email_error?: string | null }).email_error
          ? `Erreur courriel : ${(m as { email_error: string | null }).email_error}`
          : null,
      ].filter(Boolean);
      const mentionedName = (m as { mentioned_name?: string | null }).mentioned_name?.trim();
      const mentionedEmail = (m as { mentioned_email?: string | null }).mentioned_email?.trim();
      return {
        id: `derived-mention:${id}`,
        createdAt: String((m as { created_at: string }).created_at),
        category: "mission_internal_note",
        priority: "medium",
        status: "failed",
        title: `Mention interne (${(m as { entity_type: string }).entity_type} ${(m as { entity_id: string }).entity_id})`,
        message: parts.join("\n\n") || null,
        employeeLabel: mentionedName || mentionedEmail || "—",
        employeeId: null,
        companyKey: null,
        emailDelivery: "failed",
        smsDelivery: "—",
        linkHref: null,
        sourceModule: "internal_mentions",
        handledAt: null,
        dedupeKey: null,
        failureCount: null,
      };
    });
  }

  const { data: dels, error: delErr } = await supabase
    .from("app_alert_deliveries")
    .select("id, alert_id, channel, status, error_message, metadata, created_at")
    .eq("status", "failed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(150);

  if (delErr) {
    throw new Error(delErr.message);
  }

  const { data: smsRows, error: smsErr } = await supabase
    .from("sms_alerts_log")
    .select("id, chauffeur_id, alert_type, message, related_table, related_id, metadata, created_at")
    .eq("status", "failed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(150);

  if (smsErr) {
    throw new Error(smsErr.message);
  }

  const deliveryList = (dels ?? []) as Array<{
    id: string;
    alert_id: string | null;
    channel: string;
    status: string;
    error_message: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;

  const alertIds = [...new Set(deliveryList.map((d) => d.alert_id).filter((x): x is string => Boolean(x)))];
  const alertById = new Map<
    string,
    { title: string; employee_id: number | null; company_key: string | null; link_href: string | null }
  >();
  if (alertIds.length > 0) {
    const { data: alerts } = await supabase
      .from("app_alerts")
      .select("id, title, employee_id, company_key, link_href")
      .in("id", alertIds);
    for (const a of (alerts ?? []) as Array<{
      id: string;
      title: string;
      employee_id: number | null;
      company_key: string | null;
      link_href: string | null;
    }>) {
      alertById.set(a.id, a);
    }
  }

  const empIds = new Set<number>();
  for (const d of deliveryList) {
    const aid = d.alert_id;
    if (aid) {
      const a = alertById.get(aid);
      if (a?.employee_id != null) empIds.add(a.employee_id);
    }
  }
  for (const s of smsRows ?? []) {
    const cid = (s as { chauffeur_id?: number | null }).chauffeur_id;
    if (cid != null) empIds.add(cid);
  }

  const chauffeursById = new Map<number, ChauffeurMini>();
  if (empIds.size > 0) {
    const { data: ch } = await supabase
      .from("chauffeurs")
      .select("id, nom, prenom")
      .in("id", [...empIds]);
    for (const c of (ch ?? []) as ChauffeurMini[]) {
      chauffeursById.set(c.id, c);
    }
  }

  const out: JournalItemPayload[] = [];

  for (const d of deliveryList) {
    const a = d.alert_id ? alertById.get(d.alert_id) : undefined;
    const empId = a?.employee_id ?? null;
    const msgParts = [d.error_message, metaSnippet(d.metadata)].filter(Boolean);
    out.push({
      id: `derived-del:${d.id}`,
      createdAt: d.created_at,
      category: "notification_failure",
      priority: "high",
      status: "failed",
      title: a?.title ? `Échec envoi : ${a.title}` : `Échec ${d.channel} (notification)`,
      message: msgParts.join("\n\n") || null,
      employeeLabel: labelChauffeur(chauffeursById, empId),
      employeeId: empId,
      companyKey: a?.company_key ?? null,
      emailDelivery: d.channel === "email" ? "failed" : "—",
      smsDelivery: d.channel === "sms" ? "failed" : "—",
      linkHref: a?.link_href ?? null,
      sourceModule: "app_alert_deliveries",
      handledAt: null,
      dedupeKey: d.alert_id,
      failureCount: null,
    });
  }

  for (const s of smsRows ?? []) {
    const row = s as {
      id: string;
      chauffeur_id: number | null;
      alert_type: string;
      message: string;
      related_table: string | null;
      related_id: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    };
    const ref =
      row.related_table && row.related_id
        ? `Réf. ${row.related_table} : ${row.related_id}`
        : null;
    const msgParts = [row.message, ref, metaSnippet(row.metadata)].filter(Boolean);
    out.push({
      id: `derived-sms:${row.id}`,
      createdAt: row.created_at,
      category: "notification_failure",
      priority: "high",
      status: "failed",
      title: `SMS — ${row.alert_type}`,
      message: msgParts.join("\n\n") || null,
      employeeLabel: labelChauffeur(chauffeursById, row.chauffeur_id),
      employeeId: row.chauffeur_id,
      companyKey: null,
      emailDelivery: "—",
      smsDelivery: "failed",
      linkHref: null,
      sourceModule: "sms_alerts_log",
      handledAt: null,
      dedupeKey: null,
      failureCount: null,
    });
  }

  out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return out.slice(0, 200);
}

/**
 * Liste le journal app_alerts pour le centre d'alertes direction.
 */
export async function GET(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (role !== "admin" && role !== "direction") {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const url = new URL(req.url);
  const journal =
    url.searchParams.get("journal") ?? url.searchParams.get("filter") ?? "actionable";
  const phase2Queue = url.searchParams.get("phase2Queue");

  const supabase = createAdminSupabaseClient();

  if (phase2Queue === "echecs-notifications" || phase2Queue === "notes-mentions-erreur") {
    try {
      const items = await buildPhase2QueueJournalItems(
        supabase,
        phase2Queue as "echecs-notifications" | "notes-mentions-erreur"
      );
      return NextResponse.json({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur serveur";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  let query = supabase.from("app_alerts").select(
    "id, created_at, category, priority, status, title, body, link_href, source_module, employee_id, company_key, handled_at, metadata, dedupe_key"
  );

  if (journal === "actionable") {
    query = query.in("status", ["open", "failed"]);
  } else if (journal === "all") {
    // no status filter
  } else if (journal === "open" || journal === "failed" || journal === "handled" || journal === "archived" || journal === "cancelled") {
    query = query.eq("status", journal);
  } else {
    query = query.in("status", ["open", "failed"]);
  }

  const { data: alerts, error } = await query.order("created_at", { ascending: false }).limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (alerts ?? []) as AppAlertRow[];
  const empIds = [...new Set(rows.map((r) => r.employee_id).filter((id): id is number => id != null))];

  const chauffeursById = new Map<number, ChauffeurMini>();
  if (empIds.length > 0) {
    const { data: ch } = await supabase
      .from("chauffeurs")
      .select("id, nom, prenom")
      .in("id", empIds);
    for (const c of (ch ?? []) as ChauffeurMini[]) {
      chauffeursById.set(c.id, c);
    }
  }

  const alertIds = rows.map((r) => r.id);
  const deliveryByAlert = new Map<
    string,
    { email: string; sms: string; lastEmailAt: string | null; lastSmsAt: string | null }
  >();

  if (alertIds.length > 0) {
    const { data: dels } = await supabase
      .from("app_alert_deliveries")
      .select("alert_id, channel, status, created_at")
      .in("alert_id", alertIds);

    for (const d of dels ?? []) {
      const aid = d.alert_id as string | null;
      if (!aid) continue;
      const cur = deliveryByAlert.get(aid) ?? {
        email: "—",
        sms: "—",
        lastEmailAt: null as string | null,
        lastSmsAt: null as string | null,
      };
      const ch = d.channel as string;
      const st = d.status as string;
      const created = typeof d.created_at === "string" ? d.created_at : null;
      if (ch === "email") {
        cur.email = st;
        if (created) cur.lastEmailAt = created;
      }
      if (ch === "sms") {
        cur.sms = st;
        if (created) cur.lastSmsAt = created;
      }
      deliveryByAlert.set(aid, cur);
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 9;
    const pb = PRIORITY_ORDER[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const items = sorted.map((r) => {
    const ch = r.employee_id != null ? chauffeursById.get(r.employee_id) : null;
    const empLabel =
      ch != null
        ? [ch.prenom, ch.nom].filter(Boolean).join(" ").trim() || `Employé #${r.employee_id}`
        : r.employee_id != null
          ? `Employé #${r.employee_id}`
          : "—";
    const del = deliveryByAlert.get(r.id);
    const meta = r.metadata ?? {};
    const failureCount =
      typeof meta.failure_count === "number" && Number.isFinite(meta.failure_count)
        ? meta.failure_count
        : null;

    return {
      id: r.id,
      createdAt: r.created_at,
      category: r.category,
      priority: r.priority,
      status: r.status,
      title: r.title,
      message: r.body,
      employeeLabel: empLabel,
      employeeId: r.employee_id,
      companyKey: r.company_key,
      emailDelivery: del?.email ?? "—",
      smsDelivery: del?.sms ?? "—",
      linkHref: r.link_href,
      sourceModule: r.source_module,
      handledAt: r.handled_at,
      dedupeKey: r.dedupe_key,
      failureCount,
    };
  });

  return NextResponse.json({ items });
}

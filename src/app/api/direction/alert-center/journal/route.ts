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
};

type ChauffeurMini = { id: number; nom: string | null; prenom: string | null };

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
  const filter = url.searchParams.get("filter") ?? "actionable";

  const supabase = createAdminSupabaseClient();

  let query = supabase.from("app_alerts").select(
    "id, created_at, category, priority, status, title, body, link_href, source_module, employee_id, company_key, handled_at"
  );

  if (filter === "actionable" || filter === "open") {
    query = query.in("status", ["open", "failed"]);
  } else if (filter === "all") {
    // no status filter
  } else {
    query = query.eq("status", filter);
  }

  const { data: alerts, error } = await query.order("created_at", { ascending: false }).limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (alerts ?? []) as AppAlertRow[];
  const empIds = [...new Set(rows.map((r) => r.employee_id).filter((id): id is number => id != null))];

  let chauffeursById = new Map<number, ChauffeurMini>();
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
    };
  });

  return NextResponse.json({ items });
}

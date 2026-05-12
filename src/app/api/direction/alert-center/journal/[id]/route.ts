import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

const JOURNAL_ACTIONS = {
  mark_handled: { nextStatus: "handled" as const, from: ["open", "failed"] as const },
  archive: {
    nextStatus: "archived" as const,
    from: ["open", "failed", "handled", "snoozed"] as const,
  },
  cancel: { nextStatus: "cancelled" as const, from: ["open", "failed"] as const },
} as const;

type JournalActionKey = keyof typeof JOURNAL_ACTIONS;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseJournalId(raw: string):
  | { kind: "app_alert"; id: string }
  | { kind: "mention"; mentionId: number }
  | { kind: "delivery"; deliveryId: string }
  | { kind: "sms"; logId: string }
  | { kind: "invalid" } {
  const id = decodeURIComponent(raw).trim();
  if (!id.startsWith("derived-")) {
    return { kind: "app_alert", id };
  }
  if (id.startsWith("derived-mention:")) {
    const rest = id.slice("derived-mention:".length);
    const n = Number(rest);
    if (!Number.isInteger(n) || n < 1) return { kind: "invalid" };
    return { kind: "mention", mentionId: n };
  }
  if (id.startsWith("derived-del:")) {
    const rest = id.slice("derived-del:".length);
    if (!UUID_RE.test(rest)) return { kind: "invalid" };
    return { kind: "delivery", deliveryId: rest };
  }
  if (id.startsWith("derived-sms:")) {
    const rest = id.slice("derived-sms:".length);
    if (!UUID_RE.test(rest)) return { kind: "invalid" };
    return { kind: "sms", logId: rest };
  }
  return { kind: "invalid" };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (role !== "admin" && role !== "direction") {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id: paramId } = await params;
  if (!paramId) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }

  const body = (await req.json()) as { action?: unknown };
  const actionRaw = typeof body.action === "string" ? body.action : "";
  const config = JOURNAL_ACTIONS[actionRaw as JournalActionKey];
  if (!config) {
    return NextResponse.json({ error: "Action non reconnue." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const parsed = parseJournalId(paramId);

  if (parsed.kind === "invalid") {
    return NextResponse.json({ error: "Identifiant de journal invalide." }, { status: 400 });
  }

  if (parsed.kind === "mention") {
    const nextStatus =
      actionRaw === "cancel" ? ("aucun_courriel" as const) : ("lu" as const);
    const { data, error } = await supabase
      .from("internal_mentions")
      .update({
        status: nextStatus,
        read_at: now,
        email_error: null,
      })
      .eq("id", parsed.mentionId)
      .eq("status", "erreur_email")
      .select("id")
      .maybeSingle<{ id: number }>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (data?.id == null) {
      return NextResponse.json(
        { error: "Mention introuvable ou déjà traitée." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      id: paramId,
      status: config.nextStatus,
      derived: true,
      source: "internal_mentions",
    });
  }

  if (parsed.kind === "delivery") {
    const { data, error } = await supabase
      .from("app_alert_deliveries")
      .update({ status: "skipped", updated_at: now })
      .eq("id", parsed.deliveryId)
      .eq("status", "failed")
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data?.id) {
      return NextResponse.json(
        { error: "Ligne d’envoi introuvable ou déjà traitée." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      id: paramId,
      status: config.nextStatus,
      derived: true,
      source: "app_alert_deliveries",
    });
  }

  if (parsed.kind === "sms") {
    const { data, error } = await supabase
      .from("sms_alerts_log")
      .update({
        status: "acknowledged",
        acknowledged_at: now,
      })
      .eq("id", parsed.logId)
      .eq("status", "failed")
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data?.id) {
      return NextResponse.json(
        { error: "Journal SMS introuvable ou déjà traité." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      id: paramId,
      status: config.nextStatus,
      derived: true,
      source: "sms_alerts_log",
    });
  }

  const { data, error } = await supabase
    .from("app_alerts")
    .update({
      status: config.nextStatus,
      handled_at: now,
      handled_by: user.id,
    })
    .eq("id", parsed.id)
    .in("status", [...config.from])
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data?.id) {
    return NextResponse.json({ error: "Alerte introuvable ou statut incompatible." }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: data.id, status: config.nextStatus });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, role } = await getAuthenticatedRequestUser(_req);

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (role !== "admin" && role !== "direction") {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id: paramId } = await params;
  if (!paramId) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const parsed = parseJournalId(paramId);

  if (parsed.kind === "invalid") {
    return NextResponse.json({ error: "Identifiant de journal invalide." }, { status: 400 });
  }

  if (parsed.kind === "mention") {
    const { data, error: delErr } = await supabase
      .from("internal_mentions")
      .delete()
      .eq("id", parsed.mentionId)
      .eq("status", "erreur_email")
      .select("id");

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }
    if (!data?.length) {
      return NextResponse.json(
        { error: "Mention introuvable ou déjà retirée de cette file." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, id: paramId, derived: true });
  }

  if (parsed.kind === "delivery") {
    const { data, error: delErr } = await supabase
      .from("app_alert_deliveries")
      .delete()
      .eq("id", parsed.deliveryId)
      .eq("status", "failed")
      .select("id");

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }
    if (!data?.length) {
      return NextResponse.json(
        { error: "Ligne d’envoi introuvable ou déjà retirée." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, id: paramId, derived: true });
  }

  if (parsed.kind === "sms") {
    const { data, error: delErr } = await supabase
      .from("sms_alerts_log")
      .delete()
      .eq("id", parsed.logId)
      .eq("status", "failed")
      .select("id");

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }
    if (!data?.length) {
      return NextResponse.json(
        { error: "Journal SMS introuvable ou déjà retiré." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, id: paramId, derived: true });
  }

  const { data: row, error: loadErr } = await supabase
    .from("app_alerts")
    .select("id, priority")
    .eq("id", parsed.id)
    .maybeSingle<{ id: string; priority: string }>();

  if (loadErr || !row?.id) {
    return NextResponse.json({ error: "Alerte introuvable." }, { status: 404 });
  }

  if (row.priority === "critical") {
    return NextResponse.json(
      { error: "Les alertes critiques ne peuvent pas être supprimées depuis l’interface." },
      { status: 400 }
    );
  }

  const { error: delErr } = await supabase.from("app_alerts").delete().eq("id", parsed.id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, id: parsed.id });
}

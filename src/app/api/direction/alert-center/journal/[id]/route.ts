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

  const { id } = await params;
  if (!id) {
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

  const { data, error } = await supabase
    .from("app_alerts")
    .update({
      status: config.nextStatus,
      handled_at: now,
      handled_by: user.id,
    })
    .eq("id", id)
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  const { data: row, error: loadErr } = await supabase
    .from("app_alerts")
    .select("id, priority")
    .eq("id", id)
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

  const { error: delErr } = await supabase.from("app_alerts").delete().eq("id", id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, id });
}

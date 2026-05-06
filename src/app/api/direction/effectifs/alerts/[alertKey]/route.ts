import { NextRequest, NextResponse } from "next/server";
import { requireDirectionOrAdmin } from "@/app/api/direction/effectifs/_lib";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ alertKey: string }> }
) {
  const auth = await requireDirectionOrAdmin(req);
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  const params = await context.params;
  const alertKey = decodeURIComponent(params.alertKey);

  const body = (await req.json()) as { status?: unknown; note?: unknown };
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
  const note = typeof body.note === "string" ? body.note.trim() : null;
  if (!["resolue", "ignoree", "archivee"].includes(status)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status,
    updated_at: nowIso,
    note,
  };
  if (status === "resolue") {
    updates.resolved_at = nowIso;
    updates.resolved_by = user.id;
  }
  if (status === "ignoree") {
    updates.ignored_at = nowIso;
    updates.ignored_by = user.id;
  }
  if (status === "archivee") {
    updates.archived_at = nowIso;
  }

  const { data, error } = await supabase
    .from("effectifs_alert_states")
    .update(updates)
    .eq("alert_key", alertKey)
    .select("alert_key, status, note, resolved_at, ignored_at, archived_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data });
}

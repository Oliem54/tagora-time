import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
  if (body.action !== "mark_handled") {
    return NextResponse.json({ error: "Action non reconnue." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("app_alerts")
    .update({
      status: "handled",
      handled_at: now,
      handled_by: user.id,
    })
    .eq("id", id)
    .in("status", ["open", "failed"])
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data?.id) {
    return NextResponse.json({ error: "Alerte introuvable ou déjà traitée." }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: data.id });
}

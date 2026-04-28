import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    if (role !== "admin") {
      return NextResponse.json({ error: "Acces reserve aux admins." }, { status: 403 });
    }

    const { id: raw } = await context.params;
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const nowIso = new Date().toISOString();

    const { data: row, error: loadErr } = await supabase
      .from("app_improvements")
      .select("id, archived_at, deleted_at")
      .eq("id", id)
      .maybeSingle<{
        id: number;
        archived_at: string | null;
        deleted_at: string | null;
      }>();

    if (loadErr || !row) {
      return NextResponse.json({ error: "Suggestion introuvable." }, { status: 404 });
    }
    if (row.deleted_at) {
      return NextResponse.json({ error: "Suggestion deja supprimee." }, { status: 400 });
    }
    if (row.archived_at) {
      return NextResponse.json({ error: "Deja archivee." }, { status: 400 });
    }

    const { error } = await supabase
      .from("app_improvements")
      .update({
        archived_at: nowIso,
        archived_by: user.id,
        updated_at: nowIso,
      })
      .eq("id", id);

    if (error) {
      console.error("[ameliorations][archive] update failed", error);
      return NextResponse.json({ error: "Impossible d archiver." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[ameliorations][archive] unexpected", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inattendue." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (role !== "admin" && role !== "direction") {
    return NextResponse.json(
      { error: "Accès réservé à la direction et aux administrateurs." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const supabase = createAdminSupabaseClient();

  const { data: row, error: fetchErr } = await supabase
    .from("app_communication_templates")
    .select("id, default_subject, default_body, channel")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
  }

  const defBody = String(row.default_body ?? "").trim();
  if (!defBody) {
    return NextResponse.json(
      { error: "Aucun texte par défaut enregistré pour ce modèle." },
      { status: 400 }
    );
  }

  if (row.channel === "email") {
    const subj = String(row.default_subject ?? "").trim();
    if (!subj) {
      return NextResponse.json(
        { error: "Aucun sujet par défaut pour ce courriel." },
        { status: 400 }
      );
    }
  }

  const { data: updated, error: upErr } = await supabase
    .from("app_communication_templates")
    .update({
      subject: row.default_subject,
      body: row.default_body,
      updated_by: user.id,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (upErr) {
    return NextResponse.json({ error: "Réinitialisation impossible." }, { status: 500 });
  }

  return NextResponse.json({ template: updated });
}

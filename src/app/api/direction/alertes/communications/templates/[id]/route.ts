import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PatchBody = {
  subject?: string | null;
  body?: string;
  active?: boolean;
  implementation_status?: string;
};

export async function PATCH(
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
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: row, error: fetchErr } = await supabase
    .from("app_communication_templates")
    .select("id, channel, subject, body")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_by: user.id,
  };

  if (body.subject !== undefined) {
    updates.subject = body.subject;
  }
  if (body.body !== undefined) {
    updates.body = body.body;
  }
  if (body.active !== undefined) {
    updates.active = body.active;
  }
  if (body.implementation_status !== undefined) {
    updates.implementation_status = body.implementation_status;
  }

  const nextSubject = (updates.subject !== undefined ? updates.subject : row.subject) as string | null;
  const nextBody = (updates.body !== undefined ? updates.body : row.body) as string;

  if (row.channel === "email") {
    const subj = String(nextSubject ?? "").trim();
    if (!subj) {
      return NextResponse.json(
        { error: "Le sujet est obligatoire pour un courriel." },
        { status: 400 }
      );
    }
  }
  if (!String(nextBody ?? "").trim()) {
    return NextResponse.json({ error: "Le corps du message ne peut pas être vide." }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabase
    .from("app_communication_templates")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (upErr) {
    console.error("[communications/templates/patch]", upErr.message);
    return NextResponse.json({ error: "Mise à jour impossible." }, { status: 500 });
  }

  return NextResponse.json({ template: updated });
}

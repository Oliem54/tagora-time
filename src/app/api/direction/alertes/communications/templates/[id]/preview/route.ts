import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import {
  previewCommunicationTemplate,
  type AppCommunicationTemplateRow,
} from "@/app/lib/communication-templates.server";
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
  let overrides: Record<string, string> | undefined;
  try {
    const j = await req.json().catch(() => ({}));
    if (j && typeof j === "object" && j.variables && typeof j.variables === "object") {
      overrides = j.variables as Record<string, string>;
    }
  } catch {
    overrides = undefined;
  }

  const supabase = createAdminSupabaseClient();
  const { data: row, error } = await supabase
    .from("app_communication_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Modèle introuvable." }, { status: 404 });
  }

  const preview = previewCommunicationTemplate(row as AppCommunicationTemplateRow, overrides);

  return NextResponse.json({
    channel: row.channel,
    ...preview,
  });
}

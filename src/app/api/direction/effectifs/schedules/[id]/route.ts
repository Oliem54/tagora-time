import { NextRequest, NextResponse } from "next/server";
import { requireDirectionOrAdmin } from "@/app/api/direction/effectifs/_lib";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireDirectionOrAdmin(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const params = await context.params;
    const id = params.id;

    if (!id) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }

    const { error } = await supabase.from("employee_schedules").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur suppression quart." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireDirectionOrAdmin } from "@/app/api/direction/ramassages/_lib";
import { buildUpdateStamp, getUserDisplayName } from "@/app/lib/livraisons/audit-stamp.server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireDirectionOrAdmin(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const { id } = await params;
    const pickupId = Number(id);
    if (!Number.isFinite(pickupId) || pickupId <= 0) {
      return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      dateLivraison?: string;
      heurePrevue?: string;
      note?: string;
    };

    if (!body.dateLivraison || !/^\d{4}-\d{2}-\d{2}$/.test(body.dateLivraison)) {
      return NextResponse.json({ error: "Date de replanification invalide." }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {
      date_livraison: body.dateLivraison,
      heure_prevue: body.heurePrevue ?? null,
      statut: "planifiee",
    };

    const existingRes = await supabase
      .from("livraisons_planifiees")
      .select("notes")
      .eq("id", pickupId)
      .maybeSingle();
    const currentNotes = typeof existingRes.data?.notes === "string" ? existingRes.data.notes : "";
    const stamp = new Date().toISOString();
    const actorLabel = getUserDisplayName(user);
    const noteLine = `[${stamp}] Replanifie par ${actorLabel} vers ${body.dateLivraison}${body.heurePrevue ? ` ${body.heurePrevue}` : ""}${body.note ? ` — ${body.note}` : ""}`;
    updatePayload.notes = currentNotes ? `${currentNotes}\n${noteLine}` : noteLine;

    const stampedPayload = { ...updatePayload, ...buildUpdateStamp(user) };

    const { error } = await supabase
      .from("livraisons_planifiees")
      .update(stampedPayload)
      .eq("id", pickupId)
      .eq("type_operation", "ramassage_client");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur replanification." },
      { status: 500 }
    );
  }
}

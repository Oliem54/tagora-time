import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  isAllowedResourceReason,
  normalizeOptionalNote,
  parseIsoDateTime,
  requireDirectionOrAdmin,
} from "@/app/api/disponibilites/_lib";

type CreateRemorqueUnavailabilityBody = {
  remorque_id?: unknown;
  start_at?: unknown;
  end_at?: unknown;
  reason?: unknown;
  note?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const access = await requireDirectionOrAdmin(req);
    if (!access.ok) return access.response;

    const body = (await req.json()) as CreateRemorqueUnavailabilityBody;
    const remorqueId = Number(body.remorque_id);
    const startAt = parseIsoDateTime(body.start_at);
    const endAt = parseIsoDateTime(body.end_at);
    const reason = body.reason;
    const note = normalizeOptionalNote(body.note);

    if (!Number.isFinite(remorqueId) || remorqueId <= 0) {
      return NextResponse.json({ error: "Remorque invalide." }, { status: 400 });
    }

    if (!startAt || !endAt) {
      return NextResponse.json(
        { error: "Periode invalide. Le debut et la fin sont obligatoires." },
        { status: 400 }
      );
    }

    if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
      return NextResponse.json(
        { error: "Periode invalide. Le debut doit etre avant la fin." },
        { status: 400 }
      );
    }

    if (!isAllowedResourceReason(reason)) {
      return NextResponse.json({ error: "Raison d'indisponibilite invalide." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("remorque_unavailabilities")
      .insert({
        remorque_id: remorqueId,
        start_at: startAt,
        end_at: endAt,
        reason,
        note,
        status: "active",
        created_by: access.user.id,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Creation de l'indisponibilite impossible." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, row: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur serveur lors de la creation de l'indisponibilite remorque.",
      },
      { status: 500 }
    );
  }
}

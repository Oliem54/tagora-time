import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  isAllowedDayReason,
  normalizeOptionalNote,
  parseDateOnly,
  requireDirectionOrAdmin,
} from "@/app/api/disponibilites/_lib";

type CreateDayClosureBody = {
  closure_date?: unknown;
  reason?: unknown;
  note?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const access = await requireDirectionOrAdmin(req);
    if (!access.ok) return access.response;

    const body = (await req.json()) as CreateDayClosureBody;
    const closureDate = parseDateOnly(body.closure_date);
    const reason = body.reason;
    const note = normalizeOptionalNote(body.note);

    if (!closureDate) {
      return NextResponse.json({ error: "Date de fermeture invalide." }, { status: 400 });
    }

    if (!isAllowedDayReason(reason)) {
      return NextResponse.json({ error: "Raison de fermeture invalide." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("delivery_day_closures")
      .insert({
        closure_date: closureDate,
        reason,
        note,
        status: "active",
        created_by: access.user.id,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Creation de la fermeture impossible." },
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
            : "Erreur serveur lors de la creation de la fermeture.",
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { requireDirectionUser } from "@/app/lib/timeclock-api";
import { HORODATEUR_EVENT_TYPES } from "@/app/lib/horodateur";

function isHorodateurEventType(value: unknown) {
  return HORODATEUR_EVENT_TYPES.includes(value as (typeof HORODATEUR_EVENT_TYPES)[number]);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireDirectionUser(req, "terrain");

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.response.error },
        { status: auth.response.status }
      );
    }

    const body = (await req.json()) as {
      user_id?: unknown;
      chauffeur_id?: unknown;
      event_type?: unknown;
      occurred_at?: unknown;
      company_context?: unknown;
      note?: unknown;
      metadata?: Record<string, unknown>;
    };

    const userId = typeof body.user_id === "string" ? body.user_id : "";
    const chauffeurId = Number(body.chauffeur_id);
    const occurredAt =
      typeof body.occurred_at === "string" && body.occurred_at.trim()
        ? body.occurred_at
        : "";
    const companyContext =
      body.company_context === "oliem_solutions" ||
      body.company_context === "titan_produits_industriels"
        ? body.company_context
        : null;
    const note = String(body.note ?? "").trim();

    if (!userId) {
      return NextResponse.json({ error: "Employe requis." }, { status: 400 });
    }

    if (!isHorodateurEventType(body.event_type)) {
      return NextResponse.json({ error: "Type de punch invalide." }, { status: 400 });
    }

    if (!occurredAt) {
      return NextResponse.json({ error: "Date et heure requises." }, { status: 400 });
    }

    if (!companyContext) {
      return NextResponse.json({ error: "Compagnie requise." }, { status: 400 });
    }

    if (!note) {
      return NextResponse.json(
        { error: "Une note de justification est requise." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("horodateur_events")
      .insert([
        {
          user_id: userId,
          event_type: body.event_type,
          occurred_at: occurredAt,
          company_context: companyContext,
          source_module: "admin_proxy_punch",
          notes: note,
          entered_by_admin: true,
          entered_by_user_id: auth.user.id,
          admin_note: note,
          metadata: {
            ...(body.metadata ?? {}),
            proxy_punch: true,
            correction_manuelle: true,
            actor_role: "direction",
            admin_email: auth.user.email ?? null,
            chauffeur_id: Number.isFinite(chauffeurId) ? chauffeurId : null,
          },
        },
      ])
      .select(
        "id, user_id, event_type, occurred_at, company_context, notes, entered_by_admin, entered_by_user_id, admin_note, metadata, created_at"
      )
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, punch_event: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors du punch admin.",
      },
      { status: 500 }
    );
  }
}

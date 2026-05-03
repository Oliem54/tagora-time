import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  EFFECTIFS_CALENDAR_EXCEPTION_TYPES,
  mapCalendarExceptionRow,
} from "@/app/lib/effectifs-calendar-exception.shared";
import { normalizeEffectifsDepartmentKey } from "@/app/lib/effectifs-departments.shared";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user || (role !== "direction" && role !== "admin")) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }
    const supabase = createAdminSupabaseClient();
    const del = await supabase.from("effectifs_calendar_exceptions").delete().eq("id", id);
    if (del.error) {
      return NextResponse.json({ error: del.error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur suppression." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user || (role !== "direction" && role !== "admin")) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.date === "string") patch.date = body.date.trim().slice(0, 10);
    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.type === "string") {
      const t = body.type.trim();
      if (!EFFECTIFS_CALENDAR_EXCEPTION_TYPES.includes(t as (typeof EFFECTIFS_CALENDAR_EXCEPTION_TYPES)[number])) {
        return NextResponse.json({ error: "Type invalide." }, { status: 400 });
      }
      patch.type = t;
    }
    if (body.is_closed === true || body.is_closed === false) patch.is_closed = body.is_closed;
    if ("department_key" in body) {
      if (body.department_key === null || body.department_key === "") {
        patch.department_key = null;
      } else {
        const dk = normalizeEffectifsDepartmentKey(String(body.department_key));
        if (!dk) return NextResponse.json({ error: "Département invalide." }, { status: 400 });
        patch.department_key = dk;
      }
    }
    if ("location" in body) {
      patch.location =
        body.location === null || body.location === ""
          ? null
          : String(body.location).trim() || null;
    }
    if ("start_time" in body) {
      patch.start_time =
        typeof body.start_time === "string" && body.start_time.trim()
          ? body.start_time.trim().slice(0, 8)
          : null;
    }
    if ("end_time" in body) {
      patch.end_time =
        typeof body.end_time === "string" && body.end_time.trim()
          ? body.end_time.trim().slice(0, 8)
          : null;
    }
    if ("notes" in body) {
      patch.notes =
        typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Aucun champ à mettre à jour." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const upd = await supabase
      .from("effectifs_calendar_exceptions")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }
    const mapped = upd.data
      ? mapCalendarExceptionRow(upd.data as Record<string, unknown>)
      : null;
    return NextResponse.json({ exception: mapped });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur mise à jour." },
      { status: 500 }
    );
  }
}

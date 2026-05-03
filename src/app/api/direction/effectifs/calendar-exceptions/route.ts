import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  EFFECTIFS_CALENDAR_EXCEPTION_TYPES,
  mapCalendarExceptionRow,
} from "@/app/lib/effectifs-calendar-exception.shared";
import { normalizeEffectifsDepartmentKey } from "@/app/lib/effectifs-departments.shared";

export const dynamic = "force-dynamic";

function parseExceptionBody(body: unknown): {
  ok: true;
  value: Record<string, unknown>;
} | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Corps JSON invalide." };
  }
  const b = body as Record<string, unknown>;
  const date = typeof b.date === "string" ? b.date.trim().slice(0, 10) : "";
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const type = typeof b.type === "string" ? b.type.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Date invalide." };
  }
  if (!title) {
    return { ok: false, error: "Titre requis." };
  }
  if (!EFFECTIFS_CALENDAR_EXCEPTION_TYPES.includes(type as (typeof EFFECTIFS_CALENDAR_EXCEPTION_TYPES)[number])) {
    return { ok: false, error: "Type d’exception invalide." };
  }
  const is_closed = b.is_closed === true;
  const deptRaw = b.department_key;
  const department_key =
    deptRaw === null || deptRaw === undefined || deptRaw === ""
      ? null
      : normalizeEffectifsDepartmentKey(String(deptRaw));
  if (deptRaw != null && deptRaw !== "" && !department_key) {
    return { ok: false, error: "Département invalide." };
  }
  const location =
    b.location === null || b.location === undefined || b.location === ""
      ? null
      : String(b.location).trim() || null;
  const start_time =
    typeof b.start_time === "string" && b.start_time.trim()
      ? b.start_time.trim().slice(0, 8)
      : null;
  const end_time =
    typeof b.end_time === "string" && b.end_time.trim()
      ? b.end_time.trim().slice(0, 8)
      : null;
  const notes =
    typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null;

  return {
    ok: true,
    value: {
      date,
      title,
      type,
      is_closed,
      department_key,
      location,
      start_time,
      end_time,
      notes,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user || (role !== "direction" && role !== "admin")) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const parsed = parseExceptionBody(await req.json().catch(() => null));
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const insertRes = await supabase
      .from("effectifs_calendar_exceptions")
      .insert({
        ...parsed.value,
        created_by: user.id,
      })
      .select("*")
      .maybeSingle();

    if (insertRes.error) {
      return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
    }

    const mapped = insertRes.data
      ? mapCalendarExceptionRow(insertRes.data as Record<string, unknown>)
      : null;
    return NextResponse.json({ exception: mapped }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur création exception.",
      },
      { status: 500 }
    );
  }
}

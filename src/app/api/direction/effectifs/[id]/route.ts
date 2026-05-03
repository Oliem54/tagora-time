import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { mapCoverageWindowsFromDb } from "../_lib";
import { normalizeTimeInput, parseWindowPatchBody } from "../window-body";

export const dynamic = "force-dynamic";

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

    const body = await req.json().catch(() => null);
    const parsed = parseWindowPatchBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const existingRes = await supabase
      .from("department_coverage_windows")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (existingRes.error) {
      return NextResponse.json({ error: existingRes.error.message }, { status: 500 });
    }
    if (!existingRes.data) {
      return NextResponse.json({ error: "Plage introuvable." }, { status: 404 });
    }

    const cur = existingRes.data as Record<string, unknown>;
    const patch = parsed.value;

    const start =
      patch.start_local ??
      normalizeTimeInput(cur.start_local ?? cur.start_time) ??
      "";
    const end =
      patch.end_local ??
      normalizeTimeInput(cur.end_local ?? cur.end_time) ??
      "";

    if (start && end) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      if (eh * 60 + em <= sh * 60 + sm) {
        return NextResponse.json(
          { error: "L’heure de fin doit être après le début." },
          { status: 400 }
        );
      }
    }

    const updateRow: Record<string, unknown> = {};
    if (patch.department_key !== undefined) {
      updateRow.department_key = patch.department_key;
    }
    if (patch.company_key !== undefined) {
      updateRow.company_key = patch.company_key;
    }
    if (patch.weekday !== undefined) {
      updateRow.weekday = patch.weekday;
      updateRow.day_of_week = patch.weekday;
    }
    if (patch.start_local !== undefined) {
      updateRow.start_local = patch.start_local;
    }
    if (patch.end_local !== undefined) {
      updateRow.end_local = patch.end_local;
    }
    if (patch.min_employees !== undefined) {
      updateRow.min_employees = patch.min_employees;
    }
    if (patch.location_key !== undefined) {
      updateRow.location_key = patch.location_key;
      updateRow.location = patch.location_key;
    }
    if (patch.location_label !== undefined) {
      updateRow.location_label = patch.location_label;
    }
    if (patch.active !== undefined) {
      updateRow.active = patch.active;
    }

    updateRow.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("department_coverage_windows")
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mapped = data ? mapCoverageWindowsFromDb([data as Record<string, unknown>]) : [];
    return NextResponse.json({ window: mapped[0] ?? null });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur mise à jour plage.",
      },
      { status: 500 }
    );
  }
}

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
    const { error } = await supabase
      .from("department_coverage_windows")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur suppression plage.",
      },
      { status: 500 }
    );
  }
}

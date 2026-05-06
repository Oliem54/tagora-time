import { NextRequest, NextResponse } from "next/server";
import {
  isMissingRelationInSchemaCache,
  normalizeDepartment,
  normalizeLocation,
  requireDirectionOrAdmin,
} from "@/app/api/direction/effectifs/_lib";

export const dynamic = "force-dynamic";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDirectionOrAdmin(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  const { id } = await context.params;
  const body = (await req.json()) as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if ("department" in body) updates.department = normalizeDepartment(body.department);
  if ("location" in body) updates.location = normalizeLocation(body.location);
  if ("dayOfWeek" in body) updates.day_of_week = Number(body.dayOfWeek);
  if ("startTime" in body) updates.start_time = asString(body.startTime);
  if ("endTime" in body) updates.end_time = asString(body.endTime);
  if ("minEmployees" in body) updates.min_employees = Math.max(0, Number(body.minEmployees) || 0);
  if ("active" in body) updates.active = body.active !== false;

  const { data, error } = await supabase
    .from("department_coverage_windows")
    .update(updates)
    .eq("id", id)
    .select("id, department, location, day_of_week, start_time, end_time, min_employees, active")
    .single();
  if (isMissingRelationInSchemaCache(error, "department_coverage_windows")) {
    return NextResponse.json(
      {
        error:
          "Table de configuration des plages manquante. Appliquez la migration 20260501_170000_effectifs_shift_coverage_windows.sql.",
      },
      { status: 409 }
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ window: data });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDirectionOrAdmin(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  const { id } = await context.params;

  const { error } = await supabase.from("department_coverage_windows").delete().eq("id", id);
  if (isMissingRelationInSchemaCache(error, "department_coverage_windows")) {
    return NextResponse.json(
      {
        error:
          "Table de configuration des plages manquante. Appliquez la migration 20260501_170000_effectifs_shift_coverage_windows.sql.",
      },
      { status: 409 }
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

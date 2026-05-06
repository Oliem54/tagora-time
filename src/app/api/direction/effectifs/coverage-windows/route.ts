import { NextRequest, NextResponse } from "next/server";
import {
  isMissingRelationInSchemaCache,
  normalizeDepartment,
  normalizeLocation,
  requireAuthenticatedViewer,
  requireDirectionOrAdmin,
} from "@/app/api/direction/effectifs/_lib";

export const dynamic = "force-dynamic";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedViewer(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  const { data, error } = await supabase
    .from("department_coverage_windows")
    .select("id, department, location, day_of_week, start_time, end_time, min_employees, active")
    .order("department", { ascending: true })
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  if (isMissingRelationInSchemaCache(error, "department_coverage_windows")) {
    return NextResponse.json({ windows: [], migrationRequired: true });
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    windows: (data ?? []).map((row) => ({
      ...row,
      department: normalizeDepartment(row.department) ?? "Autre",
      location: normalizeLocation(row.location) ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireDirectionOrAdmin(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  const body = (await req.json()) as Record<string, unknown>;
  const department = normalizeDepartment(body.department);
  const location = normalizeLocation(body.location);
  const dayOfWeek = Number(body.dayOfWeek);
  const startTime = asString(body.startTime);
  const endTime = asString(body.endTime);
  const minEmployees = Math.max(0, Number(body.minEmployees) || 0);
  const active = body.active !== false;

  if (!department) return NextResponse.json({ error: "Département invalide." }, { status: 400 });
  if (!Number.isFinite(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    return NextResponse.json({ error: "Jour invalide." }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json({ error: "Heures invalides." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("department_coverage_windows")
    .insert([
      {
        department,
        location,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        min_employees: minEmployees,
        active,
      },
    ])
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
  return NextResponse.json({ window: data }, { status: 201 });
}

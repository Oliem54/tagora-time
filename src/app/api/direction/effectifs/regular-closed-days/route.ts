import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

function parseClosedDays(body: unknown): number[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { closedDays?: unknown }).closedDays;
  if (!Array.isArray(raw)) return null;
  const out = Array.from(
    new Set(
      raw
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
        .map((n) => Math.trunc(n))
    )
  ).sort((a, b) => a - b);
  return out;
}

function normalizeCompanyKey(value: unknown): "all" | "oliem_solutions" | "titan_produits_industriels" {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "all";
  if (v === "oliem" || v === "oliem_solutions") return "oliem_solutions";
  if (v === "titan" || v === "titan_produits_industriels") return "titan_produits_industriels";
  return "all";
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }
    const supabase = createAdminSupabaseClient();
    const companyKey = normalizeCompanyKey(req.nextUrl.searchParams.get("company"));
    const res = await supabase
      .from("effectifs_regular_closed_days")
      .select("day_of_week, active, scope, department_key, location_key, company_key")
      .order("day_of_week", { ascending: true });
    if (res.error) {
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }
    const rows = (res.data ?? []) as Record<string, unknown>[];
    const closedDays = rows
      .filter((r) => {
        const ck = normalizeCompanyKey((r as Record<string, unknown>).company_key);
        return (
          r.active !== false &&
          (companyKey === "all" ? ck === "all" : ck === "all" || ck === companyKey) &&
          (r.scope === "company" || r.scope == null) &&
          r.department_key == null &&
          r.location_key == null
        );
      })
      .map((r) => Number((r as Record<string, unknown>).day_of_week))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
      .map((n) => Math.trunc(n));
    return NextResponse.json({ closedDays, rows });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur chargement jours fermés réguliers.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user || (role !== "direction" && role !== "admin")) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
    const body = (await req.json().catch(() => null)) as {
      closedDays?: unknown;
      company_key?: unknown;
      scope?: unknown;
      department_key?: unknown;
      location_key?: unknown;
      active?: unknown;
    } | null;
    const closedDays = parseClosedDays(body);
    if (!closedDays) {
      return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
    }
    const companyKey = normalizeCompanyKey(body?.company_key);
    const scopeRaw = typeof body?.scope === "string" ? body.scope.trim() : "company";
    const scope =
      scopeRaw === "department" || scopeRaw === "location" ? scopeRaw : "company";
    const departmentKey =
      typeof body?.department_key === "string" && body.department_key.trim()
        ? body.department_key.trim()
        : null;
    const locationKey =
      typeof body?.location_key === "string" && body.location_key.trim()
        ? body.location_key.trim()
        : null;
    const scopedDepartmentKey = scope === "department" ? departmentKey : null;
    const scopedLocationKey = scope === "location" ? locationKey : null;
    const activeFlag = body?.active !== false;
    const supabase = createAdminSupabaseClient();
    let existingQuery = supabase
      .from("effectifs_regular_closed_days")
      .select("id, day_of_week")
      .eq("scope", scope)
      .eq("company_key", companyKey)
      .limit(50);
    existingQuery =
      scopedDepartmentKey == null
        ? existingQuery.is("department_key", null)
        : existingQuery.eq("department_key", scopedDepartmentKey);
    existingQuery =
      scopedLocationKey == null
        ? existingQuery.is("location_key", null)
        : existingQuery.eq("location_key", scopedLocationKey);
    const existing = await existingQuery;
    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 500 });
    }
    const existingRows = (existing.data ?? []) as { id: string; day_of_week: number }[];
    const byDow = new Map(existingRows.map((r) => [r.day_of_week, r]));
    const allDow = [0, 1, 2, 3, 4, 5, 6];
    for (const dow of allDow) {
      const row = byDow.get(dow);
      const shouldBeActive = activeFlag && closedDays.includes(dow);
      if (row) {
        const upd = await supabase
          .from("effectifs_regular_closed_days")
          .update({ active: shouldBeActive, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        if (upd.error) {
          return NextResponse.json({ error: upd.error.message }, { status: 500 });
        }
      } else if (shouldBeActive) {
        const ins = await supabase.from("effectifs_regular_closed_days").insert({
          company_key: companyKey,
          day_of_week: dow,
          scope,
          department_key: scopedDepartmentKey,
          location_key: scopedLocationKey,
          active: true,
        });
        if (ins.error) {
          return NextResponse.json({ error: ins.error.message }, { status: 500 });
        }
      }
    }

    // Optional helper: disable active windows on closed weekdays.
    if (scope === "company" && scopedDepartmentKey == null && scopedLocationKey == null) {
      const disable = await supabase
        .from("department_coverage_windows")
        .update({ active: false, updated_at: new Date().toISOString() })
        .in("day_of_week", closedDays)
        .eq("company_key", companyKey)
        .eq("active", true);
      if (disable.error) {
        return NextResponse.json({ error: disable.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ closedDays });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur mise à jour jours fermés réguliers.",
      },
      { status: 500 }
    );
  }
}

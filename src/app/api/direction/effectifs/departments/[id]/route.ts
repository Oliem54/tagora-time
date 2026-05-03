import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  isEffectifsDepartmentKey,
  normalizeEffectifsCompanyKey,
  type EffectifsDepartmentKey,
} from "@/app/lib/effectifs-departments.shared";
import type { EffectifsDepartment } from "@/app/lib/effectifs-payload.shared";

export const dynamic = "force-dynamic";

type DirectoryDepartmentPayload = EffectifsDepartment & { id: string | null };

function mapRow(raw: Record<string, unknown>): DirectoryDepartmentPayload | null {
  const keyRaw = typeof raw.department_key === "string" ? raw.department_key.trim() : "";
  if (!keyRaw || !isEffectifsDepartmentKey(keyRaw)) return null;
  const sortOrder =
    typeof raw.sort_order === "number" ? raw.sort_order : Number(raw.sort_order ?? 100);
  const labelRaw = typeof raw.label === "string" ? raw.label.trim() : "";
  const idRaw = typeof raw.id === "string" ? raw.id : null;
  return {
    id: idRaw,
    key: keyRaw as EffectifsDepartmentKey,
    label: labelRaw || keyRaw,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
    companyKey: normalizeEffectifsCompanyKey(raw.company_key),
    locationKey:
      typeof raw.location_key === "string" && raw.location_key.trim()
        ? raw.location_key.trim()
        : null,
    active: raw.active !== false,
  };
}

async function isDepartmentReferenced(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  departmentKey: string
): Promise<boolean> {
  const [
    windows,
    chauffeursPrimary,
    chauffeursSecondary,
    closed,
    exceptions,
    scheduleTargets,
  ] = await Promise.all([
    supabase
      .from("department_coverage_windows")
      .select("id", { count: "exact", head: true })
      .eq("department_key", departmentKey),
    supabase
      .from("chauffeurs")
      .select("id", { count: "exact", head: true })
      .eq("effectifs_department_key", departmentKey),
    supabase
      .from("chauffeurs")
      .select("id", { count: "exact", head: true })
      .contains("effectifs_secondary_department_keys", [departmentKey]),
    supabase
      .from("effectifs_regular_closed_days")
      .select("id", { count: "exact", head: true })
      .eq("department_key", departmentKey),
    supabase
      .from("effectifs_calendar_exceptions")
      .select("id", { count: "exact", head: true })
      .eq("department_key", departmentKey),
    supabase
      .from("effectifs_employee_schedule_requests")
      .select("id", { count: "exact", head: true })
      .eq("target_department_key", departmentKey),
  ]);

  const entries = [
    windows,
    chauffeursPrimary,
    chauffeursSecondary,
    closed,
    exceptions,
    scheduleTargets,
  ];
  for (const r of entries) {
    if (r.error) continue;
    if ((r.count ?? 0) > 0) return true;
  }
  return false;
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

    const body = (await req.json().catch(() => null)) as {
      label?: unknown;
      company_key?: unknown;
      location_key?: unknown;
      sort_order?: unknown;
      active?: unknown;
      department_key?: unknown;
    } | null;

    if (body && typeof body === "object" && body.department_key !== undefined) {
      return NextResponse.json(
        { error: "La clé technique du département ne peut pas être modifiée." },
        { status: 400 }
      );
    }

    const updateRow: Record<string, unknown> = {};
    if (typeof body?.label === "string") {
      const label = body.label.trim();
      if (!label) {
        return NextResponse.json(
          { error: "Libellé obligatoire." },
          { status: 400 }
        );
      }
      updateRow.label = label;
    }
    if (body?.company_key !== undefined) {
      updateRow.company_key = normalizeEffectifsCompanyKey(body.company_key);
    }
    if (body?.location_key !== undefined) {
      updateRow.location_key =
        typeof body.location_key === "string" && body.location_key.trim()
          ? body.location_key.trim()
          : null;
    }
    if (body?.sort_order !== undefined) {
      const n =
        typeof body.sort_order === "number"
          ? body.sort_order
          : Number(body.sort_order ?? NaN);
      if (!Number.isFinite(n)) {
        return NextResponse.json(
          { error: "Ordre d'affichage invalide." },
          { status: 400 }
        );
      }
      updateRow.sort_order = Math.trunc(n);
    }
    if (body?.active !== undefined) {
      updateRow.active = body.active !== false;
    }

    if (Object.keys(updateRow).length === 0) {
      return NextResponse.json(
        { error: "Aucun champ à mettre à jour." },
        { status: 400 }
      );
    }

    updateRow.updated_at = new Date().toISOString();

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("effectifs_departments")
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Département introuvable." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      department: mapRow(data as Record<string, unknown>),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur mise à jour département.",
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

    const existingRes = await supabase
      .from("effectifs_departments")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (existingRes.error) {
      return NextResponse.json(
        { error: existingRes.error.message },
        { status: 500 }
      );
    }
    if (!existingRes.data) {
      return NextResponse.json(
        { error: "Département introuvable." },
        { status: 404 }
      );
    }

    const existing = existingRes.data as Record<string, unknown>;
    const deptKey = typeof existing.department_key === "string" ? existing.department_key : "";

    const referenced = deptKey
      ? await isDepartmentReferenced(supabase, deptKey)
      : false;

    if (referenced) {
      const { data, error } = await supabase
        .from("effectifs_departments")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        mode: "deactivated",
        reason:
          "Ce département est utilisé dans l'historique. Il a été désactivé au lieu d'être supprimé.",
        department: data ? mapRow(data as Record<string, unknown>) : null,
      });
    }

    const { error } = await supabase
      .from("effectifs_departments")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, mode: "deleted" });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur suppression département.",
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  EFFECTIFS_DEPARTMENT_ENTRIES,
  isEffectifsDepartmentKey,
  isValidDynamicDepartmentKeySlug,
  normalizeEffectifsCompanyKey,
  type EffectifsDepartmentKey,
} from "@/app/lib/effectifs-departments.shared";
import type { EffectifsDepartment } from "@/app/lib/effectifs-payload.shared";

export const dynamic = "force-dynamic";

function isMissingDepartmentsTableError(error: {
  code?: string;
  message?: string;
}): boolean {
  const msg = (error.message ?? "").toLowerCase();
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return (
    msg.includes("effectifs_departments") &&
    (msg.includes("does not exist") ||
      msg.includes("introuvable") ||
      msg.includes("not find") ||
      msg.includes("schema cache"))
  );
}

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

function fallbackPayload(): DirectoryDepartmentPayload[] {
  return EFFECTIFS_DEPARTMENT_ENTRIES.map((entry) => ({
    id: null,
    key: entry.key,
    label: entry.label,
    sortOrder: entry.sortOrder,
    companyKey: entry.companyKey,
    locationKey: entry.locationKey,
    active: entry.active,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const res = await supabase
      .from("effectifs_departments")
      .select("*")
      .order("sort_order", { ascending: true });

    if (res.error) {
      if (isMissingDepartmentsTableError(res.error)) {
        return NextResponse.json({
          departments: fallbackPayload(),
          tablePresent: false,
        });
      }
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }

    const rows = (res.data ?? []) as Record<string, unknown>[];
    const departments = rows
      .map((r) => mapRow(r))
      .filter((d): d is DirectoryDepartmentPayload => d != null);

    if (departments.length === 0) {
      return NextResponse.json({
        departments: fallbackPayload(),
        tablePresent: true,
      });
    }

    return NextResponse.json({ departments, tablePresent: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur chargement départements.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user || (role !== "direction" && role !== "admin")) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as {
      department_key?: unknown;
      label?: unknown;
      company_key?: unknown;
      location_key?: unknown;
      sort_order?: unknown;
      active?: unknown;
    } | null;

    const keyRaw =
      typeof body?.department_key === "string" ? body.department_key.trim().toLowerCase() : "";
    if (!keyRaw || !isValidDynamicDepartmentKeySlug(keyRaw)) {
      return NextResponse.json(
        {
          error:
            "Clé invalide : 1 à 80 caractères, minuscules, chiffres et underscores seulement (a-z, 0-9, _).",
        },
        { status: 400 }
      );
    }
    const labelRaw = typeof body?.label === "string" ? body.label.trim() : "";
    if (!labelRaw) {
      return NextResponse.json(
        { error: "Libellé obligatoire." },
        { status: 400 }
      );
    }

    const companyKey = normalizeEffectifsCompanyKey(body?.company_key);
    const locationKey =
      typeof body?.location_key === "string" && body.location_key.trim()
        ? body.location_key.trim()
        : null;
    const sortOrderRaw =
      typeof body?.sort_order === "number" ? body.sort_order : Number(body?.sort_order ?? 100);
    const sortOrder = Number.isFinite(sortOrderRaw) ? Math.trunc(sortOrderRaw) : 100;
    const active = body?.active !== false;

    const supabase = createAdminSupabaseClient();
    const existingKey = await supabase
      .from("effectifs_departments")
      .select("id")
      .eq("department_key", keyRaw)
      .maybeSingle();
    if (existingKey.data) {
      return NextResponse.json(
        {
          error:
            "Cette clé de département est déjà utilisée. Modifiez la clé ou choisissez un autre nom.",
        },
        { status: 409 }
      );
    }

    const insertRes = await supabase
      .from("effectifs_departments")
      .insert({
        department_key: keyRaw,
        label: labelRaw,
        company_key: companyKey,
        location_key: locationKey,
        sort_order: sortOrder,
        active,
      })
      .select("*")
      .maybeSingle();

    if (insertRes.error) {
      if (isMissingDepartmentsTableError(insertRes.error)) {
        return NextResponse.json(
          {
            error:
              "Table effectifs_departments indisponible. Appliquez la migration avant de créer un département.",
          },
          { status: 409 }
        );
      }
      if (String(insertRes.error.code ?? "") === "23505") {
        return NextResponse.json(
          {
            error:
              "Cette clé de département est déjà utilisée. Modifiez la clé ou choisissez un autre nom.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: insertRes.error.message },
        { status: 500 }
      );
    }

    const row = insertRes.data ? mapRow(insertRes.data as Record<string, unknown>) : null;
    return NextResponse.json({ department: row }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur création département.",
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedRequestUser,
} from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  buildDirectionEffectifsPayload,
  mapCoverageWindowsFromDb,
  type ChauffeurEffectifsRow,
  formatIsoDateLocal,
  addDaysLocal,
  startOfWeekMondayLocal,
} from "./_lib";
import {
  buildLongLeaveExclusionMap,
  buildLongTermAbsencesForPayload,
  fetchActiveLeavePeriodsOverlappingRange,
} from "@/app/lib/employee-leave-period.server";
import { parseWindowInsertBody } from "./window-body";
import { mapCalendarExceptionRow } from "@/app/lib/effectifs-calendar-exception.shared";
import type { EffectifsCalendarException } from "@/app/lib/effectifs-calendar-exception.shared";
import {
  mapScheduleRequestRow,
  requestOverlapsWindow,
  type EffectifsScheduleRequest,
} from "@/app/lib/effectifs-schedule-request.shared";
import type {
  EffectifsDepartment,
  EffectifsRegularClosedDay,
} from "@/app/lib/effectifs-payload.shared";
import {
  isEffectifsDepartmentKey,
  normalizeEffectifsCompanyKey,
  type EffectifsDepartmentKey,
} from "@/app/lib/effectifs-departments.shared";

type ChauffeurQueryRow = Record<string, unknown>;

export const dynamic = "force-dynamic";

/** Champs horaire legacy (sans colonnes optionnelles selon migrations appliquées). */
const CHAUFFEUR_SCHEDULE_BASE =
  "id, nom, actif, schedule_start, schedule_end, scheduled_work_days, planned_daily_hours, planned_weekly_hours, pause_minutes, break_am_enabled, break_am_time, break_am_minutes, break_am_paid, lunch_enabled, lunch_time, lunch_minutes, lunch_paid, break_pm_enabled, break_pm_time, break_pm_minutes, break_pm_paid";

const CHAUFFEUR_EFFECTIFS_COLUMNS =
  "weekly_schedule_config, effectifs_department_key, effectifs_secondary_department_keys, effectifs_primary_location, effectifs_secondary_locations, can_deliver, default_weekly_hours, schedule_active, primary_company, can_work_for_oliem_solutions, can_work_for_titan_produits_industriels";

const CHAUFFEUR_SELECT_TRIES: string[] = [
  `${CHAUFFEUR_SCHEDULE_BASE}, ${CHAUFFEUR_EFFECTIFS_COLUMNS}`,
  `${CHAUFFEUR_SCHEDULE_BASE}, weekly_schedule_config, effectifs_department_key, effectifs_secondary_department_keys, effectifs_primary_location, effectifs_secondary_locations, can_deliver, default_weekly_hours, schedule_active`,
  `${CHAUFFEUR_SCHEDULE_BASE}, weekly_schedule_config, effectifs_department_key`,
  `${CHAUFFEUR_SCHEDULE_BASE}, weekly_schedule_config`,
  `${CHAUFFEUR_SCHEDULE_BASE}, effectifs_department_key`,
  CHAUFFEUR_SCHEDULE_BASE,
];

const OPTIONAL_CHAUFFEUR_COLUMNS = [
  "weekly_schedule_config",
  "effectifs_department_key",
  "effectifs_secondary_department_keys",
  "effectifs_primary_location",
  "effectifs_secondary_locations",
  "can_deliver",
  "default_weekly_hours",
  "schedule_active",
  "primary_company",
  "can_work_for_oliem_solutions",
  "can_work_for_titan_produits_industriels",
] as const;

/** PostgREST ne renvoie pas toujours code "42703" pour colonne absente — on assouplit le test. */
function isUnknownChauffeursColumnError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): boolean {
  const code = String(error.code ?? "");
  if (code === "42703" || code === "PGRST204") {
    return true;
  }
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  if (text.includes("42703")) {
    return true;
  }
  if (!OPTIONAL_CHAUFFEUR_COLUMNS.some((c) => text.includes(c))) {
    return false;
  }
  return (
    text.includes("does not exist") ||
    text.includes("n'existe pas") ||
    text.includes("unknown column") ||
    text.includes("colonne") && text.includes("inconnue")
  );
}

async function fetchChauffeursEffectifsRows(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<{ rows: ChauffeurQueryRow[]; error: null } | { rows: null; error: { message: string } }> {
  let lastMessage = "Colonne chauffeurs introuvable.";

  for (let i = 0; i < CHAUFFEUR_SELECT_TRIES.length; i += 1) {
    const selectList = CHAUFFEUR_SELECT_TRIES[i];
    const res = await supabase
      .from("chauffeurs")
      .select(selectList)
      .neq("actif", false)
      .order("id", { ascending: true });

    if (!res.error) {
      const rows = (res.data ?? []) as unknown as ChauffeurQueryRow[];
      const hasWeekly = selectList.includes("weekly_schedule_config");
      const hasDept = selectList.includes("effectifs_department_key");
      const hasSecondaryDept = selectList.includes(
        "effectifs_secondary_department_keys"
      );
      const hasPrimaryLoc = selectList.includes("effectifs_primary_location");
      const hasSecondaryLoc = selectList.includes("effectifs_secondary_locations");
      const hasCanDeliver = selectList.includes("can_deliver");
      const hasDefaultWeekly = selectList.includes("default_weekly_hours");
      const hasScheduleActive = selectList.includes("schedule_active");
      const hasPrimaryCompany = selectList.includes("primary_company");
      const hasCanWorkOliem = selectList.includes("can_work_for_oliem_solutions");
      const hasCanWorkTitan = selectList.includes(
        "can_work_for_titan_produits_industriels"
      );
      for (const row of rows) {
        if (!hasWeekly) {
          row.weekly_schedule_config = undefined;
        }
        if (!hasDept) {
          row.effectifs_department_key = null;
        }
        if (!hasSecondaryDept) {
          row.effectifs_secondary_department_keys = null;
        }
        if (!hasPrimaryLoc) {
          row.effectifs_primary_location = null;
        }
        if (!hasSecondaryLoc) {
          row.effectifs_secondary_locations = null;
        }
        if (!hasCanDeliver) {
          row.can_deliver = null;
        }
        if (!hasDefaultWeekly) {
          row.default_weekly_hours = null;
        }
        if (!hasScheduleActive) {
          row.schedule_active = null;
        }
        if (!hasPrimaryCompany) {
          row.primary_company = null;
        }
        if (!hasCanWorkOliem) {
          row.can_work_for_oliem_solutions = null;
        }
        if (!hasCanWorkTitan) {
          row.can_work_for_titan_produits_industriels = null;
        }
      }
      return { rows, error: null };
    }

    lastMessage = res.error.message ?? lastMessage;
    const isLastTry = i === CHAUFFEUR_SELECT_TRIES.length - 1;
    if (isLastTry || !isUnknownChauffeursColumnError(res.error)) {
      return { rows: null, error: { message: lastMessage } };
    }
  }

  return { rows: null, error: { message: lastMessage } };
}

function isMissingCoverageTableError(error: {
  code?: string;
  message?: string;
}): boolean {
  const msg = (error.message ?? "").toLowerCase();
  if (error.code === "42P01" || error.code === "PGRST205") {
    return true;
  }
  return (
    msg.includes("department_coverage_windows") &&
    (msg.includes("does not exist") ||
      msg.includes("introuvable") ||
      msg.includes("not find") ||
      msg.includes("schema cache"))
  );
}

function isMissingEffectifsAuxTableError(error: {
  code?: string;
  message?: string;
}, tableHint: string): boolean {
  const msg = (error.message ?? "").toLowerCase();
  if (error.code === "42P01" || error.code === "PGRST205") {
    return true;
  }
  return (
    msg.includes(tableHint.toLowerCase()) &&
    (msg.includes("does not exist") ||
      msg.includes("introuvable") ||
      msg.includes("not find") ||
      msg.includes("schema cache"))
  );
}

export async function GET(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const canEditCoverageWindows = role === "direction" || role === "admin";
    const companyParamRaw = (req.nextUrl.searchParams.get("company") ?? "all").trim();
    const companyParam =
      companyParamRaw === "oliem_solutions" || companyParamRaw === "titan_produits_industriels"
        ? companyParamRaw
        : "all";

    const supabase = createAdminSupabaseClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizonEnd = addDaysLocal(today, 14);
    const dateMin = formatIsoDateLocal(today);
    const dateMax = formatIsoDateLocal(horizonEnd);
    const calendarHorizonEnd = addDaysLocal(today, 120);
    const calendarDateMax = formatIsoDateLocal(calendarHorizonEnd);

    let coverageWindowsConfigured = false;
    let windowsLoadError: string | null = null;
    let coverageWindowRows: Record<string, unknown>[] = [];

    const windowsRes = await supabase
      .from("department_coverage_windows")
      .select("*")
      .order("department_key", { ascending: true })
      .order("day_of_week", { ascending: true })
      .order("start_local", { ascending: true });

    if (windowsRes.error) {
      if (isMissingCoverageTableError(windowsRes.error)) {
        coverageWindowsConfigured = false;
        windowsLoadError = null;
      } else {
        return NextResponse.json(
          { error: windowsRes.error.message ?? "Erreur department_coverage_windows." },
          { status: 500 }
        );
      }
    } else {
      coverageWindowsConfigured = true;
      coverageWindowRows = (windowsRes.data ?? []) as Record<string, unknown>[];
    }

    const coverageWindows = mapCoverageWindowsFromDb(coverageWindowRows).filter((w) =>
      companyParam === "all" ? true : w.companyKey === "all" || w.companyKey === companyParam
    );

    const chauffeurFetch = await fetchChauffeursEffectifsRows(supabase);
    if (chauffeurFetch.error) {
      return NextResponse.json({ error: chauffeurFetch.error.message }, { status: 500 });
    }
    const chauffeurRows = chauffeurFetch.rows as ChauffeurEffectifsRow[];

    const deliveryRes = await supabase
      .from("livraisons_planifiees")
      .select("date_livraison")
      .gte("date_livraison", dateMin)
      .lte("date_livraison", dateMax)
      .limit(8000);

    const deliveryRows =
      deliveryRes.error || !deliveryRes.data
        ? []
        : (deliveryRes.data as { date_livraison: string | null }[]);

    let calendarExceptions: EffectifsCalendarException[] = [];
    const exRes = await supabase
      .from("effectifs_calendar_exceptions")
      .select("*")
      .gte("date", dateMin)
      .lte("date", calendarDateMax)
      .order("date", { ascending: true })
      .order("department_key", { ascending: true });

    if (exRes.error) {
      if (!isMissingEffectifsAuxTableError(exRes.error, "effectifs_calendar_exceptions")) {
        return NextResponse.json(
          { error: exRes.error.message ?? "Erreur effectifs_calendar_exceptions." },
          { status: 500 }
        );
      }
    } else {
      calendarExceptions = (exRes.data ?? [])
        .map((r) => mapCalendarExceptionRow(r as Record<string, unknown>))
        .filter((row): row is EffectifsCalendarException => Boolean(row));
    }

    let regularClosedDays: EffectifsRegularClosedDay[] = [];
    const regularClosedRes = await supabase
      .from("effectifs_regular_closed_days")
      .select("*")
      .order("day_of_week", { ascending: true })
      .limit(400);
    if (regularClosedRes.error) {
      if (!isMissingEffectifsAuxTableError(regularClosedRes.error, "effectifs_regular_closed_days")) {
        return NextResponse.json(
          { error: regularClosedRes.error.message ?? "Erreur effectifs_regular_closed_days." },
          { status: 500 }
        );
      }
    } else if (regularClosedRes.data) {
      regularClosedDays = (regularClosedRes.data as Record<string, unknown>[])
        .map((r) => {
          const dow = Number(r.day_of_week);
          const scopeRaw = typeof r.scope === "string" ? r.scope.trim() : "company";
          const scope =
            scopeRaw === "department" || scopeRaw === "location" ? scopeRaw : "company";
          if (!Number.isFinite(dow) || dow < 0 || dow > 6) return null;
          const companyKeyRaw =
            typeof r.company_key === "string" ? r.company_key.trim() : "all";
          const companyKey =
            companyKeyRaw === "oliem_solutions" || companyKeyRaw === "titan_produits_industriels"
              ? companyKeyRaw
              : "all";
          return {
            companyKey,
            dayOfWeek: dow,
            active: r.active !== false,
            scope,
            departmentKey:
              typeof r.department_key === "string" && r.department_key.trim()
                ? (r.department_key.trim() as EffectifsRegularClosedDay["departmentKey"])
                : null,
            locationKey:
              typeof r.location_key === "string" && r.location_key.trim()
                ? r.location_key.trim()
                : typeof r.location === "string" && r.location.trim()
                  ? r.location.trim()
                  : null,
          } satisfies EffectifsRegularClosedDay;
        })
        .filter((r): r is EffectifsRegularClosedDay => r != null)
        .filter((r) =>
          companyParam === "all" ? true : r.companyKey === "all" || r.companyKey === companyParam
        );
    }

    let linkedChauffeurId: number | null = null;
    if (role === "employe") {
      const linkRes = await supabase
        .from("chauffeurs")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      const lid = (linkRes.data as { id?: unknown } | null)?.id;
      if (typeof lid === "number" && Number.isFinite(lid)) {
        linkedChauffeurId = lid;
      }
    }

    let scheduleRequestRows: Record<string, unknown>[] = [];
    let srRes;
    if (role === "employe") {
      if (linkedChauffeurId == null) {
        srRes = { data: [] as Record<string, unknown>[], error: null };
      } else {
        srRes = await supabase
          .from("effectifs_employee_schedule_requests")
          .select("*")
          .eq("employee_id", linkedChauffeurId)
          .order("created_at", { ascending: false })
          .limit(2000);
      }
    } else {
      srRes = await supabase
        .from("effectifs_employee_schedule_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(4000);
    }

    if (srRes.error) {
      if (!isMissingEffectifsAuxTableError(srRes.error, "effectifs_employee_schedule_requests")) {
        return NextResponse.json(
          { error: srRes.error.message ?? "Erreur effectifs_employee_schedule_requests." },
          { status: 500 }
        );
      }
    } else {
      scheduleRequestRows = (srRes.data ?? []) as Record<string, unknown>[];
    }

    const empIds = [
      ...new Set(
        scheduleRequestRows
          .map((r) => Number(r.employee_id))
          .filter((n) => Number.isFinite(n))
      ),
    ];
    const nomById = new Map<number, string | null>();
    if (empIds.length > 0) {
      const nomRes = await supabase.from("chauffeurs").select("id, nom").in("id", empIds);
      if (!nomRes.error && nomRes.data) {
        for (const row of nomRes.data as { id: number; nom: string | null }[]) {
          nomById.set(row.id, row.nom);
        }
      }
    }

    const scheduleRequests = scheduleRequestRows
      .map((r) =>
        mapScheduleRequestRow(r, nomById.get(Number(r.employee_id)) ?? null)
      )
      .filter((row): row is EffectifsScheduleRequest => row != null)
      .filter((row) => requestOverlapsWindow(row, dateMin, calendarDateMax));

    let departmentsFromDb: EffectifsDepartment[] | undefined;
    const deptsRes = await supabase
      .from("effectifs_departments")
      .select("*")
      .order("sort_order", { ascending: true });

    if (deptsRes.error) {
      if (!isMissingEffectifsAuxTableError(deptsRes.error, "effectifs_departments")) {
        return NextResponse.json(
          { error: deptsRes.error.message ?? "Erreur effectifs_departments." },
          { status: 500 }
        );
      }
    } else if (deptsRes.data) {
      const mapped: EffectifsDepartment[] = (deptsRes.data as Record<string, unknown>[])
        .map((r) => {
          const keyRaw = typeof r.department_key === "string" ? r.department_key.trim() : "";
          if (!keyRaw || !isEffectifsDepartmentKey(keyRaw)) return null;
          const labelRaw = typeof r.label === "string" ? r.label.trim() : "";
          const sortOrder =
            typeof r.sort_order === "number"
              ? r.sort_order
              : Number(r.sort_order ?? 100);
          return {
            key: keyRaw as EffectifsDepartmentKey,
            label: labelRaw || keyRaw,
            sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
            companyKey: normalizeEffectifsCompanyKey(r.company_key),
            locationKey:
              typeof r.location_key === "string" && r.location_key.trim()
                ? r.location_key.trim()
                : null,
            active: r.active !== false,
          } satisfies EffectifsDepartment;
        })
        .filter((row): row is EffectifsDepartment => row != null);
      if (mapped.length > 0) {
        departmentsFromDb = mapped;
      }
    }

    const refDate = new Date();
    const weekStart = startOfWeekMondayLocal(refDate);
    const weekEnd = addDaysLocal(weekStart, 6);
    const weekStartIso = formatIsoDateLocal(weekStart);
    const weekEndIso = formatIsoDateLocal(weekEnd);
    const todayIso = formatIsoDateLocal(refDate);

    const leavePeriods = await fetchActiveLeavePeriodsOverlappingRange(
      supabase,
      weekStartIso,
      weekEndIso
    );
    const longLeaveByDate = buildLongLeaveExclusionMap(
      leavePeriods,
      weekStart,
      weekEnd
    );
    const chauffeurNomById = new Map<number, string | null>(
      chauffeurRows.map((r) => [r.id, r.nom])
    );
    const longTermAbsences = buildLongTermAbsencesForPayload(
      leavePeriods,
      chauffeurNomById,
      todayIso
    );

    const payload = buildDirectionEffectifsPayload({
      coverageWindows,
      coverageWindowsConfigured,
      windowsLoadError,
      chauffeurRows,
      deliveryRows,
      referenceDate: refDate,
      canEditCoverageWindows,
      calendarExceptions,
      scheduleRequests,
      regularClosedDays,
      linkedChauffeurId,
      departments: departmentsFromDb,
      longLeaveByDate,
      longTermAbsences,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur chargement effectifs direction.",
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

    const body = await req.json().catch(() => null);
    const parsed = parseWindowInsertBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const insertPayload = {
      company_key: parsed.value.company_key,
      department_key: parsed.value.department_key,
      location_key: parsed.value.location_key,
      location_label: parsed.value.location_label,
      location: parsed.value.location_key,
      weekday: parsed.value.weekday,
      day_of_week: parsed.value.weekday,
      start_local: parsed.value.start_local,
      end_local: parsed.value.end_local,
      min_employees: parsed.value.min_employees,
      active: parsed.value.active,
    };

    const insertRes = await supabase
      .from("department_coverage_windows")
      .insert(insertPayload)
      .select("*")
      .maybeSingle();

    if (insertRes.error) {
      return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
    }

    const mapped = insertRes.data
      ? mapCoverageWindowsFromDb([insertRes.data as Record<string, unknown>])
      : [];
    return NextResponse.json({ window: mapped[0] ?? null }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur création plage.",
      },
      { status: 500 }
    );
  }
}

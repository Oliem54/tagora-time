import { NextRequest, NextResponse } from "next/server";
import {
  EFFECTIFS_DEPARTMENTS,
  EFFECTIFS_LOCATIONS,
  EffectifsStatus,
  computeHoursFromRange,
  endOfIsoWeek,
  normalizeDepartment,
  normalizeLocation,
  parseDateOnly,
  parseTimeToMinutes,
  requireAuthenticatedViewer,
  startOfIsoWeek,
  toDateOnly,
} from "@/app/api/direction/effectifs/_lib";

type ScheduleRow = {
  id: string;
  employee_id: number;
  department: string;
  location: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  planned_hours: number | null;
  status: string;
  notes: string | null;
  chauffeurs:
    | {
        id: number;
        nom: string | null;
        actif: boolean | null;
        can_deliver: boolean | null;
        primary_department?: string | null;
        secondary_departments?: string[] | null;
        primary_location?: string | null;
        secondary_locations?: string[] | null;
        schedule_active?: boolean | null;
      }
    | Array<{
        id: number;
        nom: string | null;
        actif: boolean | null;
        can_deliver: boolean | null;
        primary_department?: string | null;
        secondary_departments?: string[] | null;
        primary_location?: string | null;
        secondary_locations?: string[] | null;
        schedule_active?: boolean | null;
      }>
    | null;
};

type RequirementRow = {
  department: string;
  day_of_week: number;
  min_employees: number;
  min_hours: number;
  requirement_source: string;
  active: boolean;
};

type UsualScheduleRow = {
  employee_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  department: string | null;
  location: string | null;
  active: boolean;
};

type CoverageWindowRow = {
  id: string;
  department: string;
  location: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  min_employees: number;
  active: boolean;
};

type ComputedAlert = {
  date: string;
  department: string;
  type: string;
  message: string;
  severity: "low" | "medium" | "high";
  location?: string | null;
};

type DeliveryRow = {
  id: number;
  date_livraison: string | null;
  statut: string | null;
};

type EnrichedSchedule = ScheduleRow & {
  employeeName: string;
  canDeliver: boolean;
  isPrimaryDepartment: boolean;
  isSecondaryDepartment: boolean;
  isPrimaryLocation: boolean;
  isSecondaryLocation: boolean;
  isOutsideUsualSchedule: boolean;
  warnings: string[];
  location: string;
};

export const dynamic = "force-dynamic";
const COVERAGE_ALERT_EXPIRATION_DAYS = 15;

function isMissingColumnError(error: { message?: string; code?: string } | null, column: string) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return message.includes(column.toLowerCase()) && message.includes("does not exist");
}

function isMissingRelationError(error: { message?: string; code?: string } | null, relation: string) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return message.includes(relation.toLowerCase()) && message.includes("does not exist");
}

function buildAlertKey(alert: {
  date: string;
  department: string;
  type: string;
  message: string;
  location?: string | null;
}) {
  return [
    alert.date,
    alert.department,
    alert.location ?? "",
    alert.type,
    alert.message,
  ]
    .map((part) => String(part).trim().toLowerCase())
    .join("|");
}

function isActiveDeliveryStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return !["annulee", "annule", "livree", "completee", "complete"].includes(normalized);
}

function normalizeDowForDb(date: Date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function resolveHours(value: number | null, startTime: string, endTime: string) {
  if (value != null && Number.isFinite(Number(value))) return Number(value);
  return computeHoursFromRange(startTime, endTime);
}

function overlapsWindow(
  scheduleStart: string,
  scheduleEnd: string,
  windowStart: string,
  windowEnd: string
) {
  const aStart = parseTimeToMinutes(scheduleStart);
  const aEnd = parseTimeToMinutes(scheduleEnd);
  const bStart = parseTimeToMinutes(windowStart);
  const bEnd = parseTimeToMinutes(windowEnd);
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

function fullyCoversWindow(
  scheduleStart: string,
  scheduleEnd: string,
  windowStart: string,
  windowEnd: string
) {
  const aStart = parseTimeToMinutes(scheduleStart);
  const aEnd = parseTimeToMinutes(scheduleEnd);
  const bStart = parseTimeToMinutes(windowStart);
  const bEnd = parseTimeToMinutes(windowEnd);
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  return aStart <= bStart && aEnd >= bEnd;
}

function getCoverageStatus(params: {
  requiredEmployees: number;
  plannedEmployees: number;
  requiredHours: number;
  plannedHours: number;
}): EffectifsStatus {
  const { requiredEmployees, plannedEmployees, requiredHours, plannedHours } = params;
  if (requiredEmployees <= 0 && requiredHours <= 0) return "not_required";
  if (plannedEmployees < requiredEmployees || plannedHours < requiredHours) return "missing";
  if (
    plannedEmployees > requiredEmployees + 1 ||
    plannedHours > requiredHours + Math.max(2, requiredHours * 0.25)
  ) {
    return "surplus";
  }
  if (plannedEmployees === requiredEmployees || plannedHours === requiredHours) return "watch";
  return "covered";
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedViewer(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const requestedWeekStart = req.nextUrl.searchParams.get("weekStart");
    const requestedDepartment = normalizeDepartment(req.nextUrl.searchParams.get("department"));
    const requestedLocation = normalizeLocation(req.nextUrl.searchParams.get("location"));
    const requestedEmployeeId = Number(req.nextUrl.searchParams.get("employeeId"));

    const nowDate = new Date();
    const weekStartDate = requestedWeekStart
      ? parseDateOnly(requestedWeekStart) ?? startOfIsoWeek(nowDate)
      : startOfIsoWeek(nowDate);
    const weekStart = startOfIsoWeek(weekStartDate);
    const weekEnd = endOfIsoWeek(weekStart);
    const weekStartIso = toDateOnly(weekStart);
    const weekEndIso = toDateOnly(weekEnd);

    const [requirementsRes, deliveriesRes, usualSchedulesRes] = await Promise.all([
      supabase
        .from("department_coverage_requirements")
        .select("department, day_of_week, min_employees, min_hours, requirement_source, active")
        .eq("active", true),
      supabase
        .from("livraisons_planifiees")
        .select("id, date_livraison, statut")
        .gte("date_livraison", weekStartIso)
        .lte("date_livraison", weekEndIso),
      supabase
        .from("employee_usual_schedules")
        .select("employee_id, day_of_week, start_time, end_time, department, location, active")
        .eq("active", true),
    ]);

    let schedulesRes: { data: unknown; error: { message?: string; code?: string } | null } =
      (await supabase
      .from("employee_schedules")
      .select(
        "id, employee_id, department, location, scheduled_date, start_time, end_time, planned_hours, status, notes, chauffeurs:employee_id(id, nom, actif, can_deliver, primary_department, secondary_departments, primary_location, secondary_locations, schedule_active)"
      )
      .gte("scheduled_date", weekStartIso)
      .lte("scheduled_date", weekEndIso)
      .in("status", ["planned", "confirmed"])
      .order("scheduled_date", { ascending: true })) as {
      data: unknown;
      error: { message?: string; code?: string } | null;
    };
    if (isMissingColumnError(schedulesRes.error, "primary_location")) {
      schedulesRes = (await supabase
        .from("employee_schedules")
        .select(
          "id, employee_id, department, location, scheduled_date, start_time, end_time, planned_hours, status, notes, chauffeurs:employee_id(id, nom, actif, can_deliver, primary_department, secondary_departments, schedule_active)"
        )
        .gte("scheduled_date", weekStartIso)
        .lte("scheduled_date", weekEndIso)
        .in("status", ["planned", "confirmed"])
        .order("scheduled_date", { ascending: true })) as {
        data: unknown;
        error: { message?: string; code?: string } | null;
      };
    }

    let employeesRes: { data: unknown; error: { message?: string; code?: string } | null } =
      (await supabase
      .from("chauffeurs")
      .select(
        "id, nom, actif, primary_department, secondary_departments, primary_location, secondary_locations, can_deliver, default_weekly_hours, schedule_active, usual_schedule"
      )
      .order("nom", { ascending: true })) as {
      data: unknown;
      error: { message?: string; code?: string } | null;
    };
    if (isMissingColumnError(employeesRes.error, "primary_location")) {
      employeesRes = (await supabase
        .from("chauffeurs")
        .select(
          "id, nom, actif, primary_department, secondary_departments, can_deliver, default_weekly_hours, schedule_active, usual_schedule"
        )
        .order("nom", { ascending: true })) as {
        data: unknown;
        error: { message?: string; code?: string } | null;
      };
    }

    if (schedulesRes.error) return NextResponse.json({ error: schedulesRes.error.message }, { status: 500 });
    if (requirementsRes.error) return NextResponse.json({ error: requirementsRes.error.message }, { status: 500 });
    if (deliveriesRes.error) return NextResponse.json({ error: deliveriesRes.error.message }, { status: 500 });
    if (employeesRes.error) return NextResponse.json({ error: employeesRes.error.message }, { status: 500 });
    if (usualSchedulesRes.error && !isMissingRelationError(usualSchedulesRes.error, "employee_usual_schedules")) {
      return NextResponse.json({ error: usualSchedulesRes.error.message }, { status: 500 });
    }

    let coverageWindowsRes: { data: unknown; error: { message?: string; code?: string } | null } =
      (await supabase
        .from("department_coverage_windows")
        .select("id, department, location, day_of_week, start_time, end_time, min_employees, active")
        .eq("active", true)) as {
        data: unknown;
        error: { message?: string; code?: string } | null;
      };
    if (isMissingRelationError(coverageWindowsRes.error, "department_coverage_windows")) {
      coverageWindowsRes = { data: [], error: null };
    }
    if (coverageWindowsRes.error) {
      return NextResponse.json({ error: coverageWindowsRes.error.message }, { status: 500 });
    }

    const schedulesRaw = ((schedulesRes.data ?? []) as ScheduleRow[]).map((row) => ({
      ...row,
      chauffeurs: Array.isArray(row.chauffeurs) ? (row.chauffeurs[0] ?? null) : row.chauffeurs,
    }));
    const requirements = (requirementsRes.data ?? []) as RequirementRow[];
    const deliveries = ((deliveriesRes.data ?? []) as DeliveryRow[]).filter(
      (item) => item.date_livraison && isActiveDeliveryStatus(item.statut)
    );
    const employees = (employeesRes.data ?? []) as Array<Record<string, unknown>>;
    const usualSchedules = (usualSchedulesRes.data ?? []) as UsualScheduleRow[];
    const coverageWindows = ((coverageWindowsRes.data ?? []) as CoverageWindowRow[]).map((window) => ({
      ...window,
      department: normalizeDepartment(window.department) ?? "Autre",
      location: normalizeLocation(window.location) ?? null,
    }));

    const filteredSchedules = schedulesRaw.filter((schedule) => {
      if (requestedDepartment) {
        const normalized = normalizeDepartment(schedule.department) ?? "Autre";
        if (normalized !== requestedDepartment) return false;
      }
      if (requestedLocation) {
        const normalized = normalizeLocation(schedule.location) ?? "Autre";
        if (normalized !== requestedLocation) return false;
      }
      if (Number.isFinite(requestedEmployeeId) && requestedEmployeeId > 0) {
        if (schedule.employee_id !== requestedEmployeeId) return false;
      }
      return true;
    });

    const usualByEmployeeDow = new Map<string, UsualScheduleRow[]>();
    for (const item of usualSchedules) {
      const key = `${item.employee_id}::${item.day_of_week}`;
      const list = usualByEmployeeDow.get(key) ?? [];
      list.push(item);
      usualByEmployeeDow.set(key, list);
    }

    const schedules: EnrichedSchedule[] = filteredSchedules.map((schedule) => {
      const normalizedDepartment = normalizeDepartment(schedule.department) ?? "Autre";
      const normalizedLocation = normalizeLocation(schedule.location) ?? "Autre";
      const employee = schedule.chauffeurs;
      const employeePrimaryDepartment = normalizeDepartment(employee?.primary_department ?? null);
      const employeeSecondaryDepartments = Array.isArray(employee?.secondary_departments)
        ? employee.secondary_departments
            .map((item) => normalizeDepartment(item))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
        : [];
      const employeePrimaryLocation = normalizeLocation(employee?.primary_location ?? null);
      const employeeSecondaryLocations = Array.isArray(employee?.secondary_locations)
        ? employee.secondary_locations
            .map((item) => normalizeLocation(item))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
        : [];
      const date = parseDateOnly(schedule.scheduled_date);
      const dayOfWeek = date ? normalizeDowForDb(date) : 0;
      const usualRows = usualByEmployeeDow.get(`${schedule.employee_id}::${dayOfWeek}`) ?? [];
      const scheduleStart = parseTimeToMinutes(schedule.start_time);
      const scheduleEnd = parseTimeToMinutes(schedule.end_time);
      const isOutsideUsualSchedule = usualRows.length
        ? !usualRows.some((row) => {
            const usualStart = parseTimeToMinutes(row.start_time);
            const usualEnd = parseTimeToMinutes(row.end_time);
            if (scheduleStart == null || scheduleEnd == null || usualStart == null || usualEnd == null) {
              return false;
            }
            return scheduleStart >= usualStart && scheduleEnd <= usualEnd;
          })
        : false;
      const warnings: string[] = [];
      const isPrimaryDepartment = employeePrimaryDepartment === normalizedDepartment;
      const isSecondaryDepartment = employeeSecondaryDepartments.includes(normalizedDepartment);
      const isPrimaryLocation = employeePrimaryLocation === normalizedLocation;
      const isSecondaryLocation = employeeSecondaryLocations.includes(normalizedLocation);

      if (!isPrimaryDepartment && !isSecondaryDepartment) {
        warnings.push("Cet employé n’est pas habituellement assigné à ce département.");
      }
      if (!isPrimaryLocation && !isSecondaryLocation) {
        warnings.push("Cet employé n’est pas habituellement assigné à cet emplacement.");
      }
      if (isOutsideUsualSchedule) {
        warnings.push("Ce quart est en dehors de l’horaire habituel de l’employé.");
      }
      if (normalizedDepartment === "Livreur" && employee?.can_deliver !== true) {
        warnings.push("Employé non configuré comme livreur.");
      }

      return {
        ...schedule,
        department: normalizedDepartment,
        location: normalizedLocation,
        employeeName: employee?.nom ?? `#${schedule.employee_id}`,
        canDeliver: employee?.can_deliver === true,
        isPrimaryDepartment,
        isSecondaryDepartment,
        isPrimaryLocation,
        isSecondaryLocation,
        isOutsideUsualSchedule,
        warnings,
      };
    });

    const schedulesByDateDepartment = new Map<string, EnrichedSchedule[]>();
    for (const schedule of schedules) {
      const key = `${schedule.scheduled_date}::${schedule.department}`;
      const list = schedulesByDateDepartment.get(key) ?? [];
      list.push(schedule);
      schedulesByDateDepartment.set(key, list);
    }

    const deliveryCountByDate = new Map<string, number>();
    for (const delivery of deliveries) {
      if (!delivery.date_livraison) continue;
      const dateKey = delivery.date_livraison;
      deliveryCountByDate.set(dateKey, (deliveryCountByDate.get(dateKey) ?? 0) + 1);
    }

    const requirementsByDepartmentDay = new Map<string, RequirementRow>();
    for (const requirement of requirements) {
      const normalized = normalizeDepartment(requirement.department) ?? "Autre";
      const key = `${normalized}::${requirement.day_of_week}`;
      requirementsByDepartmentDay.set(key, { ...requirement, department: normalized });
    }

    const windowsByDepartmentDay = new Map<string, CoverageWindowRow[]>();
    for (const window of coverageWindows) {
      const key = `${window.department}::${window.day_of_week}`;
      const list = windowsByDepartmentDay.get(key) ?? [];
      list.push(window);
      windowsByDepartmentDay.set(key, list);
    }

    const days = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      return {
        date: toDateOnly(date),
        dayOfWeek: normalizeDowForDb(date),
        label: date.toLocaleDateString("fr-CA", { weekday: "long", day: "2-digit", month: "2-digit" }),
      };
    });

    const coverage: Array<Record<string, unknown>> = [];
    const computedAlerts: ComputedAlert[] = [];
    let totalPlannedHours = 0;
    let totalRequiredHours = 0;
    let totalMissingHours = 0;

    for (const day of days) {
      for (const department of EFFECTIFS_DEPARTMENTS) {
        if (requestedDepartment && requestedDepartment !== department) continue;
        const requirementKey = `${department}::${day.dayOfWeek}`;
        const requirement = requirementsByDepartmentDay.get(requirementKey);
        const dayWindows = windowsByDepartmentDay.get(requirementKey) ?? [];

        const baseRequiredEmployees = requirement?.min_employees ?? 0;
        const baseRequiredHours = Number(requirement?.min_hours ?? 0);

        const deliveryCount = deliveryCountByDate.get(day.date) ?? 0;
        const isDeliveryBased = department === "Livreur" && requirement?.requirement_source === "delivery_based";
        const requiredEmployees = isDeliveryBased && deliveryCount > 0 ? Math.max(1, baseRequiredEmployees) : baseRequiredEmployees;
        let requiredHours = isDeliveryBased && deliveryCount > 0 ? Math.max(8, baseRequiredHours) : baseRequiredHours;
        if (dayWindows.length > 0) {
          requiredHours = Math.round(
            dayWindows.reduce((sum, window) => {
              const duration = resolveHours(null, window.start_time, window.end_time);
              return sum + duration * Math.max(1, Number(window.min_employees ?? 1));
            }, 0) * 100
          ) / 100;
        }

        const entries = schedulesByDateDepartment.get(`${day.date}::${department}`) ?? [];
        const plannedEmployees = new Set(entries.map((entry) => entry.employee_id)).size;
        const plannedHours = Math.round(
          entries.reduce((sum, entry) => {
            const hours = resolveHours(entry.planned_hours, entry.start_time, entry.end_time);
            return sum + (Number.isFinite(hours) ? Number(hours) : 0);
          }, 0) * 100
        ) / 100;
        const missingEmployees = Math.max(0, requiredEmployees - plannedEmployees);
        const missingHours = Math.max(0, Math.round((requiredHours - plannedHours) * 100) / 100);
        const uncoveredWindows: string[] = [];
        const partialWindows: string[] = [];
        for (const window of dayWindows) {
          const candidates = entries.filter((entry) => {
            if (window.location && entry.location !== window.location) return false;
            return true;
          });
          const fullCount = candidates.filter((entry) =>
            fullyCoversWindow(entry.start_time, entry.end_time, window.start_time, window.end_time)
          ).length;
          const partialCount = candidates.filter((entry) =>
            overlapsWindow(entry.start_time, entry.end_time, window.start_time, window.end_time)
          ).length;
          if (fullCount < Math.max(1, window.min_employees)) {
            if (partialCount > 0) {
              partialWindows.push(`${window.start_time}-${window.end_time}`);
            } else {
              uncoveredWindows.push(`${window.start_time}-${window.end_time}`);
            }
          }
        }

        let status = getCoverageStatus({
          requiredEmployees,
          plannedEmployees,
          requiredHours,
          plannedHours,
        });
        if (uncoveredWindows.length > 0) status = "missing";
        else if (partialWindows.length > 0 && status === "covered") status = "watch";

        totalPlannedHours += plannedHours;
        totalRequiredHours += requiredHours;
        totalMissingHours += missingHours;

        coverage.push({
          date: day.date,
          department,
          requiredEmployees,
          plannedEmployees,
          requiredHours,
          plannedHours,
          status,
          missingEmployees,
          missingHours,
          coverageWindows: dayWindows.map((window) => ({
            id: window.id,
            location: window.location,
            startTime: window.start_time,
            endTime: window.end_time,
            minEmployees: window.min_employees,
          })),
          uncoveredWindows,
          partialWindows,
        });

        if (uncoveredWindows.length > 0) {
          computedAlerts.push({
            date: day.date,
            department,
            type: "window_uncovered",
            message: `Manque couverture ${uncoveredWindows.join(", ")}.`,
            severity: "high",
          });
        }
        if (partialWindows.length > 0) {
          computedAlerts.push({
            date: day.date,
            department,
            type: "window_partial",
            message: `Couvre partiellement ${partialWindows.join(", ")}.`,
            severity: "medium",
          });
        }
        if (requiredEmployees > 0 && plannedEmployees === 0) {
          computedAlerts.push({
            date: day.date,
            department,
            type: "no_employee_planned",
            message: "Aucun employé planifié.",
            severity: "high",
          });
        } else if (missingEmployees > 0 || missingHours > 0) {
          computedAlerts.push({
            date: day.date,
            department,
            type: "coverage_gap",
            message:
              missingEmployees > 0
                ? `${department} sous le minimum requis.`
                : `Heures prévues insuffisantes pour ${department}.`,
            severity: missingEmployees > 0 ? "high" : "medium",
          });
        }

        const driverEntries = schedules.filter((entry) => {
          if (entry.scheduled_date !== day.date) return false;
          return entry.department === "Livreur" || entry.canDeliver === true;
        });
        if (department === "Livreur" && deliveryCount > 0 && driverEntries.length === 0) {
          computedAlerts.push({
            date: day.date,
            department,
            type: "delivery_without_driver",
            message: "Livreur requis pour les livraisons planifiées.",
            severity: "high",
          });
        }
        for (const entry of entries) {
          if (entry.department === "Livreur" && entry.canDeliver !== true) {
            computedAlerts.push({
              date: day.date,
              department,
              type: "driver_not_configured",
              message: "Employé non configuré comme livreur.",
              severity: "medium",
            });
          }
        }
      }
    }

    let alertsStateRes: { data: unknown; error: { message?: string; code?: string } | null } =
      (await supabase
        .from("effectifs_alert_states")
        .select(
          "alert_key, status, department, location, alert_date, severity, message, first_seen_at, last_seen_at, resolved_at, ignored_at, expired_at, archived_at, note"
        )
        .order("last_seen_at", { ascending: false })) as {
        data: unknown;
        error: { message?: string; code?: string } | null;
      };
    if (isMissingRelationError(alertsStateRes.error, "effectifs_alert_states")) {
      alertsStateRes = { data: [], error: null };
    }
    if (alertsStateRes.error) {
      return NextResponse.json({ error: alertsStateRes.error.message }, { status: 500 });
    }

    const now = new Date();
    const expirationThreshold = new Date(now);
    expirationThreshold.setDate(expirationThreshold.getDate() - COVERAGE_ALERT_EXPIRATION_DAYS);
    const states = (alertsStateRes.data ?? []) as Array<Record<string, unknown>>;
    const stateByKey = new Map<string, Record<string, unknown>>();
    for (const state of states) {
      const key = String(state.alert_key ?? "");
      if (key) stateByKey.set(key, state);
    }

    const toExpireKeys: string[] = [];
    for (const state of states) {
      const status = String(state.status ?? "active");
      if (status !== "active") continue;
      const anchorDate = typeof state.alert_date === "string" ? new Date(`${state.alert_date}T00:00:00`) : null;
      const firstSeen = typeof state.first_seen_at === "string" ? new Date(state.first_seen_at) : null;
      const compareDate = anchorDate && !Number.isNaN(anchorDate.getTime()) ? anchorDate : firstSeen;
      if (compareDate && compareDate < expirationThreshold) {
        const key = String(state.alert_key ?? "");
        if (key) toExpireKeys.push(key);
      }
    }
    if (toExpireKeys.length > 0) {
      await supabase
        .from("effectifs_alert_states")
        .update({
          status: "echue",
          expired_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .in("alert_key", toExpireKeys);
      for (const key of toExpireKeys) {
        const prev = stateByKey.get(key);
        if (prev) stateByKey.set(key, { ...prev, status: "echue", expired_at: now.toISOString() });
      }
    }

    const computedWithKeys = computedAlerts.map((alert) => {
      const location = typeof alert.location === "string" ? alert.location : null;
      const alert_key = buildAlertKey({
        date: alert.date,
        department: alert.department,
        type: alert.type,
        message: alert.message,
        location,
      });
      return { ...alert, alert_key, location };
    });

    const missingStateRows = computedWithKeys
      .filter((alert) => !stateByKey.has(alert.alert_key))
      .map((alert) => ({
        alert_key: alert.alert_key,
        status: "active",
        department: alert.department,
        location: alert.location,
        alert_date: alert.date,
        severity: alert.severity,
        message: alert.message,
        first_seen_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      }));
    if (missingStateRows.length > 0) {
      await supabase.from("effectifs_alert_states").insert(missingStateRows);
      for (const row of missingStateRows) {
        stateByKey.set(row.alert_key, row as unknown as Record<string, unknown>);
      }
    }

    const seenKeys = computedWithKeys.map((alert) => alert.alert_key);
    if (seenKeys.length > 0) {
      await supabase
        .from("effectifs_alert_states")
        .update({ last_seen_at: now.toISOString(), updated_at: now.toISOString() })
        .in("alert_key", seenKeys);
    }

    const activeAlerts = computedWithKeys.filter((alert) => {
      const state = stateByKey.get(alert.alert_key);
      const status = String(state?.status ?? "active");
      return status === "active";
    });

    const historyAlerts = Array.from(stateByKey.values())
      .filter((state) => String(state.status ?? "active") !== "active")
      .slice(0, 200);

    const totalCoverageAlerts = activeAlerts.length;
    const totalDeliveryDaysWithoutDriver = new Set(
      activeAlerts
        .filter((alert) => alert.type === "delivery_without_driver")
        .map((alert) => String(alert.date))
    ).size;

    return NextResponse.json({
      summary: {
        totalPlannedHours: Math.round(totalPlannedHours * 100) / 100,
        totalRequiredHours: Math.round(totalRequiredHours * 100) / 100,
        totalMissingHours: Math.round(totalMissingHours * 100) / 100,
        totalCoverageAlerts,
        totalDeliveryDaysWithoutDriver,
      },
      days,
      departments: requestedDepartment ? [requestedDepartment] : [...EFFECTIFS_DEPARTMENTS],
      locations: [...EFFECTIFS_LOCATIONS],
      coverageWindows,
      coverage,
      alerts: activeAlerts,
      alertsHistory: historyAlerts,
      schedules,
      employees,
      usualSchedules,
      deliveryNeeds: days.map((day) => ({
        date: day.date,
        hasPlannedDeliveries: (deliveryCountByDate.get(day.date) ?? 0) > 0,
        plannedDeliveriesCount: deliveryCountByDate.get(day.date) ?? 0,
        requiredDrivers: (deliveryCountByDate.get(day.date) ?? 0) > 0 ? 1 : 0,
      })),
      weekStart: weekStartIso,
      weekEnd: weekEndIso,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur effectifs." },
      { status: 500 }
    );
  }
}

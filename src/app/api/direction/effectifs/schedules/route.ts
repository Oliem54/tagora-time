import { NextRequest, NextResponse } from "next/server";
import {
  computeHoursFromRange,
  normalizeDepartment,
  normalizeLocation,
  parseTimeToMinutes,
  parseDateOnly,
  requireDirectionOrAdmin,
  toDateOnly,
} from "@/app/api/direction/effectifs/_lib";

export const dynamic = "force-dynamic";

type CreateSchedulePayload = {
  employeeId?: unknown;
  department?: unknown;
  scheduledDate?: unknown;
  location?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  notes?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingColumnError(error: { message?: string; code?: string } | null, column: string) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return message.includes(column.toLowerCase()) && message.includes("does not exist");
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireDirectionOrAdmin(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const body = (await req.json()) as CreateSchedulePayload;
    const employeeId = Number(body.employeeId);
    const department = normalizeDepartment(body.department);
    const location = normalizeLocation(body.location) ?? "Autre";
    const date = parseDateOnly(asString(body.scheduledDate));
    const startTime = asString(body.startTime);
    const endTime = asString(body.endTime);
    const notes = asString(body.notes) || null;

    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return NextResponse.json({ error: "Employé invalide." }, { status: 400 });
    }
    if (!department) {
      return NextResponse.json({ error: "Département invalide." }, { status: 400 });
    }
    if (!date) {
      return NextResponse.json({ error: "Date invalide." }, { status: 400 });
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return NextResponse.json({ error: "Heures invalides." }, { status: 400 });
    }

    const plannedHours = computeHoursFromRange(startTime, endTime);
    if (plannedHours <= 0) {
      return NextResponse.json({ error: "La plage horaire doit être valide." }, { status: 400 });
    }

    let employeeRes = await supabase
      .from("chauffeurs")
      .select(
        "id, nom, actif, schedule_active, primary_department, secondary_departments, primary_location, secondary_locations, can_deliver"
      )
      .eq("id", employeeId)
      .maybeSingle();
    if (isMissingColumnError(employeeRes.error, "primary_location")) {
      employeeRes = await supabase
        .from("chauffeurs")
        .select("id, nom, actif, schedule_active, primary_department, secondary_departments, can_deliver")
        .eq("id", employeeId)
        .maybeSingle();
    }
    const { data: employee, error: employeeError } = employeeRes;
    if (employeeError) {
      return NextResponse.json({ error: employeeError.message }, { status: 500 });
    }
    if (!employee) {
      return NextResponse.json({ error: "Employé introuvable." }, { status: 404 });
    }

    const warnings: string[] = [];
    if (employee.actif === false) {
      warnings.push("Cet employé est inactif.");
    }
    if (employee.schedule_active === false) {
      warnings.push("Cet employé n’a pas un horaire actif.");
    }
    const primaryDepartment = normalizeDepartment(employee.primary_department);
    const secondaryDepartments = Array.isArray(employee.secondary_departments)
      ? employee.secondary_departments
          .map((item) => normalizeDepartment(item))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
      : [];
    if (primaryDepartment !== department && !secondaryDepartments.includes(department)) {
      warnings.push("Cet employé n’est pas habituellement assigné à ce département.");
    }
    const primaryLocation = normalizeLocation(employee.primary_location);
    const secondaryLocations = Array.isArray(employee.secondary_locations)
      ? employee.secondary_locations
          .map((item) => normalizeLocation(item))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
      : [];
    if (primaryLocation !== location && !secondaryLocations.includes(location)) {
      warnings.push("Cet employé n’est pas habituellement assigné à cet emplacement.");
    }
    if (department === "Livreur" && employee.can_deliver !== true) {
      warnings.push("Cet employé n’est pas configuré comme livreur.");
    }

    const dayOfWeek = (() => {
      const day = date.getDay();
      return day === 0 ? 7 : day;
    })();
    const { data: usualSchedules } = await supabase
      .from("employee_usual_schedules")
      .select("start_time, end_time, active")
      .eq("employee_id", employeeId)
      .eq("day_of_week", dayOfWeek)
      .eq("active", true);
    if (Array.isArray(usualSchedules) && usualSchedules.length > 0) {
      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);
      const matchesUsual = usualSchedules.some((row) => {
        const usualStart = parseTimeToMinutes(String(row.start_time));
        const usualEnd = parseTimeToMinutes(String(row.end_time));
        if (startMinutes == null || endMinutes == null || usualStart == null || usualEnd == null) {
          return false;
        }
        return startMinutes >= usualStart && endMinutes <= usualEnd;
      });
      if (!matchesUsual) {
        warnings.push("Ce quart est en dehors de l’horaire habituel de l’employé.");
      }
    }

    const { data, error } = await supabase
      .from("employee_schedules")
      .insert([
        {
          employee_id: employeeId,
          department,
          location,
          scheduled_date: toDateOnly(date),
          start_time: startTime,
          end_time: endTime,
          planned_hours: plannedHours,
          status: "planned",
          source: "manual",
          notes,
          created_by: user.id,
        },
      ])
      .select("id, employee_id, department, location, scheduled_date, start_time, end_time, planned_hours, status, notes")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ schedule: data, warnings }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur création quart." },
      { status: 500 }
    );
  }
}

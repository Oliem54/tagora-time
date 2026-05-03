import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { insertAppAlert } from "@/app/lib/app-alerts.server";
import { APP_ALERT_CATEGORY } from "@/app/lib/app-alerts.shared";
import {
  addDaysLocal,
  formatIsoDateLocal,
  startOfWeekMondayLocal,
} from "@/app/api/direction/effectifs/_lib";
import {
  createMissingCommunicationTemplateAlert,
  trySendCommunicationEmployeeEmail,
  trySendCommunicationEmployeeSms,
} from "@/app/lib/communication-templates.server";
import {
  formatLongLeaveReturnSummaryFr,
  isEmployeeAbsentOnCalendarDate,
  publicLeaveTypeLabelFr,
  type EmployeeLeavePeriodRow,
} from "@/app/lib/employee-leave-period.shared";
import type { EffectifsLongTermAbsence } from "@/app/lib/effectifs-payload.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

function mapLeaveRow(r: Record<string, unknown>): EmployeeLeavePeriodRow | null {
  const id = typeof r.id === "string" ? r.id : null;
  const employeeId = Number(r.employee_id);
  if (!id || !Number.isFinite(employeeId)) return null;
  return {
    id,
    employee_id: employeeId,
    leave_type: typeof r.leave_type === "string" ? r.leave_type : "other",
    start_date: String(r.start_date ?? ""),
    end_date: r.end_date != null ? String(r.end_date) : null,
    expected_return_date: r.expected_return_date != null ? String(r.expected_return_date) : null,
    is_indefinite: r.is_indefinite === true,
    status: typeof r.status === "string" ? r.status : "active",
    reason_public: typeof r.reason_public === "string" ? r.reason_public : null,
    private_note: typeof r.private_note === "string" ? r.private_note : null,
    created_by: typeof r.created_by === "string" ? r.created_by : null,
    updated_by: typeof r.updated_by === "string" ? r.updated_by : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
    ended_at: r.ended_at != null ? String(r.ended_at) : null,
    ended_by: typeof r.ended_by === "string" ? r.ended_by : null,
  };
}

/** Périodes actives qui chevauchent au moins un jour de [rangeStart, rangeEnd] (ISO). */
export async function fetchActiveLeavePeriodsOverlappingRange(
  supabase: SupabaseClient,
  rangeStart: string,
  rangeEnd: string
): Promise<EmployeeLeavePeriodRow[]> {
  const { data, error } = await supabase
    .from("employee_leave_periods")
    .select("*")
    .eq("status", "active")
    .lte("start_date", rangeEnd);

  if (error) {
    if (
      (error.message ?? "").includes("employee_leave_periods") ||
      (error.message ?? "").toLowerCase().includes("does not exist")
    ) {
      return [];
    }
    console.warn("[employee_leave_periods]", error.message);
    return [];
  }

  const rows = (data ?? [])
    .map((r) => mapLeaveRow(r as Record<string, unknown>))
    .filter((x): x is EmployeeLeavePeriodRow => x != null);

  const out: EmployeeLeavePeriodRow[] = [];
  const seen = new Set<string>();
  const startD = new Date(`${rangeStart}T12:00:00`);
  const endD = new Date(`${rangeEnd}T12:00:00`);

  for (const p of rows) {
    for (let d = new Date(startD); d.getTime() <= endD.getTime(); d = addDaysLocal(d, 1)) {
      const iso = formatIsoDateLocal(d);
      if (isEmployeeAbsentOnCalendarDate(p, iso)) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          out.push(p);
        }
        break;
      }
    }
  }
  return out;
}

export function buildLongLeaveExclusionMap(
  periods: EmployeeLeavePeriodRow[],
  weekStart: Date,
  weekEndInclusive: Date
): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  const add = (iso: string, id: number) => {
    let s = map.get(iso);
    if (!s) {
      s = new Set<number>();
      map.set(iso, s);
    }
    s.add(id);
  };

  for (let d = new Date(weekStart); d.getTime() <= weekEndInclusive.getTime(); d = addDaysLocal(d, 1)) {
    const iso = formatIsoDateLocal(d);
    for (const p of periods) {
      if (isEmployeeAbsentOnCalendarDate(p, iso)) {
        add(iso, p.employee_id);
      }
    }
  }
  return map;
}

export function buildLongTermAbsencesForPayload(
  periods: EmployeeLeavePeriodRow[],
  nomById: Map<number, string | null>,
  todayIso: string
): EffectifsLongTermAbsence[] {
  const out: EffectifsLongTermAbsence[] = [];
  for (const p of periods) {
    if (p.status !== "active") continue;
    if (!isEmployeeAbsentOnCalendarDate(p, todayIso)) continue;
    out.push({
      employeeId: p.employee_id,
      employeeName: nomById.get(p.employee_id) ?? null,
      publicLeaveLabel: publicLeaveTypeLabelFr(p.leave_type),
      startDate: p.start_date,
      expectedReturnSummary: formatLongLeaveReturnSummaryFr({
        is_indefinite: p.is_indefinite,
        expected_return_date: p.expected_return_date,
      }),
      isIndefinite: p.is_indefinite || !p.expected_return_date,
    });
  }
  out.sort((a, b) => (a.employeeName ?? "").localeCompare(b.employeeName ?? "", "fr"));
  return out;
}

export async function getActiveLeaveForEmployeeOnDate(
  supabase: SupabaseClient,
  employeeId: number,
  isoDate: string
): Promise<EmployeeLeavePeriodRow | null> {
  const { data, error } = await supabase
    .from("employee_leave_periods")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  const row = mapLeaveRow(data as Record<string, unknown>);
  if (!row) return null;
  return isEmployeeAbsentOnCalendarDate(row, isoDate) ? row : null;
}

/** Données affichage employé (sans note privée). */
export function toLongLeavePublicBanner(
  row: EmployeeLeavePeriodRow
): { publicLabel: string; startDate: string; returnSummary: string } {
  return {
    publicLabel: publicLeaveTypeLabelFr(row.leave_type),
    startDate: row.start_date,
    returnSummary: formatLongLeaveReturnSummaryFr({
      is_indefinite: row.is_indefinite,
      expected_return_date: row.expected_return_date,
    }),
  };
}

export async function insertLongLeaveStartedAlert(
  supabase: SupabaseClient,
  input: {
    employeeId: number;
    employeeName: string | null;
    publicLabel: string;
    leavePeriodId: string;
  }
) {
  await insertAppAlert(supabase, {
    category: APP_ALERT_CATEGORY.employees,
    priority: "medium",
    title: "Congé prolongé enregistré",
    body: `${input.employeeName?.trim() || `Employé #${input.employeeId}`} — ${input.publicLabel}.`,
    linkHref: `/direction/ressources/employes/${input.employeeId}`,
    sourceModule: "employee_leave_periods",
    refTable: "employee_leave_periods",
    refId: input.leavePeriodId,
    employeeId: input.employeeId,
    dedupeKey: `long_leave_started:${input.leavePeriodId}`,
    metadata: { alertType: "employee_long_leave_started" },
  });
}

export async function maybeInsertReturnVerificationAlert(
  supabase: SupabaseClient,
  input: {
    employeeId: number;
    employeeName: string | null;
    expectedReturnDate: string;
    leavePeriodId: string;
  }
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${input.expectedReturnDate}T12:00:00`);
  if (Number.isNaN(target.getTime())) return;
  const diffDays = Math.round((target.getTime() - today.getTime()) / 864e5);
  if (diffDays !== 3) return;

  await insertAppAlert(supabase, {
    category: APP_ALERT_CATEGORY.employees,
    priority: "medium",
    title: "Retour employé à vérifier",
    body: `${input.employeeName?.trim() || `Employé #${input.employeeId}`} — retour prévu dans 3 jours (${input.expectedReturnDate}).`,
    linkHref: `/direction/ressources/employes/${input.employeeId}`,
    sourceModule: "employee_leave_periods",
    refTable: "employee_leave_periods",
    refId: input.leavePeriodId,
    employeeId: input.employeeId,
    dedupeKey: `long_leave_return_3d:${input.leavePeriodId}:${input.expectedReturnDate}`,
    metadata: { alertType: "employee_return_soon" },
  });
}

export async function notifyEmployeeWorkStatusUpdated(options: {
  employeeId: number;
  nom: string | null;
  email: string | null | undefined;
  phone: string | null | undefined;
  notify: boolean;
}) {
  if (!options.notify) return;
  let admin: ReturnType<typeof createAdminSupabaseClient> | null = null;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    admin = null;
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const dashboardUrl =
    baseUrl ? `${baseUrl}/employe/effectifs` : "/employe/effectifs";
  const vars: Record<string, string | undefined> = {
    employee_name: options.nom?.trim() ?? "",
    dashboard_url: dashboardUrl,
    app_url: baseUrl,
  };

  const emailTry = await trySendCommunicationEmployeeEmail({
    supabase: admin,
    templateKey: "employee_work_status_updated_employee_email",
    audience: "employee",
    variables: vars,
    toEmail: options.email,
  });

  if (!emailTry.usedTemplate && admin) {
    await createMissingCommunicationTemplateAlert(
      admin,
      "employee_work_status_updated_employee_email",
      "email",
      "employee"
    );
  }

  const smsTry = await trySendCommunicationEmployeeSms({
    supabase: admin,
    templateKey: "employee_work_status_updated_employee_sms",
    audience: "employee",
    variables: vars,
    phone: options.phone,
  });

  if (!smsTry.usedTemplate && admin) {
    await createMissingCommunicationTemplateAlert(
      admin,
      "employee_work_status_updated_employee_sms",
      "sms",
      "employee"
    );
  }
}

export async function insertPunchDuringLongLeaveAlert(
  supabase: SupabaseClient,
  input: { employeeId: number; employeeName: string | null }
) {
  await insertAppAlert(supabase, {
    category: APP_ALERT_CATEGORY.employees,
    priority: "medium",
    title: "Pointage pendant congé prolongé",
    body: `${input.employeeName?.trim() || `Employé #${input.employeeId}`} a pointé alors qu’un congé prolongé est actif.`,
    linkHref: `/direction/horodateur`,
    sourceModule: "horodateur",
    employeeId: input.employeeId,
    metadata: { alertType: "punch_during_long_leave" },
  });
}

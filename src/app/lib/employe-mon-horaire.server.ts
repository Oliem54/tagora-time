import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getChauffeurDaySlice,
  mapEmployees,
  formatIsoDateLocal,
  startOfWeekMondayLocal,
  addDaysLocal,
  type ChauffeurEffectifsRow,
} from "@/app/api/direction/effectifs/_lib";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";
import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  departmentLabelFromKey,
  locationLabelFromKey,
} from "@/app/lib/effectifs-departments.shared";
import {
  buildApprovedOverrideMap,
  listRequestDates,
  mapScheduleRequestRow,
  scheduleRequestTypeLabel,
  type DateEmployeeOverrideMap,
  type EffectifsScheduleRequest,
} from "@/app/lib/effectifs-schedule-request.shared";
import type { EffectifsEmployee } from "@/app/lib/effectifs-payload.shared";
import type {
  MonHoraireCoworker,
  MonHoraireDay,
  MonHorairePayload,
} from "@/app/lib/employe-mon-horaire.types";
import {
  addDaysIso,
  effectifsWeekdayIndexFromIso,
  enumerateWeekFromMonday,
} from "@/app/direction/effectifs/effectifs-calendar-shared";
import {
  isEmployeeAbsentOnCalendarDate,
} from "@/app/lib/employee-leave-period.shared";
import {
  getActiveLeaveForEmployeeOnDate,
  toLongLeavePublicBanner,
} from "@/app/lib/employee-leave-period.server";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return h * 60 + m;
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const a1 = toMinutes(aStart);
  const a2 = toMinutes(aEnd);
  const b1 = toMinutes(bStart);
  const b2 = toMinutes(bEnd);
  if ([a1, a2, b1, b2].some((n) => Number.isNaN(n))) return false;
  if (a2 <= a1 || b2 <= b1) return false;
  return a1 < b2 && b1 < a2;
}

function effectiveWorkSlice(
  dateIso: string,
  employeeId: number,
  row: ChauffeurEffectifsRow,
  overrideMap: DateEmployeeOverrideMap
): { kind: "off" } | { kind: "work"; start: string; end: string } {
  const wd = effectifsWeekdayIndexFromIso(dateIso);
  const slice = getChauffeurDaySlice(row, wd);
  const o = overrideMap.get(dateIso)?.get(employeeId);
  if (o?.kind === "exclude") return { kind: "off" };
  if (o?.kind === "slice") {
    if (o.start && o.end && o.end > o.start) {
      return { kind: "work", start: o.start, end: o.end };
    }
    return { kind: "off" };
  }
  if (!slice.active || !slice.start || !slice.end) return { kind: "off" };
  return { kind: "work", start: slice.start, end: slice.end };
}

function companyShortLabel(primary: AccountRequestCompany | null): string {
  if (!primary) return "—";
  return primary === "titan_produits_industriels" ? "Titan" : "Oliem";
}

function departmentsOverlap(a: EffectifsEmployee, b: EffectifsEmployee): boolean {
  if (a.departmentKey && a.departmentKey === b.departmentKey) return true;
  if (b.departmentKey && a.secondaryDepartmentKeys.includes(b.departmentKey)) return true;
  if (a.departmentKey && b.secondaryDepartmentKeys.includes(a.departmentKey)) return true;
  for (const x of a.secondaryDepartmentKeys) {
    if (b.secondaryDepartmentKeys.includes(x) || b.departmentKey === x) return true;
  }
  return false;
}

function locationsOverlap(a: EffectifsEmployee, b: EffectifsEmployee): boolean {
  const ak = a.primaryLocationKey;
  const bk = b.primaryLocationKey;
  if (ak && bk && ak === bk) return true;
  if (ak && b.secondaryLocationKeys.includes(ak)) return true;
  if (bk && a.secondaryLocationKeys.includes(bk)) return true;
  for (const x of a.secondaryLocationKeys) {
    if (b.secondaryLocationKeys.includes(x)) return true;
  }
  return false;
}

function sameCompany(a: EffectifsEmployee, b: EffectifsEmployee): boolean {
  return (
    a.primaryCompany != null &&
    b.primaryCompany != null &&
    a.primaryCompany === b.primaryCompany
  );
}

function shouldPairCoworkers(self: EffectifsEmployee, other: EffectifsEmployee): boolean {
  if (departmentsOverlap(self, other)) return true;
  if (locationsOverlap(self, other)) return true;
  if (sameCompany(self, other)) return true;
  return false;
}

const WEEKDAY_LONG = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

function statusForDay(
  dateIso: string,
  selfId: number,
  selfRow: ChauffeurEffectifsRow,
  eff: { kind: "off" } | { kind: "work"; start: string; end: string },
  selfRequests: EffectifsScheduleRequest[],
  overrideMap: DateEmployeeOverrideMap
): { statusKey: MonHoraireDay["statusKey"]; statusLabel: string; note: string | null } {
  const pending = selfRequests.filter((r) => r.status === "pending");
  for (const r of pending) {
    if (!listRequestDates(r).includes(dateIso)) continue;
    return {
      statusKey: "pending",
      statusLabel: `Demande en attente (${scheduleRequestTypeLabel(r.requestType)})`,
      note: r.reason,
    };
  }

  if (eff.kind === "off") {
    const approvedDay = selfRequests.find(
      (r) =>
        r.status === "approved" &&
        listRequestDates(r).includes(dateIso) &&
        (r.requestType === "vacation" ||
          r.requestType === "day_off" ||
          r.requestType === "unavailable" ||
          r.requestType === "partial_absence")
    );
    if (approvedDay) {
      const isVac = approvedDay.requestType === "vacation";
      return {
        statusKey: isVac ? "vacation_approved" : "leave_approved",
        statusLabel: isVac ? "Vacances approuvées" : "Congé / absence approuvé",
        note: approvedDay.reason,
      };
    }
    return { statusKey: "off", statusLabel: "Congé", note: null };
  }

  const o = overrideMap.get(dateIso)?.get(selfId);
  if (o?.kind === "slice") {
    const habitual = getChauffeurDaySlice(selfRow, effectifsWeekdayIndexFromIso(dateIso));
    if (
      habitual.active &&
      habitual.start &&
      habitual.end &&
      (o.start !== habitual.start || o.end !== habitual.end)
    ) {
      return { statusKey: "modified", statusLabel: "Horaire modifié (demande approuvée)", note: null };
    }
  }

  return { statusKey: "work", statusLabel: "Prévu", note: null };
}

function buildCoworkers(
  dateIso: string,
  selfId: number,
  selfEmp: EffectifsEmployee,
  selfEff: { kind: "work"; start: string; end: string },
  rowsById: Map<number, ChauffeurEffectifsRow>,
  empById: Map<number, EffectifsEmployee>,
  overrideMap: DateEmployeeOverrideMap
): MonHoraireCoworker[] {
  const out: MonHoraireCoworker[] = [];
  for (const [id, row] of rowsById) {
    if (id === selfId) continue;
    const emp = empById.get(id);
    if (!emp) continue;
    const eff = effectiveWorkSlice(dateIso, id, row, overrideMap);
    if (eff.kind === "off") continue;
    if (!rangesOverlap(selfEff.start, selfEff.end, eff.start, eff.end)) continue;
    if (!shouldPairCoworkers(selfEmp, emp)) continue;
    out.push({
      employeeId: id,
      name: emp.nom,
      startLocal: eff.start,
      endLocal: eff.end,
      departmentLabel: emp.departmentKey
        ? departmentLabelFromKey(emp.departmentKey)
        : "—",
    });
  }
  out.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "fr"));
  return out;
}

export async function buildEmployeMonHorairePayload(
  supabase: SupabaseClient,
  selfRow: ChauffeurEffectifsRow
): Promise<MonHorairePayload | { error: string }> {
  const selfId = selfRow.id;
  if (!Number.isFinite(selfId)) {
    return { error: "Profil employé invalide." };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = formatIsoDateLocal(today);
  const tomorrowIso = formatIsoDateLocal(addDaysLocal(today, 1));
  const horizonEnd = formatIsoDateLocal(addDaysLocal(today, 120));

  const activeLeaveRow = await getActiveLeaveForEmployeeOnDate(supabase, selfId, todayIso);
  const longLeaveBanner = activeLeaveRow ? toLongLeavePublicBanner(activeLeaveRow) : null;

  const allChRes = await supabase
    .from("chauffeurs")
    .select("*")
    .neq("actif", false);

  if (allChRes.error) {
    return { error: allChRes.error.message ?? "Chargement chauffeurs impossible." };
  }

  let allRows = (allChRes.data ?? []) as ChauffeurEffectifsRow[];
  if (!allRows.some((r) => r.id === selfId)) {
    allRows = [...allRows, selfRow];
  }
  const rowsById = new Map(allRows.map((r) => [r.id, r]));
  const employeesMapped = mapEmployees(allRows);
  const empById = new Map(employeesMapped.map((e) => [e.id, e]));
  const selfEmp = empById.get(selfId);
  if (!selfEmp) {
    return { error: "Employé introuvable dans l’effectif." };
  }

  const srRes = await supabase
    .from("effectifs_employee_schedule_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (srRes.error) {
    return { error: srRes.error.message ?? "Chargement des demandes impossible." };
  }

  const nomById = new Map<number, string | null>();
  for (const e of employeesMapped) {
    nomById.set(e.id, e.nom);
  }

  const allRequests = (srRes.data ?? [])
    .map((r) => mapScheduleRequestRow(r as Record<string, unknown>, nomById.get(Number((r as { employee_id?: number }).employee_id)) ?? null))
    .filter((x): x is EffectifsScheduleRequest => x != null);

  const windowRequests = allRequests.filter((r) => {
    const start = r.requestedStartDate ?? r.requestedDate;
    const end = r.requestedEndDate ?? r.requestedDate;
    if (!start || !end) return false;
    return !(end < todayIso || start > horizonEnd);
  });

  const getHabitualSlice = (employeeId: number, weekdayIndex: number) => {
    const row = rowsById.get(employeeId);
    if (!row) return { active: false, start: null, end: null };
    return getChauffeurDaySlice(row, weekdayIndex);
  };

  const overrideMap = buildApprovedOverrideMap(
    windowRequests,
    getHabitualSlice,
    effectifsWeekdayIndexFromIso
  );

  const selfRequests = allRequests.filter((r) => r.employeeId === selfId);

  const weekStartIso = formatIsoDateLocal(startOfWeekMondayLocal(today));
  const weekDates = enumerateWeekFromMonday(weekStartIso);

  const weekGrid: MonHoraireDay[] = weekDates.map((dateIso) => {
    const wd = effectifsWeekdayIndexFromIso(dateIso);
    if (activeLeaveRow && isEmployeeAbsentOnCalendarDate(activeLeaveRow, dateIso)) {
      const deptLabel = selfEmp.departmentKey
        ? departmentLabelFromKey(selfEmp.departmentKey)
        : "—";
      const locLabel = selfEmp.primaryLocationKey
        ? locationLabelFromKey(selfEmp.primaryLocationKey)
        : "—";
      return {
        date: dateIso,
        weekdayLabel: WEEKDAY_LONG[wd] ?? `J${wd}`,
        statusKey: "long_leave",
        statusLabel: "Congé prolongé",
        startLocal: null,
        endLocal: null,
        departmentLabel: deptLabel,
        locationLabel: locLabel,
        companyLabel: companyShortLabel(selfEmp.primaryCompany ?? null),
        note: null,
        coworkers: [],
      };
    }
    const eff = effectiveWorkSlice(dateIso, selfId, selfRow, overrideMap);
    const st = statusForDay(dateIso, selfId, selfRow, eff, selfRequests, overrideMap);
    const deptLabel = selfEmp.departmentKey
      ? departmentLabelFromKey(selfEmp.departmentKey)
      : "—";
    const locLabel = selfEmp.primaryLocationKey
      ? locationLabelFromKey(selfEmp.primaryLocationKey)
      : "—";
    const co =
      eff.kind === "work"
        ? buildCoworkers(
            dateIso,
            selfId,
            selfEmp,
            eff,
            rowsById,
            empById,
            overrideMap
          )
        : [];

    return {
      date: dateIso,
      weekdayLabel: WEEKDAY_LONG[wd] ?? `J${wd}`,
      statusKey: st.statusKey,
      statusLabel: st.statusLabel,
      startLocal: eff.kind === "work" ? eff.start : null,
      endLocal: eff.kind === "work" ? eff.end : null,
      departmentLabel: deptLabel,
      locationLabel: locLabel,
      companyLabel: companyShortLabel(selfEmp.primaryCompany ?? null),
      note: st.note,
      coworkers: co,
    };
  });

  const dayMap = new Map(weekGrid.map((d) => [d.date, d]));
  const todayDay = dayMap.get(todayIso) ?? null;
  const tomorrowDay =
    weekGrid.find((d) => d.date === tomorrowIso) ??
    (() => {
      const eff = effectiveWorkSlice(tomorrowIso, selfId, selfRow, overrideMap);
      const st = statusForDay(tomorrowIso, selfId, selfRow, eff, selfRequests, overrideMap);
      const wd = effectifsWeekdayIndexFromIso(tomorrowIso);
      const co =
        eff.kind === "work"
          ? buildCoworkers(
              tomorrowIso,
              selfId,
              selfEmp,
              eff,
              rowsById,
              empById,
              overrideMap
            )
          : [];
      return {
        date: tomorrowIso,
        weekdayLabel: WEEKDAY_LONG[wd] ?? "",
        statusKey: st.statusKey,
        statusLabel: st.statusLabel,
        startLocal: eff.kind === "work" ? eff.start : null,
        endLocal: eff.kind === "work" ? eff.end : null,
        departmentLabel: selfEmp.departmentKey
          ? departmentLabelFromKey(selfEmp.departmentKey)
          : "—",
        locationLabel: selfEmp.primaryLocationKey
          ? locationLabelFromKey(selfEmp.primaryLocationKey)
          : "—",
        companyLabel: companyShortLabel(selfEmp.primaryCompany ?? null),
        note: st.note,
        coworkers: co,
      } satisfies MonHoraireDay;
    })();

  let nextShift: MonHorairePayload["nextShift"] = null;
  for (let i = 0; i < 56; i += 1) {
    const dIso = i === 0 ? todayIso : addDaysIso(todayIso, i);
    if (activeLeaveRow && isEmployeeAbsentOnCalendarDate(activeLeaveRow, dIso)) {
      continue;
    }
    const eff = effectiveWorkSlice(dIso, selfId, selfRow, overrideMap);
    if (eff.kind === "work") {
      const wd = effectifsWeekdayIndexFromIso(dIso);
      nextShift = {
        date: dIso,
        weekdayLabel: WEEKDAY_LONG[wd] ?? dIso,
        startLocal: eff.start,
        endLocal: eff.end,
      };
      break;
    }
  }

  const pendingRequests = selfRequests.filter((r) => r.status === "pending");
  const approvedRequests = selfRequests.filter((r) => r.status === "approved");
  const rejectedRequests = selfRequests.filter((r) => r.status === "rejected");

  const futureApproved = approvedRequests
    .filter((r) => {
      const dates = listRequestDates(r);
      return dates.some((d) => d >= todayIso);
    })
    .sort((a, b) => {
      const da = listRequestDates(a)[0] ?? "";
      const db = listRequestDates(b)[0] ?? "";
      return da.localeCompare(db);
    });

  const nextVacation =
    futureApproved.find((r) => r.requestType === "vacation") ?? null;
  const nextDayOff =
    futureApproved.find((r) =>
      ["day_off", "partial_absence", "unavailable"].includes(r.requestType)
    ) ?? null;

  return {
    employeeId: selfId,
    employeeName: selfEmp.nom,
    primaryCompany: selfEmp.primaryCompany ?? null,
    companyLabel: selfEmp.primaryCompany
      ? getCompanyLabel(selfEmp.primaryCompany)
      : "—",
    weeklySchedule: selfEmp,
    weekGrid,
    today: todayDay,
    tomorrow: tomorrowDay,
    nextShift,
    pendingRequests,
    approvedRequests,
    rejectedRequests,
    nextVacation,
    nextDayOff,
    pendingCount: pendingRequests.length,
    longLeave: longLeaveBanner,
  };
}

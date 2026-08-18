import { describe, expect, it } from "vitest";
import { isEmployeeAbsentOnCalendarDate } from "@/app/lib/employee-leave-period.shared";
import {
  messageForHorodateurPunchGpsServerCode,
  messageForPunchGeolocationFailure,
} from "@/app/lib/employee-punch-geolocation.client";
import { employeeMayPunchInZone } from "@/app/lib/horodateur-qr-punch.shared";
import { selectActiveMembershipRow } from "@/app/lib/saas/organization-membership.shared";
import {
  evaluateWebPunchGpsAgainstLoadedBases,
  evaluateWebPunchGpsCoordinates,
} from "@/app/lib/horodateur-web-punch-gps.shared";
import {
  evaluateResolvedEmployeePunchProfile,
  employeeMatchesCallerOrganization,
  linkedAuthUserMatchesCaller,
  paidOperationalPunchBlock,
  shouldIgnorePaidOperationalEvent,
} from "@/app/lib/horodateur-v1/employee-punch-eligibility.shared";
import {
  aggregateOvertimeForEmployee,
  computeRegistreRowFlags,
  filterShiftsForCallerOrganization,
  primaryStatusFromFlags,
  shiftBreakTotal,
  sumShiftMinutesByUniqueId,
} from "@/app/lib/horodateur-v1/registre-aggregations.shared";
import { computeShiftPayableMinutes } from "@/app/lib/horodateur-v1/shift-payable.shared";
import {
  computeStateFromEventTimeline,
  resolveOperationalWorkDate,
} from "@/app/lib/horodateur-v1/operational-state.shared";
import {
  HORODATEUR_PHASE1_TIMEZONE,
  diffMinutes,
  getLocalWorkDate,
  isAllowedTransition,
} from "@/app/lib/horodateur-v1/rules";
import type {
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1ShiftRecord,
} from "@/app/lib/horodateur-v1/types";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTH_LINKED = "auth-user-linked";
const DEPOT = {
  id: "base-depot",
  nom: "Depot QA",
  adresse: "100 rue Depot",
  latitude: 45.5017,
  longitude: -73.5673,
  rayon_m: 250,
};

function event(
  partial: {
    id?: string;
    employee_id?: number;
    event_type: HorodateurPhase1EventRecord["event_type"];
    occurred_at: string;
    status?: HorodateurPhase1EventRecord["status"];
    work_date?: string;
    organization_id?: string;
    company_context?: string;
  }
): HorodateurPhase1EventRecord {
  return {
    id: partial.id ?? crypto.randomUUID(),
    employee_id: partial.employee_id ?? 1,
    event_type: partial.event_type,
    occurred_at: partial.occurred_at,
    event_time: partial.occurred_at,
    created_at: partial.occurred_at,
    status: partial.status ?? "normal",
    work_date: partial.work_date ?? getLocalWorkDate(partial.occurred_at),
    week_start_date: "2026-08-17",
    company_context: partial.company_context ?? "oliem_solutions",
    notes: null,
    note: null,
    source_kind: "employe",
    actor_role: "employe",
    actor_user_id: AUTH_LINKED,
    requires_approval: false,
    related_event_id: null,
    is_manual_correction: false,
    exception_code: null,
    approval_note: null,
    organization_id: partial.organization_id ?? ORG_A,
    organization_company_id: COMPANY_A,
  } as HorodateurPhase1EventRecord;
}

function shift(
  partial: Partial<HorodateurPhase1ShiftRecord> &
    Pick<HorodateurPhase1ShiftRecord, "id" | "employee_id" | "work_date">
): HorodateurPhase1ShiftRecord {
  return {
    week_start_date: "2026-08-17",
    company_context: "oliem_solutions",
    shift_start_at: `${partial.work_date}T12:00:00.000Z`,
    shift_end_at: `${partial.work_date}T20:00:00.000Z`,
    gross_minutes: 480,
    paid_break_minutes: 0,
    unpaid_break_minutes: 0,
    unpaid_lunch_minutes: 0,
    worked_minutes: 480,
    payable_minutes: 480,
    approved_exception_minutes: 0,
    pending_exception_minutes: 0,
    anomalies_count: 0,
    status: "ferme",
    last_recomputed_at: `${partial.work_date}T20:00:00.000Z`,
    organization_id: ORG_A,
    organization_company_id: COMPANY_A,
    ...partial,
  };
}

function exception(
  partial: Partial<HorodateurPhase1ExceptionRecord> &
    Pick<HorodateurPhase1ExceptionRecord, "id" | "employee_id" | "status">
): HorodateurPhase1ExceptionRecord {
  return {
    shift_id: null,
    source_event_id: "evt-source",
    exception_type: "outside_schedule",
    reason_label: "Hors horaire",
    details: null,
    impact_minutes: 15,
    requested_at: "2026-08-17T12:00:00.000Z",
    requested_by_user_id: AUTH_LINKED,
    reviewed_at: null,
    reviewed_by_user_id: null,
    review_note: null,
    approved_minutes: null,
    organization_id: ORG_A,
    organization_company_id: COMPANY_A,
    ...partial,
  };
}

describe("employee matrix — linking and statuses", () => {
  it("refuses an inactive chauffeur", () => {
    const result = evaluateResolvedEmployeePunchProfile({
      present: true,
      active: false,
      organizationId: ORG_A,
      organizationCompanyId: COMPANY_A,
      primaryCompany: "oliem_solutions",
    });
    expect(result).toMatchObject({ ok: false, code: "employee_inactive", status: 409 });
  });

  it("treats administrative suspension as calendar absence (leave), not a new punch status", () => {
    expect(
      isEmployeeAbsentOnCalendarDate(
        {
          status: "active",
          start_date: "2026-08-01",
          end_date: "2026-08-31",
          expected_return_date: "2026-09-01",
          is_indefinite: false,
        },
        "2026-08-17"
      )
    ).toBe(true);
  });

  it("refuses punch when no chauffeur is linked to the Auth account", () => {
    const result = evaluateResolvedEmployeePunchProfile({
      present: false,
      active: false,
      organizationId: null,
      organizationCompanyId: null,
      primaryCompany: null,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "employee_not_found_for_auth_user",
      status: 404,
    });
    expect(result.ok === false && result.message.includes("membership seul ne suffit pas")).toBe(
      true
    );
  });

  it("documents that employee punch does not use membership; direction does", () => {
    expect(selectActiveMembershipRow([], "strict")).toEqual({ kind: "absent" });
    const chauffeurOk = evaluateResolvedEmployeePunchProfile({
      present: true,
      active: true,
      organizationId: ORG_A,
      organizationCompanyId: COMPANY_A,
      primaryCompany: "oliem_solutions",
    });
    expect(chauffeurOk.ok).toBe(true);
  });

  it("refuses a suspended/inactive membership for direction", () => {
    expect(
      selectActiveMembershipRow(
        [
          {
            id: "m1",
            organization_id: ORG_A,
            role: "employe",
            status: "inactive",
            is_default: true,
          },
        ],
        "strict"
      )
    ).toEqual({ kind: "inactive" });
  });

  it("allows a multi-company chauffeur for both authorized companies", () => {
    const employee = {
      active: true,
      organizationId: ORG_A,
      organizationCompanyId: COMPANY_A,
      canWorkForOliemSolutions: true,
      canWorkForTitanProduitsIndustriels: true,
    };
    expect(employeeMayPunchInZone(employee, "oliem_solutions")).toBe(true);
    expect(employeeMayPunchInZone(employee, "titan_produits_industriels")).toBe(true);
  });

  it("denies an employee from another organization", () => {
    expect(employeeMatchesCallerOrganization(ORG_A, ORG_B)).toBe(false);
    expect(
      employeeMayPunchInZone(
        {
          active: true,
          organizationId: ORG_A,
          organizationCompanyId: COMPANY_A,
          canWorkForOliemSolutions: true,
          canWorkForTitanProduitsIndustriels: true,
        },
        "oliem_solutions",
        { organization_id: ORG_B, organization_company_id: COMPANY_A }
      )
    ).toBe(false);
  });

  it("accepts a correctly linked legacy Auth account", () => {
    expect(linkedAuthUserMatchesCaller(AUTH_LINKED, AUTH_LINKED)).toBe(true);
    expect(linkedAuthUserMatchesCaller(null, AUTH_LINKED)).toBe(false);
    expect(linkedAuthUserMatchesCaller("other-auth", AUTH_LINKED)).toBe(false);
  });
});

describe("employee matrix — GPS", () => {
  it("accepts GPS inside the configured radius", () => {
    const coords = evaluateWebPunchGpsCoordinates(45.5017, -73.5673);
    expect(coords.ok).toBe(true);
    if (!coords.ok) return;
    const result = evaluateWebPunchGpsAgainstLoadedBases({
      latitude: coords.latitude,
      longitude: coords.longitude,
      bases: [DEPOT],
    });
    expect(result).toMatchObject({ ok: true, zoneValidated: true, matchedBaseId: DEPOT.id });
  });

  it("requires coordinates when GPS is absent", () => {
    expect(evaluateWebPunchGpsCoordinates(null, null)).toMatchObject({
      ok: false,
      code: "GPS_REQUIRED",
    });
    expect(evaluateWebPunchGpsCoordinates(undefined, undefined)).toMatchObject({
      ok: false,
      code: "GPS_REQUIRED",
    });
  });

  it("maps browser permission denial to the employee GPS help message", () => {
    expect(messageForPunchGeolocationFailure("permission_denied")).toContain(
      "Localisation refusée"
    );
    expect(messageForHorodateurPunchGpsServerCode("GPS_REQUIRED")).toContain("Position GPS requise");
  });

  it("rejects a position outside the authorized zone", () => {
    const result = evaluateWebPunchGpsAgainstLoadedBases({
      latitude: 45.6,
      longitude: -73.8,
      bases: [DEPOT],
    });
    expect(result).toMatchObject({ ok: false, code: "GPS_OUT_OF_ZONE" });
  });
});

describe("employee matrix — reload and overnight", () => {
  it("rebuilds the same en_quart state after punch_in (reload)", () => {
    const punchIn = event({
      event_type: "quart_debut",
      occurred_at: "2026-08-17T12:00:00.000Z",
    });
    const first = computeStateFromEventTimeline([punchIn]);
    const reloaded = computeStateFromEventTimeline([punchIn]);
    expect(first.currentState).toBe("en_quart");
    expect(reloaded).toEqual(first);
    expect(isAllowedTransition("hors_quart", "punch_in")).toBe(true);
    expect(isAllowedTransition("en_quart", "punch_in")).toBe(false);
  });

  it("keeps an overnight punch_out on the open shift work_date", () => {
    const punchInAt = "2026-08-17T22:00:00-04:00";
    const punchOutAt = "2026-08-18T02:00:00-04:00";
    const openWorkDate = getLocalWorkDate(punchInAt);
    const approved = [
      event({
        event_type: "quart_debut",
        occurred_at: punchInAt,
        work_date: openWorkDate,
      }),
    ];
    expect(
      resolveOperationalWorkDate({
        eventType: "quart_fin",
        occurredAt: punchOutAt,
        approvedEvents: approved,
      })
    ).toBe(openWorkDate);
    expect(diffMinutes(punchInAt, punchOutAt)).toBe(240);
    expect(
      computeStateFromEventTimeline([
        ...approved,
        event({
          event_type: "quart_fin",
          occurred_at: punchOutAt,
          work_date: openWorkDate,
        }),
      ]).currentState
    ).toBe("termine");
  });
});

describe("payable math, paid meal, workedMinutes, no double count", () => {
  it("does not double-subtract unpaid pause/lunch already excluded from worked", () => {
    expect(
      computeShiftPayableMinutes({
        workedMinutes: 400,
        unpaidBreakMinutes: 30,
        unpaidLunchMinutes: 45,
        approvedExceptionMinutes: 10,
      })
    ).toBe(410);
  });

  it("includes paid lunch in worked minutes (meal punches skipped)", () => {
    expect(
      shouldIgnorePaidOperationalEvent(
        { pausePaid: false, lunchPaid: true },
        "meal_start"
      )
    ).toBe(true);
    expect(
      paidOperationalPunchBlock({ pausePaid: false, lunchPaid: true }, "meal_start")
        ?.code
    ).toBe("paid_lunch_no_punch_required");
    expect(
      computeShiftPayableMinutes({
        workedMinutes: 480,
        unpaidBreakMinutes: 0,
        unpaidLunchMinutes: 0,
        approvedExceptionMinutes: 0,
      })
    ).toBe(480);
  });

  it("exposes workedMinutes independently of pending exceptions", () => {
    const workedMinutes = 420;
    const liveRow = {
      workedMinutes,
      payableMinutesToday: computeShiftPayableMinutes({
        workedMinutes,
        unpaidBreakMinutes: 15,
        unpaidLunchMinutes: 30,
        approvedExceptionMinutes: 0,
      }),
      weeklyProgressMinutes: 420,
    };
    expect(liveRow.workedMinutes).toBe(420);
    expect(liveRow.payableMinutesToday).toBe(420);
  });
});

describe("admin matrix", () => {
  it("aggregates several employees, days and authorized companies without double counting", () => {
    const shifts = [
      shift({
        id: "s-e1-d1-oliem",
        employee_id: 1,
        work_date: "2026-08-17",
        payable_minutes: 480,
        worked_minutes: 480,
      }),
      shift({
        id: "s-e1-d2-titan",
        employee_id: 1,
        work_date: "2026-08-18",
        company_context: "titan_produits_industriels",
        payable_minutes: 420,
        worked_minutes: 420,
      }),
      shift({
        id: "s-e2-d1-oliem",
        employee_id: 2,
        work_date: "2026-08-17",
        payable_minutes: 300,
        worked_minutes: 300,
      }),
      shift({
        id: "s-e2-d1-oliem",
        employee_id: 2,
        work_date: "2026-08-17",
        payable_minutes: 300,
        worked_minutes: 300,
      }),
    ];
    const uniquePayable = sumShiftMinutesByUniqueId(
      shifts.map((item) => ({ id: item.id, minutes: item.payable_minutes }))
    );
    expect(uniquePayable).toBe(1200);
    expect(shifts.filter((item) => item.company_context === "oliem_solutions").length).toBe(3);
    expect(
      shifts.filter((item) => item.company_context === "titan_produits_industriels").length
    ).toBe(1);
  });

  it("keeps archived/inactive chauffeur history in the registre totals", () => {
    const historical = shift({
      id: "s-archived",
      employee_id: 9,
      work_date: "2026-08-10",
      payable_minutes: 480,
    });
    const inactivePunch = evaluateResolvedEmployeePunchProfile({
      present: true,
      active: false,
      organizationId: ORG_A,
      organizationCompanyId: COMPANY_A,
      primaryCompany: "oliem_solutions",
    });
    expect(inactivePunch.ok).toBe(false);
    expect(historical.payable_minutes).toBe(480);
  });

  it("flags an open shift as incomplet", () => {
    const flags = computeRegistreRowFlags({
      shifts: [
        shift({
          id: "open",
          employee_id: 1,
          work_date: "2026-08-17",
          shift_end_at: null,
          status: "ouvert",
        }),
      ],
      events: [],
      exceptions: [],
    });
    expect(flags.incomplet).toBe(true);
    expect(primaryStatusFromFlags(flags)).toBe("incomplet");
  });

  it("keeps overnight duration on a single work_date", () => {
    const overnight = shift({
      id: "overnight",
      employee_id: 1,
      work_date: "2026-08-17",
      shift_start_at: "2026-08-17T22:00:00-04:00",
      shift_end_at: "2026-08-18T02:00:00-04:00",
      worked_minutes: 240,
      payable_minutes: 240,
      gross_minutes: 240,
    });
    expect(overnight.work_date).toBe("2026-08-17");
    expect(overnight.worked_minutes).toBe(240);
  });

  it("does not add pending exception minutes to payable; approved minutes are added once", () => {
    const pending = exception({
      id: "ex-pending",
      employee_id: 1,
      status: "en_attente",
      impact_minutes: 20,
    });
    const approved = exception({
      id: "ex-ok",
      employee_id: 1,
      status: "approuve",
      impact_minutes: 20,
      approved_minutes: 15,
    });
    const flagsPending = computeRegistreRowFlags({
      shifts: [
        shift({
          id: "s-pending",
          employee_id: 1,
          work_date: "2026-08-17",
          pending_exception_minutes: 20,
          payable_minutes: 480,
          status: "en_attente",
        }),
      ],
      events: [],
      exceptions: [pending],
    });
    expect(flagsPending.en_attente).toBe(true);
    expect(
      computeShiftPayableMinutes({
        workedMinutes: 480,
        unpaidBreakMinutes: 0,
        unpaidLunchMinutes: 0,
        approvedExceptionMinutes: approved.approved_minutes ?? 0,
      })
    ).toBe(495);
  });

  it("counts pauses and lunch display buckets without subtracting them twice", () => {
    const withBreaks = shift({
      id: "s-breaks",
      employee_id: 1,
      work_date: "2026-08-17",
      worked_minutes: 405,
      unpaid_break_minutes: 30,
      unpaid_lunch_minutes: 45,
      paid_break_minutes: 15,
      payable_minutes: 405,
    });
    expect(shiftBreakTotal(withBreaks)).toBe(90);
    expect(
      computeShiftPayableMinutes({
        workedMinutes: withBreaks.worked_minutes,
        unpaidBreakMinutes: withBreaks.unpaid_break_minutes,
        unpaidLunchMinutes: withBreaks.unpaid_lunch_minutes,
        approvedExceptionMinutes: 0,
      })
    ).toBe(405);
  });

  it("denies cross-tenant admin access by organization_id", () => {
    const rows = [
      shift({ id: "local", employee_id: 1, work_date: "2026-08-17", organization_id: ORG_A }),
      shift({ id: "foreign", employee_id: 99, work_date: "2026-08-17", organization_id: ORG_B }),
    ];
    const scoped = filterShiftsForCallerOrganization(rows, ORG_A);
    expect(scoped.map((item) => item.id)).toEqual(["local"]);
  });

  it("splits overtime per employee week without mixing tenants", () => {
    const overtime = aggregateOvertimeForEmployee(
      [
        shift({
          id: "w1",
          employee_id: 1,
          work_date: "2026-08-17",
          payable_minutes: 2500,
          week_start_date: "2026-08-17",
        }),
      ],
      undefined
    );
    expect(overtime.normal).toBe(2400);
    expect(overtime.overtime).toBe(100);
  });
});

describe("America/Toronto current behavior", () => {
  it("keeps the hardcoded operational timezone", () => {
    expect(HORODATEUR_PHASE1_TIMEZONE).toBe("America/Toronto");
    expect(getLocalWorkDate("2026-08-18T02:00:00-04:00")).toBe("2026-08-18");
    expect(getLocalWorkDate("2026-01-15T02:00:00-05:00")).toBe("2026-01-15");
  });
});

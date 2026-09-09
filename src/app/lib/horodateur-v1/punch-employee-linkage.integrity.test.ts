import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateResolvedEmployeePunchProfile,
  selectUniqueActiveEmployeeForPunch,
} from "@/app/lib/horodateur-v1/employee-punch-eligibility.shared";
import {
  countRegistreExceptionSignals,
  primaryStatusFromFlags,
  toRegistreExceptionFromPendingEvent,
  unionRegistreScopeEmployeeIds,
} from "@/app/lib/horodateur-v1/registre-aggregations.shared";
import { resolveOperationalWorkDate } from "@/app/lib/horodateur-v1/operational-state.shared";
import {
  classifyEventPhase1,
  diffMinutes,
  getLocalWorkDate,
  isContinuableOpenShift,
} from "@/app/lib/horodateur-v1/rules";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
} from "@/app/lib/horodateur-v1/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function profile(
  partial: Partial<HorodateurPhase1EmployeeProfile> &
    Pick<HorodateurPhase1EmployeeProfile, "employeeId">
): HorodateurPhase1EmployeeProfile {
  return {
    organizationId: ORG_A,
    organizationCompanyId: "company-a",
    authUserId: "auth-pilot",
    fullName: "Pilot Employee",
    email: null,
    phoneNumber: null,
    active: true,
    scheduleActive: true,
    primaryCompany: "oliem_solutions",
    scheduleStart: "07:00:00",
    scheduleEnd: "15:30:00",
    scheduledWorkDays: ["lundi", "mardi", "mercredi", "jeudi", "vendredi"],
    plannedWeeklyHours: 40,
    pauseMinutes: 15,
    lunchMinutes: 30,
    pausePaid: true,
    lunchPaid: false,
    expectedBreaksCount: 1,
    toleranceBeforeStartMinutes: 0,
    toleranceAfterEndMinutes: 0,
    maxShiftMinutes: 720,
    smsAlertQuartDebut: true,
    smsAlertQuartFin: true,
    smsAlertPauseDebut: true,
    smsAlertPauseFin: true,
    smsAlertDinnerDebut: true,
    smsAlertDinnerFin: true,
    smsAlertDepartTerrain: true,
    smsAlertArriveeTerrain: true,
    smsAlertSortie: true,
    smsAlertRetour: true,
    alertEmailEnabled: true,
    alertSmsEnabled: true,
    isDirectionAlertRecipient: false,
    weeklyScheduleConfig: null,
    canWorkForOliemSolutions: true,
    canWorkForTitanProduitsIndustriels: false,
    ...partial,
  };
}

function event(
  partial: Partial<HorodateurPhase1EventRecord> &
    Pick<HorodateurPhase1EventRecord, "id" | "event_type"> & {
      occurred_at: string;
    }
): HorodateurPhase1EventRecord {
  const occurredAt = partial.occurred_at;
  return {
    employee_id: 10,
    status: "normal",
    work_date: partial.work_date ?? getLocalWorkDate(occurredAt),
    week_start_date: "2026-09-07",
    event_time: occurredAt,
    created_at: occurredAt,
    company_context: "oliem_solutions",
    notes: null,
    note: null,
    source_kind: "employe",
    actor_role: "employe",
    actor_user_id: "auth-pilot",
    requires_approval: false,
    related_event_id: null,
    is_manual_correction: false,
    exception_code: null,
    approval_note: null,
    organization_id: ORG_A,
    organization_company_id: "company-a",
    ...partial,
  } as HorodateurPhase1EventRecord;
}

describe("punch employee linkage integrity", () => {
  it("refuses punch when no active unique employee is linked", () => {
    const none = selectUniqueActiveEmployeeForPunch([]);
    expect(none.ok).toBe(false);
    if (!none.ok) {
      expect(none.code).toBe("employee_not_found_for_auth_user");
    }
    const inactive = selectUniqueActiveEmployeeForPunch([
      profile({ employeeId: 10, active: false }),
    ]);
    expect(inactive.ok).toBe(false);
    if (!inactive.ok) {
      expect(inactive.code).toBe("employee_inactive");
    }
    const missingKeys = evaluateResolvedEmployeePunchProfile({
      present: true,
      active: true,
      organizationId: null,
      organizationCompanyId: null,
      primaryCompany: "oliem_solutions",
    });
    expect(missingKeys.ok).toBe(false);
    if (!missingKeys.ok) {
      expect(missingKeys.code).toBe("employee_missing_tenant_keys");
    }
  });

  it("accepts exactly one active employee in the caller tenant", () => {
    const selected = selectUniqueActiveEmployeeForPunch(
      [
        profile({ employeeId: 10, organizationId: ORG_A }),
        profile({ employeeId: 99, organizationId: ORG_B, active: true }),
      ],
      { organizationId: ORG_A }
    );
    expect(selected.ok).toBe(true);
    if (selected.ok) {
      expect(selected.employee.employeeId).toBe(10);
    }
  });

  it("fails closed on identity ambiguity and does not pick a name", () => {
    const selected = selectUniqueActiveEmployeeForPunch(
      [
        profile({ employeeId: 10, fullName: "Yves Laroche" }),
        profile({ employeeId: 11, fullName: "Richard" }),
      ],
      { organizationId: ORG_A }
    );
    expect(selected.ok).toBe(false);
    if (!selected.ok) {
      expect(selected.code).toBe("employee_ambiguous_for_auth_user");
    }
  });

  it("keeps tenant isolation: the other organization is not a punch target", () => {
    const selected = selectUniqueActiveEmployeeForPunch(
      [profile({ employeeId: 10, organizationId: ORG_B })],
      { organizationId: ORG_A }
    );
    expect(selected.ok).toBe(false);
    if (!selected.ok) {
      expect(selected.code).toBe("employee_not_found_for_auth_user");
    }
  });

  it("does not continue a stale open shift onto a later Montréal date", () => {
    expect(
      isContinuableOpenShift({
        openWorkDate: "2026-06-04",
        calendarWorkDate: "2026-09-09",
        openShiftStartAt: "2026-06-04T11:00:00.000Z",
        occurredAt: "2026-09-09T13:01:15.919Z",
      })
    ).toBe(false);
    expect(
      resolveOperationalWorkDate({
        eventType: "punch_out",
        occurredAt: "2026-09-09T13:01:15.919Z",
        approvedEvents: [
          event({
            id: "june-in",
            event_type: "quart_debut",
            occurred_at: "2026-06-04T11:00:00.000Z",
            work_date: "2026-06-04",
            status: "approuve",
          }),
        ],
      })
    ).toBe("2026-09-09");
  });

  it("still continues an overnight punch_out on the open shift date", () => {
    const punchInAt = "2026-09-08T22:00:00-04:00";
    const punchOutAt = "2026-09-09T02:00:00-04:00";
    expect(
      resolveOperationalWorkDate({
        eventType: "quart_fin",
        occurredAt: punchOutAt,
        approvedEvents: [
          event({
            id: "overnight-in",
            event_type: "quart_debut",
            occurred_at: punchInAt,
            work_date: getLocalWorkDate(punchInAt),
            status: "normal",
          }),
        ],
      })
    ).toBe(getLocalWorkDate(punchInAt));
  });

  it("treats a stale open shift as hors_quart so a new punch_in is a fresh day", () => {
    const classification = classifyEventPhase1({
      employee: profile({ employeeId: 10 }),
      currentState: {
        employee_id: 10,
        current_state: "en_quart",
        last_event_type: "quart_debut",
        last_event_at: "2026-06-04T11:00:00.000Z",
        has_open_exception: false,
        company_context: "oliem_solutions",
      },
      latestApprovedEvents: [
        event({
          id: "june-in",
          event_type: "quart_debut",
          occurred_at: "2026-06-04T11:00:00.000Z",
          work_date: "2026-06-04",
          status: "approuve",
        }),
      ],
      allApprovedEvents: [
        event({
          id: "june-in",
          event_type: "quart_debut",
          occurred_at: "2026-06-04T11:00:00.000Z",
          work_date: "2026-06-04",
          status: "approuve",
        }),
      ],
      eventType: "quart_debut",
      occurredAt: "2026-09-08T12:00:00-04:00",
      actorRole: "employe",
    });
    expect(classification.status).toBe("normal");
    expect(classification.requiresApproval).toBe(false);
  });

  it("attributes a same-day closed punch pair to the calendar date, not a stale open shift", () => {
    const punchInAt = "2026-09-09T08:00:00-04:00";
    const punchOutAt = "2026-09-09T16:00:00-04:00";
    const staleOpen = [
      event({
        id: "june-in",
        event_type: "quart_debut",
        occurred_at: "2026-06-04T11:00:00.000Z",
        work_date: "2026-06-04",
        status: "approuve",
      }),
    ];
    expect(
      resolveOperationalWorkDate({
        eventType: "punch_in",
        occurredAt: punchInAt,
        approvedEvents: staleOpen,
      })
    ).toBe("2026-09-09");
    expect(
      resolveOperationalWorkDate({
        eventType: "punch_out",
        occurredAt: punchOutAt,
        approvedEvents: staleOpen,
      })
    ).toBe("2026-09-09");
    expect(diffMinutes(punchInAt, punchOutAt)).toBe(480);
  });

  it("counts a pending punch event as a Direction-visible exception signal", () => {
    const pending = event({
      id: "pending-in",
      event_type: "quart_debut",
      occurred_at: "2026-09-08T12:00:00-04:00",
      work_date: "2026-09-08",
      status: "en_attente",
      exception_code: "invalid_sequence",
    });
    expect(
      countRegistreExceptionSignals({
        events: [pending],
        exceptions: [],
      })
    ).toBe(1);
    expect(
      toRegistreExceptionFromPendingEvent(pending).reasonLabel
    ).toBe("Pointage quart_debut en attente");
    expect(
      unionRegistreScopeEmployeeIds({
        shiftEmployeeIds: [],
        eventEmployeeIds: [10],
        exceptionEmployeeIds: [],
      })
    ).toEqual([10]);
    expect(
      primaryStatusFromFlags({
        complet: false,
        incomplet: true,
        en_attente: true,
        corrige: false,
        exception: true,
      })
    ).toBe("en_attente");
  });

  it("does not double-count a pending event that already has an exception row", () => {
    const pending = event({
      id: "pending-in",
      event_type: "quart_debut",
      occurred_at: "2026-09-08T12:00:00-04:00",
      status: "en_attente",
    });
    const exception = {
      id: "ex-1",
      employee_id: 10,
      source_event_id: "pending-in",
      status: "en_attente",
      exception_type: "invalid_sequence",
      reason_label: "Sequence",
      requested_at: "2026-09-08T16:00:00.000Z",
    } as HorodateurPhase1ExceptionRecord;
    expect(
      countRegistreExceptionSignals({
        events: [pending],
        exceptions: [exception],
      })
    ).toBe(1);
  });

  it("keeps Direction registre/live/exceptions wired to pending punches without mutating history", () => {
    const service = read("src/app/lib/horodateur-v1/registre-service.server.ts");
    const live = read("src/app/lib/horodateur-v1/service.ts");
    const shared = read("src/app/api/horodateur/_shared.ts");
    expect(service).toContain("listPendingExceptions");
    expect(service).toContain("countRegistreExceptionSignals");
    expect(service).toContain("getLocalWorkDate(ex.requested_at)");
    expect(service).toContain("toRegistreExceptionFromPendingEvent");
    expect(service).toContain("pendingEventExceptions");
    expect(live).toContain("isContinuableOpenShift");
    expect(live).toContain("staleOpenShift");
    expect(live).toContain("organizationId: options.organizationId");
    expect(shared).toContain("getEmployeeByAuthUserId(user.id");
    expect(shared).not.toContain("supabase.auth.getSession");
    const punchRoute = read("src/app/api/horodateur/punch/route.ts");
    expect(punchRoute).toContain("preSnapshot.employee.employeeId");
    expect(punchRoute).not.toContain(".maybeSingle()");
    expect(punchRoute).toContain("organizationId,");
  });
});

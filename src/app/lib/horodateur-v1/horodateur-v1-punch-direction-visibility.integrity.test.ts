import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  directionPresenceStatusLabel,
  isCurrentlyWorkingState,
  mapDirectionPresenceStatus,
  mapEmployeePunchStatus,
} from "@/app/lib/employee-punch-status.shared";
import {
  buildHorodateurAlertDedupeKey,
  isUrgentHorodateurIncident,
  shouldGrandfatherHistoricalAlert,
  shouldSendHorodateurChannel,
} from "@/app/lib/horodateur-v1/horodateur-alert-dedup.shared";
import {
  employeePunchSuccessMessage,
  isDuplicatePunchWithinWindow,
  isPunchConfirmedByServerReread,
} from "@/app/lib/horodateur-v1/punch-confirmation.shared";
import {
  hasCalendarDayOpenPunch,
  resolveOperationalWorkDate,
} from "@/app/lib/horodateur-v1/operational-state.shared";
import { getLocalWorkDate } from "@/app/lib/horodateur-v1/rules";
import type { HorodateurPhase1EventRecord } from "@/app/lib/horodateur-v1/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function event(
  partial: Partial<HorodateurPhase1EventRecord> &
    Pick<HorodateurPhase1EventRecord, "id" | "event_type"> & {
      occurred_at: string;
    }
): HorodateurPhase1EventRecord {
  return {
    employee_id: 10,
    status: "normal",
    work_date: partial.work_date ?? getLocalWorkDate(partial.occurred_at),
    week_start_date: "2026-09-21",
    event_time: partial.occurred_at,
    created_at: partial.occurred_at,
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
    organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_company_id: "company-a",
    ...partial,
  } as HorodateurPhase1EventRecord;
}

describe("HORORA punch visibility + alert dedup", () => {
  it("confirms a punch only after the server reread sees the same event id", () => {
    expect(
      isPunchConfirmedByServerReread({
        insertedEventId: "evt-24",
        lastEventId: "evt-24",
      })
    ).toBe(true);
    expect(
      isPunchConfirmedByServerReread({
        insertedEventId: "evt-24",
        lastEventId: "evt-june",
      })
    ).toBe(false);
    expect(
      employeePunchSuccessMessage({
        confirmed: false,
      })
    ).toBeNull();
    expect(
      employeePunchSuccessMessage({
        confirmed: true,
      })
    ).toBe("Pointage enregistré.");
  });

  it("treats a double click inside 90 seconds as the same punch", () => {
    expect(
      isDuplicatePunchWithinWindow({
        existingOccurredAt: "2026-09-24T12:00:00.000Z",
        candidateOccurredAt: "2026-09-24T12:00:20.000Z",
      })
    ).toBe(true);
    expect(
      isDuplicatePunchWithinWindow({
        existingOccurredAt: "2026-09-24T12:00:00.000Z",
        candidateOccurredAt: "2026-09-24T12:10:00.000Z",
      })
    ).toBe(false);
  });

  it("keeps employee and Direction labels aligned for an open shift", () => {
    expect(mapEmployeePunchStatus("en_quart")).toBe("en_service");
    expect(mapDirectionPresenceStatus("en_quart")).toBe("en_service");
    expect(directionPresenceStatusLabel("en_service")).toBe("En service");
    expect(isCurrentlyWorkingState("en_quart")).toBe(true);
    expect(isCurrentlyWorkingState("hors_quart")).toBe(false);
  });

  it("does not attach a 24 September punch to the June 4 historical shift", () => {
    const june = event({
      id: "june-in",
      event_type: "quart_debut",
      occurred_at: "2026-06-04T11:00:00.000Z",
      work_date: "2026-06-04",
      status: "approuve",
    });
    const todayInAt = "2026-09-24T12:05:00.000Z";
    const todayIn = event({
      id: "sep-24-in",
      event_type: "quart_debut",
      occurred_at: todayInAt,
      work_date: "2026-09-24",
    });
    expect(
      resolveOperationalWorkDate({
        eventType: "punch_in",
        occurredAt: todayInAt,
        approvedEvents: [june],
      })
    ).toBe("2026-09-24");
    expect(
      hasCalendarDayOpenPunch({
        approvedEvents: [june, todayIn],
        calendarWorkDate: "2026-09-24",
      })
    ).toBe(true);
    expect(
      hasCalendarDayOpenPunch({
        approvedEvents: [june],
        calendarWorkDate: "2026-09-24",
      })
    ).toBe(false);
  });

  it("dedupes alerts by organization, employee, shift date, incident and channel", () => {
    const key = buildHorodateurAlertDedupeKey({
      organizationId: "org-a",
      employeeId: 10,
      workDate: "2026-09-24",
      incidentType: "absence_or_late",
      channel: "email",
    });
    expect(key).toBe("horodateur_alert:org-a:10:2026-09-24:absence_or_late:email");
    expect(
      buildHorodateurAlertDedupeKey({
        organizationId: "org-b",
        employeeId: 10,
        workDate: "2026-09-24",
        incidentType: "absence_or_late",
        channel: "email",
      })
    ).not.toBe(key);
  });

  it("does not resend an already notified incident and never SMS a reminder", () => {
    expect(
      shouldSendHorodateurChannel({
        channel: "email",
        urgent: false,
        alreadySent: true,
        recipientCountToday: 0,
      })
    ).toBe(false);
    expect(
      shouldSendHorodateurChannel({
        channel: "sms",
        urgent: false,
        alreadySent: false,
        recipientCountToday: 0,
      })
    ).toBe(false);
    expect(
      isUrgentHorodateurIncident({
        incidentType: "exception_reminder",
      })
    ).toBe(false);
  });

  it("grandfathers historical exceptions so they do not emit again", () => {
    expect(
      shouldGrandfatherHistoricalAlert({
        incidentWorkDate: "2026-06-04",
        todayWorkDate: "2026-09-24",
      })
    ).toBe(true);
    expect(
      shouldGrandfatherHistoricalAlert({
        incidentWorkDate: "2026-09-24",
        todayWorkDate: "2026-09-24",
      })
    ).toBe(false);
  });

  it("keeps Direction live, registre, punch confirm and Nexus wiring", () => {
    const live = read("src/app/direction/horodateur/DirectionHorodateurClient.tsx");
    const liveRoute = read("src/app/api/direction/horodateur/live/route.ts");
    const exceptionsRoute = read("src/app/api/direction/horodateur/exceptions/route.ts");
    const punchRoute = read("src/app/api/horodateur/punch/route.ts");
    const service = read("src/app/lib/horodateur-v1/service.ts");
    const hook = read("src/app/hooks/useEmployeePunchSnapshot.ts");
    const registre = read(
      "src/app/direction/horodateur/registre/DirectionHorodateurRegistreClient.tsx"
    );
    expect(live).toContain("Employés actuellement au travail");
    expect(live).toContain("Recherche employé");
    expect(live).toContain("fetchHororaNexusSession");
    expect(live).not.toContain("supabase.auth.getSession");
    expect(liveRoute).toContain("lastSyncedAt");
    expect(exceptionsRoute).not.toContain("processPendingExceptionReminders");
    expect(service).not.toContain(
      "await processPendingExceptionReminders();\n  const exceptions = await listPendingExceptionsForDirection();"
    );
    expect(punchRoute).toContain("isPunchConfirmedByServerReread");
    expect(service).toContain("isDuplicatePunchWithinWindow");
    expect(service).toContain("hasCalendarDayOpenPunch");
    expect(service).toContain("normal_punch_not_urgent");
    expect(service).toContain("notifyHorodateurLatenessDigest");
    expect(hook).toContain("if (submitLockRef.current)");
    expect(hook).toContain("payload?.confirmed === true");
    expect(registre).toContain("employeeSearch");
    expect(registre).toContain("hororaNexusSessionRequestInit");
  });
});

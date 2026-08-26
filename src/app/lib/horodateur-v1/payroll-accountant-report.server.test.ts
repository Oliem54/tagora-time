import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc, from }),
}));

import {
  issueAuthorizedPayrollAccountantReport,
  loadAuthorizedPayrollAccountantReport,
  saveAuthorizedPayrollAccountantDraft,
} from "./payroll-accountant-report.server";
import {
  PAYROLL_ACCOUNTANT_PERSIST_RPC,
  bindPayrollAccountantPersistSourceHash,
} from "./payroll-accountant-report.shared";
import { buildPayrollAccountantSnapshot } from "./payroll-accountant-snapshot.shared";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1ShiftRecord,
} from "./types";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_COMPANY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CYCLE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const TENANT = {
  organizationId: ORG,
  organizationCompanyId: COMPANY,
  cycleId: CYCLE,
};

function profile(): HorodateurPhase1EmployeeProfile {
  return {
    employeeId: 7,
    organizationId: ORG,
    organizationCompanyId: COMPANY,
    authUserId: null,
    fullName: "Yves Test",
    email: null,
    phoneNumber: null,
    active: true,
    scheduleActive: true,
    primaryCompany: "oliem_solutions",
    scheduleStart: "08:00",
    scheduleEnd: "17:00",
    scheduledWorkDays: null,
    plannedWeeklyHours: 40,
    pausePaid: false,
    pauseMinutes: 15,
    lunchPaid: false,
    lunchMinutes: 30,
    expectedBreaksCount: null,
    toleranceBeforeStartMinutes: 0,
    toleranceAfterEndMinutes: 0,
    maxShiftMinutes: 720,
    smsAlertQuartDebut: false,
    smsAlertQuartFin: false,
    smsAlertPauseDebut: false,
    smsAlertPauseFin: false,
    smsAlertDinnerDebut: false,
    smsAlertDinnerFin: false,
    smsAlertDepartTerrain: false,
    smsAlertArriveeTerrain: false,
    smsAlertSortie: false,
    smsAlertRetour: false,
    alertEmailEnabled: false,
    alertSmsEnabled: false,
    isDirectionAlertRecipient: false,
    weeklyScheduleConfig: null,
    canWorkForOliemSolutions: true,
    canWorkForTitanProduitsIndustriels: false,
  };
}

function shift(
  partial?: Partial<HorodateurPhase1ShiftRecord>
): HorodateurPhase1ShiftRecord {
  return {
    id: "s1",
    employee_id: 7,
    organization_id: ORG,
    organization_company_id: COMPANY,
    week_start_date: "",
    company_context: "oliem_solutions",
    work_date: "2026-08-10",
    shift_start_at: "2026-08-10T12:00:00.000Z",
    shift_end_at: "2026-08-10T20:00:00.000Z",
    gross_minutes: 480,
    paid_break_minutes: 0,
    unpaid_break_minutes: 15,
    unpaid_lunch_minutes: 30,
    worked_minutes: 480,
    payable_minutes: 480,
    anomalies_count: 0,
    status: "valide",
    last_recomputed_at: "2026-08-10T20:01:00.000Z",
    ...partial,
  };
}

function makeUser(appPermissions: string[]): User {
  return {
    id: "user-payroll-persist",
    app_metadata: { role: "direction", permissions: appPermissions },
    user_metadata: { permissions: ["horodateur_payroll_manage"] },
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

function cycleQuery(found: boolean) {
  const filters: Array<[string, string]> = [];
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: string) => {
      filters.push([column, value]);
      return query;
    }),
    order: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (!found) {
        return { data: null, error: null };
      }
      return {
        data: {
          id: CYCLE,
          organization_id: ORG,
          organization_company_id: COMPANY,
          period_start: "2026-08-10",
          period_end: "2026-08-23",
          timezone: "America/Toronto",
        },
        error: null,
      };
    }),
  };
  return { query, filters };
}

describe("payroll accountant persist server repository", () => {
  const snapshot = bindPayrollAccountantPersistSourceHash(
    buildPayrollAccountantSnapshot({
      tenant: {
        ...TENANT,
        timezone: "America/Toronto",
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        cycleKind: "recurring",
      },
      profiles: [profile()],
      shifts: [shift()],
      events: [],
      exceptions: [],
    })
  );

  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it("ignores user_metadata and rejects a mismatched browser company", async () => {
    const denied = await saveAuthorizedPayrollAccountantDraft({
      user: makeUser(["horodateur_payroll_read"]),
      membership: { role: "direction", status: "active" },
      tenant: TENANT,
      untrustedBrowserOrganizationCompanyId: OTHER_COMPANY,
      snapshot,
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect("access" in denied && denied.access.reason).toBe(
      "browser_company_rejected"
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires payroll manage to issue and calls the service-role RPC", async () => {
    const readOnly = await issueAuthorizedPayrollAccountantReport({
      user: makeUser(["horodateur_payroll_read"]),
      membership: { role: "direction", status: "active" },
      tenant: TENANT,
      snapshot,
    });
    expect(readOnly.ok).toBe(false);

    const { query, filters } = cycleQuery(true);
    from.mockReturnValue(query);
    rpc.mockResolvedValue({
      data: {
        report_id: "report-issued",
        revision: 1,
        status: "issued",
        source_hash: snapshot.sourceHash,
        completeness_status: "complete",
        idempotent: false,
        audit_id: "audit-1",
      },
      error: null,
    });

    const issued = await issueAuthorizedPayrollAccountantReport({
      user: makeUser(["horodateur_payroll_manage"]),
      membership: { role: "direction", status: "active" },
      tenant: TENANT,
      snapshot,
    });
    expect(issued.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      PAYROLL_ACCOUNTANT_PERSIST_RPC,
      expect.objectContaining({
        p_operation: "issue",
        p_organization_id: ORG,
        p_organization_company_id: COMPANY,
        p_cycle_id: CYCLE,
        p_source_hash: snapshot.sourceHash,
        p_payload: snapshot.payload,
        p_actor_kind: "user",
      })
    );
    expect(filters).toEqual(
      expect.arrayContaining([
        ["organization_id", ORG],
        ["organization_company_id", COMPANY],
        ["id", CYCLE],
      ])
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(
      /salary|hourlyRate|SUPABASE_SERVICE_ROLE_KEY/i
    );
  });

  it("refuses persist when the payload no longer matches the bound source_hash", async () => {
    const tampered = {
      ...snapshot,
      payload: {
        ...snapshot.payload,
        forceEmitReason: "browser-tamper",
      },
    };
    const denied = await issueAuthorizedPayrollAccountantReport({
      user: makeUser(["horodateur_payroll_manage"]),
      membership: { role: "direction", status: "active" },
      tenant: TENANT,
      snapshot: tampered,
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect("reason" in denied && denied.reason).toBe("source_hash_mismatch");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses loading a report by id alone before querying", async () => {
    const loaded = await loadAuthorizedPayrollAccountantReport({
      user: makeUser(["horodateur_payroll_read"]),
      membership: { role: "direction", status: "active" },
      tenant: TENANT,
      reportId: null,
    });
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect("reason" in loaded && loaded.reason).toBe("tenant_required");
    expect(from).not.toHaveBeenCalled();
  });

  it("is server-only, uses the established admin client, and never emails or schedules", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/lib/horodateur-v1/payroll-accountant-report.server.ts"
      ),
      "utf8"
    );
    expect(source).toContain('import "server-only"');
    expect(source).toContain("createAdminSupabaseClient");
    expect(source).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("resend");
    expect(source).not.toContain("cron");
    expect(source).toContain("assertPayrollAccountantPersistSourceHash");
    expect(source).toContain("void input.user?.user_metadata");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildPayrollAccountantSnapshot } from "@/app/lib/horodateur-v1/payroll-accountant-snapshot.shared";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1ShiftRecord,
} from "@/app/lib/horodateur-v1/types";

vi.mock("server-only", () => ({}));

const {
  getAuthenticatedRequestUser,
  resolveActiveOrganizationMembershipForUserId,
  persistPayrollAccountantOperational,
  loadPayrollAccountantOperationalContext,
  resolvePayrollAccountantExportSnapshot,
} = vi.hoisted(() => ({
  getAuthenticatedRequestUser: vi.fn(),
  resolveActiveOrganizationMembershipForUserId: vi.fn(),
  persistPayrollAccountantOperational: vi.fn(),
  loadPayrollAccountantOperationalContext: vi.fn(),
  resolvePayrollAccountantExportSnapshot: vi.fn(),
}));

vi.mock("@/app/lib/account-requests.server", () => ({
  getAuthenticatedRequestUser,
}));

vi.mock("@/app/lib/saas/organization-membership.server", () => ({
  resolveActiveOrganizationMembershipForUserId,
}));

vi.mock("@/app/lib/horodateur-v1/payroll-accountant-operational.server", () => ({
  persistPayrollAccountantOperational,
  loadPayrollAccountantOperationalContext,
  resolvePayrollAccountantExportSnapshot,
}));

import { POST as postContext } from "./context/route";
import { POST as postDraft } from "./draft/route";
import { POST as postIssue } from "./issue/route";
import { POST as postCsv } from "./export/csv/route";
import { POST as postPdf } from "./export/pdf/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const CYCLE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function jsonRequest(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

function shift(): HorodateurPhase1ShiftRecord {
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
  };
}

function snapshot() {
  return buildPayrollAccountantSnapshot({
    tenant: {
      organizationId: ORG,
      organizationCompanyId: COMPANY,
      organizationName: "Org QA",
      organizationCompanyName: "Oliem Solutions",
      cycleId: CYCLE,
      timezone: "America/Toronto",
      periodStart: "2026-08-10",
      periodEnd: "2026-08-23",
      cycleKind: "recurring",
    },
    profiles: [profile()],
    shifts: [shift()],
    events: [
      {
        id: "e1",
        employee_id: 7,
        organization_id: ORG,
        organization_company_id: COMPANY,
        work_date: "2026-08-10",
        week_start_date: "2026-08-10",
        event_type: "correction",
        occurred_at: "2026-08-10T12:00:00.000Z",
        status: "approuve",
        is_manual_correction: true,
        notes: "=CMD()",
      },
    ],
    exceptions: [],
  });
}

const selection = {
  organizationId: OTHER_ORG,
  organizationCompanyId: COMPANY,
  periodStart: "2026-08-10",
  periodEnd: "2026-08-23",
  timezone: "America/Toronto",
  cycleId: CYCLE,
};

describe("payroll accountant operational API routes", () => {
  beforeEach(() => {
    getAuthenticatedRequestUser.mockReset();
    resolveActiveOrganizationMembershipForUserId.mockReset();
    persistPayrollAccountantOperational.mockReset();
    loadPayrollAccountantOperationalContext.mockReset();
    resolvePayrollAccountantExportSnapshot.mockReset();
    getAuthenticatedRequestUser.mockResolvedValue({
      user: {
        id: "user-direction",
        app_metadata: { permissions: ["horodateur_payroll_manage"] },
        user_metadata: { permissions: ["horodateur_payroll_manage"] },
      },
    });
    resolveActiveOrganizationMembershipForUserId.mockResolvedValue({
      ok: true,
      organizationId: ORG,
      membershipRole: "direction",
      membershipStatus: "active",
    });
  });

  it("refuses unauthenticated callers on draft, issue and export", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({ user: null });
    const draft = await postDraft(
      jsonRequest("/api/direction/horodateur/payroll/draft", selection)
    );
    const issue = await postIssue(
      jsonRequest("/api/direction/horodateur/payroll/issue", {
        ...selection,
        confirmIssue: true,
      })
    );
    const csv = await postCsv(
      jsonRequest("/api/direction/horodateur/payroll/export/csv", selection)
    );
    expect(draft.status).toBe(403);
    expect(issue.status).toBe(403);
    expect(csv.status).toBe(403);
    expect(persistPayrollAccountantOperational).not.toHaveBeenCalled();
    expect(resolvePayrollAccountantExportSnapshot).not.toHaveBeenCalled();
  });

  it("refuses callers without an active membership", async () => {
    resolveActiveOrganizationMembershipForUserId.mockResolvedValue({
      ok: false,
      reason: "membership_ambiguous",
    });
    const res = await postIssue(
      jsonRequest("/api/direction/horodateur/payroll/issue", {
        ...selection,
        confirmIssue: true,
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("membership_ambiguous");
  });

  it("requires confirmIssue=true before issuing", async () => {
    persistPayrollAccountantOperational.mockResolvedValue({
      ok: false,
      reason: "confirm_required",
    });
    const res = await postIssue(
      jsonRequest("/api/direction/horodateur/payroll/issue", selection)
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("confirm_required");
    expect(persistPayrollAccountantOperational).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "issue",
        confirmIssue: false,
        membershipOrganizationId: ORG,
      })
    );
  });

  it("maps blocked_incomplete and missing forced reason", async () => {
    persistPayrollAccountantOperational.mockResolvedValue({
      ok: false,
      reason: "blocked_incomplete",
    });
    const blocked = await postIssue(
      jsonRequest("/api/direction/horodateur/payroll/issue", {
        ...selection,
        confirmIssue: true,
      })
    );
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).code).toBe("blocked_incomplete");

    persistPayrollAccountantOperational.mockResolvedValue({
      ok: false,
      reason: "forced_reason_required",
    });
    const forced = await postIssue(
      jsonRequest("/api/direction/horodateur/payroll/issue", {
        ...selection,
        confirmIssue: true,
        forceEmitReason: "",
      })
    );
    expect(forced.status).toBe(400);
    expect((await forced.json()).code).toBe("forced_reason_required");
  });

  it("accepts a forced issue when a reason is supplied", async () => {
    persistPayrollAccountantOperational.mockResolvedValue({
      ok: true,
      result: {
        reportId: "issued-forced",
        revision: 1,
        status: "issued",
        sourceHash: "b".repeat(64),
        completenessStatus: "forced",
        idempotent: false,
        auditId: "audit-forced",
      },
    });
    const res = await postIssue(
      jsonRequest("/api/direction/horodateur/payroll/issue", {
        ...selection,
        confirmIssue: true,
        forceEmitReason: "Cloture comptable exceptionnelle",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.status).toBe("issued");
    expect(persistPayrollAccountantOperational).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmIssue: true,
        forceEmitReason: "Cloture comptable exceptionnelle",
        membershipOrganizationId: ORG,
      })
    );
  });

  it("saves a draft without treating the browser organization as authoritative", async () => {
    persistPayrollAccountantOperational.mockResolvedValue({
      ok: true,
      result: {
        reportId: "draft-1",
        revision: 1,
        status: "draft",
        sourceHash: "c".repeat(64),
        completenessStatus: "complete",
        idempotent: true,
        auditId: null,
      },
    });
    const res = await postDraft(
      jsonRequest("/api/direction/horodateur/payroll/draft", selection)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.idempotent).toBe(true);
    expect(persistPayrollAccountantOperational).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "save_draft",
        membershipOrganizationId: ORG,
        query: expect.objectContaining({
          untrustedBrowserOrganizationId: OTHER_ORG,
          organizationCompanyId: COMPANY,
        }),
      })
    );
  });

  it("refuses payroll manage when the operational layer denies access", async () => {
    persistPayrollAccountantOperational.mockResolvedValue({
      ok: false,
      access: {
        allowed: false,
        canRead: true,
        canManage: false,
        source: "denied",
        reason: "payroll_manage_permission_missing",
      },
    });
    const res = await postIssue(
      jsonRequest("/api/direction/horodateur/payroll/issue", {
        ...selection,
        confirmIssue: true,
      })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("payroll_manage_permission_missing");
  });

  it("exports a deterministic CSV with formula injection protection", async () => {
    const built = snapshot();
    resolvePayrollAccountantExportSnapshot.mockResolvedValue({
      ok: true,
      access: { allowed: true, canRead: true, canManage: true },
      snapshot: built,
      meta: { status: "preview", revision: null, issuedAt: null, reportId: null },
    });
    const res = await postCsv(
      jsonRequest("/api/direction/horodateur/payroll/export/csv", selection)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain(
      "horora-rapport-comptable-oliem-solutions-2026-08-10-2026-08-23.csv"
    );
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true);
    const csv = bytes.toString("utf8");
    expect(csv).toContain("'=CMD()");
    expect(csv).toContain("Yves Test");
    expect(csv).toContain("sous-total semaine");
    expect(csv).not.toContain(OTHER_ORG);
  });

  it("exports a non-empty PDF and refuses a cross-tenant export", async () => {
    const built = snapshot();
    resolvePayrollAccountantExportSnapshot.mockResolvedValue({
      ok: true,
      access: { allowed: true, canRead: true, canManage: true },
      snapshot: built,
      meta: {
        status: "issued",
        revision: 1,
        issuedAt: "2026-08-24T12:00:00.000Z",
        reportId: "issued-1",
      },
    });
    const pdfRes = await postPdf(
      jsonRequest("/api/direction/horodateur/payroll/export/pdf", selection)
    );
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("Content-Type")).toBe("application/pdf");
    const bytes = Buffer.from(await pdfRes.arrayBuffer());
    expect(bytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(bytes.byteLength).toBeGreaterThan(200);
    expect(bytes.toString("latin1")).toContain("HORORA");

    resolvePayrollAccountantExportSnapshot.mockResolvedValue({
      ok: false,
      reason: "browser_organization_rejected",
    });
    const denied = await postPdf(
      jsonRequest("/api/direction/horodateur/payroll/export/pdf", {
        ...selection,
        organizationId: OTHER_ORG,
      })
    );
    expect(denied.status).toBe(400);
    expect((await denied.json()).code).toBe("browser_organization_rejected");
  });

  it("loads context from membership organization only", async () => {
    loadPayrollAccountantOperationalContext.mockResolvedValue({
      ok: true,
      access: { canManage: true, canRead: true, allowed: true },
      organizationId: ORG,
      companies: [{ id: COMPANY, name: "Oliem Solutions", code: "oliem", isDefault: true }],
      selectedCompanyId: COMPANY,
      cycles: [],
      selectedCycleId: null,
      defaultPeriod: {
        periodStart: "2026-08-14",
        periodEnd: "2026-08-27",
        timezone: "America/Toronto",
      },
      latestIssued: null,
      latestDraft: null,
    });
    const res = await postContext(
      jsonRequest("/api/direction/horodateur/payroll/context", {
        organizationId: OTHER_ORG,
        organizationCompanyId: COMPANY,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organizationId).toBe(ORG);
    expect(body.defaultPeriod.periodStart).toBe("2026-08-14");
    expect(loadPayrollAccountantOperationalContext).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipOrganizationId: ORG,
        untrustedBrowserOrganizationId: OTHER_ORG,
      })
    );
  });

  it("does not accept a client snapshot on persist or export routes", () => {
    const files = [
      "src/app/api/direction/horodateur/payroll/draft/route.ts",
      "src/app/api/direction/horodateur/payroll/issue/route.ts",
      "src/app/api/direction/horodateur/payroll/export/csv/route.ts",
      "src/app/api/direction/horodateur/payroll/export/pdf/route.ts",
    ];
    for (const rel of files) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      expect(source).not.toContain("body.payload");
      expect(source).not.toContain("body.snapshot");
      expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });
});

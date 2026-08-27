import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const {
  getAuthenticatedRequestUser,
  resolveActiveOrganizationMembershipForUserId,
  previewPayrollAccountantReportSnapshot,
} = vi.hoisted(() => ({
  getAuthenticatedRequestUser: vi.fn(),
  resolveActiveOrganizationMembershipForUserId: vi.fn(),
  previewPayrollAccountantReportSnapshot: vi.fn(),
}));

vi.mock("@/app/lib/account-requests.server", () => ({
  getAuthenticatedRequestUser,
}));

vi.mock("@/app/lib/saas/organization-membership.server", () => ({
  resolveActiveOrganizationMembershipForUserId,
}));

vi.mock("@/app/lib/horodateur-v1/payroll-report-snapshot.server", () => ({
  previewPayrollAccountantReportSnapshot,
}));

import { POST } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const CYCLE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function jsonRequest(body: Record<string, unknown> | string) {
  return new NextRequest("http://localhost/api/direction/horodateur/payroll/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/direction/horodateur/payroll/preview", () => {
  beforeEach(() => {
    getAuthenticatedRequestUser.mockReset();
    resolveActiveOrganizationMembershipForUserId.mockReset();
    previewPayrollAccountantReportSnapshot.mockReset();
    getAuthenticatedRequestUser.mockResolvedValue({
      user: {
        id: "user-direction",
        app_metadata: { permissions: ["horodateur_payroll_read"] },
        user_metadata: { permissions: ["horodateur_payroll_manage"] },
      },
    });
    resolveActiveOrganizationMembershipForUserId.mockResolvedValue({
      ok: true,
      organizationId: ORG,
      membershipRole: "direction",
      membershipStatus: "active",
    });
    previewPayrollAccountantReportSnapshot.mockResolvedValue({
      ok: true,
      datesAdjustedFromCycle: false,
      access: { canRead: true, canManage: true, allowed: true, source: "app_metadata", reason: "direction_app_metadata" },
      snapshot: {
        sourceHash: "a".repeat(64),
        completenessStatus: "complete",
        canIssue: true,
        totals: { payableMinutes: 480, employeeCount: 1 },
        payload: { organizationId: ORG, cycleId: null },
      },
    });
  });

  it("returns a non-persisted preview using membership organization_id", async () => {
    const res = await POST(
      jsonRequest({
        organizationId: OTHER_ORG,
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
        cycleId: CYCLE,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.preview).toBe(true);
    expect(body.persisted).toBe(false);
    expect(previewPayrollAccountantReportSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipOrganizationId: ORG,
        query: expect.objectContaining({
          organizationId: ORG,
          organizationCompanyId: COMPANY,
          untrustedBrowserOrganizationId: OTHER_ORG,
          cycleId: CYCLE,
        }),
      })
    );
  });

  it("refuses an unauthenticated caller", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({ user: null });
    const res = await POST(jsonRequest({ organizationCompanyId: COMPANY }));
    expect(res.status).toBe(403);
    expect(previewPayrollAccountantReportSnapshot).not.toHaveBeenCalled();
  });

  it("refuses a caller without an active H4 membership", async () => {
    resolveActiveOrganizationMembershipForUserId.mockResolvedValue({
      ok: false,
      reason: "membership_absent",
    });
    const res = await POST(jsonRequest({ organizationCompanyId: COMPANY }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("organization_membership_required");
    expect(previewPayrollAccountantReportSnapshot).not.toHaveBeenCalled();
  });

  it("refuses a caller without payroll read", async () => {
    previewPayrollAccountantReportSnapshot.mockResolvedValue({
      ok: false,
      access: {
        allowed: false,
        canRead: false,
        canManage: false,
        source: "denied",
        reason: "payroll_permission_missing",
      },
    });
    const res = await POST(
      jsonRequest({
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("payroll_permission_missing");
  });

  it("returns validation errors from the snapshot service", async () => {
    previewPayrollAccountantReportSnapshot.mockResolvedValue({
      ok: false,
      reason: "period_order_invalid",
    });
    const res = await POST(
      jsonRequest({
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-23",
        periodEnd: "2026-08-10",
        timezone: "America/Toronto",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("period_order_invalid");
  });

  it("does not persist, email, or emit files", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/api/direction/horodateur/payroll/preview/route.ts"
      ),
      "utf8"
    );
    expect(source).not.toContain("PAYROLL_ACCOUNTANT_PERSIST_RPC");
    expect(source).not.toContain("horodateur_payroll_reports");
    expect(source).not.toContain("resend");
    expect(source).not.toContain("cron");
    expect(source).not.toContain(".pdf");
    expect(source).not.toContain("xlsx");
    expect(source).toContain('persisted: false');
  });
});

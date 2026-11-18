import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const {
  requireDirectionHorodateurAccess,
  getAuthenticatedRequestUser,
  resolveActiveOrganizationMembershipForUserId,
  readHororaExceptionEmployeeId,
  readHororaEmployeePerimeterFile,
  readHororaActorDepartmentKeys,
  approveHorodateurException,
  refuseHorodateurException,
  getWeeklyProjection,
  createStaffRetroCorrectionRequest,
  runExceptionBulkAction,
  listExceptionBulkCompanies,
  listExceptionBulkMutationEmployeeIds,
} = vi.hoisted(() => ({
  requireDirectionHorodateurAccess: vi.fn(),
  getAuthenticatedRequestUser: vi.fn(),
  resolveActiveOrganizationMembershipForUserId: vi.fn(),
  readHororaExceptionEmployeeId: vi.fn(),
  readHororaEmployeePerimeterFile: vi.fn(),
  readHororaActorDepartmentKeys: vi.fn(),
  approveHorodateurException: vi.fn(),
  refuseHorodateurException: vi.fn(),
  getWeeklyProjection: vi.fn(),
  createStaffRetroCorrectionRequest: vi.fn(),
  runExceptionBulkAction: vi.fn(),
  listExceptionBulkCompanies: vi.fn(),
  listExceptionBulkMutationEmployeeIds: vi.fn(),
}));

vi.mock("@/app/api/horodateur/_shared", () => ({
  requireDirectionHorodateurAccess,
  buildHorodateurErrorResponse: (error: unknown, options?: { route?: string }) =>
    NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "error",
        route: options?.route,
      },
      { status: 500 }
    ),
  buildHorodateurValidationErrorResponse: (input: {
    error: string;
    code: string;
    status?: number;
    route?: string;
  }) =>
    NextResponse.json(
      { ok: false, success: false, error: input.error, code: input.code, route: input.route },
      { status: input.status ?? 400 }
    ),
  normalizeEventForApi: (event: unknown) => event,
  normalizeNonEmptyString: (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null,
  normalizeDirectionCompanyContext: (value: unknown) =>
    value === "oliem_solutions" || value === "titan_produits_industriels" ? value : null,
  parseOptionalApprovedMinutes: () => ({ ok: true as const, value: null }),
  parseOptionalIsoDateTime: () => ({ ok: true as const, value: null }),
}));

vi.mock("@/app/lib/account-requests.server", () => ({
  getAuthenticatedRequestUser,
}));

vi.mock("@/app/lib/saas/organization-membership.server", () => ({
  resolveActiveOrganizationMembershipForUserId,
}));

vi.mock("@/app/lib/auth/horora-manager-perimeter.files.server", () => ({
  readHororaExceptionEmployeeId,
  readHororaEmployeePerimeterFile,
  readHororaActorDepartmentKeys,
}));

vi.mock("@/app/lib/horodateur-v1/service", () => ({
  approveHorodateurException,
  refuseHorodateurException,
  getWeeklyProjection,
  createStaffRetroCorrectionRequest,
}));

vi.mock("@/app/lib/horodateur-v1/horodateur-exception-bulk.server", () => ({
  runExceptionBulkAction,
  listExceptionBulkCompanies,
  listExceptionBulkMutationEmployeeIds,
}));

import { POST as approvePost } from "@/app/api/direction/horodateur/exceptions/[id]/approve/route";
import { POST as refusePost } from "@/app/api/direction/horodateur/exceptions/[id]/refuse/route";
import { POST as bulkPost } from "@/app/api/direction/horodateur/exceptions/bulk/route";
import { POST as correctionPost } from "@/app/api/direction/horodateur/retro-correction/route";

const approvalContext = { params: Promise.resolve({ id: "exc-1" }) };
const refuseContext = { params: Promise.resolve({ id: "exc-refuse" }) };

function approvalRequest() {
  return new NextRequest("http://localhost/api/direction/horodateur/exceptions/exc-1/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      role: "organization_owner",
      organizationId: "org-forged",
      departmentKey: "livreur",
      actorDepartmentKeys: ["livreur"],
      employeeId: 999,
    }),
  });
}

function correctionRequest() {
  return new NextRequest("http://localhost/api/direction/horodateur/retro-correction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      employeeId: 42,
      date: "2026-11-16",
      time: "08:30",
      eventType: "punch_in",
      reason: "Oubli de pointage",
      role: "organization_owner",
      organizationId: "org-forged",
      departmentKey: "livreur",
      actorDepartmentKeys: ["livreur"],
    }),
  });
}

function allowLegacyGate() {
  requireDirectionHorodateurAccess.mockResolvedValue({
    ok: true,
    user: { id: "user-1" },
    organizationId: "org-a",
    debug: { auth: { role: "direction" } },
  });
}

function session(organizationId: string | null = "org-a", userId: string | null = "user-1") {
  getAuthenticatedRequestUser.mockResolvedValue({
    user: userId ? { id: userId, email: "manager@example.test" } : null,
    role: "direction",
    organizationId,
    membershipRole: null,
    authSource: userId ? "cookie" : "none",
    authorizationSource: userId ? "membership" : null,
    sessionSource: userId ? "nexus_handoff" : null,
  });
}

function membership(role: string, organizationId = "org-a") {
  resolveActiveOrganizationMembershipForUserId.mockResolvedValue({
    ok: true,
    userId: "user-1",
    organizationId,
    membershipId: "m1",
    membershipRole: role,
    membershipStatus: "active",
    organizationStatus: "active",
    isDefault: true,
    appRole: role === "employe" ? "employe" : role === "direction" ? "direction" : "admin",
  });
}

function files(options?: {
  organizationId?: string | null;
  departmentKey?: string | null;
  actorDepartmentKeys?: string[];
  file?: null;
}) {
  readHororaExceptionEmployeeId.mockResolvedValue({ ok: true, employeeId: 42 });
  readHororaEmployeePerimeterFile.mockImplementation(async (employeeId: number) => ({
    ok: true,
    file:
      options && "file" in options && options.file === null
        ? null
        : {
            organizationId: options?.organizationId === undefined ? "org-a" : options.organizationId,
            departmentKey:
              employeeId === 43
                ? "atelier"
                : options?.departmentKey === undefined
                  ? "livreur"
                  : options.departmentKey,
          },
  }));
  readHororaActorDepartmentKeys.mockResolvedValue({
    ok: true,
    departmentKeys: options?.actorDepartmentKeys ?? ["livreur"],
  });
}

async function expectBothDenied(status: number, code: string) {
  const approval = await approvePost(approvalRequest(), approvalContext);
  const correction = await correctionPost(correctionRequest());
  expect(approval.status).toBe(status);
  expect(correction.status).toBe(status);
  expect(await approval.json()).toMatchObject({ ok: false, code });
  expect(await correction.json()).toMatchObject({ ok: false, code });
  expect(approveHorodateurException).not.toHaveBeenCalled();
  expect(createStaffRetroCorrectionRequest).not.toHaveBeenCalled();
  expect(refuseHorodateurException).not.toHaveBeenCalled();
  expect(runExceptionBulkAction).not.toHaveBeenCalled();
}

describe("HORORA manager perimeter HTTP guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowLegacyGate();
    session();
    membership("direction");
    files();
    approveHorodateurException.mockResolvedValue({
      exception: { employee_id: 42 },
      event: { id: "evt-1", employee_id: 42 },
    });
    refuseHorodateurException.mockResolvedValue({
      exception: { employee_id: 42 },
      event: { id: "evt-1", employee_id: 42 },
    });
    getWeeklyProjection.mockResolvedValue(null);
    createStaffRetroCorrectionRequest.mockResolvedValue({
      event: { id: "evt-1", employee_id: 42 },
      exception: { id: "ex-1" },
      shift: null,
      currentState: null,
    });
    listExceptionBulkMutationEmployeeIds.mockResolvedValue([42]);
    runExceptionBulkAction.mockResolvedValue({ ok: true, total: 1 });
  });

  it("allows direction approval and correction inside an assigned department", async () => {
    const approval = await approvePost(approvalRequest(), approvalContext);
    const correction = await correctionPost(correctionRequest());
    expect(approval.status).toBe(200);
    expect(correction.status).toBe(200);
    expect(approveHorodateurException).toHaveBeenCalledTimes(1);
    expect(createStaffRetroCorrectionRequest).toHaveBeenCalledTimes(1);
    expect(readHororaExceptionEmployeeId).toHaveBeenCalledWith("exc-1");
    expect(readHororaEmployeePerimeterFile).toHaveBeenCalledWith(42);
    expect(readHororaEmployeePerimeterFile).not.toHaveBeenCalledWith(999);
    expect(readHororaActorDepartmentKeys).toHaveBeenCalledWith({
      authUserId: "user-1",
      organizationId: "org-a",
    });
  });

  it("allows an organization owner inside the organization when the employee has a department", async () => {
    membership("organization_owner");
    files({ actorDepartmentKeys: [] });
    const approval = await approvePost(approvalRequest(), approvalContext);
    const correction = await correctionPost(correctionRequest());
    expect(approval.status).toBe(200);
    expect(correction.status).toBe(200);
    expect(approveHorodateurException).toHaveBeenCalledTimes(1);
    expect(createStaffRetroCorrectionRequest).toHaveBeenCalledTimes(1);
  });

  it("denies direction with no assigned department before any mutation", async () => {
    files({ actorDepartmentKeys: [] });
    await expectBothDenied(403, "manager_department_absent");
  });

  it("denies direction for an employee in another department", async () => {
    files({ actorDepartmentKeys: ["atelier"] });
    await expectBothDenied(403, "outside_perimeter");
  });

  it("denies direction when the target employee has no valid department", async () => {
    files({ departmentKey: "  " });
    await expectBothDenied(403, "target_department_absent");
  });

  it("denies an employee attempting administrative approval or correction", async () => {
    membership("employe");
    await expectBothDenied(403, "actor_forbidden");
  });

  it("denies an owner operating on another organization", async () => {
    membership("organization_owner", "org-a");
    files({ organizationId: "org-b", actorDepartmentKeys: [] });
    await expectBothDenied(403, "cross_organization_forbidden");
  });

  it("denies a direct HTTP call that bypasses the legacy gate without a session", async () => {
    session("org-a", null);
    await expectBothDenied(401, "unauthenticated");
    expect(readHororaEmployeePerimeterFile).not.toHaveBeenCalled();
  });

  it("ignores forged role, organization, and department fields in the request", async () => {
    files({ actorDepartmentKeys: ["atelier"], departmentKey: "livreur" });
    await expectBothDenied(403, "outside_perimeter");
    expect(readHororaActorDepartmentKeys).toHaveBeenCalledWith({
      authUserId: "user-1",
      organizationId: "org-a",
    });
    expect(resolveActiveOrganizationMembershipForUserId).toHaveBeenCalledWith("user-1");
  });

  it("does not mutate when the legacy gate already refuses the request", async () => {
    requireDirectionHorodateurAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 }),
    });
    const approval = await approvePost(approvalRequest(), approvalContext);
    const correction = await correctionPost(correctionRequest());
    expect(approval.status).toBe(403);
    expect(correction.status).toBe(403);
    expect(approveHorodateurException).not.toHaveBeenCalled();
    expect(createStaffRetroCorrectionRequest).not.toHaveBeenCalled();
    expect(readHororaEmployeePerimeterFile).not.toHaveBeenCalled();
  });

  it("refuses a time refusal outside the assigned department before refuseHorodateurException", async () => {
    files({ actorDepartmentKeys: [] });
    const response = await refusePost(
      new NextRequest("http://localhost/api/direction/horodateur/exceptions/exc-refuse/refuse", {
        method: "POST",
        body: JSON.stringify({
          reviewNote: "note",
          role: "organization_owner",
          departmentKey: "livreur",
        }),
      }),
      refuseContext
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "manager_department_absent" });
    expect(refuseHorodateurException).not.toHaveBeenCalled();
  });

  it("keeps an assigned-department refusal path", async () => {
    const response = await refusePost(
      new NextRequest("http://localhost/api/direction/horodateur/exceptions/exc-refuse/refuse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewNote: "Motif de refus" }),
      }),
      refuseContext
    );
    expect(response.status).toBe(200);
    expect(refuseHorodateurException).toHaveBeenCalledTimes(1);
  });

  it("denies a bulk approval that includes an employee outside the department", async () => {
    listExceptionBulkMutationEmployeeIds.mockResolvedValue([42, 43]);
    const response = await bulkPost(
      new NextRequest("http://localhost/api/direction/horodateur/exceptions/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          organizationCompanyId: "company-1",
          ids: ["exc-1", "exc-2"],
          role: "organization_owner",
          organizationId: "org-forged",
          departmentKey: "livreur",
          filters: { organizationId: "org-forged" },
        }),
      })
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "outside_perimeter" });
    expect(runExceptionBulkAction).not.toHaveBeenCalled();
    expect(listExceptionBulkMutationEmployeeIds).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-a",
        filter: expect.objectContaining({ organizationId: "org-a" }),
      })
    );
  });

  it("allows a bulk approval when every target stays inside the assigned department", async () => {
    const response = await bulkPost(
      new NextRequest("http://localhost/api/direction/horodateur/exceptions/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          organizationCompanyId: "company-1",
          ids: ["exc-1"],
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(runExceptionBulkAction).toHaveBeenCalledTimes(1);
  });

  it("calls the perimeter guard before the approval and correction mutations", () => {
    const approve = readFileSync(
      "src/app/api/direction/horodateur/exceptions/[id]/approve/route.ts",
      "utf8"
    );
    const refuse = readFileSync(
      "src/app/api/direction/horodateur/exceptions/[id]/refuse/route.ts",
      "utf8"
    );
    const correction = readFileSync(
      "src/app/api/direction/horodateur/retro-correction/route.ts",
      "utf8"
    );
    const bulk = readFileSync("src/app/api/direction/horodateur/exceptions/bulk/route.ts", "utf8");
    const quick = readFileSync(
      "src/app/api/direction/horodateur/exceptions/quick-action/route.ts",
      "utf8"
    );
    const handler = readFileSync("src/app/lib/app-action-handlers.server.ts", "utf8");
    expect(approve.indexOf("exceptionId: id")).toBeLessThan(
      approve.indexOf("await approveHorodateurException")
    );
    expect(refuse.indexOf("exceptionId: id")).toBeLessThan(
      refuse.indexOf("await refuseHorodateurException")
    );
    expect(correction.indexOf('action: "correct_time"')).toBeLessThan(
      correction.indexOf("await createStaffRetroCorrectionRequest")
    );
    expect(bulk.indexOf("enforceHororaManagerTimeHttpGuard")).toBeLessThan(
      bulk.indexOf("await runExceptionBulkAction")
    );
    expect(quick.indexOf("enforceHororaManagerTimeHttpGuard")).toBeLessThan(
      quick.indexOf("await approveHorodateurException")
    );
    expect(handler.indexOf("enforceHororaManagerTimeHttpGuard")).toBeLessThan(
      handler.indexOf("await approveHorodateurException")
    );
  });
});

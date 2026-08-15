import { beforeEach, describe, expect, it, vi } from "vitest";
import { HorodateurPhase1Error } from "@/app/lib/horodateur-v1/types";

vi.mock("server-only", () => ({}));

const {
  getEmployeeByIdForOrganization,
  getExceptionByIdForOrganization,
  getExceptionById,
  updateExceptionReview,
  getEventById,
} = vi.hoisted(() => ({
  getEmployeeByIdForOrganization: vi.fn(),
  getExceptionByIdForOrganization: vi.fn(),
  getExceptionById: vi.fn(),
  updateExceptionReview: vi.fn(),
  getEventById: vi.fn(),
}));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock("@/app/lib/app-alerts-dual-write.server", () => ({
  dualWriteHorodateurExceptionCreated: vi.fn(),
  findOpenAppAlertIdByDedupeKey: vi.fn(),
  getChauffeurCompanyKey: vi.fn(),
  logNotificationFailureAppAlert: vi.fn(),
  markHorodateurExceptionAppAlertHandled: vi.fn(),
  recordDeliveriesFromHorodateurDirectionNotify: vi.fn(),
}));

vi.mock("@/app/lib/notifications", () => ({
  notifyHorodateurLateness: vi.fn(),
  notifyDirectionOfHorodateurException: vi.fn(),
  notifyDirectionHorodateurPunchSms: vi.fn(),
  notifyEmployeeExpectedPunchSms: vi.fn(),
  notifyEmployeeHorodateurExceptionDecision: vi.fn(),
  notifyEmployeeHorodateurPunchSms: vi.fn(),
}));

vi.mock("@/app/lib/horodateur-v1/repository", () => ({
  getEmployeeByIdForOrganization,
  getExceptionByIdForOrganization,
  getExceptionById,
  getEmployeeById: vi.fn(),
  getEmployeeByAuthUserId: vi.fn(),
  getEventById,
  getCurrentStateByEmployeeId: vi.fn(),
  getShiftByEmployeeAndWorkDate: vi.fn(),
  listEventsForEmployee: vi.fn(),
  listPendingExceptions: vi.fn(),
  listExceptionsForShift: vi.fn(),
  listShiftsForEmployeeWeek: vi.fn(),
  listActiveEmployees: vi.fn(),
  insertEvent: vi.fn(),
  insertException: vi.fn(),
  updateEventOccurredAt: vi.fn(),
  updateEventReviewStatus: vi.fn(),
  updateExceptionReview,
  updateExceptionEscalationFields: vi.fn(),
  updateExceptionNotificationStatus: vi.fn(),
  upsertCurrentState: vi.fn(),
  upsertShift: vi.fn(),
  attachShiftToException: vi.fn(),
  countPendingExceptionsForEmployee: vi.fn(),
  getDirectionAlertConfig: vi.fn(),
  listDirectionAlertRecipients: vi.fn(),
  getLatenessNotification: vi.fn(),
  upsertLatenessNotification: vi.fn(),
  upsertDirectionAlertConfig: vi.fn(),
  hasExpectedPunchSmsNotificationLog: vi.fn(),
  insertHorodateurSmsAlertLog: vi.fn(),
  listApprovedScheduleRequestsForEmployee: vi.fn(),
  listExceptionsForEmployeeWorkDate: vi.fn(),
}));

describe("Phase4D Lot2 local security remediation — tenant scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("approveHorodateurException refuses exception of another tenant", async () => {
    getExceptionByIdForOrganization.mockResolvedValueOnce(null);

    const { approveHorodateurException } = await import(
      "@/app/lib/horodateur-v1/service"
    );

    await expect(
      approveHorodateurException({
        actorUserId: "actor-1",
        organizationId: "org-a",
        exceptionId: "exc-other-tenant",
      })
    ).rejects.toMatchObject({
      code: "exception_not_found",
      status: 404,
    });

    expect(getExceptionByIdForOrganization).toHaveBeenCalledWith(
      "exc-other-tenant",
      "org-a"
    );
    expect(updateExceptionReview).not.toHaveBeenCalled();
  });

  it("refuseHorodateurException refuses exception of another tenant", async () => {
    getExceptionByIdForOrganization.mockResolvedValueOnce(null);

    const { refuseHorodateurException } = await import(
      "@/app/lib/horodateur-v1/service"
    );

    await expect(
      refuseHorodateurException({
        actorUserId: "actor-1",
        organizationId: "org-a",
        exceptionId: "exc-other-tenant",
        reviewNote: "refus",
      })
    ).rejects.toMatchObject({
      code: "exception_not_found",
      status: 404,
    });

    expect(getExceptionByIdForOrganization).toHaveBeenCalledWith(
      "exc-other-tenant",
      "org-a"
    );
    expect(updateExceptionReview).not.toHaveBeenCalled();
  });

  it("createDirectionPunch refuses employee of another tenant", async () => {
    getEmployeeByIdForOrganization.mockResolvedValueOnce(null);

    const { createDirectionPunch } = await import(
      "@/app/lib/horodateur-v1/service"
    );

    await expect(
      createDirectionPunch({
        actorUserId: "actor-1",
        organizationId: "org-a",
        employeeId: 99,
        eventType: "quart_debut",
        note: "correction direction",
      })
    ).rejects.toMatchObject({
      code: "employee_not_found",
      status: 404,
    });

    expect(getEmployeeByIdForOrganization).toHaveBeenCalledWith(99, "org-a");
  });

  it("createStaffRetroCorrectionRequest refuses employee of another tenant", async () => {
    getEmployeeByIdForOrganization.mockResolvedValueOnce(null);

    const { createStaffRetroCorrectionRequest } = await import(
      "@/app/lib/horodateur-v1/service"
    );

    await expect(
      createStaffRetroCorrectionRequest({
        actorUserId: "actor-1",
        actorRole: "direction",
        organizationId: "org-a",
        employeeId: 99,
        eventType: "quart_debut",
        occurredAt: "2026-08-15T12:00:00.000Z",
        timeLabel: "08:00",
        reason: "oubli",
      })
    ).rejects.toMatchObject({
      code: "employee_not_found",
      status: 404,
    });

    expect(getEmployeeByIdForOrganization).toHaveBeenCalledWith(99, "org-a");
  });

  it("approve keeps same-tenant path (loads scoped exception before mutation)", async () => {
    getExceptionByIdForOrganization.mockResolvedValueOnce({
      id: "exc-1",
      employee_id: 1,
      organization_id: "org-a",
      status: "en_attente",
      impact_minutes: 0,
      source_event_id: "evt-1",
      exception_type: "outside_schedule",
    });
    getEventById.mockResolvedValue({
      id: "evt-1",
      employee_id: 1,
      organization_id: "org-a",
      event_type: "quart_debut",
      status: "en_attente",
      related_event_id: null,
      work_date: "2026-08-15",
      occurred_at: "2026-08-15T12:00:00.000Z",
    });
    updateExceptionReview.mockResolvedValue({
      id: "exc-1",
      employee_id: 1,
      organization_id: "org-a",
      status: "approuve",
      impact_minutes: 0,
      source_event_id: "evt-1",
      exception_type: "outside_schedule",
    });

    const { approveHorodateurException } = await import(
      "@/app/lib/horodateur-v1/service"
    );

    // May fail later on recompute mocks; assert the tenant gate ran first.
    try {
      await approveHorodateurException({
        actorUserId: "actor-1",
        organizationId: "org-a",
        exceptionId: "exc-1",
      });
    } catch (error) {
      // Downstream recompute can fail in unit isolation; tenant gate must already have passed.
      expect(error).toBeTruthy();
    }

    expect(getExceptionByIdForOrganization).toHaveBeenCalledWith("exc-1", "org-a");
    expect(updateExceptionReview).toHaveBeenCalled();
  });
});

describe("fetchPunchZoneByKey tenant scope", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("filters by organization_id and cannot return another tenant zone", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqOrg = vi.fn(() => ({ maybeSingle }));
    const eqKey = vi.fn(() => ({ eq: eqOrg }));
    const select = vi.fn(() => ({ eq: eqKey }));
    const from = vi.fn(() => ({ select }));

    const { fetchPunchZoneByKey } = await import(
      "@/app/lib/horodateur-qr-punch.server"
    );

    const result = await fetchPunchZoneByKey(
      { from } as never,
      "shared-zone-key",
      "org-a"
    );

    expect(result).toBeNull();
    expect(from).toHaveBeenCalledWith("horodateur_punch_zones");
    expect(eqKey).toHaveBeenCalledWith("zone_key", "shared-zone-key");
    expect(eqOrg).toHaveBeenCalledWith("organization_id", "org-a");
  });

  it("returns zone only when organization_id matches", async () => {
    const zone = {
      id: "z1",
      organization_id: "org-a",
      organization_company_id: null,
      zone_key: "depot",
      label: "Depot",
      company_key: "all",
      location_key: null,
      token_hash: "abc",
      active: true,
      requires_gps: false,
      latitude: null,
      longitude: null,
      radius_meters: null,
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: zone, error: null });
    const eqOrg = vi.fn(() => ({ maybeSingle }));
    const eqKey = vi.fn(() => ({ eq: eqOrg }));
    const select = vi.fn(() => ({ eq: eqKey }));
    const from = vi.fn(() => ({ select }));

    const { fetchPunchZoneByKey } = await import(
      "@/app/lib/horodateur-qr-punch.server"
    );

    const result = await fetchPunchZoneByKey(
      { from } as never,
      "depot",
      "org-a"
    );

    expect(result).toEqual(zone);
    expect(eqOrg).toHaveBeenCalledWith("organization_id", "org-a");
  });
});

describe("quick-action tenant binding", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("refuses when actor membership organization differs from exception tenant", async () => {
    const exceptionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    vi.doMock("@/app/lib/horodateur-exception-quick-action.server", () => ({
      getHorodateurQuickActionActorUserId: () =>
        "11111111-1111-4111-8111-111111111111",
      hashHorodateurQuickActionToken: (t: string) => `hash:${t}`,
    }));

    const findQuickActionTokenByHash = vi.fn().mockResolvedValue({
      id: "tok-1",
      exception_id: exceptionId,
      action: "approve",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      used_at: null,
    });
    const getExceptionByIdLocal = vi.fn().mockResolvedValue({
      id: exceptionId,
      organization_id: "org-exception",
      status: "en_attente",
      employee_id: 1,
      source_event_id: "evt-1",
    });
    const markQuickActionTokenUsed = vi.fn();
    const approveHorodateurException = vi.fn();

    vi.doMock("@/app/lib/horodateur-v1/repository", () => ({
      findQuickActionTokenByHash,
      getExceptionById: getExceptionByIdLocal,
      markQuickActionTokenUsed,
    }));
    vi.doMock("@/app/lib/horodateur-v1/service", () => ({
      approveHorodateurException,
      refuseHorodateurException: vi.fn(),
    }));
    vi.doMock("@/app/lib/saas/organization-membership.server", () => ({
      resolveActiveOrganizationMembershipForUserId: vi.fn().mockResolvedValue({
        ok: true,
        organizationId: "org-actor-other",
        userId: "11111111-1111-4111-8111-111111111111",
        membershipId: "m1",
        membershipRole: "direction",
        membershipStatus: "active",
        organizationStatus: "active",
        isDefault: true,
        appRole: "direction",
      }),
    }));
    vi.doMock("@/app/lib/app-alerts-dual-write.server", () => ({
      markHorodateurExceptionAppAlertHandled: vi.fn(),
    }));
    vi.doMock("@/app/lib/supabase/admin", () => ({
      createAdminSupabaseClient: vi.fn(),
    }));

    const { GET } = await import(
      "@/app/api/direction/horodateur/exceptions/quick-action/route"
    );

    const req = {
      nextUrl: new URL(
        `https://example.test/api/direction/horodateur/exceptions/quick-action?exceptionId=${exceptionId}&action=approve&token=secret`
      ),
    } as never;

    const response = await GET(req);
    const html = await response.text();

    expect(response.status).toBe(403);
    expect(html).toContain("Accès refusé");
    expect(approveHorodateurException).not.toHaveBeenCalled();
    expect(markQuickActionTokenUsed).not.toHaveBeenCalled();
  });

  it("passes token-bound organizationId for same-tenant actor", async () => {
    const exceptionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    vi.doMock("@/app/lib/horodateur-exception-quick-action.server", () => ({
      getHorodateurQuickActionActorUserId: () =>
        "11111111-1111-4111-8111-111111111111",
      hashHorodateurQuickActionToken: (t: string) => `hash:${t}`,
    }));

    const findQuickActionTokenByHash = vi.fn().mockResolvedValue({
      id: "tok-1",
      exception_id: exceptionId,
      action: "approve",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      used_at: null,
    });
    const getExceptionByIdLocal = vi.fn().mockResolvedValue({
      id: exceptionId,
      organization_id: "org-a",
      status: "en_attente",
      employee_id: 1,
      source_event_id: "evt-1",
    });
    const markQuickActionTokenUsed = vi.fn().mockResolvedValue({ id: "tok-1" });
    const approveHorodateurException = vi.fn().mockResolvedValue({
      employeeNotify: null,
      exception: { id: exceptionId, employee_id: 1 },
      event: { id: "evt-1", employee_id: 1 },
    });

    vi.doMock("@/app/lib/horodateur-v1/repository", () => ({
      findQuickActionTokenByHash,
      getExceptionById: getExceptionByIdLocal,
      markQuickActionTokenUsed,
    }));
    vi.doMock("@/app/lib/horodateur-v1/service", () => ({
      approveHorodateurException,
      refuseHorodateurException: vi.fn(),
    }));
    vi.doMock("@/app/lib/saas/organization-membership.server", () => ({
      resolveActiveOrganizationMembershipForUserId: vi.fn().mockResolvedValue({
        ok: true,
        organizationId: "org-a",
        userId: "11111111-1111-4111-8111-111111111111",
        membershipId: "m1",
        membershipRole: "direction",
        membershipStatus: "active",
        organizationStatus: "active",
        isDefault: true,
        appRole: "direction",
      }),
    }));
    vi.doMock("@/app/lib/app-alerts-dual-write.server", () => ({
      markHorodateurExceptionAppAlertHandled: vi.fn(),
    }));
    vi.doMock("@/app/lib/supabase/admin", () => ({
      createAdminSupabaseClient: vi.fn(() => ({})),
    }));

    const { GET } = await import(
      "@/app/api/direction/horodateur/exceptions/quick-action/route"
    );

    const req = {
      nextUrl: new URL(
        `https://example.test/api/direction/horodateur/exceptions/quick-action?exceptionId=${exceptionId}&action=approve&token=secret`
      ),
    } as never;

    const response = await GET(req);
    expect(response.status).toBe(200);
    expect(approveHorodateurException).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-a",
        exceptionId,
      })
    );
  });
});

describe("error type sanity", () => {
  it("exposes HorodateurPhase1Error for assertions", () => {
    const err = new HorodateurPhase1Error("x", {
      code: "exception_not_found",
      status: 404,
    });
    expect(err.code).toBe("exception_not_found");
  });
});

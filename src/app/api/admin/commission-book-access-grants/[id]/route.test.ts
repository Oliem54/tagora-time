import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const {
  requireAdminFinanceCommissionsAccess,
  assertUserHasActiveOrganizationMembership,
} = vi.hoisted(() => ({
  requireAdminFinanceCommissionsAccess: vi.fn(),
  assertUserHasActiveOrganizationMembership: vi.fn(),
}));

vi.mock("@/app/api/direction/commissions/_lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/direction/commissions/_lib")>();
  return {
    ...actual,
    requireAdminFinanceCommissionsAccess,
    loadChauffeurLabels: vi.fn(async () => new Map([[11, "Alex"]])),
  };
});

vi.mock("@/app/lib/auth/organization-access.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/auth/organization-access.server")>();
  return {
    ...actual,
    assertUserHasActiveOrganizationMembership,
  };
});

import { PATCH } from "./route";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const GRANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VIEWER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost/api/admin/commission-book-access-grants/${GRANT_ID}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }
  );
}

function chainable(result: unknown) {
  const api: Record<string, unknown> = {};
  const self = new Proxy(api, {
    get(_t, prop: string) {
      if (prop === "then") return undefined;
      if (prop === "maybeSingle" || prop === "single") return async () => result;
      return () => self;
    },
  });
  return self;
}

describe("PATCH commission-book-access-grants/[id] — tenant lock", () => {
  beforeEach(() => {
    requireAdminFinanceCommissionsAccess.mockReset();
    assertUserHasActiveOrganizationMembership.mockReset();
  });

  it("rejects owner/viewer retarget in body", async () => {
    requireAdminFinanceCommissionsAccess.mockResolvedValue({
      ok: true,
      user: { id: "admin-a" },
      role: "admin",
      accessToken: "token",
      supabase: { from: vi.fn() },
    });
    const res = await PATCH(makeRequest({ viewer_user_id: "other" }), {
      params: Promise.resolve({ id: GRANT_ID }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/owner_chauffeur_id|viewer_user_id/i);
  });

  it("rejects owner_chauffeur_id retarget", async () => {
    requireAdminFinanceCommissionsAccess.mockResolvedValue({
      ok: true,
      user: { id: "admin-a" },
      role: "admin",
      accessToken: "token",
      supabase: { from: vi.fn() },
    });
    const res = await PATCH(makeRequest({ owner_chauffeur_id: 99 }), {
      params: Promise.resolve({ id: GRANT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("refuses notes update when existing viewer lost same-org membership", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "commission_book_access_grants") {
          return chainable({
            data: {
              id: GRANT_ID,
              owner_chauffeur_id: 11,
              viewer_user_id: VIEWER,
              can_edit: false,
              revoked_at: null,
              notes: null,
            },
            error: null,
          });
        }
        if (table === "chauffeurs") {
          return chainable({
            data: { id: 11, organization_id: ORG_A },
            error: null,
          });
        }
        return chainable({ data: null, error: null });
      }),
    };
    requireAdminFinanceCommissionsAccess.mockResolvedValue({
      ok: true,
      user: { id: "admin-a" },
      role: "admin",
      accessToken: "token",
      supabase,
    });
    assertUserHasActiveOrganizationMembership.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Membership organisation inactive ou absente pour ce viewer.",
    });

    const res = await PATCH(makeRequest({ notes: "x" }), {
      params: Promise.resolve({ id: GRANT_ID }),
    });
    expect(res.status).toBe(403);
    expect(assertUserHasActiveOrganizationMembership).toHaveBeenCalledWith(
      VIEWER,
      ORG_A
    );
  });

  it("allows notes update when viewer still same-tenant and keeps can_edit false", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "commission_book_access_grants") {
          const api: Record<string, unknown> = {};
          const self = new Proxy(api, {
            get(_t, prop: string) {
              if (prop === "select") return () => self;
              if (prop === "eq") return () => self;
              if (prop === "update") return () => self;
              if (prop === "maybeSingle") {
                return async () => ({
                  data: {
                    id: GRANT_ID,
                    owner_chauffeur_id: 11,
                    viewer_user_id: VIEWER,
                    can_edit: false,
                    can_view: true,
                    revoked_at: null,
                    notes: "ok",
                    created_at: "2026-07-30T00:00:00Z",
                    expires_at: null,
                    viewer_role: "direction",
                    granted_by_admin_id: "admin-a",
                  },
                  error: null,
                });
              }
              return () => self;
            },
          });
          return self;
        }
        if (table === "chauffeurs") {
          return chainable({
            data: { id: 11, organization_id: ORG_A },
            error: null,
          });
        }
        return chainable({ data: null, error: null });
      }),
    };
    requireAdminFinanceCommissionsAccess.mockResolvedValue({
      ok: true,
      user: { id: "admin-a" },
      role: "admin",
      accessToken: "token",
      supabase,
    });
    assertUserHasActiveOrganizationMembership.mockResolvedValue({ ok: true });

    const res = await PATCH(makeRequest({ notes: "ok" }), {
      params: Promise.resolve({ id: GRANT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grant.can_edit).toBe(false);
  });
});

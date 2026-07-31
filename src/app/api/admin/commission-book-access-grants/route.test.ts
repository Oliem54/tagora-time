import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const {
  requireAdminFinanceCommissionsAccess,
  assertChauffeurOrganizationAccess,
  assertUserHasActiveOrganizationMembership,
  createAdminSupabaseClient,
} = vi.hoisted(() => ({
  requireAdminFinanceCommissionsAccess: vi.fn(),
  assertChauffeurOrganizationAccess: vi.fn(),
  assertUserHasActiveOrganizationMembership: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
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
    assertChauffeurOrganizationAccess,
    assertUserHasActiveOrganizationMembership,
  };
});

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

import { POST } from "./route";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const VIEWER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/commission-book-access-grants", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
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

describe("POST commission-book-access-grants — viewer same-tenant", () => {
  beforeEach(() => {
    requireAdminFinanceCommissionsAccess.mockReset();
    assertChauffeurOrganizationAccess.mockReset();
    assertUserHasActiveOrganizationMembership.mockReset();
    createAdminSupabaseClient.mockReset();
  });

  it("returns auth failure without session/permission", async () => {
    requireAdminFinanceCommissionsAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Authentification requise." }), {
        status: 401,
      }),
    });
    const res = await POST(makeRequest({ owner_chauffeur_id: 11, viewer_user_id: VIEWER }));
    expect(res.status).toBe(401);
  });

  it("refuses owner outside actor tenant", async () => {
    requireAdminFinanceCommissionsAccess.mockResolvedValue({
      ok: true,
      user: { id: "admin-a" },
      role: "admin",
      accessToken: "token-a",
      supabase: { from: vi.fn() },
    });
    assertChauffeurOrganizationAccess.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Employe hors organisations accessibles.",
    });
    const res = await POST(makeRequest({ owner_chauffeur_id: 99, viewer_user_id: VIEWER }));
    expect(res.status).toBe(403);
  });

  it("refuses viewer without same-organization membership", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "chauffeurs") {
          return chainable({
            data: { id: 11, actif: true, auth_user_id: "emp-1" },
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
      accessToken: "token-a",
      supabase,
    });
    assertChauffeurOrganizationAccess.mockResolvedValue({
      ok: true,
      organizationId: ORG_A,
    });
    createAdminSupabaseClient.mockReturnValue({
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: {
              user: {
                id: VIEWER,
                app_metadata: { role: "direction" },
                user_metadata: {},
              },
            },
            error: null,
          })),
        },
      },
    });
    assertUserHasActiveOrganizationMembership.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Membership organisation inactive ou absente pour ce viewer.",
    });

    const res = await POST(
      makeRequest({ owner_chauffeur_id: 11, viewer_user_id: VIEWER })
    );
    expect(res.status).toBe(403);
    expect(assertUserHasActiveOrganizationMembership).toHaveBeenCalledWith(
      VIEWER,
      ORG_A
    );
    expect(supabase.from).not.toHaveBeenCalledWith("commission_book_access_grants");
  });

  it("allows viewer with active membership in owner organization", async () => {
    const insertPayloads: unknown[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "chauffeurs") {
          return chainable({
            data: { id: 11, actif: true, auth_user_id: "emp-1" },
            error: null,
          });
        }
        if (table === "commission_book_access_grants") {
          const api: Record<string, unknown> = {};
          const self = new Proxy(api, {
            get(_t, prop: string) {
              if (prop === "select") return () => self;
              if (prop === "eq") return () => self;
              if (prop === "is") return () => self;
              if (prop === "maybeSingle") {
                return async () => ({ data: null, error: null });
              }
              if (prop === "insert") {
                return (rows: unknown[]) => {
                  insertPayloads.push(rows[0]);
                  return self;
                };
              }
              if (prop === "single") {
                return async () => ({
                  data: {
                    id: "grant-1",
                    owner_chauffeur_id: 11,
                    viewer_user_id: VIEWER,
                    viewer_role: "direction",
                    granted_by_admin_id: "admin-a",
                    can_view: true,
                    can_edit: false,
                    created_at: "2026-07-30T00:00:00Z",
                    revoked_at: null,
                    expires_at: null,
                    notes: null,
                  },
                  error: null,
                });
              }
              return () => self;
            },
          });
          return self;
        }
        return chainable({ data: null, error: null });
      }),
    };
    requireAdminFinanceCommissionsAccess.mockResolvedValue({
      ok: true,
      user: { id: "admin-a" },
      role: "admin",
      accessToken: "token-a",
      supabase,
    });
    assertChauffeurOrganizationAccess.mockResolvedValue({
      ok: true,
      organizationId: ORG_A,
    });
    createAdminSupabaseClient.mockReturnValue({
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: {
              user: {
                id: VIEWER,
                email: "secret@example.com",
                app_metadata: { role: "direction" },
                user_metadata: {},
              },
            },
            error: null,
          })),
        },
      },
    });
    assertUserHasActiveOrganizationMembership.mockResolvedValue({ ok: true });

    const res = await POST(
      makeRequest({ owner_chauffeur_id: 11, viewer_user_id: VIEWER })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grant.can_edit).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/secret@example\.com/);
    expect(insertPayloads[0]).toMatchObject({
      can_edit: false,
      viewer_user_id: VIEWER,
      owner_chauffeur_id: 11,
    });
    expect(assertUserHasActiveOrganizationMembership).toHaveBeenCalledWith(
      VIEWER,
      ORG_A
    );
  });

  it("does not use service_role for grant table write", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(
        "src/app/api/admin/commission-book-access-grants/route.ts",
        "utf8"
      )
    );
    expect(source).toMatch(/assertUserHasActiveOrganizationMembership/);
    expect(source).toMatch(/createAuthenticatedServerSupabaseClient|requireAdminFinanceCommissionsAccess/);
    expect(source).toMatch(/auth\.admin\.getUserById/);
    // insert uses authenticated supabase from require*, not createAdminSupabaseClient().from
    expect(source).toMatch(/const insertRes = await supabase\s*\n?\s*\.from\("commission_book_access_grants"\)/);
  });
});

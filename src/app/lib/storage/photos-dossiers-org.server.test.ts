import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const getAuthenticatedRequestUser = vi.hoisted(() => vi.fn());
const createAdminSupabaseClient = vi.hoisted(() => vi.fn());
const hasUserPermission = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/account-requests.server", () => ({
  getAuthenticatedRequestUser,
}));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/app/lib/auth/permissions", () => ({
  hasUserPermission,
}));

import {
  assertObjectPathReadableByOrganization,
  resolveStorageOrganizationContext,
} from "@/app/lib/storage/photos-dossiers-org.server";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function req() {
  return new NextRequest("http://localhost/api/test");
}

function user(id = "user-1") {
  return {
    id,
    app_metadata: { role: "direction", permissions: ["livraisons", "documents", "terrain"] },
    user_metadata: {},
  };
}

describe("H5-F5A resolveStorageOrganizationContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasUserPermission.mockReturnValue(true);
  });

  it("refuses unauthenticated users", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({ user: null, role: null });
    const result = await resolveStorageOrganizationContext(req());
    expect(result).toEqual({ ok: false, status: 401, reason: "unauthenticated" });
  });

  it("refuses client-supplied organization_id", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({ user: user(), role: "direction" });
    const result = await resolveStorageOrganizationContext(req(), {
      clientOrganizationId: ORG,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("client_org_rejected");
  });

  it("refuses absent membership", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({ user: user(), role: "direction" });
    createAdminSupabaseClient.mockReturnValue({
      from: (table: string) => {
        if (table === "platform_access") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      },
    });
    const result = await resolveStorageOrganizationContext(req());
    expect(result).toMatchObject({ ok: false, reason: "membership_absent" });
  });

  it("refuses inactive membership", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({ user: user(), role: "employe" });
    createAdminSupabaseClient.mockReturnValue({
      from: (table: string) => {
        if (table === "platform_access") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  id: "m1",
                  organization_id: ORG,
                  role: "employe",
                  status: "suspended",
                  is_default: true,
                },
              ],
              error: null,
            }),
          }),
        };
      },
    });
    const result = await resolveStorageOrganizationContext(req());
    expect(result).toMatchObject({ ok: false, reason: "membership_inactive" });
  });

  it("refuses platform-only access without membership", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({ user: user("plat"), role: null });
    createAdminSupabaseClient.mockReturnValue({
      from: (table: string) => {
        if (table === "platform_access") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: async () => ({ data: [{ id: "p1" }], error: null }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      },
    });
    const result = await resolveStorageOrganizationContext(req());
    expect(result).toMatchObject({ ok: false, reason: "platform_only" });
  });

  it("resolves active membership", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({ user: user(), role: "direction" });
    createAdminSupabaseClient.mockReturnValue({
      from: (table: string) => {
        if (table === "platform_access") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  id: "m1",
                  organization_id: ORG,
                  role: "direction",
                  status: "active",
                  is_default: true,
                },
              ],
              error: null,
            }),
          }),
        };
      },
    });
    const result = await resolveStorageOrganizationContext(req());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.organizationId).toBe(ORG);
    expect(result.membershipRole).toBe("direction");
  });

  it("refuses cross-org object paths", () => {
    const check = assertObjectPathReadableByOrganization({
      urlOrPath: `${OTHER}/livraisons/1/a.pdf`,
      organizationId: ORG,
    });
    expect(check.ok).toBe(false);
  });

  it("allows legacy paths after org gate is caller-side", () => {
    const check = assertObjectPathReadableByOrganization({
      urlOrPath: "operation-proofs/livraison/1/a.pdf",
      organizationId: ORG,
    });
    expect(check.ok).toBe(true);
  });
});

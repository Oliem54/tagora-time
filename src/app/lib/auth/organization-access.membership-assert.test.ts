import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createAdminSupabaseClient } = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
}));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/app/lib/supabase/authenticated-server", () => ({
  createAuthenticatedServerSupabaseClient: vi.fn(),
}));

import { assertUserHasActiveOrganizationMembership } from "@/app/lib/auth/organization-access.server";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const VIEWER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function mockMembershipQuery(result: { data: unknown; error: unknown }, eqs: string[] = []) {
  const api: Record<string, unknown> = {};
  const self = new Proxy(api, {
    get(_t, prop: string) {
      if (prop === "select") return () => self;
      if (prop === "eq") {
        return (col: string) => {
          eqs.push(col);
          return self;
        };
      }
      if (prop === "maybeSingle") return async () => result;
      return () => self;
    },
  });
  createAdminSupabaseClient.mockReturnValue({
    from: (table: string) => {
      expect(table).toBe("organization_memberships");
      return self;
    },
  });
  return eqs;
}

describe("assertUserHasActiveOrganizationMembership", () => {
  beforeEach(() => {
    createAdminSupabaseClient.mockReset();
  });

  it("always filters by user_id, organization_id and status=active", async () => {
    const eqs: string[] = [];
    mockMembershipQuery(
      {
        data: {
          id: "m1",
          status: "active",
          organizations: { id: ORG_A, status: "active", deleted_at: null },
        },
        error: null,
      },
      eqs
    );

    const result = await assertUserHasActiveOrganizationMembership(VIEWER, ORG_A);
    expect(result).toEqual({ ok: true });
    expect(eqs).toEqual(["user_id", "organization_id", "status"]);
  });

  it("refuses when no membership row for that user/org pair", async () => {
    mockMembershipQuery({ data: null, error: null });
    const result = await assertUserHasActiveOrganizationMembership(VIEWER, ORG_B);
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses suspended organization even if membership row returned", async () => {
    mockMembershipQuery({
      data: {
        id: "m1",
        status: "active",
        organizations: { id: ORG_A, status: "suspended", deleted_at: null },
      },
      error: null,
    });
    const result = await assertUserHasActiveOrganizationMembership(VIEWER, ORG_A);
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses deleted organization", async () => {
    mockMembershipQuery({
      data: {
        id: "m1",
        status: "active",
        organizations: {
          id: ORG_A,
          status: "active",
          deleted_at: "2026-07-01T00:00:00Z",
        },
      },
      error: null,
    });
    const result = await assertUserHasActiveOrganizationMembership(VIEWER, ORG_A);
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses invalid organization UUID", async () => {
    const result = await assertUserHasActiveOrganizationMembership(
      VIEWER,
      "oliem_solutions"
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});

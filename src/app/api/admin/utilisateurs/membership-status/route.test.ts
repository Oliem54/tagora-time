import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { commitAuditedMembershipStatus, createAdminSupabaseClient, getAuthenticatedRequestUser } =
  vi.hoisted(() => ({
    commitAuditedMembershipStatus: vi.fn(),
    createAdminSupabaseClient: vi.fn(),
    getAuthenticatedRequestUser: vi.fn(),
  }));

vi.mock("@/app/lib/auth/horora-local-nexus-fixture", () => ({
  isProcessLocalNexusFixtureEnabled: () => false,
}));
vi.mock("@/app/lib/auth/horora-membership-status-commit.server", () => ({
  commitAuditedMembershipStatus,
}));
vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));
vi.mock("@/app/lib/account-requests.server", () => ({
  getAuthenticatedRequestUser,
}));

import { POST } from "@/app/api/admin/utilisateurs/membership-status/route";

const rows = [
  { id: "mem-owner", user_id: "user-owner", role: "organization_owner", status: "active" },
  { id: "mem-employee", user_id: "user-employee", role: "employe", status: "active" },
];

beforeEach(() => {
  commitAuditedMembershipStatus.mockReset();
  getAuthenticatedRequestUser.mockResolvedValue({
    user: { id: "user-owner" },
    organizationId: "org-horora",
    membershipId: "mem-owner",
    membershipRole: "organization_owner",
    role: "admin",
  });
  createAdminSupabaseClient.mockReturnValue({
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select() {
          return builder;
        },
        update() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        is() {
          return builder;
        },
        then(
          onFulfilled: (value: { data: typeof rows; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          const data =
            table === "organization_memberships"
              ? rows.filter((row) => filters.every(([column, value]) => column !== "organization_id" || value === "org-horora"))
              : [];
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  });
});

function request(body: unknown) {
  return new NextRequest("https://horora.local/api/admin/utilisateurs/membership-status", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("membership status route", () => {
  it("refuses an unconfirmed suspension before any write", async () => {
    const response = await POST(
      request({ membershipId: "mem-employee", nextStatus: "suspended", confirmed: false })
    );
    expect(response.status).toBe(400);
    expect(commitAuditedMembershipStatus).not.toHaveBeenCalled();
  });

  it("lets an owner suspend an employee and revoke that organization's sessions", async () => {
    commitAuditedMembershipStatus.mockResolvedValue({
      ok: true,
      status: "suspended",
      audited: true,
      unchanged: false,
    });
    const response = await POST(
      request({ membershipId: "mem-employee", nextStatus: "suspended", confirmed: true })
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { access?: string; sessionRevocation?: string };
    expect(body.access).toBe("denied");
    expect(body.sessionRevocation).toBe("revoked");
    expect(commitAuditedMembershipStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-horora",
        targetUserId: "user-employee",
        nextStatus: "suspended",
      })
    );
  });

  it("refuses an employee suspending a colleague", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({
      user: { id: "user-employee" },
      organizationId: "org-horora",
      membershipId: "mem-employee",
      membershipRole: "employe",
      role: "employe",
    });
    const response = await POST(
      request({ membershipId: "mem-owner", nextStatus: "suspended", confirmed: true })
    );
    expect(response.status).toBe(403);
    expect(commitAuditedMembershipStatus).not.toHaveBeenCalled();
  });
});

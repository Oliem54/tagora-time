import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const {
  commitAuditedOrganizationRole,
  readLiveAuthorizedModuleDirectory,
  createAdminSupabaseClient,
  getAuthenticatedRequestUser,
} = vi.hoisted(() => ({
  commitAuditedOrganizationRole: vi.fn(),
  readLiveAuthorizedModuleDirectory: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
  getAuthenticatedRequestUser: vi.fn(),
}));

vi.mock("@/app/lib/auth/horora-local-nexus-fixture", () => ({
  isProcessLocalNexusFixtureEnabled: () => false,
}));

vi.mock("@/app/lib/employee-onboarding-tenant.server", () => ({
  commitAuditedOrganizationRole,
}));

vi.mock("@/app/lib/auth/horora-directory-nexus.server", () => ({
  readLiveAuthorizedModuleDirectory,
}));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/app/lib/account-requests.server", () => ({
  getAuthenticatedRequestUser,
}));

import { POST } from "@/app/api/admin/utilisateurs/membership/route";

type Row = Record<string, unknown>;

const memberships: Row[] = [
  {
    id: "mem-owner",
    user_id: "user-owner",
    role: "organization_owner",
    status: "active",
    organization_id: "org-horora",
  },
  {
    id: "mem-admin",
    user_id: "user-admin",
    role: "organization_admin",
    status: "active",
    organization_id: "org-horora",
  },
  {
    id: "mem-direction",
    user_id: "user-direction",
    role: "direction",
    status: "active",
    organization_id: "org-horora",
  },
  {
    id: "mem-employee",
    user_id: "user-employee",
    role: "employe",
    status: "active",
    organization_id: "org-horora",
  },
  {
    id: "mem-paused",
    user_id: "user-paused",
    role: "employe",
    status: "suspended",
    organization_id: "org-horora",
  },
  {
    id: "mem-foreign",
    user_id: "user-foreign",
    role: "employe",
    status: "active",
    organization_id: "org-other",
  },
];

function tables(): Record<string, Row[]> {
  return {
    organization_memberships: memberships.map((row) => ({ ...row })),
    horora_nexus_organization_map: [
      {
        nexus_organization_id: "org-nexus",
        nexus_tenant_id: "tenant-a",
        organization_id: "org-horora",
        status: "active",
      },
    ],
    horora_nexus_identity_map: [
      {
        nexus_actor_id: "nuser_employee",
        auth_user_id: "user-employee",
        disabled_at: null,
      },
      {
        nexus_actor_id: "nuser_owner",
        auth_user_id: "user-owner",
        disabled_at: null,
      },
    ],
    chauffeurs: [],
    horora_nexus_sessions: [
      {
        auth_user_id: "user-employee",
        organization_id: "org-horora",
        revoked_at: null,
      },
    ],
  };
}

function installClient() {
  const data = tables();
  const writes: string[] = [];
  const client = {
    from(table: string) {
      const filters: Array<[string, unknown, "eq" | "is"]> = [];
      let mode: "select" | "update" = "select";
      const builder = {
        select() {
          return builder;
        },
        update(values: unknown) {
          mode = "update";
          void values;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value, "eq"]);
          return builder;
        },
        is(column: string, value: unknown) {
          filters.push([column, value, "is"]);
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle: async () => {
          const rows = matched();
          return { data: rows[0] ?? null, error: null };
        },
        then(
          onFulfilled: (value: { data: Row[]; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          if (mode === "update") writes.push(table);
          return Promise.resolve({ data: matched(), error: null }).then(onFulfilled, onRejected);
        },
      };
      function matched() {
        return (data[table] ?? []).filter((row) =>
          filters.every(([column, value, operator]) =>
            operator === "is" ? row[column] == null : row[column] === value
          )
        );
      }
      return builder;
    },
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({
          data: { user: { id, app_metadata: { role: "employe" } } },
          error: null,
        })),
        updateUserById: vi.fn(async () => ({ data: { user: {} }, error: null })),
      },
    },
    writes,
  };
  createAdminSupabaseClient.mockImplementation(() => client);
  return client;
}

function session(input: {
  userId: string;
  membershipId: string;
  membershipRole: string;
  organizationId?: string;
}) {
  getAuthenticatedRequestUser.mockResolvedValue({
    user: { id: input.userId, email: `${input.userId}@example.test` },
    role: input.membershipRole === "employe" ? "employe" : "admin",
    organizationId: input.organizationId ?? "org-horora",
    membershipId: input.membershipId,
    membershipRole: input.membershipRole,
    authSource: "cookie",
    authorizationSource: "membership",
    sessionSource: "nexus_handoff",
  });
}

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/utilisateurs/membership", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function forged(body: Record<string, unknown>) {
  return request({
    actorRole: "organization_owner",
    organizationId: "org-forged",
    role: "organization_owner",
    departmentKey: "livreur",
    ...body,
  });
}

describe("HORORA membership role writer HTTP guard", () => {
  let client: ReturnType<typeof installClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = installClient();
    readLiveAuthorizedModuleDirectory.mockResolvedValue({
      ok: true,
      directory: {
        entries: [
          {
            userId: "nuser_employee",
            organizationId: "org-nexus",
            technicalKey: "tagora_time",
            status: "ACTIVE",
          },
        ],
      },
    });
    commitAuditedOrganizationRole.mockResolvedValue({
      ok: true,
      role: "direction",
      audited: true,
      unchanged: false,
    });
  });

  it("lets an owner change an employee of the same organization and audits the write", async () => {
    session({
      userId: "user-owner",
      membershipId: "mem-owner",
      membershipRole: "organization_owner",
    });
    const response = await POST(
      forged({ membershipId: "mem-employee", nextRole: "direction" })
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      rolePersisted: true,
      audited: true,
      role: "direction",
      writer: "commit_horora_membership_role_with_audit",
    });
    expect(commitAuditedOrganizationRole).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-owner",
        organizationId: "org-horora",
        targetUserId: "user-employee",
        newRole: "direction",
        reason: "user_central_membership_role",
      })
    );
    expect(commitAuditedOrganizationRole.mock.calls[0][0].organizationId).not.toBe("org-forged");
  });

  it("denies an employee changing their own role before any write", async () => {
    session({
      userId: "user-employee",
      membershipId: "mem-employee",
      membershipRole: "employe",
    });
    const response = await POST(
      forged({ membershipId: "mem-employee", nextRole: "direction" })
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "self_change_forbidden",
      rolePersisted: false,
      audited: false,
    });
    expect(commitAuditedOrganizationRole).not.toHaveBeenCalled();
  });

  it("denies direction because it cannot administer roles", async () => {
    session({
      userId: "user-direction",
      membershipId: "mem-direction",
      membershipRole: "direction",
    });
    const response = await POST(
      forged({ membershipId: "mem-employee", nextRole: "employe" })
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "direction_assignment_unauthorized",
      rolePersisted: false,
    });
    expect(commitAuditedOrganizationRole).not.toHaveBeenCalled();
  });

  it("denies a membership that belongs to another organization", async () => {
    session({
      userId: "user-owner",
      membershipId: "mem-owner",
      membershipRole: "organization_owner",
    });
    const response = await POST(forged({ membershipId: "mem-foreign", nextRole: "direction" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "cross_organization_forbidden" });
    expect(commitAuditedOrganizationRole).not.toHaveBeenCalled();
  });

  it("denies removal of the last active owner", async () => {
    session({
      userId: "user-admin",
      membershipId: "mem-admin",
      membershipRole: "organization_admin",
    });
    const response = await POST(forged({ membershipId: "mem-owner", nextRole: "direction" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "last_owner_protected",
      rolePersisted: false,
    });
    expect(commitAuditedOrganizationRole).not.toHaveBeenCalled();
  });

  it("denies an inactive membership", async () => {
    session({
      userId: "user-owner",
      membershipId: "mem-owner",
      membershipRole: "organization_owner",
    });
    const response = await POST(forged({ membershipId: "mem-paused", nextRole: "direction" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "membership_not_active" });
    expect(commitAuditedOrganizationRole).not.toHaveBeenCalled();
  });

  it("denies a revoked session before reading memberships", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({
      user: null,
      role: null,
      organizationId: null,
      membershipId: null,
      membershipRole: null,
      authSource: "cookie",
      authorizationSource: null,
      sessionSource: null,
    });
    const response = await POST(forged({ membershipId: "mem-employee", nextRole: "direction" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthenticated" });
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(commitAuditedOrganizationRole).not.toHaveBeenCalled();
  });

  it("denies a forged owner claim from an employee and does not write", async () => {
    session({
      userId: "user-employee",
      membershipId: "mem-employee",
      membershipRole: "employe",
    });
    const response = await POST(
      forged({ membershipId: "mem-direction", nextRole: "direction" })
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "actor_forbidden",
      rolePersisted: false,
      audited: false,
    });
    expect(commitAuditedOrganizationRole).not.toHaveBeenCalled();
  });

  it("does not announce a role when the audited commit conflicts", async () => {
    session({
      userId: "user-owner",
      membershipId: "mem-owner",
      membershipRole: "organization_owner",
    });
    commitAuditedOrganizationRole.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Le compte appartient a une autre organisation.",
      code: "cross_tenant_conflict",
    });
    const response = await POST(request({ membershipId: "mem-employee", nextRole: "direction" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "cross_tenant_conflict",
      rolePersisted: false,
      audited: false,
    });
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("refuses to announce a role when the audit did not commit", async () => {
    session({
      userId: "user-owner",
      membershipId: "mem-owner",
      membershipRole: "organization_owner",
    });
    commitAuditedOrganizationRole.mockResolvedValue({
      ok: true,
      role: "direction",
      audited: false,
      unchanged: false,
    });
    const response = await POST(request({ membershipId: "mem-employee", nextRole: "direction" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: "audit_write_failed",
      rolePersisted: false,
      audited: false,
    });
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(client.writes).not.toContain("horora_nexus_sessions");
  });

  it("keeps the browser from supplying the actor role or organization", () => {
    const route = readFileSync("src/app/api/admin/utilisateurs/membership/route.ts", "utf8");
    const client = readFileSync(
      "src/app/admin/utilisateurs/AdminUsersPermissionsClient.tsx",
      "utf8"
    );
    expect(route.indexOf("actorCanEditLocalPresetRoles")).toBeLessThan(
      route.indexOf("await commitAuditedOrganizationRole")
    );
    expect(route.indexOf("lastActiveOwnerWouldBeRemoved")).toBeLessThan(
      route.indexOf("await commitAuditedOrganizationRole")
    );
    expect(client).toContain("membershipId: row.membershipId, nextRole");
    expect(client).toContain("actorCanEditLocalPresetRoles(actorMembershipRole)");
    expect(client).not.toContain("actorRole:");
    expect(client).not.toContain("organizationId: scope");
  });
});

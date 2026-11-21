import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { createAdminSupabaseClient, getAuthenticatedRequestUser } = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  getAuthenticatedRequestUser: vi.fn(),
}));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

vi.mock("@/app/lib/account-requests.server", () => ({
  getAuthenticatedRequestUser,
}));

vi.mock("@/app/lib/employee-onboarding-tenant.server", () => ({
  resolveDirectionEmployeeOnboardingActor: vi.fn(),
  createTenantStampedChauffeur: vi.fn(),
}));

import { addDaysLocal, formatIsoDateLocal } from "@/app/api/direction/effectifs/_lib";
import { GET as listEmployees } from "@/app/api/direction/ressources/employes/route";
import {
  DELETE as deleteEmployee,
  GET as readEmployee,
  PATCH as patchEmployee,
} from "@/app/api/direction/ressources/employes/[id]/route";

type Row = Record<string, unknown>;

const chauffeurs: Row[] = [
  {
    id: 11,
    nom: "Dans l'organisation",
    courriel: "inside@example.test",
    telephone: null,
    actif: true,
    auth_user_id: null,
    primary_company: null,
    fonctions: [],
    fonction_autre: null,
    can_deliver: false,
    organization_id: "org-horora",
  },
  {
    id: 22,
    nom: "Autre organisation",
    courriel: "outside@example.test",
    telephone: null,
    actif: true,
    auth_user_id: null,
    primary_company: null,
    fonctions: [],
    fonction_autre: null,
    can_deliver: false,
    organization_id: "org-other",
  },
];

const leaves: Row[] = [
  {
    id: "leave-inside",
    employee_id: 11,
    leave_type: "sick_leave",
    start_date: "2026-11-01",
    end_date: "2026-11-30",
    expected_return_date: "2026-11-30",
    is_indefinite: false,
    status: "active",
    reason_public: null,
    private_note: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    ended_at: null,
    ended_by: null,
  },
  {
    id: "leave-outside",
    employee_id: 22,
    leave_type: "sick_leave",
    start_date: "2026-11-01",
    end_date: "2026-11-30",
    expected_return_date: formatIsoDateLocal(addDaysLocal(new Date(), 3)),
    is_indefinite: false,
    status: "active",
    reason_public: "secret autre organisation",
    private_note: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    ended_at: null,
    ended_by: null,
  },
];

function installClient() {
  const writes: string[] = [];
  const client = {
    writes,
    from(table: string) {
      const rows = table === "chauffeurs" ? chauffeurs : table === "employee_leave_periods" ? leaves : [];
      const filters: Array<[string, unknown]> = [];
      const includes: Array<[string, unknown[]]> = [];
      const builder = {
        select() {
          return builder;
        },
        order() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        in(column: string, value: unknown[]) {
          includes.push([column, value]);
          return builder;
        },
        neq() {
          return builder;
        },
        or() {
          return builder;
        },
        limit() {
          return builder;
        },
        update() {
          writes.push(`${table}:update`);
          return builder;
        },
        delete() {
          writes.push(`${table}:delete`);
          return builder;
        },
        maybeSingle: async () => {
          const matched = apply();
          return { data: matched[0] ?? null, error: null };
        },
        single: async () => {
          const matched = apply();
          return { data: matched[0] ?? null, error: matched[0] ? null : { message: "missing" } };
        },
        then(
          onFulfilled: (value: { data: Row[]; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          return Promise.resolve({ data: apply(), error: null }).then(onFulfilled, onRejected);
        },
      };
      function apply() {
        return rows.filter(
          (row) =>
            filters.every(([column, value]) => row[column] === value) &&
            includes.every(([column, value]) => value.includes(row[column]))
        );
      }
      return builder;
    },
  };
  createAdminSupabaseClient.mockImplementation(() => client);
  return client;
}

function session(organizationId: string | null, role: "direction" | "admin" | "employe" = "direction") {
  getAuthenticatedRequestUser.mockResolvedValue({
    user: organizationId === null && role === "employe" ? null : { id: "user-direction" },
    role: organizationId === null && role === "employe" ? null : role,
    organizationId,
  });
}

describe("HORORA employee routes stay inside the session organization", () => {
  let client: ReturnType<typeof installClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = installClient();
    session("org-horora");
  });

  it("lists only the session organization and ignores the other organization's leave", async () => {
    const response = await listEmployees(
      new NextRequest("http://localhost/api/direction/ressources/employes")
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.employees).toHaveLength(1);
    expect(body.employees[0].id).toBe(11);
    expect(body.meta.returnSoonCount).toBe(0);
    expect(JSON.stringify(body)).not.toContain("secret autre organisation");
    expect(JSON.stringify(body)).not.toContain("org-other");
  });

  it("keeps the organization return count when the search matches nobody", async () => {
    chauffeurs[0].id = 11;
    leaves[0].expected_return_date = formatIsoDateLocal(addDaysLocal(new Date(), 3));
    const response = await listEmployees(
      new NextRequest("http://localhost/api/direction/ressources/employes?q=aucun-resultat")
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.employees).toEqual([]);
    expect(body.meta.returnSoonCount).toBe(1);
    leaves[0].expected_return_date = "2026-11-30";
  });

  it("refuses a foreign employee profile, update and delete before any write", async () => {
    const read = await readEmployee(
      new NextRequest("http://localhost/api/direction/ressources/employes/22"),
      { params: Promise.resolve({ id: "22" }) }
    );
    expect(read.status).toBe(404);

    const patch = await patchEmployee(
      new NextRequest("http://localhost/api/direction/ressources/employes/22", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nom: "Transfert" }),
      }),
      { params: Promise.resolve({ id: "22" }) }
    );
    expect(patch.status).toBe(404);

    const removed = await deleteEmployee(
      new NextRequest("http://localhost/api/direction/ressources/employes/22", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "22" }) }
    );
    expect(removed.status).toBe(404);
    expect(client.writes).toEqual([]);
  });

  it("reads the employee of the session organization", async () => {
    const response = await readEmployee(
      new NextRequest("http://localhost/api/direction/ressources/employes/11"),
      { params: Promise.resolve({ id: "11" }) }
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.profile.id).toBe(11);
    expect(body.profile.organization_id).toBe("org-horora");
  });

  it("refuses the list when the session has no organization", async () => {
    session(null);
    const response = await listEmployees(
      new NextRequest("http://localhost/api/direction/ressources/employes")
    );
    expect(response.status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const getAuthenticatedRequestUser = vi.fn();
const hasUserPermission = vi.fn();
const createAdminSupabaseClient = vi.fn();
const fromMock = vi.fn();

vi.mock("@/app/lib/account-requests.server", () => ({
  getAuthenticatedRequestUser,
}));

vi.mock("@/app/lib/auth/permissions", () => ({
  hasUserPermission,
}));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG = "33333333-3333-4333-8333-333333333333";
const OTHER_COMPANY = "44444444-4444-4444-8444-444444444444";
const BASE_ID = "55555555-5555-4555-8555-555555555555";

const BUSINESS = {
  nom: "Bureau Oliem QA",
  adresse: "123 rue Test",
  latitude: 45.5,
  longitude: -73.6,
  rayon_m: 100,
  type_base: "bureau",
};

function directionAuth() {
  return {
    user: { id: "user-direction" },
    role: "direction" as const,
    organizationId: ORG,
  };
}

function jsonRequest(method: string, body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/direction/gps-bases", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("buildGpsBaseTenantWriteFields", () => {
  it("dual-writes serveur compagnie and company_context from the resolved company", async () => {
    const { buildGpsBaseTenantWriteFields } = await import("./route");
    const fields = buildGpsBaseTenantWriteFields({
      actorOrganizationId: ORG,
      company: { id: COMPANY_ID, company_code: "oliem_solutions" },
      clientBody: {
        compagnie: "titan_produits_industriels",
        company_context: "titan_produits_industriels",
        organization_id: OTHER_ORG,
        organization_company_id: OTHER_COMPANY,
      },
    });

    expect(fields.compagnie).toBe("oliem_solutions");
    expect(fields.company_context).toBe("oliem_solutions");
    expect(fields.organization_id).toBe(ORG);
    expect(fields.organization_company_id).toBe(COMPANY_ID);
  });
});

describe("POST /api/direction/gps-bases dual-write", () => {
  let inserted: Record<string, unknown> | null;

  beforeEach(() => {
    vi.resetModules();
    inserted = null;
    getAuthenticatedRequestUser.mockResolvedValue(directionAuth());
    hasUserPermission.mockReturnValue(true);
    createAdminSupabaseClient.mockReturnValue({ from: fromMock });
    fromMock.mockImplementation((table: string) => {
      if (table === "organization_companies") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: COMPANY_ID, company_code: "oliem_solutions" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        insert: (payload: Record<string, unknown>) => {
          inserted = payload;
          return {
            select: () => ({
              single: async () => ({
                data: { id: BASE_ID, ...payload },
                error: null,
              }),
            }),
          };
        },
      };
    });
  });

  it("writes server-derived compagnie, company_context, organization_id and organization_company_id", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      jsonRequest("POST", {
        ...BUSINESS,
        company_context: "oliem_solutions",
        compagnie: "titan_produits_industriels",
        organization_id: OTHER_ORG,
        organization_company_id: OTHER_COMPANY,
      })
    );
    expect(res.status).toBe(200);
    expect(inserted?.compagnie).toBe("oliem_solutions");
    expect(inserted?.company_context).toBe("oliem_solutions");
    expect(inserted?.organization_id).toBe(ORG);
    expect(inserted?.organization_company_id).toBe(COMPANY_ID);
  });

  it("refuses an unauthorized role", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({
      user: { id: "user-employee" },
      role: "employe",
      organizationId: ORG,
    });
    const { POST } = await import("./route");
    const res = await POST(
      jsonRequest("POST", { ...BUSINESS, company_context: "oliem_solutions" })
    );
    expect(res.status).toBe(403);
    expect(inserted).toBeNull();
  });

  it("fail-closes when the company is not in the actor organization", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "organization_companies") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        insert: (payload: Record<string, unknown>) => {
          inserted = payload;
          return {
            select: () => ({
              single: async () => ({ data: payload, error: null }),
            }),
          };
        },
      };
    });
    const { POST } = await import("./route");
    const res = await POST(
      jsonRequest("POST", {
        ...BUSINESS,
        company_context: "titan_produits_industriels",
      })
    );
    expect(res.status).toBe(400);
    expect(inserted).toBeNull();
  });
});

describe("PATCH /api/direction/gps-bases dual-write", () => {
  let updated: Record<string, unknown> | null;

  beforeEach(() => {
    vi.resetModules();
    updated = null;
    getAuthenticatedRequestUser.mockResolvedValue(directionAuth());
    hasUserPermission.mockReturnValue(true);
    createAdminSupabaseClient.mockReturnValue({ from: fromMock });
    fromMock.mockImplementation((table: string) => {
      if (table === "organization_companies") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: COMPANY_ID, company_code: "oliem_solutions" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        update: (payload: Record<string, unknown>) => {
          updated = payload;
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: { id: BASE_ID, ...payload },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      };
    });
  });

  it("dual-writes the same server tenant fields", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      jsonRequest("PATCH", {
        id: BASE_ID,
        ...BUSINESS,
        company_context: "oliem_solutions",
        compagnie: "titan_produits_industriels",
        organization_id: OTHER_ORG,
      })
    );
    expect(res.status).toBe(200);
    expect(updated?.compagnie).toBe("oliem_solutions");
    expect(updated?.company_context).toBe("oliem_solutions");
    expect(updated?.organization_id).toBe(ORG);
    expect(updated?.organization_company_id).toBe(COMPANY_ID);
  });
});

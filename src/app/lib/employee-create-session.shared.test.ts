import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hororaNexusSessionRequestInit } from "@/app/lib/auth/horora-nexus-session.client";
import {
  assessEmployeeCreateSession,
  interpretChauffeurCreateWriteError,
  planChauffeurTenantStamp,
} from "@/app/lib/employee-onboarding-tenant.shared";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

describe("employee create session", () => {
  it("accepts an admin session that already carries an organization", () => {
    expect(
      assessEmployeeCreateSession({
        mfaBlocked: false,
        hasUser: true,
        role: "admin",
        organizationId: ORG_A,
      })
    ).toEqual({
      ok: true,
      role: "admin",
      organizationId: ORG_A,
    });
  });

  it("refuses a missing session", () => {
    expect(
      assessEmployeeCreateSession({
        mfaBlocked: false,
        hasUser: false,
        role: null,
        organizationId: null,
      })
    ).toEqual({
      ok: false,
      status: 403,
      error: "Acces refuse.",
    });
  });

  it("refuses an insufficient role", () => {
    expect(
      assessEmployeeCreateSession({
        mfaBlocked: false,
        hasUser: true,
        role: "employe",
        organizationId: ORG_A,
      })
    ).toEqual({
      ok: false,
      status: 403,
      error: "Acces refuse.",
    });
  });

  it("refuses an authorized role without an organization", () => {
    const session = assessEmployeeCreateSession({
      mfaBlocked: false,
      hasUser: true,
      role: "direction",
      organizationId: "  ",
    });
    const company = planChauffeurTenantStamp({
      serverOrganizationId: null,
      clientOrganizationId: ORG_B,
      requestedPrimaryCompany: "oliem_solutions",
      companies: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          organization_id: ORG_A,
          company_code: "oliem_solutions",
          status: "active",
          is_default: true,
        },
      ],
    });

    expect(session).toEqual({
      ok: false,
      status: 403,
      error: "Membership organisation active requise.",
    });
    expect(company).toMatchObject({
      ok: false,
      code: "organization_membership_required",
    });
  });

  it("keeps the server organization when the browser sends another one", () => {
    const planned = planChauffeurTenantStamp({
      serverOrganizationId: ORG_A,
      clientOrganizationId: ORG_B,
      requestedPrimaryCompany: "oliem_solutions",
      companies: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          organization_id: ORG_A,
          company_code: "oliem_solutions",
          status: "active",
          is_default: true,
        },
      ],
    });

    expect(planned).toMatchObject({
      ok: true,
      organizationId: ORG_A,
      ignoredClientOrganizationId: ORG_B,
    });
  });

  it("classifies a failed employee write without confirming a row", () => {
    expect(interpretChauffeurCreateWriteError("23505")).toEqual({
      status: 409,
      code: "email_already_used",
    });
    expect(interpretChauffeurCreateWriteError(undefined)).toEqual({
      status: 500,
      code: "chauffeur_insert_failed",
    });
  });

  it("sends creation on the Nexus session cookie and not a browser bearer", () => {
    const init = hororaNexusSessionRequestInit({
      method: "POST",
      headers: {
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const source = readFileSync(
      resolve("src/app/direction/ressources/employes/EmployeeProfilePageClient.tsx"),
      "utf8"
    );
    const createCall = source.indexOf('"/api/direction/ressources/employes"');
    const creating = source.slice(Math.max(0, createCall - 400), createCall + 500);
    const route = readFileSync(
      resolve("src/app/lib/employee-onboarding-tenant.server.ts"),
      "utf8"
    );

    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(creating).toContain("hororaNexusSessionRequestInit(");
    expect(creating).not.toContain("access_token");
    expect(route).toContain("assessEmployeeCreateSession(");
  });
});

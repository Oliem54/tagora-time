import { describe, expect, it } from "vitest";
import {
  canAuthGateResolveEmployeeOnboarding,
  EMPLOYEE_ONBOARDING_AUTHORITY,
  isUserMetadataAuthoritativeForOnboarding,
  mergeAppMetadataOrganization,
  planAuthInviteVersusLink,
  planChauffeurTenantStamp,
  planEmployeeMembership,
} from "@/app/lib/employee-onboarding-tenant.shared";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function company(
  partial?: Partial<{
    id: string;
    organization_id: string;
    company_code: string;
    status: string;
    is_default: boolean;
  }>
) {
  return {
    id: COMPANY_A,
    organization_id: ORG_A,
    company_code: "oliem_solutions",
    status: "active",
    is_default: true,
    ...partial,
  };
}

function membership(
  partial?: Partial<{
    id: string;
    organization_id: string;
    user_id: string;
    role: string;
    status: string;
    is_default: boolean;
  }>
) {
  return {
    id: "m1",
    organization_id: ORG_A,
    user_id: USER,
    role: "employe",
    status: "active",
    is_default: true,
    ...partial,
  };
}

describe("employee onboarding tenant stamp", () => {
  it("stamps server organization and ignores browser organization_id", () => {
    const planned = planChauffeurTenantStamp({
      serverOrganizationId: ORG_A,
      clientOrganizationId: ORG_B,
      requestedPrimaryCompany: "oliem_solutions",
      companies: [company()],
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.organizationId).toBe(ORG_A);
    expect(planned.organizationCompanyId).toBe(COMPANY_A);
    expect(planned.primaryCompany).toBe("oliem_solutions");
    expect(planned.ignoredClientOrganizationId).toBe(ORG_B);
  });

  it("remaps an unknown requested company onto the org default", () => {
    const planned = planChauffeurTenantStamp({
      serverOrganizationId: ORG_A,
      requestedPrimaryCompany: "qa_phase4d_lot2",
      companies: [company({ company_code: "qa_phase4d_lot2", is_default: true })],
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.primaryCompany).toBe("qa_phase4d_lot2");
  });

  it("refuses when the chauffeur already belongs to another organization", () => {
    const planned = planChauffeurTenantStamp({
      serverOrganizationId: ORG_A,
      requestedPrimaryCompany: "oliem_solutions",
      companies: [company()],
      chauffeur: {
        organization_id: ORG_B,
        organization_company_id: null,
        primary_company: "oliem_solutions",
        actif: true,
      },
    });
    expect(planned).toMatchObject({ ok: false, code: "cross_tenant_conflict" });
  });

  it("refuses when no server organization is available", () => {
    const planned = planChauffeurTenantStamp({
      serverOrganizationId: null,
      requestedPrimaryCompany: "oliem_solutions",
      companies: [company()],
    });
    expect(planned).toMatchObject({
      ok: false,
      code: "organization_membership_required",
    });
  });
});

describe("employee organization membership", () => {
  it("inserts an active employe membership", () => {
    const planned = planEmployeeMembership({
      authUserId: USER,
      organizationId: ORG_A,
      existingMemberships: [],
    });
    expect(planned).toMatchObject({
      ok: true,
      action: "insert",
      role: "employe",
      status: "active",
      isDefault: true,
    });
  });

  it("is idempotent when membership already exists", () => {
    const planned = planEmployeeMembership({
      authUserId: USER,
      organizationId: ORG_A,
      existingMemberships: [membership()],
    });
    expect(planned).toMatchObject({ ok: true, action: "noop", membershipId: "m1" });
  });

  it("repairs a missing or inactive membership without duplicating", () => {
    const planned = planEmployeeMembership({
      authUserId: USER,
      organizationId: ORG_A,
      existingMemberships: [membership({ status: "invited", is_default: false })],
    });
    expect(planned).toMatchObject({ ok: true, action: "repair", membershipId: "m1" });
  });

  it("refuses a different organization fail-closed", () => {
    const planned = planEmployeeMembership({
      authUserId: USER,
      organizationId: ORG_A,
      existingMemberships: [membership({ organization_id: ORG_B })],
    });
    expect(planned).toMatchObject({
      ok: false,
      code: "cross_tenant_conflict",
      status: 409,
    });
  });

  it("refuses an unauthorized membership role from the client", () => {
    const planned = planEmployeeMembership({
      authUserId: USER,
      organizationId: ORG_A,
      existingMemberships: [],
      requestedMembershipRole: "direction",
    });
    expect(planned).toMatchObject({ ok: false, code: "unauthorized_membership_role" });
  });

  it("does not silently convert a Direction account into employe", () => {
    const planned = planEmployeeMembership({
      authUserId: USER,
      organizationId: ORG_A,
      existingMemberships: [membership({ role: "direction" })],
    });
    expect(planned).toMatchObject({ ok: false, code: "direction_conversion_forbidden" });
  });
});

describe("invite versus link and metadata authority", () => {
  it("treats an existing email as a link conflict on invite", () => {
    expect(
      planAuthInviteVersusLink({ action: "invite", authExistsForEmail: true })
    ).toMatchObject({ ok: false, code: "auth_exists_use_link", status: 409 });
  });

  it("never treats user_metadata as authorization", () => {
    expect(isUserMetadataAuthoritativeForOnboarding()).toBe(false);
    expect(EMPLOYEE_ONBOARDING_AUTHORITY.userMetadataAuthoritative).toBe(false);
    expect(EMPLOYEE_ONBOARDING_AUTHORITY.jwtRole).toBe("app_metadata.role");
    expect(EMPLOYEE_ONBOARDING_AUTHORITY.productionWrites).toBe(false);
  });

  it("keeps permissions in app_metadata and stamps organization_id", () => {
    const merged = mergeAppMetadataOrganization(
      { role: "employe", permissions: ["terrain"], full_name: "QA" },
      ORG_A
    );
    expect(merged.role).toBe("employe");
    expect(merged.permissions).toEqual(["terrain"]);
    expect(merged.organization_id).toBe(ORG_A);
    expect(merged.access_disabled).toBe(false);
  });
});

describe("AuthGate after onboarding", () => {
  it("resolves a new employe membership into the employee area only", () => {
    const resolved = canAuthGateResolveEmployeeOnboarding({
      memberships: [membership()],
      jwtAppRole: "employe",
    });
    expect(resolved).toMatchObject({
      authorized: true,
      appRole: "employe",
      source: "membership",
      employeeAreaAllowed: true,
      directionAreaAllowed: false,
    });
  });

  it("does not authorize AuthGate without membership even if JWT has a role", () => {
    const resolved = canAuthGateResolveEmployeeOnboarding({
      memberships: [],
      jwtAppRole: "employe",
    });
    expect(resolved.authorized).toBe(false);
    expect(resolved.employeeAreaAllowed).toBe(false);
  });
});

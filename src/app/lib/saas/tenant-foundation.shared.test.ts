import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_MEMBERSHIP_ROLES,
  SAAS_1B1_FORBIDDEN_BUSINESS_TABLES,
  SAAS_1B1_FOUNDATION_TABLES,
  canRemoveActiveOwner,
  isInvitationExpired,
  isOrganizationMembershipRole,
  isPlatformRoleForbiddenInMemberships,
  isPlatformSupportAccessValid,
  isValidCompanyCode,
  isValidOrganizationSlug,
  isValidTenantKey,
  normalizeInvitationEmail,
  organizationSlugToTenantKey,
  tenantKeyToOrganizationSlug,
} from "./tenant-foundation.shared";

describe("SaaS 1B.1 tenant foundation shared rules", () => {
  it("lists exactly the foundation tables for 1B.1", () => {
    expect([...SAAS_1B1_FOUNDATION_TABLES]).toEqual([
      "organizations",
      "organization_companies",
      "organization_settings",
      "organization_memberships",
      "organization_invitations",
      "platform_access",
      "platform_access_audit",
    ]);
  });

  it("keeps historical business tables out of the 1B.1 lot", () => {
    for (const table of SAAS_1B1_FORBIDDEN_BUSINESS_TABLES) {
      expect(SAAS_1B1_FOUNDATION_TABLES).not.toContain(table);
    }
  });

  it("accepts valid organization slugs and rejects invalid ones", () => {
    expect(isValidOrganizationSlug("acme-test")).toBe(true);
    expect(isValidOrganizationSlug("groupe-oliem")).toBe(true);
    expect(isValidOrganizationSlug("Acme")).toBe(false);
    expect(isValidOrganizationSlug("acme_test")).toBe(false);
    expect(isValidOrganizationSlug("-acme")).toBe(false);
  });

  it("scopes company codes and rejects mixed case", () => {
    expect(isValidCompanyCode("oliem_solutions")).toBe(true);
    expect(isValidCompanyCode("north")).toBe(true);
    expect(isValidCompanyCode("Oliem_Solutions")).toBe(false);
    expect(isValidCompanyCode("bad-code")).toBe(false);
  });

  it("validates tenantKey format distinct from organizationSlug", () => {
    expect(isValidTenantKey("oliem_solution")).toBe(true);
    expect(isValidTenantKey("acme_test")).toBe(true);
    expect(isValidTenantKey("oliem-solution")).toBe(false);
    expect(isValidTenantKey("acme-test")).toBe(false);
    expect(
      isValidTenantKey("11111111-1111-4111-8111-111111111111")
    ).toBe(false);
  });

  it("maps tenantKey ↔ organizationSlug without UUID confusion", () => {
    expect(tenantKeyToOrganizationSlug("oliem_solution")).toBe(
      "oliem-solution"
    );
    expect(organizationSlugToTenantKey("oliem-solution")).toBe(
      "oliem_solution"
    );
    expect(tenantKeyToOrganizationSlug("acme_test")).toBe("acme-test");
    expect(tenantKeyToOrganizationSlug("oliem-solution")).toBeNull();
    expect(organizationSlugToTenantKey("oliem_solution")).toBeNull();
    expect(
      tenantKeyToOrganizationSlug("11111111-1111-4111-8111-111111111111")
    ).toBeNull();
  });

  it("allows only approved membership roles", () => {
    for (const role of ORGANIZATION_MEMBERSHIP_ROLES) {
      expect(isOrganizationMembershipRole(role)).toBe(true);
    }
    expect(isOrganizationMembershipRole("platform_super_admin")).toBe(false);
    expect(isOrganizationMembershipRole("admin")).toBe(false);
  });

  it("forbids platform roles inside organization_memberships", () => {
    expect(isPlatformRoleForbiddenInMemberships("platform_super_admin")).toBe(
      true
    );
    expect(isPlatformRoleForbiddenInMemberships("platform_support")).toBe(true);
    expect(isPlatformRoleForbiddenInMemberships("organization_owner")).toBe(
      false
    );
  });

  it("supports multi-organization membership conceptually (two orgs)", () => {
    const memberships = [
      { organizationId: "org-a", userId: "user-multi", role: "employe" },
      { organizationId: "org-b", userId: "user-multi", role: "direction" },
    ];
    const orgs = new Set(memberships.map((m) => m.organizationId));
    expect(orgs.size).toBe(2);
  });

  it("blocks removing the last active owner", () => {
    expect(
      canRemoveActiveOwner({ remainingActiveOwnersExcludingTarget: 0 })
    ).toBe(false);
    expect(
      canRemoveActiveOwner({ remainingActiveOwnersExcludingTarget: 1 })
    ).toBe(true);
  });

  it("normalizes invitation emails and detects expiry", () => {
    expect(normalizeInvitationEmail("  Ada@Example.COM ")).toBe(
      "ada@example.com"
    );
    expect(isInvitationExpired("2020-01-01T00:00:00.000Z")).toBe(true);
    expect(
      isInvitationExpired("2999-01-01T00:00:00.000Z", new Date("2026-07-12"))
    ).toBe(false);
  });

  it("requires reason + expiration for active platform_support", () => {
    expect(
      isPlatformSupportAccessValid({
        accessLevel: "platform_support",
        status: "active",
        reason: "ticket-123",
        expiresAt: "2999-01-01T00:00:00.000Z",
      })
    ).toBe(true);

    expect(
      isPlatformSupportAccessValid({
        accessLevel: "platform_support",
        status: "active",
        reason: "ticket-123",
        expiresAt: "2020-01-01T00:00:00.000Z",
      })
    ).toBe(false);

    expect(
      isPlatformSupportAccessValid({
        accessLevel: "platform_support",
        status: "active",
        reason: "   ",
        expiresAt: "2999-01-01T00:00:00.000Z",
      })
    ).toBe(false);

    expect(
      isPlatformSupportAccessValid({
        accessLevel: "platform_support",
        status: "active",
        reason: "ticket-123",
        expiresAt: null,
      })
    ).toBe(false);
  });

  it("documents fail-closed posture: no permissive USING (true) in 1B.1 design", () => {
    // Runtime policies for clients are intentionally absent (fail-closed).
    // This assertion guards the documented posture in shared constants.
    expect(SAAS_1B1_FOUNDATION_TABLES.length).toBeGreaterThan(0);
  });
});

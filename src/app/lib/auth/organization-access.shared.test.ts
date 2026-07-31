import { describe, expect, it } from "vitest";
import {
  isActiveMembershipInActiveOrganization,
  normalizeOrganizationUuid,
  rejectsGrantIdentityRetarget,
  rejectsTextTenantAuthority,
  resolveObjectiveWriteOrganizationId,
  resolveRequestedOrganizationId,
  resolveSingleMembershipOrganizationPreselect,
} from "@/app/lib/auth/organization-access.shared";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

describe("organization-access.shared", () => {
  it("normalizes valid UUID and rejects invalid", () => {
    expect(normalizeOrganizationUuid(` ${ORG_A.toUpperCase()} `)).toBe(ORG_A);
    expect(normalizeOrganizationUuid("not-a-uuid")).toBeNull();
    expect(normalizeOrganizationUuid("oliem_solutions")).toBeNull();
  });

  it("resolveRequestedOrganizationId refuses missing/invalid UUID", () => {
    expect(
      resolveRequestedOrganizationId({
        requestedOrganizationId: null,
        memberships: [{ organizationId: ORG_A }],
      }).ok
    ).toBe(false);
    expect(
      resolveRequestedOrganizationId({
        requestedOrganizationId: "oliem_solutions",
        memberships: [{ organizationId: ORG_A }],
      })
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("resolveRequestedOrganizationId refuses membership outside list", () => {
    expect(
      resolveRequestedOrganizationId({
        requestedOrganizationId: ORG_B,
        memberships: [{ organizationId: ORG_A }],
      })
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("never auto-selects first membership when several exist", () => {
    expect(
      resolveSingleMembershipOrganizationPreselect([
        { organizationId: ORG_A },
        { organizationId: ORG_B },
      ])
    ).toBe("");
  });

  it("may preselect only when exactly one membership exists", () => {
    expect(
      resolveSingleMembershipOrganizationPreselect([{ organizationId: ORG_A }])
    ).toBe(ORG_A);
  });

  it("personal objective uses chauffeur organization_id", () => {
    expect(
      resolveObjectiveWriteOrganizationId({
        chauffeurId: 12,
        chauffeurOrganizationId: ORG_A,
        requestedOrganizationId: null,
      })
    ).toEqual({ ok: true, organizationId: ORG_A, mode: "personal" });
  });

  it("personal objective refuses contradictory organization_id", () => {
    expect(
      resolveObjectiveWriteOrganizationId({
        chauffeurId: 12,
        chauffeurOrganizationId: ORG_A,
        requestedOrganizationId: ORG_B,
      })
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("team objective requires organization_id UUID", () => {
    expect(
      resolveObjectiveWriteOrganizationId({
        chauffeurId: null,
        chauffeurOrganizationId: null,
        requestedOrganizationId: null,
      })
    ).toMatchObject({ ok: false, status: 400 });

    expect(
      resolveObjectiveWriteOrganizationId({
        chauffeurId: null,
        chauffeurOrganizationId: null,
        requestedOrganizationId: ORG_A,
      })
    ).toEqual({ ok: true, organizationId: ORG_A, mode: "team" });
  });

  it("rejects text tenant authorities in body", () => {
    expect(rejectsTextTenantAuthority({ company_context: "oliem_solutions" })).toBe(
      true
    );
    expect(rejectsTextTenantAuthority({ primary_company: "oliem_solutions" })).toBe(
      true
    );
    expect(rejectsTextTenantAuthority({ user_metadata: {} })).toBe(true);
    expect(rejectsTextTenantAuthority({ organization_id: ORG_A })).toBe(false);
  });

  it("accepts only active membership in active non-deleted organization", () => {
    expect(
      isActiveMembershipInActiveOrganization({
        membershipStatus: "active",
        organizationStatus: "active",
        organizationDeletedAt: null,
      })
    ).toBe(true);
    expect(
      isActiveMembershipInActiveOrganization({
        membershipStatus: "suspended",
        organizationStatus: "active",
        organizationDeletedAt: null,
      })
    ).toBe(false);
    expect(
      isActiveMembershipInActiveOrganization({
        membershipStatus: "invited",
        organizationStatus: "active",
        organizationDeletedAt: null,
      })
    ).toBe(false);
    expect(
      isActiveMembershipInActiveOrganization({
        membershipStatus: "active",
        organizationStatus: "suspended",
        organizationDeletedAt: null,
      })
    ).toBe(false);
    expect(
      isActiveMembershipInActiveOrganization({
        membershipStatus: "active",
        organizationStatus: "active",
        organizationDeletedAt: "2026-07-01T00:00:00Z",
      })
    ).toBe(false);
  });

  it("rejects grant identity retarget fields on PATCH", () => {
    expect(rejectsGrantIdentityRetarget({ owner_chauffeur_id: 1 })).toBe(true);
    expect(rejectsGrantIdentityRetarget({ viewer_user_id: "u1" })).toBe(true);
    expect(rejectsGrantIdentityRetarget({ notes: "ok" })).toBe(false);
  });
});

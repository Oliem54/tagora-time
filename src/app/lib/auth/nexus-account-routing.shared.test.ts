import { describe, expect, it } from "vitest";
import {
  classifyHororaModuleEntitlement,
  classifyNexusIdentityType,
  nexusEntryRoleDoesNotAuthorizeHororaDestination,
  resolveHororaDestinationFromMembershipRole,
} from "@/app/lib/auth/nexus-account-routing.shared";

describe("Nexus vs HORORA account types", () => {
  it("keeps Nexus identity, module entitlement, and HORORA membership separate", () => {
    expect(classifyNexusIdentityType("NEXUS_ENTRY_OPERATOR")).toBe("administrateur_interne");
    expect(classifyNexusIdentityType("NEXUS_ENTRY_MEMBER")).toBe("utilisateur_interne");
    expect(classifyNexusIdentityType("direction")).toBe("unclassified");
    expect(classifyNexusIdentityType("employe")).toBe("unclassified");
    expect(classifyHororaModuleEntitlement(true)).toBe("active");
    expect(classifyHororaModuleEntitlement(false)).toBe("refused");
    expect(nexusEntryRoleDoesNotAuthorizeHororaDestination("NEXUS_ENTRY_MEMBER")).toBe(true);
    expect(nexusEntryRoleDoesNotAuthorizeHororaDestination("NEXUS_ENTRY_OPERATOR")).toBe(true);
  });

  it("routes from organization_memberships.role only", () => {
    expect(resolveHororaDestinationFromMembershipRole("organization_owner")).toEqual({
      ok: true,
      appRole: "admin",
      path: "/admin/dashboard",
    });
    expect(resolveHororaDestinationFromMembershipRole("organization_admin")).toEqual({
      ok: true,
      appRole: "admin",
      path: "/admin/dashboard",
    });
    expect(resolveHororaDestinationFromMembershipRole("direction")).toEqual({
      ok: true,
      appRole: "direction",
      path: "/direction/dashboard",
    });
    expect(resolveHororaDestinationFromMembershipRole("employe")).toEqual({
      ok: true,
      appRole: "employe",
      path: "/employe/dashboard",
    });
  });

  it("refuses missing and unrecognized roles without choosing employe", () => {
    expect(resolveHororaDestinationFromMembershipRole(null)).toEqual({
      ok: false,
      reason: "membership_missing",
    });
    expect(resolveHororaDestinationFromMembershipRole("")).toEqual({
      ok: false,
      reason: "membership_missing",
    });
    expect(resolveHororaDestinationFromMembershipRole("admin")).toEqual({
      ok: false,
      reason: "role_mapping_denied",
    });
    expect(resolveHororaDestinationFromMembershipRole("NEXUS_ENTRY_MEMBER")).toEqual({
      ok: false,
      reason: "role_mapping_denied",
    });
  });
});

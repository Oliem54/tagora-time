import { describe, expect, it } from "vitest";
import {
  appRoleMatchesArea,
  mapOrganizationMembershipRoleToAppRole,
  resolveEffectiveAppRole,
} from "@/app/lib/auth/organization-role-mapping.shared";
import { selectActiveMembershipRow } from "@/app/lib/saas/organization-membership.shared";

describe("organization role mapping (H4 → AppRole)", () => {
  it("maps H4 roles to AppRole", () => {
    expect(mapOrganizationMembershipRoleToAppRole("organization_owner")).toBe(
      "admin"
    );
    expect(mapOrganizationMembershipRoleToAppRole("organization_admin")).toBe(
      "admin"
    );
    expect(mapOrganizationMembershipRoleToAppRole("direction")).toBe("direction");
    expect(mapOrganizationMembershipRoleToAppRole("employe")).toBe("employe");
    expect(mapOrganizationMembershipRoleToAppRole("none")).toBeNull();
    expect(mapOrganizationMembershipRoleToAppRole("admin")).toBeNull();
  });

  it("enforces area hierarchy owner/admin ≥ direction ≥ employe", () => {
    expect(appRoleMatchesArea("employe", "employe")).toBe(true);
    expect(appRoleMatchesArea("employe", "direction")).toBe(true);
    expect(appRoleMatchesArea("employe", "admin")).toBe(true);
    expect(appRoleMatchesArea("direction", "employe")).toBe(false);
    expect(appRoleMatchesArea("direction", "direction")).toBe(true);
    expect(appRoleMatchesArea("direction", "admin")).toBe(true);
    expect(appRoleMatchesArea("admin", "employe")).toBe(false);
    expect(appRoleMatchesArea("admin", "direction")).toBe(false);
    expect(appRoleMatchesArea("admin", "admin")).toBe(true);
  });

  it("prefers membership role over JWT for display dual-read helper", () => {
    expect(
      resolveEffectiveAppRole({
        membershipAppRole: "employe",
        jwtAppRole: null,
      })
    ).toEqual({ appRole: "employe", source: "membership" });
    expect(
      resolveEffectiveAppRole({
        membershipAppRole: "employe",
        jwtAppRole: "admin",
      })
    ).toEqual({ appRole: "employe", source: "membership" });
    expect(
      resolveEffectiveAppRole({
        membershipAppRole: null,
        jwtAppRole: "admin",
      })
    ).toEqual({ appRole: "admin", source: "jwt_fallback" });
    expect(
      resolveEffectiveAppRole({
        membershipAppRole: null,
        jwtAppRole: null,
      })
    ).toEqual({ appRole: null, source: "none" });
  });
});

describe("selectActiveMembershipRow", () => {
  const base = {
    organization_id: "11111111-1111-4111-8111-111111111111",
    role: "employe",
  };

  it("prefers is_default active membership", () => {
    const selected = selectActiveMembershipRow(
      [
        {
          id: "a",
          ...base,
          status: "active",
          is_default: false,
        },
        {
          id: "b",
          ...base,
          status: "active",
          is_default: true,
        },
      ],
      "strict"
    );
    expect(selected).toEqual({
      kind: "ok",
      row: expect.objectContaining({ id: "b", is_default: true }),
    });
  });

  it("uses the only active membership when no default", () => {
    const selected = selectActiveMembershipRow(
      [
        {
          id: "a",
          ...base,
          status: "suspended",
          is_default: false,
        },
        {
          id: "b",
          ...base,
          status: "active",
          is_default: false,
        },
      ],
      "strict"
    );
    expect(selected.kind).toBe("ok");
    if (selected.kind === "ok") {
      expect(selected.row.id).toBe("b");
    }
  });

  it("refuses ambiguous active memberships without default in strict mode", () => {
    const selected = selectActiveMembershipRow(
      [
        {
          id: "a",
          ...base,
          status: "active",
          is_default: false,
        },
        {
          id: "b",
          ...base,
          role: "direction",
          status: "active",
          is_default: false,
        },
      ],
      "strict"
    );
    expect(selected).toEqual({ kind: "ambiguous" });
  });

  it("reports inactive when only suspended memberships exist", () => {
    const selected = selectActiveMembershipRow(
      [
        {
          id: "a",
          ...base,
          status: "suspended",
          is_default: true,
        },
      ],
      "strict"
    );
    expect(selected).toEqual({ kind: "inactive" });
  });

  it("reports absent when no memberships", () => {
    expect(selectActiveMembershipRow([], "strict")).toEqual({ kind: "absent" });
  });
});

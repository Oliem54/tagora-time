import { describe, expect, it } from "vitest";
import type { NexusHandoffClaims } from "@/app/lib/auth/nexus-handoff";
import {
  DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
  NEXUS_TECHNICAL_MODULE_KEY,
} from "@/app/lib/auth/nexus-handoff-config";
import {
  resolveAuthorizedMappingTarget,
  resolveNexusHororaBinding,
  type NexusMappingLookups,
} from "@/app/lib/auth/nexus-identity-mapping.server";
import type { MembershipRow } from "@/app/lib/saas/organization-membership.shared";

const AUTH_USER = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG = "55555555-5555-4555-8555-555555555555";

const CLAIMS: NexusHandoffClaims = {
  sub: "actor-1",
  jti: "jti-1",
  nonce: "nonce-1",
  iat: 1,
  nbf: 1,
  exp: 2,
  user_id: "actor-1",
  organization_id: "nexus-org-1",
  membership_id: "mem-1",
  tenant_id: "tenant-1",
  module_key: NEXUS_TECHNICAL_MODULE_KEY,
  handoff_id: "h1",
  grant_id: "g1",
  grant_version: "1",
};

function membership(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return {
    id: MEMBERSHIP_ID,
    organization_id: ORG_ID,
    role: "organization_admin",
    status: "active",
    is_default: true,
    ...overrides,
  };
}

function lookups(overrides: Partial<NexusMappingLookups> = {}): NexusMappingLookups {
  return {
    async findIdentityMaps() {
      return [
        {
          nexus_actor_id: "actor-1",
          auth_user_id: AUTH_USER,
          disabled_at: null,
        },
      ];
    },
    async authUserExists() {
      return true;
    },
    async findMembershipsForUser() {
      return [membership()];
    },
    async findOrganizationMaps() {
      return [
        {
          nexus_organization_id: "nexus-org-1",
          organization_id: ORG_ID,
          status: "active",
        },
      ];
    },
    async findOrganization() {
      return { id: ORG_ID, status: "active", deleted_at: null };
    },
    ...overrides,
  };
}

describe("Nexus HORORA identity mapping", () => {
  it("resolves a unique active mapping from membership AppRole", async () => {
    const result = await resolveNexusHororaBinding(CLAIMS, lookups());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.binding.role).toBe("admin");
      expect(result.binding.authUserId).toBe(AUTH_USER);
      expect(result.binding.organizationId).toBe(ORG_ID);
      expect(result.binding.membershipId).toBe(MEMBERSHIP_ID);
    }
  });

  it("maps employe and direction memberships to dashboard roles", async () => {
    const employe = await resolveNexusHororaBinding(
      CLAIMS,
      lookups({
        async findMembershipsForUser() {
          return [membership({ role: "employe" })];
        },
      })
    );
    expect(employe.ok).toBe(true);
    if (employe.ok) expect(employe.binding.role).toBe("employe");

    const direction = await resolveNexusHororaBinding(
      CLAIMS,
      lookups({
        async findMembershipsForUser() {
          return [membership({ role: "direction" })];
        },
      })
    );
    expect(direction.ok).toBe(true);
    if (direction.ok) expect(direction.binding.role).toBe("direction");
  });

  it("denies an absent actor mapping", async () => {
    await expect(
      resolveNexusHororaBinding(
        CLAIMS,
        lookups({
          async findIdentityMaps() {
            return [];
          },
        })
      )
    ).resolves.toEqual({ ok: false, reason: "mapping_absent" });
  });

  it("denies an ambiguous actor mapping", async () => {
    await expect(
      resolveNexusHororaBinding(
        CLAIMS,
        lookups({
          async findIdentityMaps() {
            const row = {
              nexus_actor_id: "actor-1",
              auth_user_id: AUTH_USER,
              disabled_at: null,
            };
            return [row, { ...row, auth_user_id: "66666666-6666-4666-8666-666666666666" }];
          },
        })
      )
    ).resolves.toEqual({ ok: false, reason: "mapping_ambiguous" });
  });

  it("denies unmatched, duplicate org maps, inactive org, and cross-tenant", async () => {
    await expect(
      resolveNexusHororaBinding(
        CLAIMS,
        lookups({
          async findOrganizationMaps() {
            return [];
          },
        })
      )
    ).resolves.toEqual({ ok: false, reason: "organization_mapping_absent" });

    await expect(
      resolveNexusHororaBinding(
        CLAIMS,
        lookups({
          async findOrganizationMaps() {
            const row = {
              nexus_organization_id: "nexus-org-1",
              organization_id: ORG_ID,
              status: "active" as const,
            };
            return [row, { ...row, organization_id: OTHER_ORG }];
          },
        })
      )
    ).resolves.toEqual({ ok: false, reason: "organization_mapping_ambiguous" });

    await expect(
      resolveNexusHororaBinding(
        CLAIMS,
        lookups({
          async findOrganization() {
            return { id: ORG_ID, status: "suspended", deleted_at: null };
          },
        })
      )
    ).resolves.toEqual({ ok: false, reason: "organization_inactive" });

    await expect(
      resolveNexusHororaBinding(
        CLAIMS,
        lookups({
          async findMembershipsForUser() {
            return [membership({ organization_id: OTHER_ORG })];
          },
        })
      )
    ).resolves.toEqual({ ok: false, reason: "cross_tenant" });
  });

  it("denies ambiguous memberships in the mapped org", async () => {
    await expect(
      resolveNexusHororaBinding(
        CLAIMS,
        lookups({
          async findMembershipsForUser() {
            return [
              membership({ id: MEMBERSHIP_ID, is_default: false, role: "employe" }),
              membership({
                id: "77777777-7777-4777-8777-777777777777",
                is_default: false,
                role: "direction",
              }),
            ];
          },
        })
      )
    ).resolves.toEqual({ ok: false, reason: "membership_ambiguous" });
  });

  it("denies an absent Auth user", async () => {
    await expect(
      resolveNexusHororaBinding(
        CLAIMS,
        lookups({
          async authUserExists() {
            return false;
          },
        })
      )
    ).resolves.toEqual({ ok: false, reason: "auth_user_missing" });
  });

  it("inserts env-authorized maps only for an existing member", async () => {
    const identity: Array<{ nexus_actor_id: string; auth_user_id: string; disabled_at: null }> = [];
    const orgs: Array<{ nexus_organization_id: string; organization_id: string; status: string }> =
      [];
    const env = {
      HORORA_NEXUS_ACTOR_ID: "actor-1",
      HORORA_AUTH_USER_ID: AUTH_USER,
      HORORA_NEXUS_ORGANIZATION_ID: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
      HORORA_ORGANIZATION_ID: ORG_ID,
    };
    const claims = { ...CLAIMS, organization_id: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID };
    const result = await resolveNexusHororaBinding(
      claims,
      lookups({
        async findIdentityMaps() {
          return identity;
        },
        async findOrganizationMaps() {
          return orgs;
        },
        async insertIdentityMap(row) {
          identity.push({ ...row, disabled_at: null });
          return { duplicate: false };
        },
        async insertOrganizationMap(row) {
          orgs.push({ ...row, status: "active" });
          return { duplicate: false };
        },
      }),
      env
    );
    expect(result.ok).toBe(true);
    expect(identity).toHaveLength(1);
    expect(orgs).toHaveLength(1);
  });

  it("inserts env-authorized maps when only the existing HORORA user is configured", async () => {
    const identity: Array<{ nexus_actor_id: string; auth_user_id: string; disabled_at: null }> = [];
    const orgs: Array<{ nexus_organization_id: string; organization_id: string; status: string }> =
      [];
    const env = {
      HORORA_AUTH_USER_ID: AUTH_USER,
      HORORA_ORGANIZATION_ID: ORG_ID,
    };
    const claims = { ...CLAIMS, organization_id: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID };
    const result = await resolveNexusHororaBinding(
      claims,
      lookups({
        async findIdentityMaps() {
          return identity;
        },
        async findOrganizationMaps() {
          return orgs;
        },
        async insertIdentityMap(row) {
          identity.push({ ...row, disabled_at: null });
          return { duplicate: false };
        },
        async insertOrganizationMap(row) {
          orgs.push({ ...row, status: "active" });
          return { duplicate: false };
        },
      }),
      env
    );
    expect(result.ok).toBe(true);
    expect(identity).toEqual([
      { nexus_actor_id: CLAIMS.user_id, auth_user_id: AUTH_USER, disabled_at: null },
    ]);
  });

  it("does not env-insert when the actor is not authorized", async () => {
    let inserted = false;
    await expect(
      resolveNexusHororaBinding(
        CLAIMS,
        lookups({
          async findIdentityMaps() {
            return [];
          },
          async insertIdentityMap() {
            inserted = true;
            return { duplicate: false };
          },
        }),
        {
          HORORA_NEXUS_ACTOR_ID: "someone-else",
          HORORA_AUTH_USER_ID: AUTH_USER,
          HORORA_ORGANIZATION_ID: ORG_ID,
        }
      )
    ).resolves.toEqual({ ok: false, reason: "mapping_absent" });
    expect(inserted).toBe(false);
  });

  it("does not search by email or treat user_metadata as authority", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/app/lib/auth/nexus-identity-mapping.server.ts", "utf8")
    );
    expect(source).not.toMatch(/email_normalized|getUserByEmail|findUserByNormalizedEmail/);
    expect(source).not.toMatch(/\.user_metadata\b/);
    expect(source).not.toContain("createUser");
  });

  it("reads authorized mapping from env without baking UUIDs", () => {
    expect(
      resolveAuthorizedMappingTarget("actor-1", {
        HORORA_NEXUS_ACTOR_ID: "actor-1",
        HORORA_AUTH_USER_ID: AUTH_USER,
        HORORA_ORGANIZATION_ID: ORG_ID,
      })
    ).toEqual({
      authUserId: AUTH_USER,
      organizationId: ORG_ID,
      nexusOrganizationId: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
    });
    expect(
      resolveAuthorizedMappingTarget("nuser_martin_staging", {
        HORORA_AUTH_USER_ID: AUTH_USER,
        HORORA_ORGANIZATION_ID: ORG_ID,
      })
    ).toEqual({
      authUserId: AUTH_USER,
      organizationId: ORG_ID,
      nexusOrganizationId: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
    });
    const mappingSource = import.meta.url;
    expect(mappingSource).not.toContain("HORORA_AUTH_USER_ID=");
  });
});

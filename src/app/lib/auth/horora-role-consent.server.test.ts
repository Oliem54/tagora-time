import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  HORORA_ROLE_CATALOG_VERSION,
  HORORA_ROLE_CONTRACT_VERSION,
  createMemoryHororaRoleAcknowledgementStore,
  handleHororaRoleAssignmentPost,
  handleHororaRoleCatalogGet,
  hororaRoleCatalog,
  type HororaRoleAcknowledgementStore,
  type HororaRoleConsentVerifier,
} from "@/app/lib/auth/horora-role-consent.server";
import {
  HORORA_ROLE_ASSIGNMENT_AUDIENCE,
  HORORA_ROLE_CATALOG_AUDIENCE,
  HORORA_ROLE_CONSENT_TYP,
  type HororaRoleConsentClaims,
} from "@/app/lib/auth/horora-role-consent-token.server";
import { FORBIDDEN_NEXUS_AUTHORITY_CLAIMS } from "@/app/lib/auth/nexus-handoff-config";
import type { NexusMappingLookups } from "@/app/lib/auth/nexus-identity-mapping.server";
import type { MembershipRow } from "@/app/lib/saas/organization-membership.shared";

const ADMIN = "nuser_admin_fixture";
const TARGET = "nuser_consent_fixture";
const NEXUS_ORG = "org_consent_fixture";
const AUTH_USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP = "33333333-3333-4333-8333-333333333333";
const TOKEN = "header.payload.signature";
const NOW = new Date("2026-10-09T18:00:00.000Z");

function consentClaims(
  audience: HororaRoleConsentClaims["audience"] = HORORA_ROLE_ASSIGNMENT_AUDIENCE,
  overrides: Partial<HororaRoleConsentClaims> = {}
): HororaRoleConsentClaims {
  const assignment =
    audience === HORORA_ROLE_CATALOG_AUDIENCE
      ? null
      : {
          moduleKey: "tagora_time" as const,
          userModuleAccessId: "uma_consent",
          moduleRoleAssignmentId: "mra_consent",
          roleKey: "employe",
          assignmentVersion: 1,
          catalogVersion: HORORA_ROLE_CATALOG_VERSION,
          operation: "ASSIGN" as const,
          previousRoleKey: null,
        };
  return {
    typ: HORORA_ROLE_CONSENT_TYP,
    issuer: "https://nexus-handoff.test",
    audience,
    adminUserId: ADMIN,
    targetUserId: TARGET,
    moduleKey: "tagora_time",
    organizationId: NEXUS_ORG,
    tenantId: "tenant-consent",
    environment: "local",
    operationId: "operation-consent-1",
    iat: 1,
    nbf: 1,
    exp: 2,
    assignment,
    ...overrides,
  };
}

function verifyClaims(claims: HororaRoleConsentClaims): HororaRoleConsentVerifier {
  return async (token) => {
    if (!token?.trim()) return { ok: false, reason: "missing_token" };
    return { ok: true, claims };
  };
}

function membership(role: string, status = "active"): MembershipRow {
  return {
    id: MEMBERSHIP,
    organization_id: ORG,
    role,
    status,
    is_default: true,
  };
}

function lookups(
  row: MembershipRow | null = membership("employe"),
  options: { mapTenant?: string | null } = {}
): NexusMappingLookups & {
  calls: string[];
} {
  const mapTenant = "mapTenant" in options ? options.mapTenant : "tenant-consent";
  const calls: string[] = [];
  return {
    calls,
    async findIdentityMaps(nexusActorId) {
      calls.push(`identity:${nexusActorId}`);
      if (nexusActorId !== TARGET) return [];
      return [
        {
          nexus_actor_id: TARGET,
          auth_user_id: AUTH_USER,
          disabled_at: null,
        },
      ];
    },
    async authUserExists() {
      calls.push("auth");
      return true;
    },
    async findMembershipsForUser(authUserId) {
      calls.push(`memberships:${authUserId}`);
      return row ? [row] : [];
    },
    async findOrganizationMaps(nexusOrganizationId) {
      calls.push(`org-map:${nexusOrganizationId}`);
      if (nexusOrganizationId !== NEXUS_ORG) return [];
      return [
        {
          nexus_organization_id: NEXUS_ORG,
          nexus_tenant_id: mapTenant ?? null,
          organization_id: ORG,
          status: "active",
        },
      ];
    },
    async findOrganization() {
      calls.push("organization");
      return { id: ORG, status: "active", deleted_at: null };
    },
  };
}

describe("horora role consent contract", () => {
  it("publishes the catalog only for the catalog audience", async () => {
    const result = await handleHororaRoleCatalogGet({
      token: TOKEN,
      verify: verifyClaims(consentClaims(HORORA_ROLE_CATALOG_AUDIENCE)),
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual(hororaRoleCatalog());
    const catalog = hororaRoleCatalog();
    expect(catalog.contractVersion).toBe(HORORA_ROLE_CONTRACT_VERSION);
    expect(catalog.roleModel).toBe("REQUIRED_SINGLE");
    expect(catalog.roles.map((role) => role.roleKey)).toEqual(["employe", "direction"]);
  });

  it("refuses a catalog token on the assignment route and the reverse", async () => {
    const catalogOnAssignment = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims(consentClaims(HORORA_ROLE_CATALOG_AUDIENCE)),
      lookups: lookups(),
      store: createMemoryHororaRoleAcknowledgementStore(),
      now: () => NOW,
      createId: () => "ack_crossed",
    });
    expect(catalogOnAssignment.status).toBe(401);
    expect(catalogOnAssignment.body).toEqual({ ok: false, reason: "invalid_audience" });

    const assignmentOnCatalog = await handleHororaRoleCatalogGet({
      token: TOKEN,
      verify: verifyClaims(consentClaims(HORORA_ROLE_ASSIGNMENT_AUDIENCE)),
    });
    expect(assignmentOnCatalog.status).toBe(401);
    expect(assignmentOnCatalog.body).toEqual({ ok: false, reason: "invalid_audience" });
  });

  it("refuses a user handoff before any membership lookup", async () => {
    const ports = lookups();
    const store = createMemoryHororaRoleAcknowledgementStore();
    const verify: HororaRoleConsentVerifier = async () => ({
      ok: false,
      reason: "handoff_refused",
    });
    const result = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify,
      lookups: ports,
      store,
      now: () => NOW,
      createId: () => "ack_handoff",
    });
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ ok: false, reason: "handoff_refused" });
    expect(ports.calls).toEqual([]);
    expect(store.rows()).toHaveLength(0);
  });

  it("reads the target membership and ignores the admin and the browser", async () => {
    const store = createMemoryHororaRoleAcknowledgementStore();
    const ports = lookups();
    const result = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims(consentClaims()),
      lookups: ports,
      store,
      now: () => NOW,
      createId: () => "ack_real_1",
    });
    expect(result.body).toEqual({
      ok: true,
      status: "ACCEPTED",
      moduleAcknowledgementId: "ack_real_1",
      timestamp: NOW.toISOString(),
    });
    expect(ports.calls).toContain(`identity:${TARGET}`);
    expect(ports.calls).not.toContain(`identity:${ADMIN}`);
    expect(store.rows()[0]?.adminUserId).toBe(ADMIN);
    expect(store.rows()[0]?.nexusActorId).toBe(TARGET);
    expect(store.rows()[0]?.nexusTenantId).toBe("tenant-consent");
    expect(store.rows()[0]?.roleKey).toBe("employe");
    expect(membership("employe")).toEqual({
      id: MEMBERSHIP,
      organization_id: ORG,
      role: "employe",
      status: "active",
      is_default: true,
    });
  });

  it("refuses browser actor, target, organization, and role substitutes", async () => {
    const ports = lookups();
    const store = createMemoryHororaRoleAcknowledgementStore();
    const result = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: {
        handoff: TOKEN,
        admin_user_id: "browser-admin",
        target_user_id: "browser-target",
        organization_id: "browser-org",
        roleKey: "direction",
      },
      verify: verifyClaims(consentClaims()),
      lookups: ports,
      store,
      now: () => NOW,
      createId: () => "ack_browser",
    });
    expect(result.reason).toBe("forbidden_client_identity");
    expect(ports.calls).toEqual([]);
    expect(store.rows()).toHaveLength(0);
    expect(JSON.stringify(result.body)).not.toContain("ack_browser");
  });

  it("returns the same persisted acknowledgement for the same operation and tuple", async () => {
    const store = createMemoryHororaRoleAcknowledgementStore();
    const createId = vi.fn(() => "ack_real_1");
    const input = {
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims(consentClaims()),
      lookups: lookups(),
      store,
      now: () => NOW,
      createId,
    };
    await handleHororaRoleAssignmentPost(input);
    const replay = await handleHororaRoleAssignmentPost({
      ...input,
      lookups: lookups(),
      now: () => new Date("2026-10-09T19:00:00.000Z"),
    });
    expect(replay.body).toEqual({
      ok: true,
      status: "ACCEPTED",
      moduleAcknowledgementId: "ack_real_1",
      timestamp: NOW.toISOString(),
    });
    expect(createId).toHaveBeenCalledTimes(1);
    expect(store.rows()).toHaveLength(1);
  });

  it("refuses the same operation id when the tuple changes", async () => {
    const store = createMemoryHororaRoleAcknowledgementStore();
    await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims(consentClaims()),
      lookups: lookups(),
      store,
      now: () => NOW,
      createId: () => "ack_real_1",
    });
    const changed = consentClaims();
    const conflict = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims({
        ...changed,
        assignment: changed.assignment
          ? { ...changed.assignment, roleKey: "direction" }
          : null,
      }),
      lookups: lookups(membership("direction")),
      store,
      now: () => NOW,
      createId: () => "ack_real_2",
    });
    expect(conflict.reason).toBe("ack_conflict");
    expect(store.rows()).toHaveLength(1);
    expect(JSON.stringify(conflict.body)).not.toContain("ack_real_2");
  });

  it("refuses an unmapped organization and an invalid membership", async () => {
    const wrongOrg = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims(consentClaims(HORORA_ROLE_ASSIGNMENT_AUDIENCE, {
        organizationId: "org_other",
      })),
      lookups: lookups(),
      store: createMemoryHororaRoleAcknowledgementStore(),
      now: () => NOW,
      createId: () => "ack_org",
    });
    expect(wrongOrg.reason).toBe("organization_mapping_absent");

    const cases: Array<{ row: MembershipRow | null; roleKey: string; reason: string }> = [
      { row: membership("employe"), roleKey: "organization_admin", reason: "unknown_role" },
      { row: membership("employe", "suspended"), roleKey: "employe", reason: "membership_inactive" },
      { row: null, roleKey: "employe", reason: "membership_missing" },
      { row: membership("direction"), roleKey: "employe", reason: "role_mismatch" },
    ];
    for (const item of cases) {
      const store = createMemoryHororaRoleAcknowledgementStore();
      const claims = consentClaims();
      const result = await handleHororaRoleAssignmentPost({
        token: TOKEN,
        body: { handoff: TOKEN },
        verify: verifyClaims({
          ...claims,
          assignment: claims.assignment
            ? { ...claims.assignment, roleKey: item.roleKey }
            : null,
        }),
        lookups: lookups(item.row),
        store,
        now: () => NOW,
        createId: () => "ack_should_not_exist",
      });
      expect(result.reason).toBe(item.reason);
      expect(store.rows()).toHaveLength(0);
      expect(JSON.stringify(result.body)).not.toContain("moduleAcknowledgementId");
    }
  });

  it("returns no acknowledgement when persistence fails", async () => {
    const memory = createMemoryHororaRoleAcknowledgementStore();
    const store: HororaRoleAcknowledgementStore = {
      findByOperationId: (operationId) => memory.findByOperationId(operationId),
      findByAssignmentId: (assignmentId) => memory.findByAssignmentId(assignmentId),
      insert: async () => {
        throw new Error("persistence down");
      },
    };
    const result = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims(consentClaims()),
      lookups: lookups(),
      store,
      now: () => NOW,
      createId: () => "ack_not_persisted",
    });
    expect(result.status).toBe(403);
    expect(result.reason).toBe("acknowledgement_unavailable");
    expect(result.body).toEqual({ ok: false, reasonCode: "MODULE_REFUSED" });
    expect(memory.rows()).toHaveLength(0);
  });

  it("refuses a tenant mismatch, a missing map tenant, a blank tenant, and another tenant for the same user", async () => {
    const mismatch = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims(consentClaims(HORORA_ROLE_ASSIGNMENT_AUDIENCE, { tenantId: "tenant-a" })),
      lookups: lookups(membership("employe"), { mapTenant: "tenant-b" }),
      store: createMemoryHororaRoleAcknowledgementStore(),
      now: () => NOW,
      createId: () => "ack_tenant_mismatch",
    });
    expect(mismatch.reason).toBe("cross_tenant");

    const missingMapTenant = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims(consentClaims()),
      lookups: lookups(membership("employe"), { mapTenant: null }),
      store: createMemoryHororaRoleAcknowledgementStore(),
      now: () => NOW,
      createId: () => "ack_tenant_null",
    });
    expect(missingMapTenant.reason).toBe("tenant_mapping_absent");

    const blankMapTenant = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims(consentClaims()),
      lookups: lookups(membership("employe"), { mapTenant: "   " }),
      store: createMemoryHororaRoleAcknowledgementStore(),
      now: () => NOW,
      createId: () => "ack_tenant_blank",
    });
    expect(blankMapTenant.reason).toBe("tenant_mapping_absent");

    const missingTokenTenant = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims(consentClaims(HORORA_ROLE_ASSIGNMENT_AUDIENCE, { tenantId: "" })),
      lookups: lookups(),
      store: createMemoryHororaRoleAcknowledgementStore(),
      now: () => NOW,
      createId: () => "ack_token_tenant",
    });
    expect(missingTokenTenant.reason).toBe("tenant_mapping_absent");

    const sameUserOtherTenant = await handleHororaRoleAssignmentPost({
      token: TOKEN,
      body: { handoff: TOKEN },
      verify: verifyClaims(consentClaims()),
      lookups: lookups(membership("employe"), { mapTenant: "tenant-other" }),
      store: createMemoryHororaRoleAcknowledgementStore(),
      now: () => NOW,
      createId: () => "ack_same_user_other_tenant",
    });
    expect(sameUserOtherTenant.reason).toBe("cross_tenant");
    expect(sameUserOtherTenant.body).toEqual({ ok: false, reasonCode: "MODULE_REFUSED" });
  });

  it("does not grant a role or derive a tenant from a HORORA slug", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/lib/auth/horora-role-consent.server.ts"),
      "utf8"
    );
    expect(source).toContain("is not decided here");
    expect(source).toContain("membership.row.role !== request.roleKey");
    expect(source).not.toMatch(/\.from\(\s*["']organization_memberships/);
    expect(source).not.toContain("organizationSlugToTenantKey");
    expect(source).not.toContain("tenantKeyToOrganizationSlug");
    expect(source).toContain('reason: "role_mismatch"');
    expect(source).not.toContain("organization_owner");
    expect(source).not.toContain('"admin"');
  });

  it("keeps handoff verification off the consent routes", () => {
    const root = process.cwd();
    const handoff = readFileSync(join(root, "src/app/lib/auth/nexus-handoff.ts"), "utf8");
    const session = readFileSync(
      join(root, "src/app/lib/auth/nexus-brokered-session.ts"),
      "utf8"
    );
    const catalogRoute = readFileSync(
      join(root, "src/app/api/nexus/role-catalog/route.ts"),
      "utf8"
    );
    const assignmentRoute = readFileSync(
      join(root, "src/app/api/nexus/role-assignment/route.ts"),
      "utf8"
    );
    const token = readFileSync(
      join(root, "src/app/lib/auth/horora-role-consent-token.server.ts"),
      "utf8"
    );
    const config = readFileSync(
      join(root, "src/app/lib/auth/nexus-handoff-config.ts"),
      "utf8"
    );
    expect(FORBIDDEN_NEXUS_AUTHORITY_CLAIMS).toContain("module_business_role");
    expect(handoff).not.toContain("identity_class:");
    expect(session).toContain("mapOrganizationMembershipRoleToAppRole(membership.role)");
    expect(token).toContain(`"${HORORA_ROLE_CATALOG_AUDIENCE}"`);
    expect(token).toContain(`"${HORORA_ROLE_ASSIGNMENT_AUDIENCE}"`);
    expect(token).toContain("readNexusHandoffConfig");
    expect(config).toContain("NEXUS_HANDOFF_ISSUER");
    expect(config).toContain("NEXUS_HANDOFF_JWKS_URL");
    expect(catalogRoute).toContain("HORORA_ROLE_CATALOG_AUDIENCE");
    expect(catalogRoute).toContain("verifyTagoraRoleConsentV1");
    expect(catalogRoute).not.toContain("verifyTagoraHandoffV1");
    expect(assignmentRoute).toContain("verifyTagoraRoleConsentV1");
    expect(assignmentRoute).toContain("HORORA_ROLE_ASSIGNMENT_AUDIENCE");
    expect(assignmentRoute).not.toContain("verifyTagoraHandoffV1");
    expect(assignmentRoute).not.toContain("fetch(");
  });
});

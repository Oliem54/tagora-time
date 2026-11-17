import { exportJWK, generateKeyPair } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HORORA_PRODUCTION_VERCEL_PROJECT_ID, HORORA_STAGING_VERCEL_PROJECT_ID } from "@/app/lib/canonical-domains";
import { HORORA_DIRECTORY_STAGING_PRIVATE_JWK_ENV } from "@/app/lib/auth/horora-authorized-module-directory-client.shared";

vi.mock("server-only", () => ({}));

const scope = {
  tenantId: "tenant_tagora_internal",
  organizationId: "org_tagora_internal",
  moduleKey: "tagora_time" as const,
};

const employeeId = "nuser_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function privateJwk() {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.kid = "horora-staging-directory-es256-2026-11-12";
  jwk.alg = "ES256";
  return jwk;
}

function previewEnv(jwk: unknown) {
  return {
    VERCEL_PROJECT_ID: HORORA_STAGING_VERCEL_PROJECT_ID,
    VERCEL_ENV: "preview",
    [HORORA_DIRECTORY_STAGING_PRIVATE_JWK_ENV]: JSON.stringify(jwk),
  };
}

function directoryBody(entries: unknown[]) {
  return {
    ok: true,
    contract: "AUTHORIZED_MODULE_DIRECTORY_V1",
    contractVersion: "1",
    businessPermissionsAuthority: false,
    defaultBusinessAccess: "DENY",
    identityMatch: "EXPLICIT_NUSER_MAPPING_ONLY",
    emailMatch: "FORBIDDEN",
    complete: true,
    reasonCode: "DIRECTORY_READY",
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    moduleKey: "tagora_time",
    entries,
  };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    userId: employeeId,
    displayName: "Employé QA",
    contactEmail: "info@pi-titan.com",
    technicalKey: "tagora_time",
    status: "ACTIVE",
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    nexusRoleKey: "employe",
    accessVersion: 1,
    defaultBusinessAccess: "DENY",
    businessPermissions: null,
    ...overrides,
  };
}

describe("HORORA staging directory client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("signs a staging call and drops another tenant from the result", async () => {
    const jwk = await privateJwk();
    const { fetchHororaStagingDirectory } = await import(
      "@/app/lib/auth/horora-directory-nexus.server"
    );
    const fetchImpl = vi.fn(async () =>
      Response.json(
        directoryBody([
          entry(),
          entry({
            userId: "nuser_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            organizationId: "org_other",
            tenantId: "tenant_other",
          }),
        ])
      )
    );
    const result = await fetchHororaStagingDirectory({
      query: scope,
      env: previewEnv(jwk),
      fetchImpl,
      allowOutsideVercel: true,
      now: new Date("2026-11-13T02:00:00.000Z"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((row) => row.userId)).toEqual([employeeId]);
    expect(result.businessPermissionsAuthority).toBe(false);
    expect(result.defaultBusinessAccess).toBe("DENY");
    const call = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    const [url, init] = call;
    expect(String(url).startsWith("https://app.staging.tagora.ca/api/nexus/service/authorized-module-directory")).toBe(true);
    expect(String(url)).toContain("tenantId=tenant_tagora_internal");
    expect(String(url)).toContain("organizationId=org_tagora_internal");
    const header = new Headers(init.headers).get("authorization") ?? "";
    expect(header.startsWith("Bearer ")).toBe(true);
    expect(header.split(".").length).toBe(3);
  });

  it("classifies a foreign organization as tenant isolation", async () => {
    const jwk = await privateJwk();
    const { fetchHororaStagingDirectory } = await import(
      "@/app/lib/auth/horora-directory-nexus.server"
    );
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          ok: false,
          contract: "AUTHORIZED_MODULE_DIRECTORY_V1",
          reasonCode: "ORGANIZATION_DENIED",
          entries: [],
        },
        { status: 403 }
      )
    );
    const result = await fetchHororaStagingDirectory({
      query: {
        ...scope,
        tenantId: "tenant_isolation_probe",
        organizationId: "org_isolation_probe",
      },
      env: previewEnv(jwk),
      fetchImpl,
      allowOutsideVercel: true,
    });
    expect(result).toMatchObject({
      ok: false,
      httpStatus: 403,
      classification: "tenant_isolated",
      reasonCode: "ORGANIZATION_DENIED",
    });
  });

  it("does not call Nexus from the production project", async () => {
    const jwk = await privateJwk();
    const { fetchHororaStagingDirectory, readLiveAuthorizedModuleDirectory } = await import(
      "@/app/lib/auth/horora-directory-nexus.server"
    );
    const fetchImpl = vi.fn();
    const blocked = await fetchHororaStagingDirectory({
      query: scope,
      env: {
        ...previewEnv(jwk),
        VERCEL_PROJECT_ID: HORORA_PRODUCTION_VERCEL_PROJECT_ID,
        VERCEL_ENV: "production",
      },
      fetchImpl,
      allowOutsideVercel: true,
    });
    expect(blocked).toMatchObject({ ok: false, reasonCode: "RUNTIME_FORBIDDEN" });
    const held = await readLiveAuthorizedModuleDirectory({
      query: scope,
      env: { VERCEL_ENV: "production", VERCEL_PROJECT_ID: HORORA_PRODUCTION_VERCEL_PROJECT_ID },
      fetchImpl,
    });
    expect(held).toMatchObject({
      ok: false,
      status: "service_uncertified",
      directory: null,
      localCanonicalIdentityGrantsAccess: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    const { localCanonicalNexusUserIdForUncertifiedDirectory } = await import(
      "@/app/lib/auth/horora-directory-nexus.server"
    );
    expect(
      localCanonicalNexusUserIdForUncertifiedDirectory({
        authUserId: "auth-martin",
        scope,
        links: [
          {
            nexusUserId: "nuser_5035cfcbd29a751e382fdf02f785d11f",
            authUserId: "auth-martin",
            organizationId: scope.organizationId,
          },
        ],
      })
    ).toBe("nuser_5035cfcbd29a751e382fdf02f785d11f");
    expect(
      localCanonicalNexusUserIdForUncertifiedDirectory({
        authUserId: "auth-martin",
        scope,
        links: [
          {
            nexusUserId: "nuser_one",
            authUserId: "auth-martin",
            organizationId: scope.organizationId,
          },
          {
            nexusUserId: "nuser_two",
            authUserId: "auth-martin",
            organizationId: scope.organizationId,
          },
        ],
      })
    ).toBeNull();
  });

  it("revokes REVOKED and SUSPENDED sessions and keeps ABSENT or an outage", async () => {
    const jwk = await privateJwk();
    const { inspectLiveDirectorySession, clearHororaDirectoryCacheForTests, sessionRevocationDecision } =
      await import("@/app/lib/auth/horora-directory-nexus.server");
    clearHororaDirectoryCacheForTests();
    expect(sessionRevocationDecision({ list: "unavailable", status: null })).toEqual({
      action: "keep",
      observation: "unavailable",
    });
    expect(sessionRevocationDecision({ list: "ready", status: "ABSENT" })).toEqual({
      action: "keep",
      observation: "absent",
    });
    const fetchImpl = vi.fn(async () =>
      Response.json(
        directoryBody([
          entry({ status: "REVOKED", userId: employeeId }),
          entry({ status: "SUSPENDED", userId: "nuser_cccccccccccccccccccccccccccccccc" }),
        ])
      )
    );
    const revoked = await inspectLiveDirectorySession({
      nexusActorId: employeeId,
      hororaOrganizationId: "org-horora",
      nexusOrganizationId: scope.organizationId,
      env: previewEnv(jwk),
      fetchImpl,
      scope,
    });
    expect(revoked).toEqual({ action: "revoke", observation: "revoked" });
    const suspended = await inspectLiveDirectorySession({
      nexusActorId: "nuser_cccccccccccccccccccccccccccccccc",
      hororaOrganizationId: "org-horora",
      nexusOrganizationId: scope.organizationId,
      env: previewEnv(jwk),
      fetchImpl,
      scope,
      now: new Date(Date.now() + 60_000),
    });
    expect(suspended).toEqual({ action: "revoke", observation: "suspended" });
    const absent = await inspectLiveDirectorySession({
      nexusActorId: "nuser_dddddddddddddddddddddddddddddddd",
      hororaOrganizationId: "org-horora",
      nexusOrganizationId: scope.organizationId,
      env: previewEnv(jwk),
      fetchImpl,
      scope,
      now: new Date(Date.now() + 120_000),
    });
    expect(absent).toEqual({ action: "keep", observation: "absent" });
    const outage = await inspectLiveDirectorySession({
      nexusActorId: employeeId,
      hororaOrganizationId: "org-horora",
      nexusOrganizationId: scope.organizationId,
      env: previewEnv(jwk),
      scope,
      now: new Date(Date.now() + 180_000),
      fetchImpl: vi.fn(async () => {
        throw new Error("nexus down");
      }),
    });
    expect(outage).toEqual({ action: "keep", observation: "unavailable" });
  });

  it("proves the consolidated candidate with one assertion, a denied replay, and a foreign 403", async () => {
    const jwk = await privateJwk();
    const { runConsolidatedDirectoryProof, NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN } = await import(
      "@/app/lib/auth/horora-directory-nexus.server"
    );
    let firstAuthorization = "";
    const fetchImpl = vi.fn(async (url: URL, init: RequestInit) => {
      const authorization = new Headers(init.headers).get("authorization") ?? "";
      const count = fetchImpl.mock.calls.length;
      expect(String(url).startsWith(`${NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN}/api/nexus/service/authorized-module-directory`)).toBe(true);
      if (count === 1) {
        firstAuthorization = authorization;
        return Response.json(
          directoryBody([
            entry({
              businessPermissions: null,
            }),
          ])
        );
      }
      if (count === 2) {
        expect(authorization).toBe(firstAuthorization);
        return Response.json(
          { ok: false, reasonCode: "SERVICE_CLIENT_DENIED", contract: "AUTHORIZED_MODULE_DIRECTORY_V1" },
          { status: 401 }
        );
      }
      expect(authorization).not.toBe(firstAuthorization);
      expect(String(url)).toContain("organizationId=org_isolation_probe");
      return Response.json(
        { ok: false, reasonCode: "ORGANIZATION_DENIED", contract: "AUTHORIZED_MODULE_DIRECTORY_V1" },
        { status: 403 }
      );
    });
    const proof = await runConsolidatedDirectoryProof({
      env: {
        ...previewEnv(jwk),
        HORORA_DIRECTORY_CONSOLIDATED_PROOF: "1",
        HORORA_DIRECTORY_NEXUS_ORIGIN: NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: new Date("2026-11-13T20:00:00.000Z"),
    });
    const serialized = JSON.stringify(proof);
    expect(serialized).not.toContain("eyJ");
    expect(serialized).not.toContain("info@pi-titan.com");
    expect(serialized).not.toContain('"d"');
    expect(proof).toMatchObject({
      signedRequestSent: true,
      directoryReady: true,
      realDirectoryData: true,
      replayDenied: true,
      foreignTenantDenied: true,
      moduleAuthorization: true,
      sensitivePermissionDisclosed: false,
      failureDependency: null,
    });
    expect(proof.directory.canonicalUserCount).toBe(1);
    expect(proof.directory.businessPermissionsAuthority).toBe(false);
    expect(proof.directory.defaultBusinessAccess).toBe("DENY");
  });
});

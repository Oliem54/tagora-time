import { generateKeyPairSync, type JsonWebKey } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  HORORA_PRODUCTION_VERCEL_PROJECT_ID,
  HORORA_STAGING_VERCEL_PROJECT_ID,
  NEXUS_STAGING_PUBLIC_ORIGIN,
} from "@/app/lib/canonical-domains";
import { HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH } from "@/app/lib/auth/horora-authorized-module-directory-client.shared";
import {
  HORORA_DIRECTORY_AUDIENCE,
  HORORA_DIRECTORY_CLIENT_ID,
  HORORA_DIRECTORY_STAGING_PRIVATE_JWK_ENV,
  certifiedDirectoryAccessForSession,
  directoryAccessForUser,
  readHororaStagingAuthorizedDirectory,
  resolveHororaDirectoryOrigin,
} from "@/app/lib/auth/horora-directory-es256.server";

const DIRECTORY_KID = "horora-directory-staging-test";

const QUERY = {
  tenantId: "tenant_tagora_internal",
  organizationId: "org_tagora_internal",
  moduleKey: "tagora_time" as const,
};

function privateJwk(): JsonWebKey {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  jwk.kid = DIRECTORY_KID;
  jwk.alg = "ES256";
  jwk.use = "sig";
  return jwk;
}

function stagingEnv(jwk: JsonWebKey | null = privateJwk()) {
  return {
    VERCEL_PROJECT_ID: HORORA_STAGING_VERCEL_PROJECT_ID,
    [HORORA_DIRECTORY_STAGING_PRIVATE_JWK_ENV]: jwk ? JSON.stringify(jwk) : "",
  };
}

function payloadOf(authorization: string) {
  const token = authorization.replace(/^Bearer /, "");
  const [header, body] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as {
      alg: string;
      kid: string;
    },
    body: JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      iss: string;
      sub: string;
      aud: string;
      module_key: string;
      d?: string;
    },
    parts: token.split(".").length,
  };
}

describe("HORORA staging directory ES256 client", () => {
  it("does not fetch without a staging private key", async () => {
    const fetchImpl = vi.fn();
    const result = await readHororaStagingAuthorizedDirectory({
      query: QUERY,
      env: stagingEnv(null),
      fetchImpl,
    });
    expect(result).toMatchObject({
      ok: false,
      status: "service_unavailable",
      revocationEnforced: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not fetch from the production project", async () => {
    const fetchImpl = vi.fn();
    const result = await readHororaStagingAuthorizedDirectory({
      query: QUERY,
      env: {
        ...stagingEnv(),
        VERCEL_PROJECT_ID: HORORA_PRODUCTION_VERCEL_PROJECT_ID,
      },
      fetchImpl,
    });
    expect(result.status).toBe("service_unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses one agreed directory origin and refuses a split target", async () => {
    const candidate = "https://tagora-nexus-staging-candidate.vercel.app";
    expect(
      resolveHororaDirectoryOrigin({
        ...stagingEnv(),
        HORORA_DIRECTORY_NEXUS_ORIGIN: candidate,
        NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN: `${candidate}/`,
      })
    ).toBe(candidate);
    const fetchImpl = vi.fn(async () => new Response("missing", { status: 404 }));
    const agreed = await readHororaStagingAuthorizedDirectory({
      query: QUERY,
      env: {
        ...stagingEnv(),
        HORORA_DIRECTORY_NEXUS_ORIGIN: candidate,
        NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN: candidate,
      },
      fetchImpl,
    });
    expect(agreed.status).toBe("service_unavailable");
    const [url] = fetchImpl.mock.calls[0] as unknown as [URL];
    expect(url.origin).toBe(candidate);
    const split = vi.fn();
    const refused = await readHororaStagingAuthorizedDirectory({
      query: QUERY,
      env: {
        ...stagingEnv(),
        HORORA_DIRECTORY_NEXUS_ORIGIN: candidate,
        NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN: "https://tagora-nexus-staging-other.vercel.app",
      },
      fetchImpl: split,
    });
    expect(refused.status).toBe("service_unavailable");
    expect(split).not.toHaveBeenCalled();
  });

  it("signs the directory audience and keeps a missing route distinct from revocation", async () => {
    const fetchImpl = vi.fn(async () => new Response("missing", { status: 404 }));
    const result = await readHororaStagingAuthorizedDirectory({
      query: QUERY,
      env: stagingEnv(),
      fetchImpl,
      nowSeconds: 1_700_000_000,
    });
    expect(result).toMatchObject({
      ok: false,
      status: "service_unavailable",
      revocationEnforced: false,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe(NEXUS_STAGING_PUBLIC_ORIGIN);
    expect(url.pathname).toBe(HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH);
    const authorization = String((init.headers as { Authorization: string }).Authorization);
    const assertion = payloadOf(authorization);
    expect(assertion.parts).toBe(3);
    expect(assertion.header).toMatchObject({
      alg: "ES256",
      kid: DIRECTORY_KID,
    });
    expect(assertion.body).toMatchObject({
      iss: HORORA_DIRECTORY_CLIENT_ID,
      sub: HORORA_DIRECTORY_CLIENT_ID,
      aud: HORORA_DIRECTORY_AUDIENCE,
      module_key: "tagora_time",
    });
    expect(assertion.body.d).toBeUndefined();
    expect(authorization).not.toContain('"d":');
  });

  it("keeps ABSENT distinct from REVOKED when the directory answers", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            entries: [
              {
                userId: "nuser_revoked0001",
                displayName: "QA",
                contactEmail: null,
                technicalKey: "tagora_time",
                status: "REVOKED",
                organizationId: QUERY.organizationId,
                nexusRoleKey: "employe",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    const result = await readHororaStagingAuthorizedDirectory({
      query: QUERY,
      env: stagingEnv(),
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.revocationEnforced).toBe(false);
    expect(directoryAccessForUser(result.entries, "nuser_revoked0001")).toBe("REVOKED");
    expect(directoryAccessForUser(result.entries, "nuser_absent0001")).toBe("ABSENT");
  });

  it("treats a forbidden directory runtime as uncertified, not revoked", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ reasonCode: "DIRECTORY_RUNTIME_FORBIDDEN" }), {
          status: 403,
        })
    );
    const result = await readHororaStagingAuthorizedDirectory({
      query: QUERY,
      env: stagingEnv(),
      fetchImpl,
    });
    expect(result).toMatchObject({
      ok: false,
      status: "service_uncertified",
      revocationEnforced: false,
    });
  });

  it("does not revoke a session when the signed user is absent", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, entries: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    const access = await certifiedDirectoryAccessForSession({
      nexusActorId: "nuser_absent0000000000000000000001",
      nexusOrganizationId: QUERY.organizationId,
      env: stagingEnv(),
      fetchImpl,
    });
    expect(access).toBe("ABSENT");
  });

  it("returns the revoked status for a certified directory row", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            entries: [
              {
                userId: "nuser_revoked00000000000000000001",
                displayName: "QA",
                status: "REVOKED",
                organizationId: QUERY.organizationId,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    const access = await certifiedDirectoryAccessForSession({
      nexusActorId: "nuser_revoked00000000000000000001",
      nexusOrganizationId: QUERY.organizationId,
      env: stagingEnv(),
      fetchImpl,
    });
    expect(access).toBe("REVOKED");
    const otherOrg = await certifiedDirectoryAccessForSession({
      nexusActorId: "nuser_revoked00000000000000000001",
      nexusOrganizationId: "org_other",
      env: stagingEnv(),
      fetchImpl,
    });
    expect(otherOrg).toBe("unknown");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

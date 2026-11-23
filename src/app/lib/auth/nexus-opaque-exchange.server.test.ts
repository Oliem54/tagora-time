import { generateKeyPairSync, type JsonWebKey } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { handleNexusCallback } from "@/app/auth/nexus/callback/route";
import {
  HORORA_PRODUCTION_VERCEL_PROJECT_ID,
  HORORA_STAGING_VERCEL_PROJECT_ID,
  NEXUS_STAGING_PUBLIC_ORIGIN,
} from "@/app/lib/canonical-domains";
import { completeNexusCallbackPhaseA } from "@/app/lib/auth/nexus-callback.server";
import {
  DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_VERSION,
  NEXUS_TECHNICAL_MODULE_KEY,
  publicNexusCallbackDenyReason,
} from "@/app/lib/auth/nexus-handoff-config";
import type { NexusMappingLookups } from "@/app/lib/auth/nexus-identity-mapping.server";
import type { NexusReplayStore } from "@/app/lib/auth/nexus-handoff-replay.server";
import {
  HORORA_OPAQUE_EXCHANGE_ASSERTION_TYPE,
  HORORA_OPAQUE_EXCHANGE_AUDIENCE,
  HORORA_OPAQUE_EXCHANGE_PATH,
  HORORA_OPAQUE_EXCHANGE_PRIVATE_JWK_ENV,
  HORORA_STAGING_NEXUS_CLIENT_ID,
  HORORA_STAGING_NEXUS_CLIENT_KID,
  HORORA_STAGING_NEXUS_TENANT_ID,
  exchangeHororaOpaqueHandoffCode,
} from "@/app/lib/auth/nexus-opaque-exchange.server";

const ISSUER = "https://nexus-handoff.test";
const NOW = 1_700_000_000;
const SUBJECT = "actor-1";
const AUTH_USER = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const OPAQUE_CODE = `htc_${"a".repeat(32)}`;

const CONFIG = {
  issuer: ISSUER,
  audience: NEXUS_HANDOFF_AUDIENCE,
  jwksUrl: "https://nexus-handoff.test/jwks.json",
  expectedModuleKey: NEXUS_TECHNICAL_MODULE_KEY,
  clockToleranceSeconds: 30 as const,
  maxTtlSeconds: 120 as const,
};

const STAGING_ENV = {
  VERCEL_PROJECT_ID: HORORA_STAGING_VERCEL_PROJECT_ID,
};
const PRODUCTION_ENV = {
  VERCEL_PROJECT_ID: HORORA_PRODUCTION_VERCEL_PROJECT_ID,
};

function clientPrivateJwk(kid: string = HORORA_STAGING_NEXUS_CLIENT_KID): JsonWebKey {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  jwk.kid = kid;
  jwk.alg = "ES256";
  jwk.use = "sig";
  return jwk;
}

async function signedAssertion(input?: {
  moduleKey?: string;
  organizationId?: string;
  jti?: string;
  otherKey?: boolean;
}) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const other = input?.otherKey ? await generateKeyPair("ES256", { extractable: true }) : null;
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "k1";
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  const token = await new SignJWT({
    typ: NEXUS_HANDOFF_VERSION,
    handoff_version: NEXUS_HANDOFF_VERSION,
    module_key: input?.moduleKey ?? NEXUS_TECHNICAL_MODULE_KEY,
    user_id: SUBJECT,
    organization_id: input?.organizationId ?? "nexus-org-1",
    membership_id: "mem-1",
    tenant_id: "tenant-1",
    handoff_id: "h1",
    grant_id: "g1",
    grant_version: "1",
    jti: input?.jti ?? "jti-opaque",
    nonce: "nonce-opaque",
  })
    .setProtectedHeader({ alg: "ES256", kid: "k1", typ: NEXUS_HANDOFF_VERSION })
    .setIssuer(ISSUER)
    .setAudience(NEXUS_HANDOFF_AUDIENCE)
    .setSubject(SUBJECT)
    .setIssuedAt(NOW)
    .setNotBefore(NOW)
    .setExpirationTime(NOW + 60)
    .sign(other?.privateKey ?? privateKey);
  return { token, jwks: createLocalJWKSet({ keys: [publicJwk] }) };
}

function lookups(): NexusMappingLookups {
  return {
    async findIdentityMaps() {
      return [{ nexus_actor_id: SUBJECT, auth_user_id: AUTH_USER, disabled_at: null }];
    },
    async authUserExists() {
      return true;
    },
    async findMembershipsForUser() {
      return [
        {
          id: MEMBERSHIP_ID,
          organization_id: ORG_ID,
          role: "organization_admin",
          status: "active",
          is_default: true,
        },
      ];
    },
    async findOrganizationMaps() {
      return [
        {
          nexus_organization_id: "nexus-org-1",
          nexus_tenant_id: "tenant-1",
          organization_id: ORG_ID,
          status: "active",
        },
      ];
    },
    async findOrganization() {
      return { id: ORG_ID, status: "active", deleted_at: null };
    },
  };
}

function replayStore(): NexusReplayStore {
  const seen: string[] = [];
  return {
    async insertReceipt(input) {
      const key = `${input.jti}:${input.nonce}`;
      if (seen.includes(key) || seen.includes(input.jti) || seen.includes(input.nonce)) {
        return { duplicate: true };
      }
      seen.push(key, input.jti, input.nonce);
      return { duplicate: false };
    },
  };
}

function mintDeps(jwks: Awaited<ReturnType<typeof signedAssertion>>["jwks"]) {
  const issued: string[] = [];
  return {
    issued,
    deps: {
      verifyOptions: { config: CONFIG, jwks, nowSeconds: NOW, env: STAGING_ENV },
      lookups: lookups(),
      replayStore: replayStore(),
      mintOptions: {
        env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" },
        async loadAuthUserById(id: string) {
          return { id };
        },
        async issueSessionForExistingUser(id: string) {
          issued.push(id);
          return {
            ok: true as const,
            cookieHeader:
              "horora_nx_session=session-test; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
            redirectPath: "/admin/utilisateurs",
          };
        },
      },
    },
  };
}

describe("HORORA staging opaque exchange", () => {
  it("signs an ES256 private_key_jwt and keeps the assertion on the server", async () => {
    const privateJwk = clientPrivateJwk();
    const calls: Array<{ url: string; body: Record<string, string> }> = [];
    const result = await exchangeHororaOpaqueHandoffCode(OPAQUE_CODE, {
      env: {
        ...STAGING_ENV,
        [HORORA_OPAQUE_EXCHANGE_PRIVATE_JWK_ENV]: JSON.stringify(privateJwk),
      },
      fetchImpl: async (url, init) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body)) as Record<string, string>,
        });
        return new Response(JSON.stringify({ ok: true, assertion: "server.only.assertion" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(result).toEqual({ ok: true, assertion: "server.only.assertion" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      new URL(HORORA_OPAQUE_EXCHANGE_PATH, NEXUS_STAGING_PUBLIC_ORIGIN).toString()
    );
    expect(calls[0].body.client_assertion_type).toBe(HORORA_OPAQUE_EXCHANGE_ASSERTION_TYPE);
    expect(calls[0].body.client_assertion.split(".")).toHaveLength(3);
    expect(calls[0].body.clientId).toBe(HORORA_STAGING_NEXUS_CLIENT_ID);
    expect(calls[0].body.moduleKey).toBe(NEXUS_TECHNICAL_MODULE_KEY);
    expect(calls[0].body.tenantId).toBe(HORORA_STAGING_NEXUS_TENANT_ID);
    expect(calls[0].body.organizationId).toBe(DEFAULT_HORORA_NEXUS_ORGANIZATION_ID);
    const [header, payload] = calls[0].body.client_assertion.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toMatchObject({
      alg: "ES256",
      kid: HORORA_STAGING_NEXUS_CLIENT_KID,
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({
      iss: HORORA_STAGING_NEXUS_CLIENT_ID,
      sub: HORORA_STAGING_NEXUS_CLIENT_ID,
      aud: HORORA_OPAQUE_EXCHANGE_AUDIENCE,
      client_id: HORORA_STAGING_NEXUS_CLIENT_ID,
    });
    expect(JSON.stringify(calls[0].body)).not.toContain(String(privateJwk.d));
  });

  it("refuses a private key that does not match the registered ES256 kid", async () => {
    let called = false;
    const result = await exchangeHororaOpaqueHandoffCode(OPAQUE_CODE, {
      env: {
        ...STAGING_ENV,
        [HORORA_OPAQUE_EXCHANGE_PRIVATE_JWK_ENV]: JSON.stringify(clientPrivateJwk("other-kid")),
      },
      fetchImpl: async () => {
        called = true;
        return new Response(null, { status: 500 });
      },
    });
    expect(result).toEqual({ ok: false, reason: "exchange_client_denied" });
    expect(called).toBe(false);
  });

  it("does not exchange a code when the project is Production", async () => {
    let called = false;
    const result = await exchangeHororaOpaqueHandoffCode(OPAQUE_CODE, {
      env: {
        ...PRODUCTION_ENV,
        [HORORA_OPAQUE_EXCHANGE_PRIVATE_JWK_ENV]: JSON.stringify(clientPrivateJwk()),
      },
      fetchImpl: async () => {
        called = true;
        return new Response(null, { status: 500 });
      },
    });
    expect(result).toEqual({ ok: false, reason: "exchange_unavailable" });
    expect(called).toBe(false);
  });

  it.each([
    [401, "WRONG_CLIENT", "exchange_client_denied"],
    [403, "WRONG_ORGANIZATION", "wrong_organization"],
    [400, "JTI_EXPIRED", "exchange_expired"],
    [400, "JTI_REPLAYED", "exchange_replay"],
    [503, "STORE_UNAVAILABLE", "exchange_unavailable"],
  ] as const)("maps exchange status %s %s", async (status, reason, expected) => {
    const result = await exchangeHororaOpaqueHandoffCode(OPAQUE_CODE, {
      env: {
        ...STAGING_ENV,
        [HORORA_OPAQUE_EXCHANGE_PRIVATE_JWK_ENV]: JSON.stringify(clientPrivateJwk()),
      },
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: false, reason }), {
          status,
          headers: { "content-type": "application/json" },
        }),
    });
    expect(result).toEqual({ ok: false, reason: expected });
  });
});

describe("HORORA staging opaque callback", () => {
  it("mints a session only after the exchanged assertion is validated", async () => {
    const { token, jwks } = await signedAssertion();
    const { deps, issued } = mintDeps(jwks);
    const logs: Array<Record<string, string>> = [];
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ code: OPAQUE_CODE }), body: null },
      {
        ...deps,
        logger: (_message, fields) => logs.push(fields),
        exchangeOpaqueCode: async () => ({ ok: true, assertion: token }),
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.redirectPath).toBe("/admin/utilisateurs");
    expect(issued).toEqual([AUTH_USER]);
    expect(JSON.stringify(logs)).not.toContain(OPAQUE_CODE);
    expect(JSON.stringify(logs)).not.toContain(token);
  });

  it("keeps the assertion out of the browser redirect", async () => {
    const { token, jwks } = await signedAssertion({ jti: "jti-route" });
    const { deps } = mintDeps(jwks);
    const response = await handleNexusCallback(
      new Request(`https://tagora-time-staging.vercel.app/auth/nexus/callback?code=${OPAQUE_CODE}`, {
        headers: { "sec-fetch-dest": "document" },
      }),
      {
        callbackDeps: {
          ...deps,
          exchangeOpaqueCode: async () => ({ ok: true, assertion: token }),
        },
      }
    );
    const location = response.headers.get("location") ?? "";
    const body = await response.text();
    expect(response.status).toBe(303);
    expect(location).toContain("/admin/utilisateurs");
    expect(location).not.toContain(OPAQUE_CODE);
    expect(location).not.toContain(token);
    expect(body).not.toContain(token);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rejects an invalid code without exchanging it", async () => {
    let called = false;
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ code: "not-a-code" }), body: null },
      {
        verifyOptions: { env: STAGING_ENV },
        exchangeOpaqueCode: async () => {
          called = true;
          return { ok: false, reason: "exchange_denied" };
        },
      }
    );
    expect(result).toEqual({ ok: false, reason: "opaque_code_rejected" });
    expect(called).toBe(false);
    expect(publicNexusCallbackDenyReason("opaque_code_rejected")).toBe("handoff_refused");
  });

  it("rejects an expired opaque code before creating a session", async () => {
    const { deps, issued } = mintDeps(createLocalJWKSet({ keys: [] }));
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ code: OPAQUE_CODE }), body: null },
      {
        ...deps,
        exchangeOpaqueCode: async () => ({ ok: false, reason: "exchange_expired" }),
      }
    );
    expect(result).toEqual({ ok: false, reason: "exchange_expired" });
    expect(issued).toEqual([]);
    expect(publicNexusCallbackDenyReason("exchange_expired")).toBe("handoff_expired");
  });

  it("rejects a replayed assertion and does not mint again", async () => {
    const { token, jwks } = await signedAssertion({ jti: "jti-replay" });
    const { deps, issued } = mintDeps(jwks);
    const input = { searchParams: new URLSearchParams({ code: OPAQUE_CODE }), body: null };
    const exchangeOpaqueCode = async () => ({ ok: true as const, assertion: token });
    const first = await completeNexusCallbackPhaseA(input, { ...deps, exchangeOpaqueCode });
    const second = await completeNexusCallbackPhaseA(input, { ...deps, exchangeOpaqueCode });
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: "replay" });
    expect(issued).toEqual([AUTH_USER]);
  });

  it("rejects the wrong client without a session", async () => {
    const { deps, issued } = mintDeps(createLocalJWKSet({ keys: [] }));
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ code: OPAQUE_CODE }), body: null },
      {
        ...deps,
        exchangeOpaqueCode: async () => ({ ok: false, reason: "exchange_client_denied" }),
      }
    );
    expect(result).toEqual({ ok: false, reason: "exchange_client_denied" });
    expect(issued).toEqual([]);
  });

  it("rejects the wrong organization without a session", async () => {
    const { deps, issued } = mintDeps(createLocalJWKSet({ keys: [] }));
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ code: OPAQUE_CODE }), body: null },
      {
        ...deps,
        exchangeOpaqueCode: async () => ({ ok: false, reason: "wrong_organization" }),
      }
    );
    expect(result).toEqual({ ok: false, reason: "wrong_organization" });
    expect(issued).toEqual([]);
    expect(publicNexusCallbackDenyReason("wrong_organization")).toBe("cross_tenant");
  });

  it("rejects an assertion signed by the wrong ES256 key", async () => {
    const { token, jwks } = await signedAssertion({ otherKey: true, jti: "jti-bad-sig" });
    const { deps, issued } = mintDeps(jwks);
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ code: OPAQUE_CODE }), body: null },
      {
        ...deps,
        exchangeOpaqueCode: async () => ({ ok: true, assertion: token }),
      }
    );
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
    expect(issued).toEqual([]);
  });

  it("keeps Production on the signed handoff path and ignores an opaque code", async () => {
    let called = false;
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ code: OPAQUE_CODE }), body: null },
      {
        verifyOptions: { env: PRODUCTION_ENV },
        exchangeOpaqueCode: async () => {
          called = true;
          return { ok: false, reason: "exchange_denied" };
        },
      }
    );
    expect(result).toEqual({ ok: false, reason: "opaque_code_rejected" });
    expect(called).toBe(false);
  });
});

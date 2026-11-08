import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  SignJWT,
  type CryptoKey,
} from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleNexusCallback } from "@/app/auth/nexus/callback/route";
import { NEXUS_CALLBACK_OPAQUE_CODE_FORM_ID } from "@/app/lib/auth/nexus-callback-document.server";
import { completeNexusCallbackPhaseA } from "@/app/lib/auth/nexus-callback.server";
import {
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_VERSION,
  NEXUS_TECHNICAL_MODULE_KEY,
} from "@/app/lib/auth/nexus-handoff-config";
import type { NexusMappingLookups } from "@/app/lib/auth/nexus-identity-mapping.server";
import type { NexusReplayStore } from "@/app/lib/auth/nexus-handoff-replay.server";
import {
  buildNexusOpaqueExchangeBody,
  exportHororaStagingModuleClientPublicJwk,
  HORORA_STAGING_MODULE_CLIENT_PUBLIC_JWK_FIELDS,
  HORORA_STAGING_NEXUS_CLIENT_ASSERTION_TYPE,
  HORORA_STAGING_NEXUS_EXCHANGE_URL,
  HORORA_STAGING_NEXUS_MODULE_CLIENT_ID,
  HORORA_STAGING_NEXUS_MODULE_CLIENT_KID,
  HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK_ENV,
  HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_KEY_OWNER,
  HORORA_STAGING_NEXUS_MODULE_CLIENT_PUBLIC_JWK,
  HORORA_STAGING_NEXUS_MODULE_CLIENT_PUBLIC_KEY_CONSUMER,
  isHororaStagingOpaqueCallbackRequest,
  selectOpaqueHandoffCode,
  toHororaStagingModuleClientPublicJwk,
  type HororaStagingModuleClientPublicJwk,
} from "@/app/lib/auth/horora-staging-nexus-module-client";
import {
  exchangeNexusOpaqueHandoffCode,
  readHororaStagingModuleClientPrivateKeyStatus,
  signHororaStagingModuleClientAssertion,
  verifyHororaStagingModuleClientAssertion,
} from "@/app/lib/auth/horora-staging-nexus-module-client.server";

const NOW = 1_700_000_000;
const CODE = "staging-opaque-code-1";
const AUTH_DIR = dirname(fileURLToPath(import.meta.url));
const ISSUER = "https://nexus-handoff.test";
const SUBJECT = "actor-1";
const AUTH_USER = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";

const HANDOFF_CONFIG = {
  issuer: ISSUER,
  audience: NEXUS_HANDOFF_AUDIENCE,
  jwksUrl: "https://nexus-handoff.test/jwks.json",
  expectedModuleKey: NEXUS_TECHNICAL_MODULE_KEY,
  clockToleranceSeconds: 30 as const,
  maxTtlSeconds: 120 as const,
};

type TestMaterial = {
  privateJwk: Record<string, unknown>;
  publicJwk: HororaStagingModuleClientPublicJwk;
  privateKey: CryptoKey;
};

async function testMaterial(): Promise<TestMaterial> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const exportedPublic = await exportJWK(publicKey);
  const exportedPrivate = await exportJWK(privateKey);
  const publicJwk: HororaStagingModuleClientPublicJwk = {
    kty: "EC",
    crv: "P-256",
    alg: "ES256",
    kid: HORORA_STAGING_NEXUS_MODULE_CLIENT_KID,
    use: "sig",
    x: String(exportedPublic.x),
    y: String(exportedPublic.y),
  };
  return {
    publicJwk,
    privateKey,
    privateJwk: {
      ...publicJwk,
      d: exportedPrivate.d,
    },
  };
}

async function signCustom(
  privateKey: CryptoKey,
  input: {
    clientId?: string;
    clientIdClaim?: string;
    audience?: string;
    iat?: number;
    exp?: number;
  } = {}
): Promise<string> {
  const clientId = input.clientId ?? HORORA_STAGING_NEXUS_MODULE_CLIENT_ID;
  const iat = input.iat ?? NOW;
  const exp = input.exp ?? iat + 60;
  return new SignJWT({
    client_id: input.clientIdClaim ?? clientId,
  })
    .setProtectedHeader({
      alg: "ES256",
      kid: HORORA_STAGING_NEXUS_MODULE_CLIENT_KID,
      typ: "JWT",
    })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(input.audience ?? HORORA_STAGING_NEXUS_EXCHANGE_URL)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setJti("jti-client-test")
    .sign(privateKey);
}

async function captureConsole(secret: string, run: () => Promise<void>): Promise<void> {
  const logs: string[] = [];
  const methods = ["log", "info", "debug", "warn", "error"] as const;
  const spies = methods.map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(
        args
          .map((arg) => {
            if (typeof arg === "string") return arg;
            try {
              return JSON.stringify(arg);
            } catch {
              return "";
            }
          })
          .join(" ")
      );
    })
  );
  try {
    await run();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  expect(logs.join("\n")).not.toContain(secret);
}

function handoffLookups(): NexusMappingLookups {
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

function replayStore(): NexusReplayStore & { seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
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

async function handoffToken() {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "k1";
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  const token = await new SignJWT({
    typ: NEXUS_HANDOFF_VERSION,
    handoff_version: NEXUS_HANDOFF_VERSION,
    module_key: NEXUS_TECHNICAL_MODULE_KEY,
    user_id: SUBJECT,
    organization_id: "nexus-org-1",
    membership_id: "mem-1",
    tenant_id: "tenant-1",
    handoff_id: "h1",
    grant_id: "g1",
    grant_version: "1",
    jti: "jti-opaque-callback",
    nonce: "nonce-opaque-callback",
  })
    .setProtectedHeader({ alg: "ES256", kid: "k1", typ: NEXUS_HANDOFF_VERSION })
    .setIssuer(ISSUER)
    .setAudience(NEXUS_HANDOFF_AUDIENCE)
    .setSubject(SUBJECT)
    .setIssuedAt(NOW)
    .setNotBefore(NOW)
    .setExpirationTime(NOW + 60)
    .sign(privateKey);
  return { token, jwks: await importJWK(publicJwk, "ES256") };
}

describe("HORORA staging module client public identity", () => {
  it("exports only the public JWK fields and no private material", () => {
    const jwk = exportHororaStagingModuleClientPublicJwk();
    expect(Object.keys(jwk)).toEqual([...HORORA_STAGING_MODULE_CLIENT_PUBLIC_JWK_FIELDS]);
    expect(jwk).toEqual(HORORA_STAGING_NEXUS_MODULE_CLIENT_PUBLIC_JWK);
    expect(jwk).not.toHaveProperty("d");
    expect(JSON.stringify(jwk)).not.toContain('"d"');
    expect(jwk.kty).toBe("EC");
    expect(jwk.crv).toBe("P-256");
    expect(jwk.alg).toBe("ES256");
    expect(jwk.use).toBe("sig");
    expect(jwk.kid).toBe(HORORA_STAGING_NEXUS_MODULE_CLIENT_KID);
    expect(jwk.kid).not.toBe("nexus_handoff_active_es256");
    expect(HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK_ENV.startsWith("NEXT_PUBLIC_")).toBe(
      false
    );
    expect(HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_KEY_OWNER).toBe("HORORA_STAGING_SERVER");
    expect(HORORA_STAGING_NEXUS_MODULE_CLIENT_PUBLIC_KEY_CONSUMER).toBe("TAGORA_NEXUS_STAGING");
  });

  it("strips private fields when deriving a public JWK", async () => {
    const material = await testMaterial();
    const derived = toHororaStagingModuleClientPublicJwk(material.privateJwk);
    expect(derived).toEqual(material.publicJwk);
    expect(derived).not.toHaveProperty("d");
    expect(Object.keys(derived ?? {})).toEqual([...HORORA_STAGING_MODULE_CLIENT_PUBLIC_JWK_FIELDS]);
  });

  it("does not commit the private key, a PEM, or a NEXT_PUBLIC_ secret", () => {
    const publicSource = readFileSync(join(AUTH_DIR, "horora-staging-nexus-module-client.ts"), "utf8");
    const serverSource = readFileSync(
      join(AUTH_DIR, "horora-staging-nexus-module-client.server.ts"),
      "utf8"
    );
    const routeSource = readFileSync(
      join(AUTH_DIR, "../../auth/nexus/callback/route.ts"),
      "utf8"
    );
    for (const source of [publicSource, serverSource, routeSource]) {
      expect(source).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
      expect(source).not.toContain("NEXT_PUBLIC_HORORA_STAGING");
      expect(source).not.toContain("NEXUS_HANDOFF_ACTIVE_PRIVATE_JWK");
    }
    expect(publicSource).not.toMatch(/"d"\s*:/);
    expect(serverSource).toContain(HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK_ENV);
  });
});

describe("HORORA staging private_key_jwt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs an ES256 client assertion and does not expose the private key", async () => {
    const material = await testMaterial();
    const secret = String(material.privateJwk.d);
    let assertion = "";
    await captureConsole(secret, async () => {
      const status = await readHororaStagingModuleClientPrivateKeyStatus(
        { [HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK_ENV]: JSON.stringify(material.privateJwk) },
        { expectedPublicJwk: material.publicJwk }
      );
      expect(status).toEqual({
        configured: true,
        owner: HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_KEY_OWNER,
      });
      expect(JSON.stringify(status)).not.toContain(secret);
      const signed = await signHororaStagingModuleClientAssertion({
        privateJwk: material.privateJwk,
        expectedPublicJwk: material.publicJwk,
        nowSeconds: NOW,
        jti: "jti-client-test",
      });
      expect(signed.ok).toBe(true);
      if (signed.ok) assertion = signed.assertion;
    });

    expect(assertion).not.toContain(secret);
    const header = decodeProtectedHeader(assertion);
    expect(header).toMatchObject({
      alg: "ES256",
      kid: HORORA_STAGING_NEXUS_MODULE_CLIENT_KID,
    });
    const publicKey = await importJWK(material.publicJwk, "ES256");
    const verified = await jwtVerify(assertion, publicKey, {
      algorithms: ["ES256"],
      issuer: HORORA_STAGING_NEXUS_MODULE_CLIENT_ID,
      audience: HORORA_STAGING_NEXUS_EXCHANGE_URL,
      subject: HORORA_STAGING_NEXUS_MODULE_CLIENT_ID,
      currentDate: new Date(NOW * 1000),
    });
    expect(verified.payload.iss).toBe(HORORA_STAGING_NEXUS_MODULE_CLIENT_ID);
    expect(verified.payload.sub).toBe(HORORA_STAGING_NEXUS_MODULE_CLIENT_ID);
    expect(verified.payload.client_id).toBe(HORORA_STAGING_NEXUS_MODULE_CLIENT_ID);
    expect(verified.payload.aud).toBe(HORORA_STAGING_NEXUS_EXCHANGE_URL);
    expect(verified.payload.jti).toBe("jti-client-test");
    expect(await verifyHororaStagingModuleClientAssertion(assertion, {
      publicJwk: material.publicJwk,
      nowSeconds: NOW,
    })).toEqual({ ok: true, clientId: HORORA_STAGING_NEXUS_MODULE_CLIENT_ID });
  });

  it("refuses a missing key, a public-only key, a foreign key, and the Nexus handoff env", async () => {
    const material = await testMaterial();
    expect(await readHororaStagingModuleClientPrivateKeyStatus({})).toEqual({
      configured: false,
      reason: "missing_configuration",
    });
    const publicOnly = { ...material.privateJwk };
    delete publicOnly.d;
    expect(
      await readHororaStagingModuleClientPrivateKeyStatus(
        { [HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK_ENV]: JSON.stringify(publicOnly) },
        { expectedPublicJwk: material.publicJwk }
      )
    ).toEqual({ configured: false, reason: "invalid_configuration" });
    expect(
      await readHororaStagingModuleClientPrivateKeyStatus({
        [HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK_ENV]: JSON.stringify(material.privateJwk),
      })
    ).toEqual({ configured: false, reason: "invalid_configuration" });
    expect(
      await readHororaStagingModuleClientPrivateKeyStatus({
        NEXUS_HANDOFF_ACTIVE_PRIVATE_JWK: JSON.stringify(material.privateJwk),
      })
    ).toEqual({ configured: false, reason: "missing_configuration" });
    const reused = {
      ...material.privateJwk,
      kid: "nexus_handoff_active_es256",
    };
    expect(
      await signHororaStagingModuleClientAssertion({
        privateJwk: reused,
        expectedPublicJwk: material.publicJwk,
        nowSeconds: NOW,
      })
    ).toEqual({ ok: false, reason: "invalid_configuration" });
  });

  it("denies a wrong audience, a wrong client id, an expired assertion, and a tampered signature", async () => {
    const material = await testMaterial();
    const verify = (token: string, nowSeconds = NOW) =>
      verifyHororaStagingModuleClientAssertion(token, {
        publicJwk: material.publicJwk,
        nowSeconds,
      });

    expect(
      await verify(await signCustom(material.privateKey, { audience: "https://evil.example/exchange" }))
    ).toEqual({ ok: false, reason: "invalid_audience" });
    expect(await verify(await signCustom(material.privateKey, { clientId: "other-client" }))).toEqual({
      ok: false,
      reason: "invalid_client",
    });
    expect(
      await verify(
        await signCustom(material.privateKey, {
          clientId: HORORA_STAGING_NEXUS_MODULE_CLIENT_ID,
          clientIdClaim: "other-client",
        })
      )
    ).toEqual({ ok: false, reason: "invalid_client" });
    expect(
      await verify(await signCustom(material.privateKey, { iat: NOW - 120, exp: NOW - 30 }))
    ).toEqual({ ok: false, reason: "expired_token" });

    const signed = await signHororaStagingModuleClientAssertion({
      privateJwk: material.privateJwk,
      expectedPublicJwk: material.publicJwk,
      nowSeconds: NOW,
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    const parts = signed.assertion.split(".");
    const signature = parts[2] ?? "";
    const index = Math.min(8, signature.length - 1);
    const replacement = signature[index] === "A" ? "B" : "A";
    const flipped = `${parts[0]}.${parts[1]}.${signature.slice(0, index)}${replacement}${signature.slice(index + 1)}`;
    expect(await verify(flipped)).toEqual({ ok: false, reason: "invalid_signature" });
    expect(
      await verifyHororaStagingModuleClientAssertion(signed.assertion, { nowSeconds: NOW })
    ).toEqual({ ok: false, reason: "invalid_signature" });
  });
});

describe("HORORA staging opaque code exchange", () => {
  it("posts only the code and the private_key_jwt to the staging exchange", async () => {
    const material = await testMaterial();
    const secret = String(material.privateJwk.d);
    const calls: Array<{ url: string; body: string }> = [];
    let result: Awaited<ReturnType<typeof exchangeNexusOpaqueHandoffCode>> = {
      ok: false,
      reason: "exchange_unreachable",
    };
    await captureConsole(secret, async () => {
      result = await exchangeNexusOpaqueHandoffCode({
        code: CODE,
        privateJwk: material.privateJwk,
        expectedPublicJwk: material.publicJwk,
        nowSeconds: NOW,
        fetchImpl: async (url, init) => {
          calls.push({ url: String(url), body: String(init?.body) });
          return new Response(
            JSON.stringify({
              assertion: "header.payload.signature",
              tenant_id: "evil-tenant",
              organization_id: "evil-org",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      });
    });

    expect(result).toEqual({ ok: true, assertion: "header.payload.signature" });
    expect(JSON.stringify(result)).not.toContain("evil-tenant");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(HORORA_STAGING_NEXUS_EXCHANGE_URL);
    const body = new URLSearchParams(calls[0]?.body);
    expect(Array.from(body.keys()).sort()).toEqual([
      "client_assertion",
      "client_assertion_type",
      "code",
    ]);
    expect(body.get("code")).toBe(CODE);
    expect(body.get("client_assertion_type")).toBe(HORORA_STAGING_NEXUS_CLIENT_ASSERTION_TYPE);
    expect(body.get("tenant_id")).toBeNull();
    expect(body.get("organization_id")).toBeNull();
    expect(body.get("handoff")).toBeNull();
    const clientAssertion = body.get("client_assertion") ?? "";
    expect(clientAssertion).not.toContain(secret);
    expect(
      await verifyHororaStagingModuleClientAssertion(clientAssertion, {
        publicJwk: material.publicJwk,
        nowSeconds: NOW,
      })
    ).toEqual({ ok: true, clientId: HORORA_STAGING_NEXUS_MODULE_CLIENT_ID });
    expect(calls[0]?.body).not.toContain(secret);
  });

  it("keeps browser tenant and organization out of the exchange body", () => {
    const browser = new URLSearchParams({
      code: CODE,
      tenant_id: "evil-tenant",
      organization_id: "evil-org",
      handoff: "browser.assertion.value",
    });
    const body = buildNexusOpaqueExchangeBody({
      code: CODE,
      clientAssertion: "header.payload.signature",
    });
    expect(browser.get("tenant_id")).toBe("evil-tenant");
    expect(body.get("tenant_id")).toBeNull();
    expect(body.get("organization_id")).toBeNull();
    expect(body.get("handoff")).toBeNull();
    expect(selectOpaqueHandoffCode(CODE, null)).toEqual({ ok: true, code: CODE });
    expect(selectOpaqueHandoffCode("short", null)).toEqual({ ok: false, reason: "invalid_code" });
    expect(selectOpaqueHandoffCode(CODE, "other-opaque-code")).toEqual({
      ok: false,
      reason: "code_mismatch",
    });
  });

  it("fails closed when Nexus does not return an assertion", async () => {
    const material = await testMaterial();
    const rejected = await exchangeNexusOpaqueHandoffCode({
      code: CODE,
      privateJwk: material.privateJwk,
      expectedPublicJwk: material.publicJwk,
      nowSeconds: NOW,
      fetchImpl: async () => new Response("no", { status: 401 }),
    });
    expect(rejected).toEqual({ ok: false, reason: "exchange_rejected" });
    const missing = await exchangeNexusOpaqueHandoffCode({
      code: CODE,
      privateJwk: material.privateJwk,
      expectedPublicJwk: material.publicJwk,
      nowSeconds: NOW,
      fetchImpl: async () =>
        new Response(JSON.stringify({ tenant_id: "evil-tenant" }), { status: 200 }),
    });
    expect(missing).toEqual({ ok: false, reason: "assertion_missing" });
  });
});

describe("HORORA staging opaque callback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts ?code= on Staging without a browser assertion", async () => {
    const exchange = vi.fn();
    const inspect = vi.fn();
    const response = await handleNexusCallback(
      new Request(`https://time.staging.tagora.ca/auth/nexus/callback?code=${CODE}`, {
        headers: { "sec-fetch-dest": "document" },
      }),
      { exchangeOpaqueCode: exchange, inspectHandoff: inspect }
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`id="${NEXUS_CALLBACK_OPAQUE_CODE_FORM_ID}"`);
    expect(html).toContain('name="code"');
    expect(html).toContain(`value="${CODE}"`);
    expect(html).not.toContain('name="handoff"');
    expect(html).toContain('action="https://time.staging.tagora.ca/auth/nexus/callback"');
    expect(exchange).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not require a browser assertion on the staging vercel host", () => {
    const request = new Request(
      `https://tagora-time-staging.vercel.app/auth/nexus/callback?code=${CODE}&handoff=browser.assertion.value`
    );
    expect(isHororaStagingOpaqueCallbackRequest(request)).toBe(true);
    expect(
      isHororaStagingOpaqueCallbackRequest(
        new Request(`https://time.tagora.ca/auth/nexus/callback?code=${CODE}`)
      )
    ).toBe(false);
  });

  it("keeps Production on the handoff assertion path", async () => {
    const exchange = vi.fn();
    const response = await handleNexusCallback(
      new Request(`https://time.tagora.ca/auth/nexus/callback?code=${CODE}`),
      { exchangeOpaqueCode: exchange }
    );
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "https://time.tagora.ca");
    expect(location.pathname).toBe("/auth/nexus/denied");
    expect(location.searchParams.get("reason")).toBe("handoff_missing");
    expect(exchange).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("exchanges the opaque code server-side and preserves verification, mint, and replay", async () => {
    const { token, jwks } = await handoffToken();
    const store = replayStore();
    const seen: Array<{ search: string; handoff: unknown }> = [];
    const exchange = vi.fn(async (input: { code: string }) => {
      expect(input.code).toBe(CODE);
      return { ok: true as const, assertion: token };
    });
    const deps = {
      exchangeOpaqueCode: exchange,
      async completePhaseA(input: { searchParams: URLSearchParams; body: unknown }) {
        seen.push({
          search: input.searchParams.toString(),
          handoff:
            input.body && typeof input.body === "object"
              ? (input.body as Record<string, unknown>).handoff
              : null,
        });
        return completeNexusCallbackPhaseA(input, {
          verifyOptions: { config: HANDOFF_CONFIG, jwks, nowSeconds: NOW },
          lookups: handoffLookups(),
          replayStore: store,
          mintOptions: {
            env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" },
            async loadAuthUserById(id: string) {
              return { id };
            },
            async issueSessionForExistingUser() {
              return {
                ok: true as const,
                cookieHeader:
                  "horora_nx_session=opaque-test-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
                redirectPath: "/admin/dashboard",
              };
            },
          },
        });
      },
    };
    const requestUrl =
      "https://tagora-time-staging.vercel.app/auth/nexus/callback?tenant_id=evil-tenant&organization_id=evil-org&handoff=browser.assertion.value";
    const first = await handleNexusCallback(
      new Request(requestUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://tagora-time-staging.vercel.app",
        },
        body: `code=${CODE}`,
      }),
      deps
    );
    expect(first.status).toBe(303);
    expect(new URL(first.headers.get("location") ?? "https://x.invalid").pathname).toBe(
      "/admin/dashboard"
    );
    expect(first.headers.get("set-cookie")).toContain("horora_nx_session=");
    expect(first.headers.get("set-cookie")).toContain("HttpOnly");
    expect(seen[0]?.search).toBe("");
    expect(seen[0]?.handoff).toBe(token);
    expect(seen[0]?.handoff).not.toBe("browser.assertion.value");
    expect(exchange).toHaveBeenCalledTimes(1);

    const second = await handleNexusCallback(
      new Request("https://tagora-time-staging.vercel.app/auth/nexus/callback", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://tagora-time-staging.vercel.app",
        },
        body: `code=${CODE}`,
      }),
      deps
    );
    expect(second.status).toBe(303);
    const denied = new URL(second.headers.get("location") ?? "https://x.invalid");
    expect(denied.pathname).toBe("/auth/nexus/denied");
    expect(denied.searchParams.get("reason")).toBe("replay");
    expect(second.headers.get("set-cookie")).toBeNull();
  });

  it("still verifies a direct handoff assertion on Staging", async () => {
    const { token, jwks } = await handoffToken();
    const store = replayStore();
    const minted = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { config: HANDOFF_CONFIG, jwks, nowSeconds: NOW },
        lookups: handoffLookups(),
        replayStore: store,
        mintOptions: {
          env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" },
          async loadAuthUserById(id: string) {
            return { id };
          },
          async issueSessionForExistingUser() {
            return {
              ok: true as const,
              cookieHeader:
                "horora_nx_session=opaque-test-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
              redirectPath: "/admin/dashboard",
            };
          },
        },
      }
    );
    expect(minted.ok).toBe(true);
    const replay = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { config: HANDOFF_CONFIG, jwks, nowSeconds: NOW },
        lookups: handoffLookups(),
        replayStore: store,
        mintOptions: {
          env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" },
          async loadAuthUserById(id: string) {
            return { id };
          },
          async issueSessionForExistingUser() {
            return {
              ok: true as const,
              cookieHeader:
                "horora_nx_session=opaque-test-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
              redirectPath: "/admin/dashboard",
            };
          },
        },
      }
    );
    expect(replay).toEqual({ ok: false, reason: "replay" });
  });
});

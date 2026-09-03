import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWK,
  type KeyObject,
} from "jose";
import { describe, expect, it } from "vitest";
import {
  extractNexusHandoffToken,
  verifyTagoraHandoffV1,
} from "@/app/lib/auth/nexus-handoff";
import {
  FORBIDDEN_NEXUS_AUTHORITY_CLAIMS,
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_VERSION,
  NEXUS_TECHNICAL_MODULE_KEY,
} from "@/app/lib/auth/nexus-handoff-config";

const ISSUER = "https://nexus-handoff.test";
const SUBJECT = "actor-nexus-1";
const NOW = 1_700_000_000;

type PrivateSigningKey = CryptoKey | KeyObject;

type KeyBundle = {
  privateKey: PrivateSigningKey;
  jwks: ReturnType<typeof createLocalJWKSet>;
  kid: string;
};

const CONFIG = {
  issuer: ISSUER,
  audience: NEXUS_HANDOFF_AUDIENCE,
  jwksUrl: "https://nexus-handoff.test/jwks.json",
  expectedModuleKey: NEXUS_TECHNICAL_MODULE_KEY,
  clockToleranceSeconds: 30 as const,
  maxTtlSeconds: 120 as const,
};

async function createEs256Bundle(kid = "nexus-es256"): Promise<KeyBundle> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  return {
    privateKey,
    jwks: createLocalJWKSet({ keys: [publicJwk as JWK] }),
    kid,
  };
}

function baseClaims(overrides: Record<string, unknown> = {}) {
  return {
    typ: NEXUS_HANDOFF_VERSION,
    handoff_version: NEXUS_HANDOFF_VERSION,
    module_key: NEXUS_TECHNICAL_MODULE_KEY,
    user_id: SUBJECT,
    organization_id: "org_tagora_internal",
    membership_id: "membership-1",
    tenant_id: "tenant-1",
    handoff_id: "handoff-1",
    grant_id: "grant-1",
    grant_version: "1",
    jti: "jti-1",
    nonce: "nonce-1",
    ...overrides,
  };
}

async function signHandoff(options: {
  privateKey: PrivateSigningKey;
  kid?: string;
  alg?: "ES256" | "RS256";
  typ?: string;
  claims?: Record<string, unknown>;
  issuer?: string;
  audience?: string;
  subject?: string;
  issuedAt?: number;
  notBefore?: number;
  expiresAt?: number;
}): Promise<string> {
  const header: { alg: "ES256" | "RS256"; kid?: string; typ?: string } = {
    alg: options.alg ?? "ES256",
    typ: options.typ ?? NEXUS_HANDOFF_VERSION,
  };
  if (options.kid) header.kid = options.kid;
  return new SignJWT(baseClaims(options.claims))
    .setProtectedHeader(header)
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? NEXUS_HANDOFF_AUDIENCE)
    .setSubject(options.subject ?? SUBJECT)
    .setIssuedAt(options.issuedAt ?? NOW)
    .setNotBefore(options.notBefore ?? NOW)
    .setExpirationTime(options.expiresAt ?? NOW + 60)
    .sign(options.privateKey);
}

function compactUnsigned(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode(header)}.${encode(payload)}.sig`;
}

describe("TAGORA_HANDOFF_V1 verifier", () => {
  it("accepts a valid ES256 assertion and keeps nonce", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({ privateKey: keys.privateKey, kid: keys.kid });
    const result = await verifyTagoraHandoffV1(token, {
      config: CONFIG,
      jwks: keys.jwks,
      nowSeconds: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.module_key).toBe(NEXUS_TECHNICAL_MODULE_KEY);
      expect(result.claims.nonce).toBe("nonce-1");
      expect(result.claims.user_id).toBe(SUBJECT);
    }
  });

  it("denies a wrong issuer", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      issuer: "https://other-issuer.test",
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "invalid_issuer" });
  });

  it("denies a wrong audience", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      audience: "tagora:stock-premium",
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "invalid_audience" });
  });

  it("denies a wrong module key", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      claims: { module_key: "tagora_stock_premium" },
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "invalid_module_key" });
  });

  it("denies a missing nonce", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      claims: { nonce: "  " },
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "missing_claim" });
  });

  it("denies a missing membership_id", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      claims: { membership_id: "" },
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "missing_claim" });
  });

  it("denies an expired assertion", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      issuedAt: NOW - 180,
      notBefore: NOW - 180,
      expiresAt: NOW - 60,
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "expired_token" });
  });

  it("denies a future assertion", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      issuedAt: NOW + 120,
      notBefore: NOW + 120,
      expiresAt: NOW + 180,
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "future_token" });
  });

  it("denies TTL above 120 seconds", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      issuedAt: NOW,
      notBefore: NOW,
      expiresAt: NOW + 121,
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "ttl_exceeded" });
  });

  it("denies a missing entitlement", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      claims: { grant_id: "   " },
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "missing_entitlement" });
  });

  it("denies a revoked membership", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      claims: { membership_status: "revoked" },
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "revoked_membership" });
  });

  it("denies an unknown kid against the published JWKS kids", async () => {
    const keys = await createEs256Bundle("known-kid");
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: "unknown-kid",
    });
    await expect(
      verifyTagoraHandoffV1(token, {
        config: CONFIG,
        jwks: keys.jwks,
        nowSeconds: NOW,
        knownKids: ["known-kid"],
      })
    ).resolves.toEqual({ ok: false, reason: "unknown_kid" });
  });

  it("extracts the handoff query without logging it", () => {
    const params = new URLSearchParams({ handoff: "raw.jwt.value" });
    expect(extractNexusHandoffToken({ searchParams: params })).toBe("raw.jwt.value");
  });

  it("denies HS256 and a missing kid", async () => {
    const keys = await createEs256Bundle();
    const hs256 = compactUnsigned(
      { alg: "HS256", kid: "k", typ: NEXUS_HANDOFF_VERSION },
      baseClaims({ iat: NOW, nbf: NOW, exp: NOW + 60, iss: ISSUER, aud: NEXUS_HANDOFF_AUDIENCE, sub: SUBJECT })
    );
    await expect(
      verifyTagoraHandoffV1(hs256, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "disallowed_algorithm" });

    const token = await signHandoff({ privateKey: keys.privateKey });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "missing_kid" });
  });

  it("denies a wrong signature", async () => {
    const signer = await createEs256Bundle("nexus-es256");
    const other = await createEs256Bundle("nexus-es256");
    const token = await signHandoff({
      privateKey: signer.privateKey,
      kid: signer.kid,
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: other.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("denies forbidden authority claims", async () => {
    const keys = await createEs256Bundle();
    for (const claim of FORBIDDEN_NEXUS_AUTHORITY_CLAIMS) {
      const token = await signHandoff({
        privateKey: keys.privateKey,
        kid: keys.kid,
        claims: { [claim]: true, jti: `jti-${claim}` },
      });
      await expect(
        verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
      ).resolves.toEqual({ ok: false, reason: "forbidden_authority_claim" });
    }
  });

  it("denies an unknown entry_role and accepts a Nexus entry role", async () => {
    const keys = await createEs256Bundle();
    const denied = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      claims: { entry_role: "super_admin" },
    });
    await expect(
      verifyTagoraHandoffV1(denied, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "invalid_entry_role" });

    const allowed = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      claims: { entry_role: "NEXUS_ENTRY_MEMBER", jti: "jti-entry" },
    });
    const result = await verifyTagoraHandoffV1(allowed, {
      config: CONFIG,
      jwks: keys.jwks,
      nowSeconds: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("denies email as canonical identity", async () => {
    const keys = await createEs256Bundle();
    const email = "user@example.test";
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      subject: email,
      claims: { user_id: email },
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "email_identity_forbidden" });
  });

  it("denies user_id that does not match sub", async () => {
    const keys = await createEs256Bundle();
    const token = await signHandoff({
      privateKey: keys.privateKey,
      kid: keys.kid,
      claims: { user_id: "other-actor" },
    });
    await expect(
      verifyTagoraHandoffV1(token, { config: CONFIG, jwks: keys.jwks, nowSeconds: NOW })
    ).resolves.toEqual({ ok: false, reason: "missing_claim" });
  });
});

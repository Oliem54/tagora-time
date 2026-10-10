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
  HORORA_ROLE_ASSIGNMENT_AUDIENCE,
  HORORA_ROLE_CATALOG_AUDIENCE,
  HORORA_ROLE_CONSENT_TYP,
  verifyTagoraRoleConsentV1,
} from "@/app/lib/auth/horora-role-consent-token.server";
import {
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_VERSION,
  NEXUS_TECHNICAL_MODULE_KEY,
} from "@/app/lib/auth/nexus-handoff-config";

const ISSUER = "https://nexus-handoff.test";
const NOW = 1_700_000_000;
const ADMIN = "nuser_admin_fixture";
const TARGET = "nuser_consent_fixture";

const CONFIG = {
  issuer: ISSUER,
  audience: NEXUS_HANDOFF_AUDIENCE,
  jwksUrl: "https://nexus-handoff.test/jwks.json",
  expectedModuleKey: NEXUS_TECHNICAL_MODULE_KEY,
  clockToleranceSeconds: 30 as const,
  maxTtlSeconds: 120 as const,
};

type PrivateSigningKey = CryptoKey | KeyObject;

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "consent-test";
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  return { privateKey, jwks: createLocalJWKSet({ keys: [publicJwk as JWK] }) };
}

function claims(audience: string, overrides: Record<string, unknown> = {}) {
  return {
    typ: HORORA_ROLE_CONSENT_TYP,
    module_key: NEXUS_TECHNICAL_MODULE_KEY,
    admin_user_id: ADMIN,
    target_user_id: TARGET,
    organization_id: "org_consent_fixture",
    tenant_id: "tenant-consent",
    environment: "staging",
    jti: "operation-consent-1",
    ...overrides,
    aud: audience,
  };
}

async function sign(input: {
  privateKey: PrivateSigningKey;
  audience: string;
  issuer?: string;
  typ?: string;
  claims?: Record<string, unknown>;
}) {
  const headerTyp = input.typ ?? HORORA_ROLE_CONSENT_TYP;
  return new SignJWT(input.claims ?? claims(input.audience))
    .setProtectedHeader({ alg: "ES256", kid: "consent-test", typ: headerTyp })
    .setIssuer(input.issuer ?? ISSUER)
    .setSubject(ADMIN)
    .setAudience(input.audience)
    .setIssuedAt(NOW)
    .setNotBefore(NOW)
    .setExpirationTime(NOW + 60)
    .setJti("operation-consent-1")
    .sign(input.privateKey);
}

describe("TAGORA_ROLE_CONSENT_V1 verification", () => {
  it("accepts each exact audience and refuses the other", async () => {
    const bundle = await keys();
    const catalog = await sign({
      privateKey: bundle.privateKey,
      audience: HORORA_ROLE_CATALOG_AUDIENCE,
    });
    const assignment = await sign({
      privateKey: bundle.privateKey,
      audience: HORORA_ROLE_ASSIGNMENT_AUDIENCE,
      claims: claims(HORORA_ROLE_ASSIGNMENT_AUDIENCE, {
        user_module_access_id: "uma_consent",
        module_role_assignment_id: "mra_consent",
        role_key: "employe",
        assignment_version: 1,
        catalog_version: "horora-role-catalog-v1",
        operation: "ASSIGN",
        previous_role_key: null,
      }),
    });

    const catalogOk = await verifyTagoraRoleConsentV1(catalog, {
      audience: HORORA_ROLE_CATALOG_AUDIENCE,
      config: CONFIG,
      jwks: bundle.jwks,
      nowSeconds: NOW,
    });
    const assignmentOk = await verifyTagoraRoleConsentV1(assignment, {
      audience: HORORA_ROLE_ASSIGNMENT_AUDIENCE,
      config: CONFIG,
      jwks: bundle.jwks,
      nowSeconds: NOW,
    });
    const crossed = await verifyTagoraRoleConsentV1(catalog, {
      audience: HORORA_ROLE_ASSIGNMENT_AUDIENCE,
      config: CONFIG,
      jwks: bundle.jwks,
      nowSeconds: NOW,
    });

    expect(catalogOk.ok).toBe(true);
    expect(assignmentOk.ok).toBe(true);
    if (catalogOk.ok) expect(catalogOk.claims.audience).toBe(HORORA_ROLE_CATALOG_AUDIENCE);
    if (assignmentOk.ok) {
      expect(assignmentOk.claims.adminUserId).toBe(ADMIN);
      expect(assignmentOk.claims.targetUserId).toBe(TARGET);
      expect(assignmentOk.claims.assignment?.roleKey).toBe("employe");
    }
    expect(crossed).toEqual({ ok: false, reason: "invalid_audience" });
  });

  it("refuses a valid user handoff, a bad issuer, type, module, environment, and organization", async () => {
    const bundle = await keys();
    const verify = (token: string) =>
      verifyTagoraRoleConsentV1(token, {
        audience: HORORA_ROLE_CATALOG_AUDIENCE,
        config: CONFIG,
        jwks: bundle.jwks,
        nowSeconds: NOW,
      });

    const handoff = await sign({
      privateKey: bundle.privateKey,
      audience: NEXUS_HANDOFF_AUDIENCE,
      typ: NEXUS_HANDOFF_VERSION,
      claims: {
        typ: NEXUS_HANDOFF_VERSION,
        handoff_version: NEXUS_HANDOFF_VERSION,
        module_key: NEXUS_TECHNICAL_MODULE_KEY,
        user_id: TARGET,
        organization_id: "org_consent_fixture",
        membership_id: "membership-1",
        tenant_id: "tenant-consent",
        handoff_id: "handoff-1",
        grant_id: "grant-1",
        grant_version: "1",
        jti: "jti-handoff",
        nonce: "nonce-1",
        environment: "staging",
      },
    });
    const badIssuer = await sign({
      privateKey: bundle.privateKey,
      audience: HORORA_ROLE_CATALOG_AUDIENCE,
      issuer: "https://other.example",
    });
    const badType = await sign({
      privateKey: bundle.privateKey,
      audience: HORORA_ROLE_CATALOG_AUDIENCE,
      claims: claims(HORORA_ROLE_CATALOG_AUDIENCE, { typ: "OTHER" }),
    });
    const badModule = await sign({
      privateKey: bundle.privateKey,
      audience: HORORA_ROLE_CATALOG_AUDIENCE,
      claims: claims(HORORA_ROLE_CATALOG_AUDIENCE, { module_key: "tagora_stock" }),
    });
    const production = await sign({
      privateKey: bundle.privateKey,
      audience: HORORA_ROLE_CATALOG_AUDIENCE,
      claims: claims(HORORA_ROLE_CATALOG_AUDIENCE, { environment: "production" }),
    });
    const unknownEnv = await sign({
      privateKey: bundle.privateKey,
      audience: HORORA_ROLE_CATALOG_AUDIENCE,
      claims: claims(HORORA_ROLE_CATALOG_AUDIENCE, { environment: "preview" }),
    });
    const missingOrg = await sign({
      privateKey: bundle.privateKey,
      audience: HORORA_ROLE_CATALOG_AUDIENCE,
      claims: claims(HORORA_ROLE_CATALOG_AUDIENCE, { organization_id: " " }),
    });

    expect(await verify(handoff)).toEqual({ ok: false, reason: "handoff_refused" });
    expect(await verify(badIssuer)).toEqual({ ok: false, reason: "invalid_issuer" });
    expect(await verify(badType)).toEqual({ ok: false, reason: "invalid_typ" });
    expect(await verify(badModule)).toEqual({ ok: false, reason: "invalid_module_key" });
    expect(await verify(production)).toEqual({ ok: false, reason: "invalid_environment" });
    expect(await verify(unknownEnv)).toEqual({ ok: false, reason: "invalid_environment" });
    expect(await verify(missingOrg)).toEqual({ ok: false, reason: "missing_claim" });
  });

  it("refuses an invalid signature, an expired token, and a missing tenant", async () => {
    const bundle = await keys();
    const other = await keys();
    const verify = (token: string, nowSeconds = NOW) =>
      verifyTagoraRoleConsentV1(token, {
        audience: HORORA_ROLE_CATALOG_AUDIENCE,
        config: CONFIG,
        jwks: bundle.jwks,
        nowSeconds,
      });
    const valid = await sign({
      privateKey: bundle.privateKey,
      audience: HORORA_ROLE_CATALOG_AUDIENCE,
    });
    const signedByOther = await sign({
      privateKey: other.privateKey,
      audience: HORORA_ROLE_CATALOG_AUDIENCE,
    });
    const expired = await new SignJWT(claims(HORORA_ROLE_CATALOG_AUDIENCE))
      .setProtectedHeader({ alg: "ES256", kid: "consent-test", typ: HORORA_ROLE_CONSENT_TYP })
      .setIssuer(ISSUER)
      .setSubject(ADMIN)
      .setAudience(HORORA_ROLE_CATALOG_AUDIENCE)
      .setIssuedAt(NOW - 90)
      .setNotBefore(NOW - 90)
      .setExpirationTime(NOW - 60)
      .setJti("operation-consent-1")
      .sign(bundle.privateKey);
    const missingTenant = await sign({
      privateKey: bundle.privateKey,
      audience: HORORA_ROLE_CATALOG_AUDIENCE,
      claims: claims(HORORA_ROLE_CATALOG_AUDIENCE, { tenant_id: " " }),
    });

    expect(await verify(valid)).toMatchObject({ ok: true });
    expect(await verify(signedByOther)).toEqual({ ok: false, reason: "invalid_signature" });
    expect(await verify(expired)).toEqual({ ok: false, reason: "expired_token" });
    expect(await verify(missingTenant)).toEqual({ ok: false, reason: "missing_claim" });
  });
});

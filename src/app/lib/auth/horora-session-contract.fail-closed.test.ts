import { describe, expect, it } from "vitest";
import { completeNexusCallbackPhaseA } from "@/app/lib/auth/nexus-callback.server";
import {
  HORORA_NEXUS_SESSION_CUTOVER_AT,
  HORORA_SESSION_CONTRACT_PREFIX,
  HORORA_SESSION_CONTRACT_VERSION,
  encodeBrokeredSessionCookieValue,
  isIssuedBeforeSessionCutover,
  isLegacyHororaLoginPath,
  looksLikeSupabaseJwt,
  parseBrokeredSessionCookieValue,
  resolveHororaRequestAccess,
  sanitizedHororaSessionProvenance,
} from "@/app/lib/auth/horora-session-contract";
import {
  NEXUS_BROKERED_SESSION_COOKIE_NAME,
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_VERSION,
  NEXUS_TECHNICAL_MODULE_KEY,
} from "@/app/lib/auth/nexus-handoff-config";
import {
  createBrokeredHororaSession,
  createMemoryBrokeredSessionStore,
  generateOpaqueSessionToken,
  hashOpaqueSessionToken,
  resolveBrokeredHororaSessionFromCookies,
  type NexusBrokeredRevalidationLookups,
} from "@/app/lib/auth/nexus-brokered-session";
import { resolveAuthorizedMappingTarget } from "@/app/lib/auth/nexus-identity-mapping.server";
import type { NexusMappingLookups } from "@/app/lib/auth/nexus-identity-mapping.server";
import type { NexusReplayStore } from "@/app/lib/auth/nexus-handoff-replay.server";
import type { MembershipRow } from "@/app/lib/saas/organization-membership.shared";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";
import { getLoginPathForRole } from "@/app/lib/auth/roles";
import { loginPathForMissingMfaSession } from "@/app/lib/auth/password-mfa.shared";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { DEFAULT_HORORA_NEXUS_ORGANIZATION_ID } from "@/app/lib/auth/nexus-handoff-config";

const AUTH_USER = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const SUBJECT = "actor-contract";
const ISSUER = "https://nexus-handoff.test";
const NOW = 1_700_000_000;

const BINDING = {
  nexusActorId: SUBJECT,
  nexusOrganizationId: "nexus-org-1",
  nexusMembershipId: "mem-1",
  authUserId: AUTH_USER,
  organizationId: ORG_ID,
  membershipId: MEMBERSHIP_ID,
  membershipRole: "employe" as const,
  role: "employe" as const,
};

function lookups(): NexusBrokeredRevalidationLookups {
  return {
    async authUserExists(id) {
      return id === AUTH_USER;
    },
    async findMembershipById(id) {
      if (id !== MEMBERSHIP_ID) return null;
      return {
        id: MEMBERSHIP_ID,
        organization_id: ORG_ID,
        role: "employe",
        status: "active",
        is_default: true,
        user_id: AUTH_USER,
      };
    },
    async findOrganizationById() {
      return { id: ORG_ID, status: "active", deleted_at: null };
    },
  };
}

function cookieReader(header: string) {
  const match = header.match(new RegExp(`${NEXUS_BROKERED_SESSION_COOKIE_NAME}=([^;]*)`));
  const token = match?.[1] ?? "";
  return {
    get(name: string) {
      return name === NEXUS_BROKERED_SESSION_COOKIE_NAME ? token : undefined;
    },
  };
}

function mappingLookups(): NexusMappingLookups {
  const membership: MembershipRow = {
    id: MEMBERSHIP_ID,
    organization_id: ORG_ID,
    role: "employe",
    status: "active",
    is_default: true,
  };
  return {
    async findIdentityMaps() {
      return [{ nexus_actor_id: SUBJECT, auth_user_id: AUTH_USER, disabled_at: null }];
    },
    async authUserExists() {
      return true;
    },
    async findMembershipsForUser() {
      return [membership];
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
  };
}

function replayStore(): NexusReplayStore {
  const seen: string[] = [];
  return {
    async insertReceipt(input) {
      const key = `${input.jti}:${input.nonce}`;
      if (seen.includes(key)) return { duplicate: true };
      seen.push(key);
      return { duplicate: false };
    },
  };
}

async function signedHandoff() {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "contract-kid";
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
    handoff_id: "h-contract",
    grant_id: "g1",
    grant_version: "1",
    jti: "jti-contract",
    nonce: "nonce-contract",
  })
    .setProtectedHeader({
      alg: "ES256",
      kid: "contract-kid",
      typ: NEXUS_HANDOFF_VERSION,
    })
    .setIssuer(ISSUER)
    .setAudience(NEXUS_HANDOFF_AUDIENCE)
    .setSubject(SUBJECT)
    .setIssuedAt(NOW)
    .setNotBefore(NOW)
    .setExpirationTime(NOW + 60)
    .sign(privateKey);
  return { token, jwks: createLocalJWKSet({ keys: [publicJwk] }) };
}

describe("HORORA Nexus session contract fail-closed", () => {
  it("valid Nexus handoff creates a contracted HORORA session", async () => {
    const issued = await signedHandoff();
    const store = createMemoryBrokeredSessionStore();
    const minted = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: issued.token }), body: null },
      {
        verifyOptions: {
          config: {
            issuer: ISSUER,
            audience: NEXUS_HANDOFF_AUDIENCE,
            jwksUrl: "https://nexus-handoff.test/jwks.json",
            expectedModuleKey: NEXUS_TECHNICAL_MODULE_KEY,
            clockToleranceSeconds: 30 as const,
            maxTtlSeconds: 120 as const,
          },
          jwks: issued.jwks,
          nowSeconds: NOW,
        },
        lookups: mappingLookups(),
        replayStore: replayStore(),
        mintOptions: {
          env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" },
          loadAuthUserById: async (id) => ({ id }),
          brokeredStore: store,
          cookieEnvironment: "production",
        },
      }
    );
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;
    expect(minted.redirectPath).toBe("/employe/dashboard");
    const token = cookieReader(minted.cookieHeader).get(NEXUS_BROKERED_SESSION_COOKIE_NAME) ?? "";
    expect(token.startsWith(HORORA_SESSION_CONTRACT_PREFIX)).toBe(true);
    const parsed = parseBrokeredSessionCookieValue(token);
    expect(parsed).toEqual({
      ok: true,
      format: "current",
      contractVersion: HORORA_SESSION_CONTRACT_VERSION,
    });
    const resolved = await resolveBrokeredHororaSessionFromCookies(cookieReader(minted.cookieHeader), {
      store,
      lookups: lookups(),
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.principal.role).toBe("employe");
      expect(
        sanitizedHororaSessionProvenance({
          source: "nexus_handoff",
          identity_class: resolved.principal.role,
          tenant_present: "yes",
          issued_at: resolved.principal.createdAt,
          contract_version: HORORA_SESSION_CONTRACT_VERSION,
          validation: "accepted",
          reason: "nexus_handoff",
        }).source
      ).toBe("nexus_handoff");
    }
  });

  it("refresh of a valid Nexus session is accepted", async () => {
    const store = createMemoryBrokeredSessionStore();
    const created = await createBrokeredHororaSession(BINDING, {
      store,
      environment: "production",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const cookies = cookieReader(created.cookieHeader);
    const first = await resolveBrokeredHororaSessionFromCookies(cookies, {
      store,
      lookups: lookups(),
    });
    const refresh = await resolveBrokeredHororaSessionFromCookies(cookies, {
      store,
      lookups: lookups(),
    });
    expect(first.ok).toBe(true);
    expect(refresh.ok).toBe(true);
  });

  it("legacy HORORA / Supabase session is refused", async () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature";
    expect(looksLikeSupabaseJwt(jwt)).toBe(true);
    expect(parseBrokeredSessionCookieValue(jwt)).toEqual({
      ok: false,
      reason: "pre_cutover_cookie",
    });
    const refused = await resolveBrokeredHororaSessionFromCookies(
      {
        get(name) {
          return name === NEXUS_BROKERED_SESSION_COOKIE_NAME ? jwt : undefined;
        },
      },
      { store: createMemoryBrokeredSessionStore(), lookups: lookups() }
    );
    expect(refused).toEqual({ ok: false, reason: "pre_cutover_cookie" });
    expect(
      resolveHororaRequestAccess({
        pathname: "/employe/dashboard",
        hasBrokeredSessionCookie: false,
      })
    ).toEqual({ action: "redirect", location: NEXUS_PUBLIC_LOGIN_URL });
  });

  it("pre-cutover cookie without Nexus store provenance is refused", async () => {
    expect(isIssuedBeforeSessionCutover("2026-09-01T00:00:00.000Z")).toBe(true);
    expect(isIssuedBeforeSessionCutover(HORORA_NEXUS_SESSION_CUTOVER_AT)).toBe(false);
    const opaque = generateOpaqueSessionToken();
    const refused = await resolveBrokeredHororaSessionFromCookies(
      {
        get(name) {
          return name === NEXUS_BROKERED_SESSION_COOKIE_NAME ? opaque : undefined;
        },
      },
      { store: createMemoryBrokeredSessionStore(), lookups: lookups() }
    );
    expect(refused).toEqual({ ok: false, reason: "pre_cutover_cookie" });
  });

  it("direct employee dashboard without Nexus provenance is redirected", () => {
    expect(
      resolveHororaRequestAccess({
        pathname: "/employe/dashboard",
        hasBrokeredSessionCookie: false,
      })
    ).toEqual({ action: "redirect", location: NEXUS_PUBLIC_LOGIN_URL });
    expect(
      resolveHororaRequestAccess({
        pathname: "/employe/dashboard",
        hasBrokeredSessionCookie: true,
      })
    ).toEqual({ action: "next" });
  });

  it("local employee login is redirected to Nexus", () => {
    expect(isLegacyHororaLoginPath("/employe/login")).toBe(true);
    expect(
      resolveHororaRequestAccess({
        pathname: "/employe/login",
        hasBrokeredSessionCookie: false,
      })
    ).toEqual({ action: "redirect", location: NEXUS_PUBLIC_LOGIN_URL });
    expect(getLoginPathForRole("employe")).toBe(NEXUS_PUBLIC_LOGIN_URL);
    const page = readFileSync(join(process.cwd(), "src/app/employe/login/page.tsx"), "utf8");
    expect(page).toContain("NEXUS_PUBLIC_LOGIN_URL");
    expect(page).toContain("redirect");
    expect(page).not.toContain("signInWithPassword");
  });

  it("local direction login is redirected to Nexus", () => {
    expect(isLegacyHororaLoginPath("/direction/login")).toBe(true);
    expect(isLegacyHororaLoginPath("/login")).toBe(true);
    expect(isLegacyHororaLoginPath("/connexion")).toBe(true);
    expect(
      resolveHororaRequestAccess({
        pathname: "/direction/login",
        hasBrokeredSessionCookie: true,
      })
    ).toEqual({ action: "redirect", location: NEXUS_PUBLIC_LOGIN_URL });
    expect(getLoginPathForRole("direction")).toBe(NEXUS_PUBLIC_LOGIN_URL);
    expect(loginPathForMissingMfaSession("/direction/dashboard")).toBe(NEXUS_PUBLIC_LOGIN_URL);
    const page = readFileSync(join(process.cwd(), "src/app/direction/login/page.tsx"), "utf8");
    expect(page).toContain("NEXUS_PUBLIC_LOGIN_URL");
    expect(page).not.toContain("signInWithPassword");
  });

  it("fixed/default actor without a signed handoff is refused", async () => {
    expect(
      resolveAuthorizedMappingTarget("nuser_other", {
        HORORA_NEXUS_ACTOR_ID: SUBJECT,
        HORORA_AUTH_USER_ID: AUTH_USER,
        HORORA_ORGANIZATION_ID: ORG_ID,
        HORORA_NEXUS_ORGANIZATION_ID: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
      })
    ).toBeNull();
    const missing = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams(), body: null },
      {
        mintOptions: {
          env: {
            NEXUS_HORORA_SESSION_MINT_ENABLED: "true",
            HORORA_NEXUS_ACTOR_ID: SUBJECT,
            HORORA_AUTH_USER_ID: AUTH_USER,
            HORORA_ORGANIZATION_ID: ORG_ID,
          },
        },
      }
    );
    expect(missing).toEqual({ ok: false, reason: "missing_token" });
  });

  it("other actor and cross-tenant sessions are refused", async () => {
    const store = createMemoryBrokeredSessionStore();
    const created = await createBrokeredHororaSession(BINDING, { store, environment: "local" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const cookies = cookieReader(created.cookieHeader);
    const cross = await resolveBrokeredHororaSessionFromCookies(cookies, {
      store,
      lookups: {
        ...lookups(),
        async findMembershipById() {
          return {
            id: MEMBERSHIP_ID,
            organization_id: "55555555-5555-4555-8555-555555555555",
            role: "employe",
            status: "active",
            is_default: true,
            user_id: AUTH_USER,
          };
        },
      },
    });
    expect(cross).toEqual({ ok: false, reason: "cross_tenant" });

    expect(
      resolveAuthorizedMappingTarget("nuser_other_actor", {
        HORORA_NEXUS_ACTOR_ID: SUBJECT,
        HORORA_AUTH_USER_ID: AUTH_USER,
        HORORA_ORGANIZATION_ID: ORG_ID,
      })
    ).toBeNull();
  });

  it("grandfathers a still-valid Nexus opaque cookie minted before the contract prefix", async () => {
    const store = createMemoryBrokeredSessionStore();
    const opaque = generateOpaqueSessionToken();
    const tokenHash = await hashOpaqueSessionToken(opaque);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    await store.insert({
      tokenHash,
      authUserId: AUTH_USER,
      organizationId: ORG_ID,
      nexusActorId: SUBJECT,
      nexusOrganizationId: "nexus-org-1",
      membershipId: MEMBERSHIP_ID,
      createdAt,
      expiresAt,
      revokedAt: null,
    });
    const ok = await resolveBrokeredHororaSessionFromCookies(
      {
        get(name) {
          return name === NEXUS_BROKERED_SESSION_COOKIE_NAME ? opaque : undefined;
        },
      },
      { store, lookups: lookups() }
    );
    expect(ok.ok).toBe(true);
    expect(encodeBrokeredSessionCookieValue("abc").startsWith(HORORA_SESSION_CONTRACT_PREFIX)).toBe(
      true
    );
  });
});


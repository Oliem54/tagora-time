import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from "jose";
import { describe, expect, it } from "vitest";
import { completeNexusCallbackPhaseA } from "@/app/lib/auth/nexus-callback.server";
import { GET as callbackGet, POST as callbackPost } from "@/app/auth/nexus/callback/route";
import {
  NEXUS_CALLBACK_FAIL_CLOSED_PATH,
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_VERSION,
  NEXUS_TECHNICAL_MODULE_KEY,
  isNexusPasswordLoginPath,
  publicNexusCallbackDenyReason,
} from "@/app/lib/auth/nexus-handoff-config";
import type { NexusMappingLookups } from "@/app/lib/auth/nexus-identity-mapping.server";
import type { NexusReplayStore } from "@/app/lib/auth/nexus-handoff-replay.server";
import { createMemoryBrokeredSessionStore } from "@/app/lib/auth/nexus-brokered-session";
import type { OrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";

const ISSUER = "https://nexus-handoff.test";
const NOW = 1_700_000_000;
const SUBJECT = "actor-routing";
const AUTH_USER = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";

const CONFIG = {
  issuer: ISSUER,
  audience: NEXUS_HANDOFF_AUDIENCE,
  jwksUrl: "https://nexus-handoff.test/jwks.json",
  expectedModuleKey: NEXUS_TECHNICAL_MODULE_KEY,
  clockToleranceSeconds: 30 as const,
  maxTtlSeconds: 120 as const,
};

async function token(overrides: Record<string, unknown> = {}) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "k-routing";
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  const jwt = await new SignJWT({
    typ: NEXUS_HANDOFF_VERSION,
    handoff_version: NEXUS_HANDOFF_VERSION,
    module_key: NEXUS_TECHNICAL_MODULE_KEY,
    user_id: SUBJECT,
    organization_id: "nexus-org-1",
    membership_id: "mem-1",
    tenant_id: "tenant-1",
    handoff_id: "h-routing",
    grant_id: "g1",
    grant_version: "1",
    jti: `jti-${Math.random().toString(16).slice(2)}`,
    nonce: `nonce-${Math.random().toString(16).slice(2)}`,
    ...overrides,
  })
    .setProtectedHeader({ alg: "ES256", kid: "k-routing", typ: NEXUS_HANDOFF_VERSION })
    .setIssuer(ISSUER)
    .setAudience(NEXUS_HANDOFF_AUDIENCE)
    .setSubject(SUBJECT)
    .setIssuedAt(NOW)
    .setNotBefore(NOW)
    .setExpirationTime(NOW + 60)
    .sign(privateKey);
  return {
    token: jwt,
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
  };
}

function lookups(role: OrganizationMembershipRole | string): NexusMappingLookups {
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
          role,
          status: "active",
          is_default: true,
        },
      ];
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

async function completeForRole(role: OrganizationMembershipRole | string) {
  const issued = await token();
  return completeNexusCallbackPhaseA(
    { searchParams: new URLSearchParams({ handoff: issued.token }), body: null },
    {
      verifyOptions: { config: CONFIG, jwks: issued.jwks, nowSeconds: NOW },
      lookups: lookups(role),
      replayStore: replayStore(),
      mintOptions: {
        env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" },
        async loadAuthUserById(id: string) {
          return { id };
        },
        brokeredStore: createMemoryBrokeredSessionStore(),
        cookieEnvironment: "local",
      },
    }
  );
}

describe("HORORA account-type routing after Nexus handoff", () => {
  it("never treats a password login path as a successful callback", () => {
    expect(NEXUS_CALLBACK_FAIL_CLOSED_PATH).toBe("/auth/nexus/denied");
    expect(isNexusPasswordLoginPath("/employe/login")).toBe(true);
    expect(isNexusPasswordLoginPath("/admin/dashboard")).toBe(false);
    expect(publicNexusCallbackDenyReason("membership_absent")).toBe("membership_missing");
    expect(publicNexusCallbackDenyReason("expired_token")).toBe("handoff_expired");
  });

  it("routes organization_admin and organization_owner to /admin/dashboard", async () => {
    const admin = await completeForRole("organization_admin");
    expect(admin.ok).toBe(true);
    if (admin.ok) {
      expect(admin.redirectPath).toBe("/admin/dashboard");
      expect(isNexusPasswordLoginPath(admin.redirectPath)).toBe(false);
      expect(admin.cookieHeader).toContain("horora_nx_session=");
    }
    const owner = await completeForRole("organization_owner");
    expect(owner.ok).toBe(true);
    if (owner.ok) expect(owner.redirectPath).toBe("/admin/dashboard");
  });

  it("routes direction to /direction/dashboard", async () => {
    const result = await completeForRole("direction");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.redirectPath).toBe("/direction/dashboard");
  });

  it("routes employe to /employe/dashboard", async () => {
    const result = await completeForRole("employe");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.redirectPath).toBe("/employe/dashboard");
  });

  it("refuses an unrecognized role instead of defaulting to employe", async () => {
    const result = await completeForRole("chauffeur");
    expect(result).toEqual({ ok: false, reason: "role_mapping_denied" });
  });

  it("refuses missing and ambiguous memberships without a password redirect", async () => {
    const missingIssued = await token();
    const missing = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: missingIssued.token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks: missingIssued.jwks, nowSeconds: NOW },
        lookups: {
          ...lookups("employe"),
          async findMembershipsForUser() {
            return [];
          },
        },
        replayStore: replayStore(),
        mintOptions: { env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" } },
      }
    );
    expect(missing).toEqual({ ok: false, reason: "membership_missing" });

    const ambiguousIssued = await token();
    const ambiguous = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: ambiguousIssued.token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks: ambiguousIssued.jwks, nowSeconds: NOW },
        lookups: {
          ...lookups("employe"),
          async findMembershipsForUser() {
            return [
              {
                id: MEMBERSHIP_ID,
                organization_id: ORG_ID,
                role: "employe",
                status: "active",
                is_default: false,
              },
              {
                id: "77777777-7777-4777-8777-777777777777",
                organization_id: ORG_ID,
                role: "direction",
                status: "active",
                is_default: false,
              },
            ];
          },
        },
        replayStore: replayStore(),
        mintOptions: { env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" } },
      }
    );
    expect(ambiguous).toEqual({ ok: false, reason: "membership_ambiguous" });
  });

  it("refuses an expired handoff", async () => {
    const issued = await token();
    const expired = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: issued.token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks: issued.jwks, nowSeconds: NOW + 10_000 },
        lookups: lookups("organization_admin"),
        replayStore: replayStore(),
        mintOptions: { env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" } },
      }
    );
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe("expired_token");
  });

  it("refuses replay of a consumed handoff", async () => {
    const issued = await token({ jti: "jti-replay-once", nonce: "nonce-replay-once" });
    const deps = {
      verifyOptions: { config: CONFIG, jwks: issued.jwks, nowSeconds: NOW },
      lookups: lookups("organization_admin"),
      replayStore: replayStore(),
      mintOptions: {
        env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" },
        async loadAuthUserById(id: string) {
          return { id };
        },
        brokeredStore: createMemoryBrokeredSessionStore(),
        cookieEnvironment: "local" as const,
      },
    };
    const first = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: issued.token }), body: null },
      deps
    );
    expect(first.ok).toBe(true);
    const second = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: issued.token }), body: null },
      deps
    );
    expect(second).toEqual({ ok: false, reason: "replay" });
  });

  it("refuses a cross-tenant membership", async () => {
    const issued = await token();
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: issued.token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks: issued.jwks, nowSeconds: NOW },
        lookups: {
          ...lookups("organization_admin"),
          async findMembershipsForUser() {
            return [
              {
                id: MEMBERSHIP_ID,
                organization_id: "55555555-5555-4555-8555-555555555555",
                role: "organization_admin",
                status: "active",
                is_default: true,
              },
            ];
          },
        },
        replayStore: replayStore(),
        mintOptions: { env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" } },
      }
    );
    expect(result).toEqual({ ok: false, reason: "cross_tenant" });
  });

  it("never redirects the callback onto a HORORA password login", async () => {
    const missing = await callbackGet(
      new Request("http://localhost:3002/auth/nexus/callback")
    );
    const missingUrl = new URL(missing.headers.get("location") ?? "http://localhost");
    expect(missingUrl.pathname).toBe("/auth/nexus/denied");
    expect(isNexusPasswordLoginPath(missingUrl.pathname)).toBe(false);

    const posted = await callbackPost(
      new Request("http://localhost:3002/auth/nexus/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handoff: "not-a-jwt" }),
      })
    );
    const postedUrl = new URL(posted.headers.get("location") ?? "http://localhost");
    expect(postedUrl.pathname).toBe("/auth/nexus/denied");
    expect(isNexusPasswordLoginPath(postedUrl.pathname)).toBe(false);
    expect(posted.headers.get("set-cookie")).toBeNull();
  });

  it("keeps the denied page free of password fields and user_metadata authority", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/auth/nexus/denied/page.tsx"),
      "utf8"
    );
    expect(page).toContain("membership_missing");
    expect(page).toContain("membership_ambiguous");
    expect(page).toContain("role_mapping_denied");
    expect(page).not.toMatch(/type=["']password["']/);
    expect(page).not.toContain("user_metadata");
    expect(page).not.toContain("signInWithPassword");
  });
});

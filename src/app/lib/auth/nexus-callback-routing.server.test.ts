import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from "jose";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleNexusCallback } from "@/app/auth/nexus/callback/route";
import {
  completeNexusCallbackPhaseA,
  inspectNexusHandoff,
} from "@/app/lib/auth/nexus-callback.server";
import { createMemoryBrokeredSessionStore } from "@/app/lib/auth/nexus-brokered-session";
import {
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_VERSION,
  NEXUS_TECHNICAL_MODULE_KEY,
} from "@/app/lib/auth/nexus-handoff-config";
import type { NexusMappingLookups } from "@/app/lib/auth/nexus-identity-mapping.server";
import type { NexusReplayStore } from "@/app/lib/auth/nexus-handoff-replay.server";
import type { MembershipRow } from "@/app/lib/saas/organization-membership.shared";

const ISSUER = "https://nexus-handoff.test";
const NOW = 1_700_000_000;
const SUBJECT = "actor-1";
const AUTH_USER = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG = "55555555-5555-4555-8555-555555555555";

const CONFIG = {
  issuer: ISSUER,
  audience: NEXUS_HANDOFF_AUDIENCE,
  jwksUrl: "https://nexus-handoff.test/jwks.json",
  expectedModuleKey: NEXUS_TECHNICAL_MODULE_KEY,
  clockToleranceSeconds: 30 as const,
  maxTtlSeconds: 120 as const,
};

async function signToken(overrides: Record<string, unknown> = {}, times?: {
  iat?: number;
  nbf?: number;
  exp?: number;
  nowSeconds?: number;
}) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "k1";
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  const iat = times?.iat ?? NOW;
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
    jti: `jti-${Math.random().toString(36).slice(2, 10)}`,
    nonce: `nonce-${Math.random().toString(36).slice(2, 10)}`,
    ...overrides,
  })
    .setProtectedHeader({ alg: "ES256", kid: "k1", typ: NEXUS_HANDOFF_VERSION })
    .setIssuer(ISSUER)
    .setAudience(NEXUS_HANDOFF_AUDIENCE)
    .setSubject(SUBJECT)
    .setIssuedAt(iat)
    .setNotBefore(times?.nbf ?? iat)
    .setExpirationTime(times?.exp ?? iat + 60)
    .sign(privateKey);
  return {
    token,
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
    nowSeconds: times?.nowSeconds ?? NOW,
  };
}

function lookups(role: string = "organization_admin", extra: Partial<NexusMappingLookups> = {}): NexusMappingLookups {
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
        } satisfies MembershipRow,
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
    ...extra,
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

function mintOptions() {
  return {
    env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" },
    async loadAuthUserById(id: string) {
      return { id };
    },
    brokeredStore: createMemoryBrokeredSessionStore(),
    cookieEnvironment: "local" as const,
  };
}

async function completeForRole(role: string) {
  const { token, jwks, nowSeconds } = await signToken();
  return completeNexusCallbackPhaseA(
    { searchParams: new URLSearchParams({ handoff: token }), body: null },
    {
      verifyOptions: { config: CONFIG, jwks, nowSeconds },
      lookups: lookups(role),
      replayStore: replayStore(),
      mintOptions: mintOptions(),
    }
  );
}

describe("Nexus callback membership destinations", () => {
  it("routes organization_admin and organization_owner to /admin/dashboard", async () => {
    const admin = await completeForRole("organization_admin");
    expect(admin.ok).toBe(true);
    if (admin.ok) {
      expect(admin.redirectPath).toBe("/admin/dashboard");
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

  it("refuses a missing membership without a password login", async () => {
    const { token, jwks, nowSeconds } = await signToken();
    const result = await inspectNexusHandoff(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks, nowSeconds },
        lookups: lookups("employe", {
          async findMembershipsForUser() {
            return [];
          },
        }),
      }
    );
    expect(result).toEqual({ ok: false, reason: "membership_missing" });
  });

  it("refuses an unrecognized membership role without a password login", async () => {
    const { token, jwks, nowSeconds } = await signToken();
    const result = await inspectNexusHandoff(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks, nowSeconds },
        lookups: lookups("supervisor"),
      }
    );
    expect(result).toEqual({ ok: false, reason: "role_mapping_denied" });
  });

  it("refuses an ambiguous membership without choosing employe", async () => {
    const { token, jwks, nowSeconds } = await signToken();
    const result = await inspectNexusHandoff(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks, nowSeconds },
        lookups: lookups("employe", {
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
        }),
      }
    );
    expect(result).toEqual({ ok: false, reason: "membership_ambiguous" });
  });

  it("refuses a cross-tenant membership", async () => {
    const { token, jwks, nowSeconds } = await signToken();
    const result = await inspectNexusHandoff(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks, nowSeconds },
        lookups: lookups("organization_admin", {
          async findMembershipsForUser() {
            return [
              {
                id: MEMBERSHIP_ID,
                organization_id: OTHER_ORG,
                role: "organization_admin",
                status: "active",
                is_default: true,
              },
            ];
          },
        }),
      }
    );
    expect(result).toEqual({ ok: false, reason: "cross_tenant" });
  });

  it("refuses an expired handoff", async () => {
    const { token, jwks } = await signToken({}, { iat: NOW - 180, nbf: NOW - 180, exp: NOW - 60 });
    const result = await inspectNexusHandoff(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks, nowSeconds: NOW },
        lookups: lookups(),
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired_token");
  });

  it("never redirects a valid mint to /employe/login", async () => {
    const minted = await completeForRole("organization_admin");
    expect(minted.ok).toBe(true);
    if (minted.ok) {
      expect(minted.redirectPath).not.toBe("/employe/login");
      expect(minted.redirectPath).not.toBe("/direction/login");
      expect(minted.redirectPath).not.toBe("/login");
    }

    const response = await handleNexusCallback(
      new Request("https://tagora-time-staging.vercel.app/auth/nexus/callback", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://tagora-time-staging.vercel.app",
        },
        body: "handoff=unused",
      }),
      {
        async completePhaseA() {
          return {
            ok: true as const,
            cookieHeader:
              "horora_nx_session=opaque; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
            redirectPath: "/admin/dashboard",
          };
        },
      }
    );
    const location = new URL(response.headers.get("location") ?? "https://x.invalid/");
    expect(location.pathname).toBe("/admin/dashboard");
    expect(location.pathname).not.toBe("/employe/login");
    expect(response.headers.get("set-cookie")).toContain("horora_nx_session=");
  });

  it("rejects a mint that targets the employee password page", async () => {
    const { token, jwks, nowSeconds } = await signToken();
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks, nowSeconds },
        lookups: lookups(),
        replayStore: replayStore(),
        mintOptions: {
          env: { NEXUS_HORORA_SESSION_MINT_ENABLED: "true" },
          async loadAuthUserById(id: string) {
            return { id };
          },
          async issueSessionForExistingUser() {
            return {
              ok: true as const,
              cookieHeader: "horora_nx_session=x; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
              redirectPath: "/employe/login",
            };
          },
        },
      }
    );
    expect(result).toEqual({ ok: false, reason: "role_mapping_denied" });
  });

  it("maps public deny reasons away from password login", async () => {
    const expired = await handleNexusCallback(
      new Request("https://tagora-time-staging.vercel.app/auth/nexus/callback?handoff=x", {
        headers: { "sec-fetch-dest": "document" },
      }),
      {
        async inspectHandoff() {
          return { ok: false as const, reason: "expired_token" };
        },
      }
    );
    const expiredUrl = new URL(expired.headers.get("location") ?? "https://x.invalid/");
    expect(expiredUrl.pathname).toBe("/auth/nexus/denied");
    expect(expiredUrl.searchParams.get("reason")).toBe("handoff_expired");

    const replay = await handleNexusCallback(
      new Request("https://tagora-time-staging.vercel.app/auth/nexus/callback?handoff=x", {
        headers: { "sec-fetch-dest": "document" },
      }),
      {
        async inspectHandoff() {
          return {
            ok: true as const,
            token: "x",
            claims: {
              sub: SUBJECT,
              jti: "j",
              nonce: "n",
              iat: NOW,
              nbf: NOW,
              exp: NOW + 60,
              user_id: SUBJECT,
              organization_id: "nexus-org-1",
              membership_id: "mem-1",
              tenant_id: "tenant-1",
              module_key: NEXUS_TECHNICAL_MODULE_KEY,
              handoff_id: "h1",
              grant_id: "g1",
              grant_version: "1",
            },
            binding: {
              nexusActorId: SUBJECT,
              nexusOrganizationId: "nexus-org-1",
              nexusMembershipId: "mem-1",
              authUserId: AUTH_USER,
              organizationId: ORG_ID,
              membershipId: MEMBERSHIP_ID,
              membershipRole: "organization_admin",
              role: "admin",
            },
          };
        },
        async isReplayConsumed() {
          return { ok: true as const, consumed: true };
        },
      }
    );
    const replayUrl = new URL(replay.headers.get("location") ?? "https://x.invalid/");
    expect(replayUrl.pathname).toBe("/auth/nexus/denied");
    expect(replayUrl.searchParams.get("reason")).toBe("replay");
  });

  it("does not render a second HORORA password on the deny page", () => {
    const denied = readFileSync(join(process.cwd(), "src/app/auth/nexus/denied/page.tsx"), "utf8");
    expect(denied).not.toMatch(/type=["']password["']/);
    expect(denied).not.toContain("/employe/login");
    expect(denied).not.toContain("signInWithPassword");
    expect(denied).toContain("membership_missing");
    expect(denied).toContain("membership_ambiguous");
    expect(denied).toContain("role_mapping_denied");
  });
});

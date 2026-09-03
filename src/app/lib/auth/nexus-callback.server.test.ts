import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from "jose";
import { describe, expect, it } from "vitest";
import { completeNexusCallbackPhaseA, inspectNexusHandoff } from "@/app/lib/auth/nexus-callback.server";
import {
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_VERSION,
  NEXUS_TECHNICAL_MODULE_KEY,
} from "@/app/lib/auth/nexus-handoff-config";
import type { NexusMappingLookups } from "@/app/lib/auth/nexus-identity-mapping.server";
import type { NexusReplayStore } from "@/app/lib/auth/nexus-handoff-replay.server";
import { GET as callbackGet, POST as callbackPost } from "@/app/auth/nexus/callback/route";
import { GET as returnGet } from "@/app/auth/nexus/return/route";
import { mintNexusHororaSession } from "@/app/lib/auth/nexus-session-mint.server";

const ISSUER = "https://nexus-handoff.test";
const NOW = 1_700_000_000;
const SUBJECT = "actor-1";
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

async function validToken() {
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
    jti: "jti-callback",
    nonce: "nonce-callback",
  })
    .setProtectedHeader({ alg: "ES256", kid: "k1", typ: NEXUS_HANDOFF_VERSION })
    .setIssuer(ISSUER)
    .setAudience(NEXUS_HANDOFF_AUDIENCE)
    .setSubject(SUBJECT)
    .setIssuedAt(NOW)
    .setNotBefore(NOW)
    .setExpirationTime(NOW + 60)
    .sign(privateKey);
  return {
    token,
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
  };
}

function lookups(): NexusMappingLookups {
  return {
    async findIdentityMaps() {
      return [
        {
          nexus_actor_id: SUBJECT,
          auth_user_id: AUTH_USER,
          disabled_at: null,
        },
      ];
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

describe("Nexus callback Phase A", () => {
  it("does not mint a session or cookies when the flag is closed", async () => {
    const { token, jwks } = await validToken();
    const logs: Array<Record<string, string>> = [];
    const store = replayStore();
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks, nowSeconds: NOW },
        lookups: lookups(),
        replayStore: store,
        logger: (_message, fields) => {
          logs.push(fields);
        },
      }
    );
    expect(result).toEqual({ ok: false, reason: "session_mint_disabled" });
    expect(JSON.stringify(logs)).not.toContain(token);
    const minted = await mintNexusHororaSession({
      nexusActorId: SUBJECT,
      nexusOrganizationId: "nexus-org-1",
      nexusMembershipId: "mem-1",
      authUserId: AUTH_USER,
      organizationId: ORG_ID,
      membershipId: MEMBERSHIP_ID,
      membershipRole: "organization_admin",
      role: "admin",
    });
    expect(minted.ok).toBe(false);
  });

  it("inspects a fresh handoff without consuming jti or nonce", async () => {
    const { token, jwks } = await validToken();
    const store = replayStore();
    const inspected = await inspectNexusHandoff(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks, nowSeconds: NOW },
        lookups: lookups(),
        replayStore: store,
      }
    );
    expect(inspected.ok).toBe(true);
    expect(store.seen).toEqual([]);
  });

  it("consumes jti+nonce then refuses replay", async () => {
    const { token, jwks } = await validToken();
    const store = replayStore();
    const deps = {
      verifyOptions: { config: CONFIG, jwks, nowSeconds: NOW },
      lookups: lookups(),
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
    };
    const first = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      deps
    );
    expect(first.ok).toBe(true);
    const second = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      deps
    );
    expect(second).toEqual({ ok: false, reason: "replay" });
  });

  it("mints a session only after ALLOW", async () => {
    const { token, jwks } = await validToken();
    const issued: string[] = [];
    const store = replayStore();
    const allowed = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { config: CONFIG, jwks, nowSeconds: NOW },
        lookups: lookups(),
        replayStore: store,
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
                "horora_nx_session=opaque-test-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
              redirectPath: "/admin/dashboard",
            };
          },
        },
      }
    );
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.redirectPath).toBe("/admin/dashboard");
      expect(allowed.cookieHeader).toContain("horora_nx_session=");
      expect(allowed.cookieHeader).toContain("HttpOnly");
    }
    expect(issued).toEqual([AUTH_USER]);
  });

  it("redirects fail-closed to /auth/nexus/denied without Set-Cookie or a password login", async () => {
    const response = await callbackGet(
      new Request("http://localhost:3002/auth/nexus/callback")
    );
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "http://localhost");
    expect(location.pathname).toBe("/auth/nexus/denied");
    expect(location.searchParams.get("reason")).toBe("handoff_missing");
    expect(response.headers.get("set-cookie")).toBeNull();
    const posted = await callbackPost(
      new Request("http://localhost:3002/auth/nexus/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handoff: "not-a-jwt" }),
      })
    );
    expect(posted.headers.get("set-cookie")).toBeNull();
    expect(new URL(posted.headers.get("location") ?? "http://localhost").pathname).toBe(
      "/auth/nexus/denied"
    );
  });
});

describe("Nexus return route", () => {
  it("stays on /auth/nexus/denied when the allowlist is missing", async () => {
    const response = await returnGet(
      new Request(
        "http://localhost:3002/auth/nexus/return?next=https://evil.example/modules"
      )
    );
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/auth/nexus/denied");
  });
});

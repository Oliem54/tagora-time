import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { completeNexusCallbackPhaseA } from "@/app/lib/auth/nexus-callback.server";
import { createNexusMappingLookups } from "@/app/lib/auth/nexus-mapping-postgrest.server";
import { createMemoryBrokeredSessionStore } from "@/app/lib/auth/nexus-brokered-session";
import {
  DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_VERSION,
  NEXUS_TECHNICAL_MODULE_KEY,
} from "@/app/lib/auth/nexus-handoff-config";
import {
  isMappingStoreUnavailableError,
  logNexusCallbackClosed,
  sanitizeMappingStoreError,
} from "@/app/lib/auth/nexus-callback-logging.shared";
import {
  lockMappingOutboundHeaders,
  type MappingDispatch,
} from "@/app/lib/supabase/mapping-undici.server";
import { HORORA_MAPPING_USER_AGENT } from "@/app/lib/supabase/service-role-postgrest.shared";
import type { MappingHttpStatusLog } from "@/app/lib/auth/nexus-mapping-postgrest.server";

const ISSUER = "https://tagora-nexus-staging.vercel.app";
const NOW = 1_790_000_000;
const ACTOR = "nuser_5035cfcbd29a751e382fdf02f785d11f";
const AUTH_USER = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://qcgvzdlfsxybrmloijpt.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  NEXUS_HANDOFF_ISSUER: ISSUER,
  NEXUS_HANDOFF_JWKS_URL: "https://tagora-nexus-staging.vercel.app/.well-known/jwks.json",
  NEXUS_HANDOFF_AUDIENCE: NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_EXPECTED_MODULE_KEY: NEXUS_TECHNICAL_MODULE_KEY,
  NEXUS_HORORA_SESSION_MINT_ENABLED: "true",
};

function dispatchResult(body: unknown, status = 200): { status: number; bodyText: string } {
  return { status, bodyText: JSON.stringify(body) };
}

describe("Nexus mapping PostgREST client", () => {
  it("selects the identity map with a locked server user-agent and no browser authorization", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    let deny = false;
    const dispatch: MappingDispatch = vi.fn(async (input) => {
      calls.push({ url: input.url, headers: input.headers });
      if (deny) {
        return {
          status: 401,
          bodyText: JSON.stringify({
            message: "Forbidden use of secret API key in browser",
            apikey: "sb_secret_should_not_leak",
            token: "eyJshould-not-leak",
          }),
        };
      }
      return dispatchResult([
        {
          nexus_actor_id: ACTOR,
          auth_user_id: AUTH_USER,
          disabled_at: null,
        },
      ]);
    });

    const httpLogs: MappingHttpStatusLog[] = [];
    const lookups = createNexusMappingLookups(ENV, dispatch, (fields) => {
      httpLogs.push(fields);
    });
    const rows = await lookups.findIdentityMaps(ACTOR);
    expect(rows).toEqual([
      { nexus_actor_id: ACTOR, auth_user_id: AUTH_USER, disabled_at: null },
    ]);
    const headers = calls[0]?.headers;
    expect(headers?.apikey).toBe("sb_secret_test");
    expect(headers?.authorization).toBeUndefined();
    expect(headers?.["user-agent"]).toBe(HORORA_MAPPING_USER_AGENT);
    expect(headers?.["x-client-info"]).toBe(HORORA_MAPPING_USER_AGENT);
    expect(JSON.stringify(headers)).not.toMatch(/mozilla|chrome|safari/i);
    expect(calls[0]?.url).toContain("/rest/v1/horora_nexus_identity_map");
    expect(calls[0]?.url).toContain("qcgvzdlfsxybrmloijpt.supabase.co");

    deny = true;
    await expect(lookups.findIdentityMaps(ACTOR)).rejects.toThrow(/^mapping_http_401$/);
    expect(httpLogs).toEqual([{ stage: "identity_mapping", http_status: "401" }]);
    expect(JSON.stringify(httpLogs)).not.toMatch(
      /sb_secret_should_not_leak|Forbidden|eyJshould-not-leak/
    );
    try {
      await lookups.findIdentityMaps(ACTOR);
    } catch (error) {
      expect(isMappingStoreUnavailableError(error)).toBe(true);
      expect(sanitizeMappingStoreError(error)).toBe("http_401");
      expect(error instanceof Error ? error.message : "").not.toMatch(
        /sb_secret_should_not_leak|Forbidden|eyJshould-not-leak/
      );
      const logged: Array<Record<string, string>> = [];
      logNexusCallbackClosed({
        stage: "identity_mapping",
        reason_code: "mapping_unavailable",
        detail: sanitizeMappingStoreError(error),
        logger: (_message, fields) => {
          logged.push(fields);
        },
      });
      const serialized = JSON.stringify(logged);
      expect(logged[0]).toEqual({
        decision: "closed",
        stage: "identity_mapping",
        reason_code: "mapping_unavailable",
        detail: "http_401",
      });
      expect(serialized).not.toMatch(/sb_secret_should_not_leak|Forbidden|eyJshould-not-leak/);
    }
  });

  it("drops an inbound browser User-Agent and keeps sb_secret on apikey only", () => {
    const locked = lockMappingOutboundHeaders(
      new Headers({
        Accept: "application/json",
        apikey: "sb_secret_test",
        Authorization: "Bearer sb_secret_test",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "sec-fetch-dest": "empty",
        Origin: "https://time.tagora.ca",
        "X-Client-Info": "supabase-js/browser",
        Cookie: "session=sb_secret_test",
      })
    );
    expect(locked.apikey).toBe("sb_secret_test");
    expect(locked.authorization).toBeUndefined();
    expect(locked["user-agent"]).toBe(HORORA_MAPPING_USER_AGENT);
    expect(locked["x-client-info"]).toBe(HORORA_MAPPING_USER_AGENT);
    expect(JSON.stringify(locked)).not.toMatch(
      /mozilla|chrome|safari|supabase-js|cookie|sec-fetch|time\.tagora/i
    );
  });

  it("opens an admin session when a valid handoff matches the mapping rows", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "mapping-kid";
    publicJwk.alg = "ES256";
    publicJwk.use = "sig";
    const jwks = createLocalJWKSet({ keys: [publicJwk] });
    const token = await new SignJWT({
      typ: NEXUS_HANDOFF_VERSION,
      handoff_version: NEXUS_HANDOFF_VERSION,
      module_key: NEXUS_TECHNICAL_MODULE_KEY,
      user_id: ACTOR,
      organization_id: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
      membership_id: "mem_martin",
      tenant_id: "tenant_tagora_internal",
      handoff_id: "h_martin",
      grant_id: "g1",
      grant_version: "1",
      jti: "jti_mapping",
      nonce: "nonce_mapping",
    })
      .setProtectedHeader({ alg: "ES256", kid: "mapping-kid", typ: NEXUS_HANDOFF_VERSION })
      .setIssuer(ISSUER)
      .setAudience(NEXUS_HANDOFF_AUDIENCE)
      .setSubject(ACTOR)
      .setIssuedAt(NOW)
      .setNotBefore(NOW)
      .setExpirationTime(NOW + 90)
      .sign(privateKey);

    const dispatch: MappingDispatch = vi.fn(async (input) => {
      const url = input.url;
      if (url.includes("horora_nexus_identity_map")) {
        return dispatchResult([
          { nexus_actor_id: ACTOR, auth_user_id: AUTH_USER, disabled_at: null },
        ]);
      }
      if (url.includes("/auth/v1/admin/users/")) {
        return dispatchResult({ user: { id: AUTH_USER } });
      }
      if (url.includes("horora_nexus_organization_map")) {
        return dispatchResult([
          {
            nexus_organization_id: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
            organization_id: ORG_ID,
            status: "active",
          },
        ]);
      }
      if (url.includes("organization_memberships")) {
        return dispatchResult([
          {
            id: MEMBERSHIP_ID,
            organization_id: ORG_ID,
            role: "organization_owner",
            status: "active",
            is_default: true,
          },
        ]);
      }
      if (url.includes("/rest/v1/organizations")) {
        return dispatchResult([{ id: ORG_ID, status: "active", deleted_at: null }]);
      }
      return dispatchResult([], 404);
    });

    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { jwks, env: ENV, nowSeconds: NOW },
        lookups: createNexusMappingLookups(ENV, dispatch),
        replayStore: {
          async insertReceipt() {
            return { duplicate: false };
          },
        },
        mintOptions: {
          env: ENV,
          loadAuthUserById: async (id) => ({ id }),
          brokeredStore: createMemoryBrokeredSessionStore(),
          cookieEnvironment: "staging",
        },
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.redirectPath).toBe("/admin/dashboard");
    expect(result.cookieHeader).toContain("horora_nx_session=");
  });

  it("refuses an invalid handoff before a mapping query", async () => {
    const { publicKey } = await generateKeyPair("ES256", { extractable: true });
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "invalid-kid";
    publicJwk.alg = "ES256";
    publicJwk.use = "sig";
    const dispatch = vi.fn();
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: "not-a-jwt" }), body: null },
      {
        verifyOptions: {
          env: ENV,
          nowSeconds: NOW,
          jwks: createLocalJWKSet({ keys: [publicJwk] }),
        },
        lookups: createNexusMappingLookups(ENV, dispatch),
      }
    );
    expect(result.ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not read mapping tables through the shared admin client or global fetch", () => {
    const identity = readFileSync("src/app/lib/auth/nexus-identity-mapping.server.ts", "utf8");
    expect(identity).toContain("createNexusMappingLookups");
    expect(identity).not.toContain("createAdminSupabaseClient");
    const client = readFileSync("src/app/lib/auth/nexus-mapping-postgrest.server.ts", "utf8");
    expect(client).toContain("dispatchMappingWithUndici");
    expect(client).toContain("lockMappingOutboundHeaders");
    expect(client).not.toContain("= fetch");
  });
});

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
import { isMappingStoreUnavailableError } from "@/app/lib/auth/nexus-callback-logging.shared";
import { HORORA_MAPPING_USER_AGENT } from "@/app/lib/supabase/service-role-postgrest.shared";

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Nexus mapping PostgREST client", () => {
  it("selects the identity map as service_role and refuses anon permission denied", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    let deny = false;
    const baseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), headers });
      if (deny) {
        return jsonResponse(
          { code: "42501", message: "permission denied for table horora_nexus_identity_map" },
          401
        );
      }
      return jsonResponse([
        {
          nexus_actor_id: ACTOR,
          auth_user_id: AUTH_USER,
          disabled_at: null,
        },
      ]);
    });

    const lookups = createNexusMappingLookups(ENV, baseFetch as unknown as typeof fetch);
    const rows = await lookups.findIdentityMaps(ACTOR);
    expect(rows).toEqual([
      { nexus_actor_id: ACTOR, auth_user_id: AUTH_USER, disabled_at: null },
    ]);
    const headers = calls[0]?.headers;
    expect(headers?.get("apikey")).toBe("sb_secret_test");
    expect(headers?.has("Authorization")).toBe(false);
    expect(headers?.get("User-Agent")).toBe(HORORA_MAPPING_USER_AGENT);
    expect(calls[0]?.url).toContain("/rest/v1/horora_nexus_identity_map");
    expect(calls[0]?.url).toContain("qcgvzdlfsxybrmloijpt.supabase.co");

    deny = true;
    await expect(lookups.findIdentityMaps(ACTOR)).rejects.toThrow(/permission denied/);
    await expect(lookups.findIdentityMaps(ACTOR)).rejects.toSatisfy((error: unknown) =>
      isMappingStoreUnavailableError(error)
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

    const baseFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("horora_nexus_identity_map")) {
        return jsonResponse([
          { nexus_actor_id: ACTOR, auth_user_id: AUTH_USER, disabled_at: null },
        ]);
      }
      if (url.includes("/auth/v1/admin/users/")) {
        return jsonResponse({ user: { id: AUTH_USER } });
      }
      if (url.includes("horora_nexus_organization_map")) {
        return jsonResponse([
          {
            nexus_organization_id: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
            organization_id: ORG_ID,
            status: "active",
          },
        ]);
      }
      if (url.includes("organization_memberships")) {
        return jsonResponse([
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
        return jsonResponse([{ id: ORG_ID, status: "active", deleted_at: null }]);
      }
      return jsonResponse([], 404);
    });

    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { jwks, env: ENV, nowSeconds: NOW },
        lookups: createNexusMappingLookups(ENV, baseFetch as unknown as typeof fetch),
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
    const baseFetch = vi.fn();
    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: "not-a-jwt" }), body: null },
      {
        verifyOptions: {
          env: ENV,
          nowSeconds: NOW,
          jwks: createLocalJWKSet({ keys: [publicJwk] }),
        },
        lookups: createNexusMappingLookups(ENV, baseFetch as unknown as typeof fetch),
      }
    );
    expect(result.ok).toBe(false);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("does not read mapping tables through the shared admin client", () => {
    const source = readFileSync("src/app/lib/auth/nexus-identity-mapping.server.ts", "utf8");
    expect(source).toContain("createNexusMappingLookups");
    expect(source).not.toContain("createAdminSupabaseClient");
  });
});

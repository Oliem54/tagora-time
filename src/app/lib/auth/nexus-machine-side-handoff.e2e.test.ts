import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { completeNexusCallbackPhaseA } from "@/app/lib/auth/nexus-callback.server";
import {
  DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
  NEXUS_HANDOFF_AUDIENCE,
  NEXUS_HANDOFF_VERSION,
  NEXUS_TECHNICAL_MODULE_KEY,
} from "@/app/lib/auth/nexus-handoff-config";
import type { NexusMappingLookups } from "@/app/lib/auth/nexus-identity-mapping.server";
import { createMemoryBrokeredSessionStore } from "@/app/lib/auth/nexus-brokered-session";
import type { NexusReplayStore } from "@/app/lib/auth/nexus-handoff-replay.server";
import type { MembershipRow } from "@/app/lib/saas/organization-membership.shared";

const ISSUER = "https://tagora-nexus-staging.vercel.app";
const NOW = Math.floor(Date.now() / 1000);
const SUBJECT = "nuser_3e45dda035be43af16d14eca02bf8a5f";
const AUTH_USER = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";

describe("machine-side HORORA handoff path (exact actor)", () => {
  it("issues → callback → dashboard → replay refused without password login", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "machine-kid";
    publicJwk.alg = "ES256";
    publicJwk.use = "sig";
    const jwks = createLocalJWKSet({ keys: [publicJwk] });

    const jti = "jti_machine_" + NOW;
    const nonce = "nonce_machine_" + NOW;
    const token = await new SignJWT({
      typ: NEXUS_HANDOFF_VERSION,
      handoff_version: NEXUS_HANDOFF_VERSION,
      module_key: NEXUS_TECHNICAL_MODULE_KEY,
      user_id: SUBJECT,
      organization_id: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
      membership_id: "mem_machine",
      tenant_id: "tenant_tagora_internal",
      handoff_id: "h_machine",
      grant_id: "g1",
      grant_version: "1",
      jti,
      nonce,
      entry_role: "NEXUS_ENTRY_OPERATOR",
    })
      .setProtectedHeader({
        alg: "ES256",
        kid: "machine-kid",
        typ: NEXUS_HANDOFF_VERSION,
      })
      .setIssuer(ISSUER)
      .setAudience(NEXUS_HANDOFF_AUDIENCE)
      .setSubject(SUBJECT)
      .setIssuedAt(NOW)
      .setNotBefore(NOW)
      .setExpirationTime(NOW + 90)
      .sign(privateKey);

    const membership: MembershipRow = {
      id: MEMBERSHIP_ID,
      organization_id: ORG_ID,
      role: "organization_admin",
      status: "active",
      is_default: true,
    };

    const seen: string[] = [];
    const replayStore: NexusReplayStore = {
      async insertReceipt(input) {
        const key = `${input.jti}:${input.nonce}`;
        if (seen.includes(key)) return { duplicate: true };
        seen.push(key);
        return { duplicate: false };
      },
    };

    const lookups: NexusMappingLookups = {
      async findIdentityMaps() {
        throw new Error('relation "public.horora_nexus_identity_map" does not exist');
      },
      async authUserExists() {
        return false;
      },
      async findMembershipsForUser() {
        return [membership];
      },
      async findOrganizationMaps() {
        throw new Error('relation "public.horora_nexus_organization_map" does not exist');
      },
      async findOrganization() {
        return { id: ORG_ID, status: "active", deleted_at: null };
      },
    };

    const env = {
      NEXUS_HANDOFF_ISSUER: ISSUER,
      NEXUS_HANDOFF_JWKS_URL: "https://tagora-nexus-staging.vercel.app/.well-known/jwks.json",
      NEXUS_HANDOFF_AUDIENCE: NEXUS_HANDOFF_AUDIENCE,
      NEXUS_HANDOFF_EXPECTED_MODULE_KEY: NEXUS_TECHNICAL_MODULE_KEY,
      NEXUS_HORORA_SESSION_MINT_ENABLED: "true",
      HORORA_NEXUS_ACTOR_ID: SUBJECT,
      HORORA_AUTH_USER_ID: AUTH_USER,
      HORORA_ORGANIZATION_ID: ORG_ID,
      HORORA_NEXUS_ORGANIZATION_ID: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
    };

    const first = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { jwks, env, nowSeconds: NOW },
        lookups,
        replayStore,
        mintOptions: {
          env,
          loadAuthUserById: async (id) => ({ id }),
          brokeredStore: createMemoryBrokeredSessionStore(),
          cookieEnvironment: "staging",
        },
      }
    );

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.redirectPath).toBe("/admin/dashboard");
    expect(first.cookieHeader).toContain("horora_nx_session=");
    expect(first.redirectPath).not.toBe("/employe/login");

    const replay = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: { jwks, env, nowSeconds: NOW },
        lookups,
        replayStore,
        mintOptions: {
          env,
          loadAuthUserById: async (id) => ({ id }),
          brokeredStore: createMemoryBrokeredSessionStore(),
          cookieEnvironment: "staging",
        },
      }
    );
    expect(replay).toEqual({ ok: false, reason: "replay" });
  });

  it("refuses another Nexus actor from sharing the configured Auth user", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "machine-kid-2";
    publicJwk.alg = "ES256";
    publicJwk.use = "sig";
    const jwks = createLocalJWKSet({ keys: [publicJwk] });
    const otherActor = "nuser_other_actor_not_martin";
    const token = await new SignJWT({
      typ: NEXUS_HANDOFF_VERSION,
      handoff_version: NEXUS_HANDOFF_VERSION,
      module_key: NEXUS_TECHNICAL_MODULE_KEY,
      user_id: otherActor,
      organization_id: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
      membership_id: "mem_other",
      tenant_id: "tenant_tagora_internal",
      handoff_id: "h_other",
      grant_id: "g1",
      grant_version: "1",
      jti: "jti_other",
      nonce: "nonce_other",
    })
      .setProtectedHeader({
        alg: "ES256",
        kid: "machine-kid-2",
        typ: NEXUS_HANDOFF_VERSION,
      })
      .setIssuer(ISSUER)
      .setAudience(NEXUS_HANDOFF_AUDIENCE)
      .setSubject(otherActor)
      .setIssuedAt(NOW)
      .setNotBefore(NOW)
      .setExpirationTime(NOW + 90)
      .sign(privateKey);

    const result = await completeNexusCallbackPhaseA(
      { searchParams: new URLSearchParams({ handoff: token }), body: null },
      {
        verifyOptions: {
          jwks,
          env: {
            NEXUS_HANDOFF_ISSUER: ISSUER,
            NEXUS_HANDOFF_JWKS_URL:
              "https://tagora-nexus-staging.vercel.app/.well-known/jwks.json",
            NEXUS_HANDOFF_AUDIENCE: NEXUS_HANDOFF_AUDIENCE,
            NEXUS_HANDOFF_EXPECTED_MODULE_KEY: NEXUS_TECHNICAL_MODULE_KEY,
            NEXUS_HORORA_SESSION_MINT_ENABLED: "true",
            HORORA_NEXUS_ACTOR_ID: SUBJECT,
            HORORA_AUTH_USER_ID: AUTH_USER,
            HORORA_ORGANIZATION_ID: ORG_ID,
          },
          nowSeconds: NOW,
        },
        lookups: {
          async findIdentityMaps() {
            throw new Error('relation "public.horora_nexus_identity_map" does not exist');
          },
          async authUserExists() {
            return true;
          },
          async findMembershipsForUser() {
            return [];
          },
          async findOrganizationMaps() {
            return [];
          },
          async findOrganization() {
            return null;
          },
        },
      }
    );
    expect(result).toEqual({ ok: false, reason: "mapping_unavailable" });
  });
});

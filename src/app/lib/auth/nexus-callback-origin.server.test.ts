import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleNexusCallback } from "@/app/auth/nexus/callback/route";
import {
  NEXUS_CALLBACK_CONTINUE_FORM_ID,
  isSameOriginNexusCallbackPost,
} from "@/app/lib/auth/nexus-callback-document.server";
import {
  NEXUS_CALLBACK_PUBLIC_ORIGIN_ENV,
  evaluateNexusCallbackOrigin,
  isSameOriginNexusCallbackPost as originCheck,
} from "@/app/lib/auth/nexus-callback-origin.server";
import type { NexusHandoffClaims } from "@/app/lib/auth/nexus-handoff";
import { NEXUS_TECHNICAL_MODULE_KEY } from "@/app/lib/auth/nexus-handoff-config";
import type { NexusResolvedBinding } from "@/app/lib/auth/nexus-identity-mapping.server";

const PUBLIC_ORIGIN = "https://time.staging.tagora.ca";
const DEPLOYMENT_ORIGIN = "https://tagora-time-abc123.vercel.app";
const CALLBACK_PATH = "/auth/nexus/callback";
const TOKEN = "header.payload.signature";

const BINDING: NexusResolvedBinding = {
  nexusActorId: "actor-1",
  nexusOrganizationId: "org_tagora_internal",
  nexusMembershipId: "mem-1",
  authUserId: "11111111-1111-4111-8111-111111111111",
  organizationId: "33333333-3333-4333-8333-333333333333",
  membershipId: "44444444-4444-4444-8444-444444444444",
  membershipRole: "organization_admin",
  role: "admin",
};

const CLAIMS: NexusHandoffClaims = {
  sub: "actor-1",
  jti: "jti_origin_fix",
  nonce: "nonce_origin_fix",
  iat: 1_700_000_000,
  nbf: 1_700_000_000,
  exp: 1_700_000_060,
  user_id: "actor-1",
  organization_id: "org_tagora_internal",
  membership_id: "mem-1",
  tenant_id: "tenant-1",
  module_key: NEXUS_TECHNICAL_MODULE_KEY,
  handoff_id: "hoff_v1_origin",
  grant_id: "g1",
  grant_version: "1",
};

function formPost(requestUrl: string, headers: Record<string, string>): Request {
  return new Request(requestUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: `handoff=${encodeURIComponent(TOKEN)}`,
  });
}

function inspectOk() {
  return {
    async inspectHandoff() {
      return { ok: true as const, token: TOKEN, claims: CLAIMS, binding: BINDING };
    },
  };
}

describe("Nexus callback trusted external origin", () => {
  const emptyEnv = { [NEXUS_CALLBACK_PUBLIC_ORIGIN_ENV]: undefined };

  beforeEach(() => {
    vi.stubEnv(NEXUS_CALLBACK_PUBLIC_ORIGIN_ENV, PUBLIC_ORIGIN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the public Staging alias Origin against an internal deployment request URL", () => {
    const request = formPost(`${DEPLOYMENT_ORIGIN}${CALLBACK_PATH}`, {
      origin: PUBLIC_ORIGIN,
      host: "tagora-time-abc123.vercel.app",
      "x-forwarded-host": "time.staging.tagora.ca",
      "x-forwarded-proto": "https",
    });
    expect(originCheck(request, { [NEXUS_CALLBACK_PUBLIC_ORIGIN_ENV]: PUBLIC_ORIGIN })).toBe(true);
  });

  it("allows the public Staging alias Origin via canonical NEXT_PUBLIC_APP_URL", () => {
    const request = formPost(`${DEPLOYMENT_ORIGIN}${CALLBACK_PATH}`, {
      origin: PUBLIC_ORIGIN,
      host: "tagora-time-abc123.vercel.app",
    });
    expect(originCheck(request, emptyEnv)).toBe(false);
    expect(originCheck(request, { [NEXUS_CALLBACK_PUBLIC_ORIGIN_ENV]: PUBLIC_ORIGIN })).toBe(true);
  });

  it("denies an unrelated origin", () => {
    const request = formPost(`${PUBLIC_ORIGIN}${CALLBACK_PATH}`, {
      origin: "https://evil.example",
      "x-forwarded-host": "time.staging.tagora.ca",
      "x-forwarded-proto": "https",
    });
    expect(originCheck(request, { [NEXUS_CALLBACK_PUBLIC_ORIGIN_ENV]: PUBLIC_ORIGIN })).toBe(false);
  });

  it("allows Origin null on a canonical same-origin navigational POST", () => {
    const headers = {
      origin: "null",
      host: "time.staging.tagora.ca",
      "x-forwarded-host": "time.staging.tagora.ca",
      "x-forwarded-proto": "https",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
    };
    expect(originCheck(formPost(`${PUBLIC_ORIGIN}${CALLBACK_PATH}`, headers), emptyEnv)).toBe(true);
    expect(isSameOriginNexusCallbackPost(formPost(`${PUBLIC_ORIGIN}${CALLBACK_PATH}`, headers), emptyEnv)).toBe(
      true
    );
  });

  it("denies a Nexus same-site Origin even on the canonical host", () => {
    const denied = evaluateNexusCallbackOrigin(
      formPost(`${PUBLIC_ORIGIN}${CALLBACK_PATH}`, {
        origin: "https://tagora-nexus-staging.vercel.app",
        host: "time.staging.tagora.ca",
        "x-forwarded-host": "time.staging.tagora.ca",
        "x-forwarded-proto": "https",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      }),
      { [NEXUS_CALLBACK_PUBLIC_ORIGIN_ENV]: PUBLIC_ORIGIN }
    );
    expect(denied).toEqual({ ok: false, failed_origin_check: "origin_not_trusted" });
  });

  it("renders the continue form against the canonical Staging callback", async () => {
    const response = await handleNexusCallback(
      new Request(`${PUBLIC_ORIGIN}${CALLBACK_PATH}?handoff=fresh`, {
        headers: { "sec-fetch-dest": "document" },
      }),
      {
        ...inspectOk(),
        async isReplayConsumed() {
          return { ok: true, consumed: false };
        },
      }
    );
    const html = await response.text();
    expect(html).toContain(`action="${PUBLIC_ORIGIN}${CALLBACK_PATH}"`);
    expect(html).toContain("<title>HORORA</title>");
  });

  it("does not mint on GET inspect; it still returns the continue document", async () => {
    const minted: string[] = [];
    const response = await handleNexusCallback(
      new Request(`${PUBLIC_ORIGIN}${CALLBACK_PATH}?handoff=fresh`, {
        headers: { "sec-fetch-dest": "document" },
      }),
      {
        ...inspectOk(),
        async isReplayConsumed() {
          return { ok: true, consumed: false };
        },
        async completePhaseA() {
          minted.push("minted");
          return { ok: false as const, reason: "should_not_mint_on_get" };
        },
      }
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(NEXUS_CALLBACK_CONTINUE_FORM_ID);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(minted).toEqual([]);
  });

  it("returns 204 for prefetch GET", async () => {
    const response = await handleNexusCallback(
      new Request(`${PUBLIC_ORIGIN}${CALLBACK_PATH}?handoff=fresh`, {
        headers: { "sec-purpose": "prefetch" },
      }),
      inspectOk()
    );
    expect(response.status).toBe(204);
  });

  it("keeps replay protection: consumed jti does not mint", async () => {
    const response = await handleNexusCallback(
      new Request(`${PUBLIC_ORIGIN}${CALLBACK_PATH}?handoff=fresh`, {
        headers: { "sec-fetch-dest": "document" },
      }),
      {
        ...inspectOk(),
        async isReplayConsumed() {
          return { ok: true, consumed: true };
        },
        async completePhaseA() {
          return {
            ok: true as const,
            cookieHeader: "horora_nx_session=x",
            redirectPath: "/admin/dashboard",
          };
        },
      }
    );
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/auth/nexus/denied");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not consume or mint a cross-origin form POST", async () => {
    const consumed: string[] = [];
    const response = await handleNexusCallback(
      formPost(`${PUBLIC_ORIGIN}${CALLBACK_PATH}`, {
        origin: "https://evil.example",
      }),
      {
        async completePhaseA() {
          consumed.push("consume");
          return {
            ok: true as const,
            cookieHeader: "horora_nx_session=stolen; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
            redirectPath: "/admin/dashboard",
          };
        },
      }
    );
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/auth/nexus/denied");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(consumed).toEqual([]);
  });
});

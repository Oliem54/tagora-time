import { describe, expect, it } from "vitest";
import {
  inspectNexusPublicJwksDocument,
  resetNexusPublicJwksCache,
  verifyConfiguredNexusPublicJwks,
  verifyNexusPublicJwks,
} from "@/app/lib/auth/nexus-jwks.server";
import { NEXUS_TECHNICAL_MODULE_KEY } from "@/app/lib/auth/nexus-handoff-config";

const PUBLIC_JWK = {
  kty: "EC",
  crv: "P-256",
  alg: "ES256",
  use: "sig",
  kid: "nexus-staging-handoff-es256-2026-09-02",
  x: "public-x",
  y: "public-y",
};

describe("Nexus public JWKS", () => {
  it("accepts a public ES256 JWKS document", () => {
    expect(inspectNexusPublicJwksDocument({ keys: [PUBLIC_JWK] })).toEqual({
      ok: true,
      kids: [PUBLIC_JWK.kid],
      keyCount: 1,
    });
  });

  it("rejects private key material and empty documents", () => {
    expect(
      inspectNexusPublicJwksDocument({ keys: [{ ...PUBLIC_JWK, d: "private" }] })
    ).toEqual({ ok: false, reason: "invalid_jwks" });
    expect(inspectNexusPublicJwksDocument({ keys: [] })).toEqual({
      ok: false,
      reason: "invalid_jwks",
    });
  });

  it("fetches the configured HTTPS JWKS and stays fail-closed on HTTP errors", async () => {
    resetNexusPublicJwksCache();
    const ok = await verifyNexusPublicJwks("https://nexus-handoff.test/jwks.json", {
      bypassCache: true,
      async fetch() {
        return new Response(JSON.stringify({ keys: [PUBLIC_JWK] }), { status: 200 });
      },
    });
    expect(ok).toEqual({
      ok: true,
      kids: [PUBLIC_JWK.kid],
      keyCount: 1,
    });

    const down = await verifyConfiguredNexusPublicJwks(
      {
        NEXUS_HANDOFF_ISSUER: "https://nexus-handoff.test",
        NEXUS_HANDOFF_JWKS_URL: "https://nexus-handoff.test/jwks.json",
        NEXUS_HANDOFF_AUDIENCE: "tagora:time",
        NEXUS_HANDOFF_EXPECTED_MODULE_KEY: NEXUS_TECHNICAL_MODULE_KEY,
      },
      {
        bypassCache: true,
        async fetch() {
          return new Response("down", { status: 503 });
        },
      }
    );
    expect(down).toEqual({ ok: false, reason: "jwks_unavailable" });
  });
});

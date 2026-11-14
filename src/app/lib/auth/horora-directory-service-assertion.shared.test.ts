import { exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import {
  HORORA_DIRECTORY_ASSERTION_TTL_SECONDS,
  HORORA_DIRECTORY_AUDIENCE,
  HORORA_DIRECTORY_CLIENT_ID,
  HORORA_DIRECTORY_SERVICE_ALGORITHM,
  HORORA_DIRECTORY_STAGING_PRIVATE_JWK_ENV,
} from "@/app/lib/auth/horora-authorized-module-directory-client.shared";
import {
  publicDirectoryJwk,
  signHororaDirectoryAssertion,
} from "@/app/lib/auth/horora-directory-service-assertion.shared";

describe("HORORA directory service assertion", () => {
  it("signs with a dedicated ES256 key and verifies with the public JWK", async () => {
    expect(HORORA_DIRECTORY_STAGING_PRIVATE_JWK_ENV).toBe(
      "HORORA_DIRECTORY_STAGING_PRIVATE_JWK"
    );
    expect(HORORA_DIRECTORY_CLIENT_ID).toBe("svc_horora_directory");
    expect(HORORA_DIRECTORY_AUDIENCE).toBe("tagora:time:directory");
    expect(HORORA_DIRECTORY_ASSERTION_TTL_SECONDS).toBeLessThanOrEqual(120);

    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const privateJwk = await exportJWK(privateKey);
    privateJwk.kid = "horora-directory-test-kid";
    privateJwk.alg = "ES256";
    const publicJwk = publicDirectoryJwk(privateJwk);
    expect(publicJwk).toEqual({
      kty: "EC",
      crv: "P-256",
      x: privateJwk.x,
      y: privateJwk.y,
      kid: "horora-directory-test-kid",
      alg: "ES256",
      use: "sig",
    });
    expect(publicJwk).not.toHaveProperty("d");

    const now = new Date("2026-11-12T23:00:00.000Z");
    const token = await signHororaDirectoryAssertion({
      privateJwk,
      query: {
        tenantId: "tenant_tagora_internal",
        organizationId: "org_tagora_internal",
        moduleKey: "tagora_time",
      },
      jti: "jti-directory-test",
      now,
    });
    const verified = await jwtVerify(token, await importJWK(publicJwk, "ES256"), {
      issuer: HORORA_DIRECTORY_CLIENT_ID,
      audience: HORORA_DIRECTORY_AUDIENCE,
      algorithms: [HORORA_DIRECTORY_SERVICE_ALGORITHM],
      currentDate: now,
    });
    expect(verified.protectedHeader).toMatchObject({
      alg: "ES256",
      kid: "horora-directory-test-kid",
      typ: "JWT",
    });
    expect(verified.payload).toMatchObject({
      iss: "svc_horora_directory",
      sub: "svc_horora_directory",
      aud: "tagora:time:directory",
      module_key: "tagora_time",
      tenant_id: "tenant_tagora_internal",
      organization_id: "org_tagora_internal",
    });
    expect(Number(verified.payload.exp) - Number(verified.payload.iat)).toBe(60);
  });

  it("rejects a JWK that is not a private P-256 directory key", () => {
    expect(() =>
      publicDirectoryJwk({
        kty: "EC",
        crv: "P-256",
        x: "x",
        y: "y",
        kid: "kid",
      })
    ).toThrow("directory_private_jwk_rejected");
  });
});

/**
 * Signs a HORORA directory assertion. The remote call stays held.
 * This module does not read the staging private key and does not fetch Nexus.
 */

import { SignJWT, importJWK, type JWK } from "jose";
import {
  HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
  type HororaDirectoryScope,
} from "@/app/lib/auth/horora-authorized-module-directory.shared";
import {
  HORORA_DIRECTORY_ASSERTION_TTL_SECONDS,
  HORORA_DIRECTORY_AUDIENCE,
  HORORA_DIRECTORY_CLIENT_ID,
  HORORA_DIRECTORY_SERVICE_ALGORITHM,
} from "@/app/lib/auth/horora-authorized-module-directory-client.shared";

const PUBLIC_JWK_FIELDS = ["kty", "crv", "x", "y", "kid", "alg", "use"] as const;

export type HororaDirectoryPublicJwk = {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  kid: string;
  alg: typeof HORORA_DIRECTORY_SERVICE_ALGORITHM;
  use: "sig";
};

export function publicDirectoryJwk(privateJwk: JWK): HororaDirectoryPublicJwk {
  const kid = privateJwk.kid?.trim() ?? "";
  if (
    privateJwk.kty !== "EC" ||
    privateJwk.crv !== "P-256" ||
    !privateJwk.x ||
    !privateJwk.y ||
    !kid ||
    privateJwk.d === undefined
  ) {
    throw new Error("directory_private_jwk_rejected");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: privateJwk.x,
    y: privateJwk.y,
    kid,
    alg: HORORA_DIRECTORY_SERVICE_ALGORITHM,
    use: "sig",
  };
}

export function assertPublicDirectoryJwk(jwk: HororaDirectoryPublicJwk): void {
  const keys = Object.keys(jwk);
  if (keys.some((key) => !PUBLIC_JWK_FIELDS.includes(key as (typeof PUBLIC_JWK_FIELDS)[number]))) {
    throw new Error("directory_public_jwk_rejected");
  }
  if ("d" in jwk) throw new Error("directory_public_jwk_rejected");
}

export async function signHororaDirectoryAssertion(input: {
  privateJwk: JWK;
  query: HororaDirectoryScope;
  jti: string;
  now?: Date;
}): Promise<string> {
  const publicJwk = publicDirectoryJwk(input.privateJwk);
  assertPublicDirectoryJwk(publicJwk);
  if (input.query.moduleKey !== HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY) {
    throw new Error("directory_module_rejected");
  }
  const key = await importJWK(input.privateJwk, HORORA_DIRECTORY_SERVICE_ALGORITHM);
  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
  return new SignJWT({
    tenant_id: input.query.tenantId,
    organization_id: input.query.organizationId,
    module_key: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
  })
    .setProtectedHeader({
      alg: HORORA_DIRECTORY_SERVICE_ALGORITHM,
      kid: publicJwk.kid,
      typ: "JWT",
    })
    .setIssuer(HORORA_DIRECTORY_CLIENT_ID)
    .setSubject(HORORA_DIRECTORY_CLIENT_ID)
    .setAudience(HORORA_DIRECTORY_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + HORORA_DIRECTORY_ASSERTION_TTL_SECONDS)
    .setJti(input.jti)
    .sign(key);
}

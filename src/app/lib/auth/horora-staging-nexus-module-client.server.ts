/**
 * HORORA Staging server signer for MODULE→NEXUS private_key_jwt.
 * The private key is read from HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK.
 * It is never logged, returned, or copied into a public field.
 */

import {
  decodeProtectedHeader,
  errors as joseErrors,
  importJWK,
  jwtVerify,
  SignJWT,
} from "jose";
import {
  buildNexusOpaqueExchangeBody,
  exportHororaStagingModuleClientPublicJwk,
  HORORA_STAGING_NEXUS_CLIENT_ASSERTION_TTL_SECONDS,
  HORORA_STAGING_NEXUS_EXCHANGE_URL,
  HORORA_STAGING_NEXUS_MODULE_CLIENT_ID,
  HORORA_STAGING_NEXUS_MODULE_CLIENT_KID,
  HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK_ENV,
  HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_KEY_OWNER,
  type HororaStagingModuleClientPublicJwk,
} from "@/app/lib/auth/horora-staging-nexus-module-client";

const CLIENT_ASSERTION_MAX_TTL_SECONDS = 120;
const FORBIDDEN_MODULE_CLIENT_KID = "nexus_handoff_active_es256";
const EXCHANGE_RESPONSE_MAX_CHARS = 16_384;

export type HororaStagingModuleClientEnv = Readonly<Record<string, string | undefined>>;

export type PrivateKeyStatus =
  | {
      readonly configured: true;
      readonly owner: typeof HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_KEY_OWNER;
    }
  | { readonly configured: false; readonly reason: "missing_configuration" | "invalid_configuration" };

export type ModuleClientAssertionDenyReason =
  | "missing_token"
  | "malformed_token"
  | "disallowed_algorithm"
  | "invalid_signature"
  | "invalid_audience"
  | "invalid_client"
  | "expired_token"
  | "missing_claim"
  | "invalid_token";

export type OpaqueExchangeDenyReason =
  | "invalid_code"
  | "missing_configuration"
  | "invalid_configuration"
  | "exchange_unreachable"
  | "exchange_rejected"
  | "assertion_missing";

type PrivateJwkMaterial = {
  kty: "EC";
  crv: "P-256";
  alg: "ES256";
  kid: typeof HORORA_STAGING_NEXUS_MODULE_CLIENT_KID;
  use: "sig";
  x: string;
  y: string;
  d: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parsePrivateJwk(raw: string): PrivateJwkMaterial | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.kty !== "EC" || parsed.crv !== "P-256" || parsed.alg !== "ES256") return null;
  if (parsed.kid === FORBIDDEN_MODULE_CLIENT_KID) return null;
  if (parsed.use !== "sig" || parsed.kid !== HORORA_STAGING_NEXUS_MODULE_CLIENT_KID) return null;
  if (typeof parsed.x !== "string" || typeof parsed.y !== "string" || typeof parsed.d !== "string") {
    return null;
  }
  if (!parsed.x || !parsed.y || parsed.d.length < 16) return null;
  return {
    kty: "EC",
    crv: "P-256",
    alg: "ES256",
    kid: HORORA_STAGING_NEXUS_MODULE_CLIENT_KID,
    use: "sig",
    x: parsed.x,
    y: parsed.y,
    d: parsed.d,
  };
}

async function privateKeyMatchesPublicJwk(
  privateJwk: PrivateJwkMaterial,
  expected: HororaStagingModuleClientPublicJwk
): Promise<boolean> {
  if (privateJwk.x !== expected.x || privateJwk.y !== expected.y) {
    return false;
  }
  try {
    const privateKey = await importJWK(
      {
        kty: privateJwk.kty,
        crv: privateJwk.crv,
        alg: privateJwk.alg,
        kid: privateJwk.kid,
        use: privateJwk.use,
        x: privateJwk.x,
        y: privateJwk.y,
        d: privateJwk.d,
      },
      "ES256"
    );
    const publicKey = await importJWK(
      {
        kty: expected.kty,
        crv: expected.crv,
        alg: expected.alg,
        kid: expected.kid,
        use: expected.use,
        x: expected.x,
        y: expected.y,
      },
      "ES256"
    );
    const probe = await new SignJWT({ probe: "match" })
      .setProtectedHeader({ alg: "ES256", kid: expected.kid })
      .setIssuer("probe")
      .setAudience("probe")
      .setSubject("probe")
      .setIssuedAt(1_700_000_000)
      .setExpirationTime(1_700_000_060)
      .sign(privateKey);
    await jwtVerify(probe, publicKey, {
      algorithms: ["ES256"],
      issuer: "probe",
      audience: "probe",
      clockTolerance: 0,
      currentDate: new Date(1_700_000_000 * 1000),
    });
    return true;
  } catch {
    return false;
  }
}

function expectedPublicJwk(
  override?: HororaStagingModuleClientPublicJwk
): HororaStagingModuleClientPublicJwk {
  return override ?? exportHororaStagingModuleClientPublicJwk();
}

export async function readHororaStagingModuleClientPrivateKeyStatus(
  env: HororaStagingModuleClientEnv = process.env,
  options?: { readonly expectedPublicJwk?: HororaStagingModuleClientPublicJwk }
): Promise<PrivateKeyStatus> {
  const raw = env[HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK_ENV];
  if (typeof raw !== "string" || raw.trim() === "") {
    return { configured: false, reason: "missing_configuration" };
  }
  const privateJwk = parsePrivateJwk(raw.trim());
  if (!privateJwk) return { configured: false, reason: "invalid_configuration" };
  const matches = await privateKeyMatchesPublicJwk(privateJwk, expectedPublicJwk(options?.expectedPublicJwk));
  if (!matches) return { configured: false, reason: "invalid_configuration" };
  return {
    configured: true,
    owner: HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_KEY_OWNER,
  };
}

export async function signHororaStagingModuleClientAssertion(options: {
  readonly env?: HororaStagingModuleClientEnv;
  readonly privateJwk?: unknown;
  readonly expectedPublicJwk?: HororaStagingModuleClientPublicJwk;
  readonly nowSeconds?: number;
  readonly jti?: string;
}): Promise<
  | { readonly ok: true; readonly assertion: string }
  | { readonly ok: false; readonly reason: "missing_configuration" | "invalid_configuration" }
> {
  const expected = expectedPublicJwk(options.expectedPublicJwk);
  let privateJwk: PrivateJwkMaterial | null = null;
  if (options.privateJwk !== undefined) {
    privateJwk = parsePrivateJwk(JSON.stringify(options.privateJwk));
  } else {
    const raw = options.env?.[HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK_ENV];
    if (typeof raw !== "string" || raw.trim() === "") {
      return { ok: false, reason: "missing_configuration" };
    }
    privateJwk = parsePrivateJwk(raw.trim());
  }
  if (!privateJwk) return { ok: false, reason: "invalid_configuration" };
  const matches = await privateKeyMatchesPublicJwk(privateJwk, expected);
  if (!matches) return { ok: false, reason: "invalid_configuration" };

  try {
    const privateKey = await importJWK(
      {
        kty: privateJwk.kty,
        crv: privateJwk.crv,
        alg: privateJwk.alg,
        kid: privateJwk.kid,
        use: privateJwk.use,
        x: privateJwk.x,
        y: privateJwk.y,
        d: privateJwk.d,
      },
      "ES256"
    );
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      client_id: HORORA_STAGING_NEXUS_MODULE_CLIENT_ID,
    })
      .setProtectedHeader({
        alg: "ES256",
        kid: HORORA_STAGING_NEXUS_MODULE_CLIENT_KID,
        typ: "JWT",
      })
      .setIssuer(HORORA_STAGING_NEXUS_MODULE_CLIENT_ID)
      .setSubject(HORORA_STAGING_NEXUS_MODULE_CLIENT_ID)
      .setAudience(HORORA_STAGING_NEXUS_EXCHANGE_URL)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + HORORA_STAGING_NEXUS_CLIENT_ASSERTION_TTL_SECONDS)
      .setJti(options.jti ?? crypto.randomUUID())
      .sign(privateKey);
    return { ok: true, assertion };
  } catch {
    return { ok: false, reason: "invalid_configuration" };
  }
}

function failAssertion(
  reason: ModuleClientAssertionDenyReason
): { ok: false; reason: ModuleClientAssertionDenyReason } {
  return { ok: false, reason };
}

function mapAssertionFailure(error: unknown): ModuleClientAssertionDenyReason {
  if (error instanceof joseErrors.JWTExpired) return "expired_token";
  if (error instanceof joseErrors.JWSSignatureVerificationFailed) return "invalid_signature";
  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    if (error.claim === "aud") return "invalid_audience";
    if (error.claim === "iss" || error.claim === "sub") return "invalid_client";
    if (error.claim === "exp") return "expired_token";
    return "invalid_token";
  }
  if (error instanceof joseErrors.JWSInvalid || error instanceof joseErrors.JWTInvalid) {
    return "invalid_signature";
  }
  return "invalid_token";
}

export async function verifyHororaStagingModuleClientAssertion(
  token: string | null | undefined,
  options: {
    readonly publicJwk?: HororaStagingModuleClientPublicJwk;
    readonly nowSeconds?: number;
  } = {}
): Promise<
  | { readonly ok: true; readonly clientId: typeof HORORA_STAGING_NEXUS_MODULE_CLIENT_ID }
  | { readonly ok: false; readonly reason: ModuleClientAssertionDenyReason }
> {
  if (typeof token !== "string" || token.trim() === "") return failAssertion("missing_token");
  const trimmed = token.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return failAssertion("malformed_token");
  }

  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(trimmed);
  } catch {
    return failAssertion("malformed_token");
  }
  if (header.alg === "none" || header.alg === "HS256") return failAssertion("disallowed_algorithm");
  if (header.alg !== "ES256") return failAssertion("disallowed_algorithm");
  if (header.kid !== HORORA_STAGING_NEXUS_MODULE_CLIENT_KID) return failAssertion("invalid_token");

  const publicJwk = options.publicJwk ?? exportHororaStagingModuleClientPublicJwk();
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  try {
    const publicKey = await importJWK(
      {
        kty: publicJwk.kty,
        crv: publicJwk.crv,
        alg: publicJwk.alg,
        kid: publicJwk.kid,
        use: publicJwk.use,
        x: publicJwk.x,
        y: publicJwk.y,
      },
      "ES256"
    );
    const verified = await jwtVerify(trimmed, publicKey, {
      algorithms: ["ES256"],
      issuer: HORORA_STAGING_NEXUS_MODULE_CLIENT_ID,
      audience: HORORA_STAGING_NEXUS_EXCHANGE_URL,
      subject: HORORA_STAGING_NEXUS_MODULE_CLIENT_ID,
      clockTolerance: 0,
      currentDate: new Date(nowSeconds * 1000),
      requiredClaims: ["iss", "sub", "aud", "exp", "iat", "jti"],
    });
    const payload = verified.payload;
    if (payload.aud !== HORORA_STAGING_NEXUS_EXCHANGE_URL) return failAssertion("invalid_audience");
    if (payload.iss !== HORORA_STAGING_NEXUS_MODULE_CLIENT_ID) return failAssertion("invalid_client");
    if (payload.sub !== HORORA_STAGING_NEXUS_MODULE_CLIENT_ID) return failAssertion("invalid_client");
    if (!Object.prototype.hasOwnProperty.call(payload, "client_id")) return failAssertion("missing_claim");
    if (payload.client_id !== HORORA_STAGING_NEXUS_MODULE_CLIENT_ID) {
      return failAssertion("invalid_client");
    }
    if (typeof payload.jti !== "string" || payload.jti.trim() === "" || payload.jti.length > 128) {
      return failAssertion("missing_claim");
    }
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
      return failAssertion("missing_claim");
    }
    if (payload.iat > nowSeconds) return failAssertion("invalid_token");
    if (payload.exp <= nowSeconds) return failAssertion("expired_token");
    const lifetime = payload.exp - payload.iat;
    if (lifetime < 1 || lifetime > CLIENT_ASSERTION_MAX_TTL_SECONDS) return failAssertion("invalid_token");
    return { ok: true, clientId: HORORA_STAGING_NEXUS_MODULE_CLIENT_ID };
  } catch (error) {
    return failAssertion(mapAssertionFailure(error));
  }
}

function readReturnedAssertion(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const assertion = typeof value.assertion === "string" ? value.assertion.trim() : "";
  const handoff = typeof value.handoff === "string" ? value.handoff.trim() : "";
  if (assertion && handoff && assertion !== handoff) return null;
  const token = assertion || handoff;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;
  return token;
}

/**
 * Redeems a Nexus opaque code. tenant_id and organization_id are not accepted
 * from the caller: the POST body is only the code and the private_key_jwt.
 */
export async function exchangeNexusOpaqueHandoffCode(input: {
  readonly code: string;
  readonly env?: HororaStagingModuleClientEnv;
  readonly fetchImpl?: typeof fetch;
  readonly nowSeconds?: number;
  readonly privateJwk?: unknown;
  readonly expectedPublicJwk?: HororaStagingModuleClientPublicJwk;
}): Promise<
  | { readonly ok: true; readonly assertion: string }
  | { readonly ok: false; readonly reason: OpaqueExchangeDenyReason }
> {
  const code = input.code.trim();
  if (!/^[A-Za-z0-9._~-]{8,1024}$/.test(code)) {
    return { ok: false, reason: "invalid_code" };
  }
  const signed = await signHororaStagingModuleClientAssertion({
    env: input.env,
    privateJwk: input.privateJwk,
    expectedPublicJwk: input.expectedPublicJwk,
    nowSeconds: input.nowSeconds,
  });
  if (!signed.ok) return signed;

  const body = buildNexusOpaqueExchangeBody({
    code,
    clientAssertion: signed.assertion,
  });
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(HORORA_STAGING_NEXUS_EXCHANGE_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, reason: "exchange_rejected" };
    }
    const advertised = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(advertised) && advertised > EXCHANGE_RESPONSE_MAX_CHARS) {
      return { ok: false, reason: "assertion_missing" };
    }
    const text = await response.text();
    if (text.length === 0 || text.length > EXCHANGE_RESPONSE_MAX_CHARS) {
      return { ok: false, reason: "assertion_missing" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: "assertion_missing" };
    }
    const assertion = readReturnedAssertion(parsed);
    if (!assertion) return { ok: false, reason: "assertion_missing" };
    return { ok: true, assertion };
  } catch {
    return { ok: false, reason: "exchange_unreachable" };
  }
}

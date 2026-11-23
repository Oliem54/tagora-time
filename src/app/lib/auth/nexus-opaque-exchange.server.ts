/**
 * Staging-only exchange of the Nexus opaque browser code.
 * The code is never a JWT. The returned assertion stays on the server
 * and is never written back into a URL.
 */

import { createPrivateKey, randomBytes, sign, type JsonWebKey } from "node:crypto";
import {
  HORORA_PRODUCTION_VERCEL_PROJECT_ID,
  HORORA_STAGING_VERCEL_PROJECT_ID,
  NEXUS_STAGING_PUBLIC_ORIGIN,
} from "@/app/lib/canonical-domains";
import {
  DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
  NEXUS_TECHNICAL_MODULE_KEY,
  type NexusHandoffEnvSource,
} from "@/app/lib/auth/nexus-handoff-config";

export const HORORA_STAGING_NEXUS_CLIENT_ID = "horora_staging_nexus_client" as const;
export const HORORA_STAGING_NEXUS_CLIENT_KID =
  "7e517fc74e013ebb7ba0c3f82a6c13a3" as const;
export const HORORA_STAGING_NEXUS_TENANT_ID = "tenant_tagora_internal" as const;
export const HORORA_OPAQUE_EXCHANGE_PATH = "/api/nexus/handoff/exchange" as const;
export const HORORA_OPAQUE_EXCHANGE_AUDIENCE =
  "https://app.staging.tagora.ca/api/nexus/handoff/exchange" as const;
export const HORORA_OPAQUE_EXCHANGE_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer" as const;
export const HORORA_OPAQUE_EXCHANGE_PRIVATE_JWK_ENV =
  "HORORA_STAGING_NEXUS_MODULE_CLIENT_PRIVATE_JWK" as const;
const CLIENT_ASSERTION_TTL_SECONDS = 60;
const OPAQUE_HANDOFF_CODE = /^htc_[A-Za-z0-9_-]{32}$/;

export type HororaOpaqueExchangeReason =
  | "exchange_unavailable"
  | "exchange_replay"
  | "exchange_expired"
  | "wrong_tenant"
  | "wrong_organization"
  | "wrong_module"
  | "exchange_client_denied"
  | "exchange_denied";

export type HororaOpaqueExchangeResult =
  | { readonly ok: true; readonly assertion: string }
  | { readonly ok: false; readonly reason: HororaOpaqueExchangeReason };

export type HororaOpaqueCredential =
  | { readonly kind: "opaque_code"; readonly code: string }
  | { readonly kind: "rejected_code" }
  | { readonly kind: "contradictory" }
  | { readonly kind: "assertion"; readonly token: string }
  | { readonly kind: "absent" };

export type HororaOpaqueExchangeInput = {
  env?: NexusHandoffEnvSource;
  fetchImpl?: typeof fetch;
};

function deny(reason: HororaOpaqueExchangeReason): HororaOpaqueExchangeResult {
  return { ok: false, reason };
}

function readField(
  searchParams: URLSearchParams | null | undefined,
  body: unknown,
  key: "handoff" | "code"
): string {
  const fromQuery = searchParams?.get(key)?.trim() ?? "";
  if (fromQuery) return fromQuery;
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function hororaStagingOpaqueExchangeEnabled(
  env: NexusHandoffEnvSource = process.env
): boolean {
  const projectId = (env.VERCEL_PROJECT_ID ?? "").trim();
  return projectId === HORORA_STAGING_VERCEL_PROJECT_ID;
}

export function classifyNexusOpaqueCredential(input: {
  searchParams?: URLSearchParams | null;
  body?: unknown;
  env?: NexusHandoffEnvSource;
}): HororaOpaqueCredential {
  const handoff = readField(input.searchParams, input.body, "handoff");
  const code = readField(input.searchParams, input.body, "code");
  if (handoff && code) return { kind: "contradictory" };
  if (handoff) return { kind: "assertion", token: handoff };
  if (!code) return { kind: "absent" };
  if (!OPAQUE_HANDOFF_CODE.test(code)) return { kind: "rejected_code" };
  const env = input.env ?? process.env;
  const projectId = (env.VERCEL_PROJECT_ID ?? "").trim();
  if (
    !hororaStagingOpaqueExchangeEnabled(env) ||
    projectId === HORORA_PRODUCTION_VERCEL_PROJECT_ID
  ) {
    return { kind: "rejected_code" };
  }
  return { kind: "opaque_code", code };
}

export function readHororaStagingClientPrivateJwk(
  env: NexusHandoffEnvSource = process.env
): JsonWebKey | null {
  const raw = (env[HORORA_OPAQUE_EXCHANGE_PRIVATE_JWK_ENV] ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as JsonWebKey & { d?: string };
    if (!parsed.d || parsed.kty !== "EC" || parsed.crv !== "P-256") return null;
    if (parsed.alg && parsed.alg !== "ES256") return null;
    if (parsed.kid !== HORORA_STAGING_NEXUS_CLIENT_KID) return null;
    if (typeof parsed.x !== "string" || typeof parsed.y !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function issueClientAssertion(privateJwk: JsonWebKey): string | null {
  try {
    const key = createPrivateKey({ key: privateJwk, format: "jwk" });
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: HORORA_STAGING_NEXUS_CLIENT_ID,
      sub: HORORA_STAGING_NEXUS_CLIENT_ID,
      aud: HORORA_OPAQUE_EXCHANGE_AUDIENCE,
      iat: now,
      exp: now + CLIENT_ASSERTION_TTL_SECONDS,
      jti: `horora_${now}_${randomBytes(8).toString("hex")}`,
      client_id: HORORA_STAGING_NEXUS_CLIENT_ID,
      tenant_id: HORORA_STAGING_NEXUS_TENANT_ID,
      organization_id: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
    };
    const header = {
      alg: "ES256",
      typ: "JWT",
      kid: HORORA_STAGING_NEXUS_CLIENT_KID,
    };
    const encoded = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const signingInput = `${encoded(header)}.${encoded(claims)}`;
    const signature = sign("SHA256", Buffer.from(signingInput), {
      key,
      dsaEncoding: "ieee-p1363",
    });
    return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
  } catch {
    return null;
  }
}

function reasonFromExchange(status: number, payload: unknown): HororaOpaqueExchangeReason {
  const reason =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).reason
      : "";
  if (reason === "JTI_REPLAYED") return "exchange_replay";
  if (reason === "JTI_EXPIRED") return "exchange_expired";
  if (reason === "WRONG_TENANT") return "wrong_tenant";
  if (reason === "WRONG_ORGANIZATION") return "wrong_organization";
  if (reason === "WRONG_MODULE") return "wrong_module";
  if (
    reason === "WRONG_CLIENT" ||
    reason === "CLIENT_AUTH_REQUIRED" ||
    reason === "CLIENT_AUTH_INVALID" ||
    reason === "CLIENT_KEY_UNKNOWN" ||
    reason === "CLIENT_UNKNOWN"
  ) {
    return "exchange_client_denied";
  }
  if (status === 503 || reason === "STORE_UNAVAILABLE") return "exchange_unavailable";
  return "exchange_denied";
}

export async function exchangeHororaOpaqueHandoffCode(
  code: string,
  input: HororaOpaqueExchangeInput = {}
): Promise<HororaOpaqueExchangeResult> {
  const opaqueCode = code.trim();
  const env = input.env ?? process.env;
  if (!hororaStagingOpaqueExchangeEnabled(env)) return deny("exchange_unavailable");
  if (!OPAQUE_HANDOFF_CODE.test(opaqueCode)) return deny("exchange_denied");
  const privateJwk = readHororaStagingClientPrivateJwk(env);
  if (!privateJwk) {
    const raw = (env[HORORA_OPAQUE_EXCHANGE_PRIVATE_JWK_ENV] ?? "").trim();
    return deny(raw ? "exchange_client_denied" : "exchange_unavailable");
  }
  const clientAssertion = issueClientAssertion(privateJwk);
  if (!clientAssertion) return deny("exchange_client_denied");

  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(
      new URL(HORORA_OPAQUE_EXCHANGE_PATH, NEXUS_STAGING_PUBLIC_ORIGIN),
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          code: opaqueCode,
          client_assertion: clientAssertion,
          client_assertion_type: HORORA_OPAQUE_EXCHANGE_ASSERTION_TYPE,
          clientId: HORORA_STAGING_NEXUS_CLIENT_ID,
          moduleKey: NEXUS_TECHNICAL_MODULE_KEY,
          tenantId: HORORA_STAGING_NEXUS_TENANT_ID,
          organizationId: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
        }),
        cache: "no-store",
        redirect: "error",
      }
    );
  } catch {
    return deny("exchange_unavailable");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return deny(response.status === 503 ? "exchange_unavailable" : "exchange_denied");
  }
  if (!response.ok) return deny(reasonFromExchange(response.status, payload));
  const assertion =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).assertion
      : "";
  if (typeof assertion !== "string" || assertion.split(".").length !== 3) {
    return deny("exchange_denied");
  }
  return { ok: true, assertion };
}

/**
 * Staging read of the Nexus authorized-module directory.
 * The private key stays in the server environment. A missing route, a
 * refused runtime, or an absent user is never reported as REVOKED.
 */

import { createPrivateKey, randomBytes, sign, type JsonWebKey } from "node:crypto";
import { NEXUS_STAGING_PUBLIC_ORIGIN } from "@/app/lib/canonical-domains";
import {
  HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH,
  HORORA_DIRECTORY_SERVICE_ALGORITHM,
} from "@/app/lib/auth/horora-authorized-module-directory-client.shared";
import {
  HORORA_DIRECTORY_REVOCATION_ENFORCED_ON_EXISTING_USERS,
  isCanonicalNexusUserId,
  type AuthorizedModuleDirectoryEntry,
  type HororaDirectoryAccessStatus,
  type HororaDirectoryScope,
} from "@/app/lib/auth/horora-authorized-module-directory.shared";
import { hororaStagingOpaqueExchangeEnabled } from "@/app/lib/auth/nexus-opaque-exchange.server";
import {
  DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
  type NexusHandoffEnvSource,
} from "@/app/lib/auth/nexus-handoff-config";

export const HORORA_DIRECTORY_CLIENT_ID = "svc_horora_directory" as const;
export const HORORA_DIRECTORY_AUDIENCE = "tagora:time:directory" as const;
export const HORORA_DIRECTORY_STAGING_PRIVATE_JWK_ENV =
  "HORORA_DIRECTORY_STAGING_PRIVATE_JWK" as const;
export const HORORA_DIRECTORY_STAGING_TENANT_ID = "tenant_tagora_internal" as const;
export const HORORA_DIRECTORY_NEXUS_ORIGIN_ENV = "HORORA_DIRECTORY_NEXUS_ORIGIN" as const;
export const NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN_ENV =
  "NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN" as const;

const DIRECTORY_ASSERTION_TTL_SECONDS = 60;
const DIRECTORY_STATUSES = new Set(["ACTIVE", "PENDING", "SUSPENDED", "REVOKED"]);

export type HororaDirectoryReadResult =
  | {
      ok: true;
      status: "ready";
      entries: readonly AuthorizedModuleDirectoryEntry[];
      revocationEnforced: false;
    }
  | {
      ok: false;
      status: "service_unavailable" | "service_uncertified" | "query_rejected";
      entries: readonly [];
      revocationEnforced: false;
    };

type DirectoryReadInput = {
  query: HororaDirectoryScope | null;
  env?: NexusHandoffEnvSource;
  fetchImpl?: typeof fetch;
  nowSeconds?: number;
};

function held(status: Exclude<HororaDirectoryReadResult, { ok: true }>["status"]): HororaDirectoryReadResult {
  return {
    ok: false,
    status,
    entries: [],
    revocationEnforced: HORORA_DIRECTORY_REVOCATION_ENFORCED_ON_EXISTING_USERS,
  };
}

export function readHororaDirectoryStagingPrivateJwk(
  env: NexusHandoffEnvSource = process.env
): JsonWebKey | null {
  const raw = (env[HORORA_DIRECTORY_STAGING_PRIVATE_JWK_ENV] ?? "").trim();
  if (raw.length < 32) return null;
  try {
    const parsed = JSON.parse(raw) as JsonWebKey & { d?: string };
    if (!parsed.d || parsed.kty !== "EC" || parsed.crv !== "P-256") return null;
    if (parsed.alg && parsed.alg !== "ES256") return null;
    if (typeof parsed.kid !== "string" || parsed.kid.trim().length === 0 || parsed.kid.length > 128) {
      return null;
    }
    if (typeof parsed.x !== "string" || typeof parsed.y !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function issueDirectoryAssertion(
  privateJwk: JsonWebKey,
  query: HororaDirectoryScope,
  nowSeconds: number
): string | null {
  try {
    const key = createPrivateKey({ key: privateJwk, format: "jwk" });
    const claims = {
      iss: HORORA_DIRECTORY_CLIENT_ID,
      sub: HORORA_DIRECTORY_CLIENT_ID,
      aud: HORORA_DIRECTORY_AUDIENCE,
      iat: nowSeconds,
      exp: nowSeconds + DIRECTORY_ASSERTION_TTL_SECONDS,
      jti: `horora_dir_${nowSeconds}_${randomBytes(8).toString("hex")}`,
      client_id: HORORA_DIRECTORY_CLIENT_ID,
      tenant_id: query.tenantId,
      organization_id: query.organizationId,
      module_key: query.moduleKey,
    };
    const header = {
      alg: HORORA_DIRECTORY_SERVICE_ALGORITHM,
      typ: "JWT",
      kid: privateJwk.kid,
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

function readEntries(payload: unknown): AuthorizedModuleDirectoryEntry[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const rows = (payload as { entries?: unknown }).entries;
  if (!Array.isArray(rows)) return [];
  const entries: AuthorizedModuleDirectoryEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    const userId = typeof record.userId === "string" ? record.userId.trim() : "";
    const status = typeof record.status === "string" ? record.status : "";
    if (!isCanonicalNexusUserId(userId) || !DIRECTORY_STATUSES.has(status)) continue;
    entries.push({
      userId,
      displayName: typeof record.displayName === "string" ? record.displayName : "Nexus",
      contactEmail: typeof record.contactEmail === "string" ? record.contactEmail : null,
      technicalKey: "tagora_time",
      status: status as AuthorizedModuleDirectoryEntry["status"],
      organizationId:
        typeof record.organizationId === "string" ? record.organizationId : null,
      nexusRoleKey: typeof record.nexusRoleKey === "string" ? record.nexusRoleKey : null,
    });
  }
  return entries;
}

export function directoryAccessForUser(
  entries: readonly AuthorizedModuleDirectoryEntry[],
  userId: string
): HororaDirectoryAccessStatus {
  const match = entries.find((entry) => entry.userId === userId.trim());
  return match?.status ?? "ABSENT";
}

function normalizeDirectoryOrigin(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveHororaDirectoryOrigin(
  env: NexusHandoffEnvSource = process.env
): string | null {
  const dedicated = normalizeDirectoryOrigin(env[HORORA_DIRECTORY_NEXUS_ORIGIN_ENV]);
  const consolidated = normalizeDirectoryOrigin(env[NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN_ENV]);
  if (!dedicated && !consolidated) return NEXUS_STAGING_PUBLIC_ORIGIN;
  if (!dedicated || !consolidated || dedicated !== consolidated) return null;
  return dedicated;
}

function queryAccepted(query: HororaDirectoryScope | null): query is HororaDirectoryScope {
  if (!query) return false;
  return (
    query.moduleKey === "tagora_time" &&
    query.tenantId.trim().length > 0 &&
    query.organizationId.trim().length > 0 &&
    !query.tenantId.includes("@") &&
    !query.organizationId.includes("@")
  );
}

export async function readHororaStagingAuthorizedDirectory(
  input: DirectoryReadInput
): Promise<HororaDirectoryReadResult> {
  if (!queryAccepted(input.query)) return held("query_rejected");
  const env = input.env ?? process.env;
  if (!hororaStagingOpaqueExchangeEnabled(env)) return held("service_unavailable");
  const privateJwk = readHororaDirectoryStagingPrivateJwk(env);
  if (!privateJwk) return held("service_unavailable");
  const assertion = issueDirectoryAssertion(
    privateJwk,
    input.query,
    input.nowSeconds ?? Math.floor(Date.now() / 1000)
  );
  if (!assertion) return held("service_unavailable");
  const origin = resolveHororaDirectoryOrigin(env);
  if (!origin) return held("service_unavailable");

  const url = new URL(HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH, origin);
  url.searchParams.set("tenantId", input.query.tenantId);
  url.searchParams.set("organizationId", input.query.organizationId);
  url.searchParams.set("moduleKey", input.query.moduleKey);

  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${assertion}`,
      },
    });
  } catch {
    return held("service_unavailable");
  }

  if (response.status === 404 || response.status >= 500) return held("service_unavailable");
  if (response.status === 401 || response.status === 403) return held("service_uncertified");
  if (response.status !== 200) return held("service_unavailable");

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) {
    return held("service_unavailable");
  }
  return {
    ok: true,
    status: "ready",
    entries: readEntries(payload),
    revocationEnforced: false,
  };
}

export async function certifiedDirectoryAccessForSession(input: {
  nexusActorId: string;
  nexusOrganizationId: string;
  env?: NexusHandoffEnvSource;
  fetchImpl?: typeof fetch;
}): Promise<HororaDirectoryAccessStatus | "unknown"> {
  if (!isCanonicalNexusUserId(input.nexusActorId)) return "unknown";
  if (input.nexusOrganizationId !== DEFAULT_HORORA_NEXUS_ORGANIZATION_ID) return "unknown";
  const result = await readHororaStagingAuthorizedDirectory({
    query: {
      tenantId: HORORA_DIRECTORY_STAGING_TENANT_ID,
      organizationId: DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
      moduleKey: "tagora_time",
    },
    env: input.env,
    fetchImpl: input.fetchImpl,
  });
  if (!result.ok) return "unknown";
  return directoryAccessForUser(result.entries, input.nexusActorId);
}

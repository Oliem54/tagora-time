/**
 * Local client for the future Nexus AuthorizedModuleDirectory read.
 * The remote call stays held. This module does not fetch, does not read
 * Nexus admin cookies, and does not call /api/nexus/admin/users.
 */

import {
  HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
  HORORA_DIRECTORY_REVOCATION_ENFORCED_ON_EXISTING_USERS,
  isCanonicalNexusUserId,
  type AuthorizedModuleDirectory,
  type AuthorizedModuleDirectoryEntry,
  type HororaCanonicalIdentityLink,
  type HororaDirectoryScope,
} from "@/app/lib/auth/horora-authorized-module-directory.shared";

export const HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH =
  "/api/nexus/service/authorized-module-directory" as const;

export const HORORA_FORBIDDEN_NEXUS_ADMIN_USERS_PATH =
  "/api/nexus/admin/users" as const;

export const HORORA_DIRECTORY_SERVICE_AUTHENTICATION = "private_key_jwt" as const;
export const HORORA_DIRECTORY_SERVICE_ALGORITHM = "ES256" as const;

export type HororaDirectoryServiceStatus =
  | "service_uncertified"
  | "service_unavailable"
  | "query_rejected"
  | "ready";

export type AuthorizedDirectoryTransportResult =
  | { ok: true; entries: readonly AuthorizedModuleDirectoryEntry[] }
  | { ok: false; reason: "service_unavailable" };

export type AuthorizedDirectoryTransport = (
  request: HororaDirectoryServiceRequest
) => Promise<AuthorizedDirectoryTransportResult>;

export type HororaDirectoryServiceRequest = {
  method: "GET";
  path: typeof HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH;
  query: HororaDirectoryScope;
  authentication: typeof HORORA_DIRECTORY_SERVICE_AUTHENTICATION;
  algorithm: typeof HORORA_DIRECTORY_SERVICE_ALGORITHM;
  dispatch: "held";
};

export type HororaOrganizationMapSnapshot = {
  nexusOrganizationId: string;
  nexusTenantId: string | null;
  organizationId: string;
  status: string;
};

export function authorizeHororaDirectoryReader(
  role: string | null | undefined
): boolean {
  return role === "admin";
}

export function resolveAuthorizedDirectoryQuery(input: {
  hororaOrganizationId: string | null | undefined;
  organizationMaps: readonly HororaOrganizationMapSnapshot[];
}):
  | { ok: true; query: HororaDirectoryScope }
  | { ok: false; reason: "query_rejected" } {
  const organizationId = input.hororaOrganizationId?.trim() ?? "";
  if (!organizationId) return { ok: false, reason: "query_rejected" };
  const maps = input.organizationMaps.filter(
    (row) => row.organizationId === organizationId && row.status === "active"
  );
  if (maps.length !== 1) return { ok: false, reason: "query_rejected" };
  const tenantId = maps[0].nexusTenantId?.trim() ?? "";
  const nexusOrganizationId = maps[0].nexusOrganizationId.trim();
  if (!tenantId || !nexusOrganizationId || tenantId.includes("@")) {
    return { ok: false, reason: "query_rejected" };
  }
  return {
    ok: true,
    query: {
      tenantId,
      organizationId: nexusOrganizationId,
      moduleKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
    },
  };
}

export function planAuthorizedDirectoryRequest(
  query: HororaDirectoryScope | null | undefined
):
  | { ok: true; request: HororaDirectoryServiceRequest }
  | { ok: false; reason: "query_rejected" } {
  if (!query) return { ok: false, reason: "query_rejected" };
  const tenantId = query.tenantId.trim();
  const organizationId = query.organizationId.trim();
  if (
    !tenantId ||
    !organizationId ||
    tenantId.includes("@") ||
    organizationId.includes("@") ||
    query.moduleKey !== HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY
  ) {
    return { ok: false, reason: "query_rejected" };
  }
  return {
    ok: true,
    request: {
      method: "GET",
      path: HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH,
      query: {
        tenantId,
        organizationId,
        moduleKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
      },
      authentication: HORORA_DIRECTORY_SERVICE_AUTHENTICATION,
      algorithm: HORORA_DIRECTORY_SERVICE_ALGORITHM,
      dispatch: "held",
    },
  };
}

export function acceptCanonicalIdentityLinks(
  rows: readonly {
    nexusUserId?: unknown;
    authUserId?: unknown;
    organizationId: string;
    disabledAt?: unknown;
  }[]
): HororaCanonicalIdentityLink[] {
  const links: HororaCanonicalIdentityLink[] = [];
  for (const row of rows) {
    if (typeof row.nexusUserId !== "string" || typeof row.authUserId !== "string") {
      continue;
    }
    if (!isCanonicalNexusUserId(row.nexusUserId)) continue;
    if (!row.authUserId.trim() || row.authUserId.includes("@")) continue;
    if (row.disabledAt) continue;
    links.push({
      nexusUserId: row.nexusUserId.trim(),
      authUserId: row.authUserId.trim(),
      organizationId: row.organizationId,
      disabledAt: null,
    });
  }
  return links;
}

export function filterDirectoryEntriesForScope(
  entries: readonly AuthorizedModuleDirectoryEntry[],
  query: HororaDirectoryScope
): AuthorizedModuleDirectoryEntry[] {
  return entries.filter(
    (entry) =>
      entry.technicalKey === query.moduleKey &&
      entry.organizationId === query.organizationId &&
      isCanonicalNexusUserId(entry.userId)
  );
}

export async function readAuthorizedModuleDirectory(input: {
  query: HororaDirectoryScope | null;
  transport?: AuthorizedDirectoryTransport;
  /** Test-only. The admin route keeps this held. */
  dispatch?: "held" | "test";
}): Promise<
  | {
      ok: true;
      status: "ready";
      directory: AuthorizedModuleDirectory;
      revocationEnforced: false;
    }
  | {
      ok: false;
      status: Exclude<HororaDirectoryServiceStatus, "ready">;
      directory: null;
      revocationEnforced: false;
    }
> {
  const held = {
    revocationEnforced: HORORA_DIRECTORY_REVOCATION_ENFORCED_ON_EXISTING_USERS,
  } as const;
  const plan = planAuthorizedDirectoryRequest(input.query);
  if (!plan.ok) {
    return { ok: false, status: "query_rejected", directory: null, ...held };
  }
  if (input.dispatch !== "test") {
    return { ok: false, status: "service_uncertified", directory: null, ...held };
  }
  try {
    const transported = await input.transport?.(plan.request);
    if (!transported || !transported.ok) {
      return { ok: false, status: "service_unavailable", directory: null, ...held };
    }
    return {
      ok: true,
      status: "ready",
      revocationEnforced: false,
      directory: {
        technicalKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
        connected: true,
        entries: filterDirectoryEntriesForScope(transported.entries, plan.request.query),
      },
    };
  } catch {
    return { ok: false, status: "service_unavailable", directory: null, ...held };
  }
}

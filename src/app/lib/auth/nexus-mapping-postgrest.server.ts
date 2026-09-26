import type {
  HororaOrganizationRow,
  NexusIdentityMapRow,
  NexusMappingLookups,
  NexusOrganizationMapRow,
} from "@/app/lib/auth/nexus-identity-mapping.server";
import type { MembershipRow } from "@/app/lib/saas/organization-membership.shared";
import {
  dispatchMappingWithUndici,
  lockMappingOutboundHeaders,
  mappingHttpStatusError,
  type MappingDispatch,
} from "@/app/lib/supabase/mapping-undici.server";
import { buildHororaServiceRoleHeaders } from "@/app/lib/supabase/service-role-postgrest.shared";
import { resolveHororaRuntimeSupabaseUrl } from "@/app/lib/supabase/supabase-host.shared";

export type MappingHttpStatusLog = {
  stage: "identity_mapping";
  http_status: string;
};

export function createNexusMappingLookups(
  env: NodeJS.ProcessEnv = process.env,
  dispatch: MappingDispatch = dispatchMappingWithUndici,
  logHttpStatus?: (fields: MappingHttpStatusLog) => void
): NexusMappingLookups {
  const supabaseUrl = resolveHororaRuntimeSupabaseUrl(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env
  );
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  const headers = buildHororaServiceRoleHeaders(serviceRoleKey);

  async function send(
    url: URL,
    method: "GET" | "POST",
    requestHeaders: Headers,
    body?: string
  ): Promise<{ status: number; bodyText: string }> {
    return dispatch({
      url: url.toString(),
      method,
      headers: lockMappingOutboundHeaders(requestHeaders),
      body,
    });
  }

  async function selectRows<T>(table: string, query: Record<string, string>): Promise<T[]> {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value);
    }
    const response = await send(url, "GET", headers);
    if (!isHttpOk(response.status)) {
      reportMappingHttpStatus(response.status, logHttpStatus);
      throw mappingHttpStatusError(response.status);
    }
    return parseJsonArray<T>(response.bodyText, response.status);
  }

  async function insertRow(
    table: string,
    body: Record<string, string>
  ): Promise<{ duplicate: boolean }> {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Content-Type", "application/json");
    requestHeaders.set("Prefer", "return=minimal");
    const response = await send(url, "POST", requestHeaders, JSON.stringify(body));
    if (isHttpOk(response.status)) return { duplicate: false };
    if (response.status === 409 || response.bodyText.includes("23505")) {
      return { duplicate: true };
    }
    reportMappingHttpStatus(response.status, logHttpStatus);
    throw mappingHttpStatusError(response.status);
  }

  return {
    async findIdentityMaps(nexusActorId) {
      return selectRows<NexusIdentityMapRow>("horora_nexus_identity_map", {
        select: "nexus_actor_id,auth_user_id,disabled_at",
        nexus_actor_id: `eq.${nexusActorId}`,
        disabled_at: "is.null",
      });
    },
    async authUserExists(authUserId) {
      const url = new URL(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, supabaseUrl);
      const response = await send(url, "GET", headers);
      if (response.status === 401 || response.status === 403) {
        reportMappingHttpStatus(response.status, logHttpStatus);
        throw mappingHttpStatusError(response.status);
      }
      if (!isHttpOk(response.status)) return false;
      const data = parseJsonObject(response.bodyText, response.status) as {
        id?: string;
        user?: { id?: string };
      };
      const id = data.user?.id ?? data.id ?? "";
      return id === authUserId;
    },
    async findMembershipsForUser(authUserId) {
      return selectRows<MembershipRow>("organization_memberships", {
        select: "id,organization_id,role,status,is_default",
        user_id: `eq.${authUserId}`,
      });
    },
    async findOrganizationMaps(nexusOrganizationId) {
      return selectRows<NexusOrganizationMapRow>("horora_nexus_organization_map", {
        select: "nexus_organization_id,organization_id,status",
        nexus_organization_id: `eq.${nexusOrganizationId}`,
        status: "eq.active",
      });
    },
    async findOrganization(organizationId) {
      const rows = await selectRows<HororaOrganizationRow>("organizations", {
        select: "id,status,deleted_at",
        id: `eq.${organizationId}`,
      });
      return rows[0] ?? null;
    },
    async insertIdentityMap(row) {
      return insertRow("horora_nexus_identity_map", row);
    },
    async insertOrganizationMap(row) {
      return insertRow("horora_nexus_organization_map", {
        ...row,
        status: "active",
      });
    },
  };
}

function reportMappingHttpStatus(
  status: number,
  logHttpStatus?: (fields: MappingHttpStatusLog) => void
): void {
  const httpStatus =
    Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : "000";
  const fields: MappingHttpStatusLog = {
    stage: "identity_mapping",
    http_status: httpStatus,
  };
  if (logHttpStatus) {
    logHttpStatus(fields);
    return;
  }
  console.info("[horora.nexus.mapping]", fields);
}

function isHttpOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function parseJsonArray<T>(bodyText: string, status: number): T[] {
  const data = parseJsonObject(bodyText, status);
  return Array.isArray(data) ? (data as T[]) : [];
}

function parseJsonObject(bodyText: string, status: number): unknown {
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw mappingHttpStatusError(status);
  }
}

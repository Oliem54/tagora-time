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
  toMappingClientError,
  type MappingDispatch,
  type MappingErrorKind,
} from "@/app/lib/supabase/mapping-undici.server";
import { buildHororaServiceRoleHeaders } from "@/app/lib/supabase/service-role-postgrest.shared";
import { resolveHororaRuntimeSupabaseUrl } from "@/app/lib/supabase/supabase-host.shared";

export type MappingHttpStatusLog = {
  stage: "identity_mapping";
  error_kind: MappingErrorKind;
  http_status?: string;
  postgrest_code?: string;
  actor_id_present?: "yes" | "no";
  actor_id_empty?: "yes" | "no";
  actor_id_format?: "valid" | "invalid";
  actor_id_origin?: "server_claim";
};

const NEXUS_ACTOR_ID_MAX_LENGTH = 128;
const POSTGREST_SQLSTATE = /^[0-9A-Z]{5}$/;

export function readPostgrestSqlState(bodyText: string): string | undefined {
  const trimmed = bodyText.trim();
  if (!trimmed || trimmed.startsWith("<")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const code = (parsed as { code?: unknown }).code;
  if (typeof code !== "string" || !POSTGREST_SQLSTATE.test(code)) return undefined;
  return code;
}

export function diagnoseNexusActorIdFilter(value: unknown): Pick<
  MappingHttpStatusLog,
  "actor_id_present" | "actor_id_empty" | "actor_id_format" | "actor_id_origin"
> {
  const present = typeof value === "string";
  const trimmed = present ? value.trim() : "";
  const formatValid =
    present &&
    trimmed.length >= 1 &&
    trimmed.length <= NEXUS_ACTOR_ID_MAX_LENGTH &&
    !trimmed.includes("@");
  return {
    actor_id_present: present ? "yes" : "no",
    actor_id_empty: trimmed.length === 0 ? "yes" : "no",
    actor_id_format: formatValid ? "valid" : "invalid",
    actor_id_origin: "server_claim",
  };
}

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
    try {
      return await dispatch({
        url: url.toString(),
        method,
        headers: lockMappingOutboundHeaders(requestHeaders),
        body,
      });
    } catch (error) {
      const classified = toMappingClientError(error);
      reportMappingFailure(classified.errorKind, classified.httpStatus, logHttpStatus);
      throw classified;
    }
  }

  async function selectRows<T>(
    table: string,
    query: Record<string, string>,
    actorFilter?: ReturnType<typeof diagnoseNexusActorIdFilter>
  ): Promise<T[]> {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value);
    }
    const response = await send(url, "GET", headers);
    if (!isHttpOk(response.status)) {
      throw reportHttpFailure(response.status, logHttpStatus, response.bodyText, actorFilter);
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
    throw reportHttpFailure(response.status, logHttpStatus, response.bodyText);
  }

  return {
    async findIdentityMaps(nexusActorId) {
      const actorValue = typeof nexusActorId === "string" ? nexusActorId : "";
      return selectRows<NexusIdentityMapRow>(
        "horora_nexus_identity_map",
        {
          select: "nexus_actor_id,auth_user_id,disabled_at",
          nexus_actor_id: `eq.${actorValue}`,
          disabled_at: "is.null",
        },
        diagnoseNexusActorIdFilter(nexusActorId)
      );
    },
    async authUserExists(authUserId) {
      const url = new URL(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, supabaseUrl);
      const response = await send(url, "GET", headers);
      if (response.status === 401 || response.status === 403) {
        throw reportHttpFailure(response.status, logHttpStatus);
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
        select: "nexus_organization_id,nexus_tenant_id,organization_id,status",
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

function reportHttpFailure(
  status: number,
  logHttpStatus?: (fields: MappingHttpStatusLog) => void,
  bodyText?: string,
  actorFilter?: ReturnType<typeof diagnoseNexusActorIdFilter>
): Error {
  const failure = mappingHttpStatusError(status);
  reportMappingFailure(
    failure.errorKind,
    failure.httpStatus,
    logHttpStatus,
    bodyText,
    actorFilter
  );
  return failure;
}

function reportMappingFailure(
  errorKind: MappingErrorKind,
  httpStatus: string | undefined,
  logHttpStatus?: (fields: MappingHttpStatusLog) => void,
  bodyText?: string,
  actorFilter?: ReturnType<typeof diagnoseNexusActorIdFilter>
): void {
  const fields: MappingHttpStatusLog = {
    stage: "identity_mapping",
    error_kind: errorKind,
  };
  if (httpStatus && /^\d{3}$/.test(httpStatus)) {
    fields.http_status = httpStatus;
  }
  const postgrestCode = bodyText ? readPostgrestSqlState(bodyText) : undefined;
  if (postgrestCode) fields.postgrest_code = postgrestCode;
  if (actorFilter) Object.assign(fields, actorFilter);
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

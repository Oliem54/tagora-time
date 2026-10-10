/**
 * Durable HORORA acknowledgement store.
 * Uses the existing service-role PostgREST path. Browser identity headers
 * are not forwarded. The table migration is local until a later apply GO.
 */

import type { HororaRoleAcknowledgement } from "@/app/lib/auth/horora-role-consent.server";
import {
  HORORA_ROLE_ACKNOWLEDGEMENT_TABLE,
  HORORA_ROLE_CATALOG_VERSION,
  isHororaAssignableRoleKey,
} from "@/app/lib/auth/horora-role-consent.server";
import { buildHororaServiceRoleHeaders } from "@/app/lib/supabase/service-role-postgrest.shared";
import {
  dispatchMappingWithUndici,
  lockMappingOutboundHeaders,
  type MappingDispatch,
} from "@/app/lib/supabase/mapping-undici.server";
import { resolveHororaRuntimeSupabaseUrl } from "@/app/lib/supabase/supabase-host.shared";
import type { HororaRoleAcknowledgementStore } from "@/app/lib/auth/horora-role-consent.server";

const SELECT_COLUMNS = [
  "id",
  "operation_id",
  "module_role_assignment_id",
  "user_module_access_id",
  "role_key",
  "membership_id",
  "admin_user_id",
  "nexus_actor_id",
  "nexus_organization_id",
  "nexus_tenant_id",
  "organization_id",
  "environment",
  "operation",
  "catalog_version",
  "assignment_version",
  "acknowledged_at",
].join(",");

export function createHororaRoleAcknowledgementStore(
  env: NodeJS.ProcessEnv = process.env,
  dispatch: MappingDispatch = dispatchMappingWithUndici
): HororaRoleAcknowledgementStore {
  const supabaseUrl = resolveHororaRuntimeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL, env);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  const headers = buildHororaServiceRoleHeaders(serviceRoleKey);

  return {
    async findByOperationId(operationId) {
      return findOne(dispatch, supabaseUrl, headers, "operation_id", operationId);
    },
    async findByAssignmentId(moduleRoleAssignmentId) {
      return findOne(
        dispatch,
        supabaseUrl,
        headers,
        "module_role_assignment_id",
        moduleRoleAssignmentId
      );
    },
    async insert(row) {
      const url = new URL(`/rest/v1/${HORORA_ROLE_ACKNOWLEDGEMENT_TABLE}`, supabaseUrl);
      const requestHeaders = new Headers(headers);
      requestHeaders.set("Content-Type", "application/json");
      requestHeaders.set("Prefer", "return=minimal");
      const response = await send(
        dispatch,
        url,
        "POST",
        requestHeaders,
        JSON.stringify({
          id: row.id,
          operation_id: row.operationId,
          module_role_assignment_id: row.moduleRoleAssignmentId,
          user_module_access_id: row.userModuleAccessId,
          role_key: row.roleKey,
          membership_id: row.membershipId,
          admin_user_id: row.adminUserId,
          nexus_actor_id: row.nexusActorId,
          nexus_organization_id: row.nexusOrganizationId,
          nexus_tenant_id: row.nexusTenantId,
          organization_id: row.organizationId,
          environment: row.environment,
          operation: row.operation,
          catalog_version: row.catalogVersion,
          assignment_version: row.assignmentVersion,
          acknowledged_at: row.acknowledgedAt,
        })
      );
      if (response.status >= 200 && response.status < 300) return { duplicate: false };
      if (response.status === 409 || response.bodyText.includes("23505")) {
        return { duplicate: true };
      }
      throw new Error("acknowledgement_unavailable");
    },
  };
}

async function findOne(
  dispatch: MappingDispatch,
  supabaseUrl: string,
  headers: Headers,
  column: "operation_id" | "module_role_assignment_id",
  value: string
): Promise<HororaRoleAcknowledgement | null> {
  const url = new URL(`/rest/v1/${HORORA_ROLE_ACKNOWLEDGEMENT_TABLE}`, supabaseUrl);
  url.searchParams.set("select", SELECT_COLUMNS);
  url.searchParams.set(column, `eq.${value}`);
  url.searchParams.set("limit", "2");
  const response = await send(dispatch, url, "GET", headers);
  if (response.status < 200 || response.status >= 300) {
    throw new Error("acknowledgement_unavailable");
  }
  const rows = parseRows(response.bodyText);
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new Error("ack_conflict");
  return rows[0] ?? null;
}

async function send(
  dispatch: MappingDispatch,
  url: URL,
  method: "GET" | "POST",
  headers: Headers,
  body?: string
): Promise<{ status: number; bodyText: string }> {
  return dispatch({
    url: url.toString(),
    method,
    headers: lockMappingOutboundHeaders(headers),
    body,
  });
}

function parseRows(bodyText: string): HororaRoleAcknowledgement[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    throw new Error("acknowledgement_unavailable");
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((row) => {
    const mapped = mapRow(row);
    return mapped ? [mapped] : [];
  });
}

function readAssignmentVersion(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return Number(value);
  return null;
}

function mapRow(value: unknown): HororaRoleAcknowledgement | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const roleKey = typeof row.role_key === "string" ? row.role_key : "";
  const assignmentVersion = readAssignmentVersion(row.assignment_version);
  if (!isHororaAssignableRoleKey(roleKey) || assignmentVersion == null) return null;
  if (row.catalog_version !== HORORA_ROLE_CATALOG_VERSION) return null;
  if (
    typeof row.id !== "string" ||
    typeof row.operation_id !== "string" ||
    typeof row.module_role_assignment_id !== "string" ||
    typeof row.user_module_access_id !== "string" ||
    typeof row.membership_id !== "string" ||
    typeof row.admin_user_id !== "string" ||
    typeof row.nexus_actor_id !== "string" ||
    typeof row.nexus_organization_id !== "string" ||
    typeof row.nexus_tenant_id !== "string" ||
    row.nexus_tenant_id.trim().length === 0 ||
    row.nexus_tenant_id !== row.nexus_tenant_id.trim() ||
    typeof row.organization_id !== "string" ||
    typeof row.acknowledged_at !== "string" ||
    (row.environment !== "local" &&
      row.environment !== "test" &&
      row.environment !== "staging") ||
    (row.operation !== "ASSIGN" && row.operation !== "CHANGE")
  ) {
    return null;
  }
  return {
    id: row.id,
    operationId: row.operation_id,
    moduleRoleAssignmentId: row.module_role_assignment_id,
    userModuleAccessId: row.user_module_access_id,
    roleKey,
    membershipId: row.membership_id,
    adminUserId: row.admin_user_id,
    nexusActorId: row.nexus_actor_id,
    nexusOrganizationId: row.nexus_organization_id,
    nexusTenantId: row.nexus_tenant_id,
    organizationId: row.organization_id,
    environment: row.environment,
    operation: row.operation,
    catalogVersion: HORORA_ROLE_CATALOG_VERSION,
    assignmentVersion,
    acknowledgedAt: row.acknowledged_at,
  };
}

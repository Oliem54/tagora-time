import type {
  HororaOrganizationRow,
  NexusIdentityMapRow,
  NexusMappingLookups,
  NexusOrganizationMapRow,
} from "@/app/lib/auth/nexus-identity-mapping.server";
import type { MembershipRow } from "@/app/lib/saas/organization-membership.shared";
import { buildHororaServiceRoleHeaders } from "@/app/lib/supabase/service-role-postgrest.shared";
import { resolveHororaRuntimeSupabaseUrl } from "@/app/lib/supabase/supabase-host.shared";

type FetchLike = typeof fetch;

export function createNexusMappingLookups(
  env: NodeJS.ProcessEnv = process.env,
  baseFetch: FetchLike = fetch
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

  async function selectRows<T>(table: string, query: Record<string, string>): Promise<T[]> {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value);
    }
    const response = await baseFetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(await readPostgrestMessage(response));
    }
    const data = (await response.json()) as T[] | null;
    return data ?? [];
  }

  async function insertRow(
    table: string,
    body: Record<string, string>
  ): Promise<{ duplicate: boolean }> {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Content-Type", "application/json");
    requestHeaders.set("Prefer", "return=minimal");
    const response = await baseFetch(url, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (response.ok) return { duplicate: false };
    const message = await readPostgrestMessage(response);
    if (message.includes("23505") || response.status === 409) {
      return { duplicate: true };
    }
    throw new Error(message);
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
      const response = await baseFetch(url, {
        method: "GET",
        headers,
        cache: "no-store",
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { id?: string; user?: { id?: string } };
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

async function readPostgrestMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string; code?: string };
    const message = body.message?.trim() || "";
    const code = body.code?.trim() || "";
    if (message && code) return `${code} ${message}`;
    return message || code || `postgrest_${response.status}`;
  } catch {
    return text.trim() || `postgrest_${response.status}`;
  }
}

/**
 * Explicit Nexus → HORORA identity and organization mapping.
 * Membership-based. No email lookup, no metadata authority, no auto-provision
 * of auth.users or organization_memberships.
 */

import type { NexusHandoffClaims } from "@/app/lib/auth/nexus-handoff";
import {
  DEFAULT_HORORA_NEXUS_ORGANIZATION_ID,
  HORORA_NEXUS_MAPPING_ENV_KEYS,
  type NexusHandoffEnvSource,
} from "@/app/lib/auth/nexus-handoff-config";
import { mapOrganizationMembershipRoleToAppRole } from "@/app/lib/auth/organization-role-mapping.shared";
import type { AppRole } from "@/app/lib/auth/roles";
import {
  selectActiveMembershipRow,
  type MembershipRow,
} from "@/app/lib/saas/organization-membership.shared";
import type { OrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";

export type NexusIdentityMapRow = {
  nexus_actor_id: string;
  auth_user_id: string;
  disabled_at: string | null;
};

export type NexusOrganizationMapRow = {
  nexus_organization_id: string;
  organization_id: string;
  status: string;
};

export type HororaOrganizationRow = {
  id: string;
  status: string;
  deleted_at: string | null;
};

export type NexusMappingDenyReason =
  | "mapping_absent"
  | "mapping_ambiguous"
  | "auth_user_missing"
  | "membership_missing"
  | "membership_inactive"
  | "membership_ambiguous"
  | "role_mapping_denied"
  | "organization_mapping_absent"
  | "organization_mapping_ambiguous"
  | "organization_missing"
  | "organization_inactive"
  | "cross_tenant"
  | "mapping_unavailable";

export type NexusResolvedBinding = {
  readonly nexusActorId: string;
  readonly nexusOrganizationId: string;
  readonly nexusMembershipId: string;
  readonly authUserId: string;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly membershipRole: OrganizationMembershipRole;
  readonly role: AppRole;
};

export type NexusMappingResult =
  | { readonly ok: true; readonly binding: NexusResolvedBinding }
  | { readonly ok: false; readonly reason: NexusMappingDenyReason };

export type NexusMappingLookups = {
  findIdentityMaps(nexusActorId: string): Promise<NexusIdentityMapRow[]>;
  authUserExists(authUserId: string): Promise<boolean>;
  findMembershipsForUser(authUserId: string): Promise<MembershipRow[]>;
  findOrganizationMaps(nexusOrganizationId: string): Promise<NexusOrganizationMapRow[]>;
  findOrganization(organizationId: string): Promise<HororaOrganizationRow | null>;
  insertIdentityMap?(row: {
    nexus_actor_id: string;
    auth_user_id: string;
  }): Promise<{ duplicate: boolean }>;
  insertOrganizationMap?(row: {
    nexus_organization_id: string;
    organization_id: string;
  }): Promise<{ duplicate: boolean }>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(reason: NexusMappingDenyReason): NexusMappingResult {
  return { ok: false, reason };
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function readEnv(env: NexusHandoffEnvSource, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

export function resolveAuthorizedMappingTarget(
  claimsUserId: string,
  env: NexusHandoffEnvSource = process.env
): { authUserId: string; organizationId: string; nexusOrganizationId: string } | null {
  const nexusOrg =
    readEnv(env, HORORA_NEXUS_MAPPING_ENV_KEYS.nexusOrganizationId) ||
    DEFAULT_HORORA_NEXUS_ORGANIZATION_ID;
  const organizationId = readEnv(env, HORORA_NEXUS_MAPPING_ENV_KEYS.organizationId);
  if (!organizationId || !isUuid(organizationId)) return null;

  const actor = readEnv(env, HORORA_NEXUS_MAPPING_ENV_KEYS.nexusActorId);
  const authUserId = readEnv(env, HORORA_NEXUS_MAPPING_ENV_KEYS.authUserId);
  if (authUserId && isUuid(authUserId)) {
    if (!actor || claimsUserId === actor) {
      return { authUserId, organizationId, nexusOrganizationId: nexusOrg };
    }
  }

  const employeeActor = readEnv(env, HORORA_NEXUS_MAPPING_ENV_KEYS.employeeNexusActorId);
  const employeeAuthUserId = readEnv(env, HORORA_NEXUS_MAPPING_ENV_KEYS.employeeAuthUserId);
  if (
    employeeActor &&
    employeeAuthUserId &&
    claimsUserId === employeeActor &&
    isUuid(employeeAuthUserId)
  ) {
    return { authUserId: employeeAuthUserId, organizationId, nexusOrganizationId: nexusOrg };
  }

  return null;
}

export async function defaultNexusMappingLookups(): Promise<NexusMappingLookups> {
  const { createAdminSupabaseClient } = await import("@/app/lib/supabase/admin");
  const supabase = createAdminSupabaseClient();
  return {
    async findIdentityMaps(nexusActorId) {
      const { data, error } = await supabase
        .from("horora_nexus_identity_map")
        .select("nexus_actor_id, auth_user_id, disabled_at")
        .eq("nexus_actor_id", nexusActorId)
        .is("disabled_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []) as NexusIdentityMapRow[];
    },
    async authUserExists(authUserId) {
      const { data, error } = await supabase.auth.admin.getUserById(authUserId);
      if (error || !data.user?.id) return false;
      return data.user.id === authUserId;
    },
    async findMembershipsForUser(authUserId) {
      const { data, error } = await supabase
        .from("organization_memberships")
        .select("id, organization_id, role, status, is_default")
        .eq("user_id", authUserId);
      if (error) throw new Error(error.message);
      return (data ?? []) as MembershipRow[];
    },
    async findOrganizationMaps(nexusOrganizationId) {
      const { data, error } = await supabase
        .from("horora_nexus_organization_map")
        .select("nexus_organization_id, organization_id, status")
        .eq("nexus_organization_id", nexusOrganizationId)
        .eq("status", "active");
      if (error) throw new Error(error.message);
      return (data ?? []) as NexusOrganizationMapRow[];
    },
    async findOrganization(organizationId) {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, status, deleted_at")
        .eq("id", organizationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as HororaOrganizationRow | null) ?? null;
    },
    async insertIdentityMap(row) {
      const { error } = await supabase.from("horora_nexus_identity_map").insert(row);
      if (!error) return { duplicate: false };
      if (error.code === "23505") return { duplicate: true };
      throw new Error(error.message);
    },
    async insertOrganizationMap(row) {
      const { error } = await supabase.from("horora_nexus_organization_map").insert({
        ...row,
        status: "active",
      });
      if (!error) return { duplicate: false };
      if (error.code === "23505") return { duplicate: true };
      throw new Error(error.message);
    },
  };
}

function selectableMembershipInOrg(
  rows: MembershipRow[],
  organizationId: string
):
  | { ok: true; row: MembershipRow }
  | { ok: false; reason: NexusMappingDenyReason } {
  const inOrg = rows.filter((row) => row.organization_id === organizationId);
  const elsewhereActive = rows.filter(
    (row) => row.organization_id !== organizationId && row.status === "active"
  );
  const selected = selectActiveMembershipRow(inOrg, "strict");
  if (selected.kind === "ok") {
    if (selected.row.organization_id !== organizationId) {
      return { ok: false, reason: "cross_tenant" };
    }
    return { ok: true, row: selected.row };
  }
  if (selected.kind === "ambiguous") {
    return { ok: false, reason: "membership_ambiguous" };
  }
  if (selected.kind === "inactive") {
    return { ok: false, reason: "membership_inactive" };
  }
  if (elsewhereActive.length > 0) {
    return { ok: false, reason: "cross_tenant" };
  }
  return { ok: false, reason: "membership_missing" };
}

async function maybeInsertAuthorizedMaps(
  claims: NexusHandoffClaims,
  ports: NexusMappingLookups,
  env: NexusHandoffEnvSource
): Promise<NexusMappingResult | { ok: true; continue: true }> {
  const authorized = resolveAuthorizedMappingTarget(claims.user_id, env);
  if (!authorized) return { ok: true, continue: true };
  if (claims.organization_id !== authorized.nexusOrganizationId) {
    return fail("organization_mapping_absent");
  }

  const authExists = await ports.authUserExists(authorized.authUserId);
  if (!authExists) return fail("auth_user_missing");

  const memberships = await ports.findMembershipsForUser(authorized.authUserId);
  const selected = selectableMembershipInOrg(memberships, authorized.organizationId);
  if (!selected.ok) return fail(selected.reason);

  const organization = await ports.findOrganization(authorized.organizationId);
  if (!organization) return fail("organization_missing");
  if (organization.deleted_at || organization.status !== "active") {
    return fail("organization_inactive");
  }

  if (ports.insertIdentityMap) {
    await ports.insertIdentityMap({
      nexus_actor_id: claims.user_id,
      auth_user_id: authorized.authUserId,
    });
  }
  if (ports.insertOrganizationMap) {
    await ports.insertOrganizationMap({
      nexus_organization_id: claims.organization_id,
      organization_id: authorized.organizationId,
    });
  }
  return { ok: true, continue: true };
}

export async function resolveNexusHororaBinding(
  claims: NexusHandoffClaims,
  lookups?: NexusMappingLookups,
  env: NexusHandoffEnvSource = process.env
): Promise<NexusMappingResult> {
  try {
    const ports = lookups ?? (await defaultNexusMappingLookups());
    let identityRows = await ports.findIdentityMaps(claims.user_id);
    if (identityRows.length === 0) {
      const inserted = await maybeInsertAuthorizedMaps(claims, ports, env);
      if (!inserted.ok) return inserted;
      identityRows = await ports.findIdentityMaps(claims.user_id);
    }
    if (identityRows.length === 0) return fail("mapping_absent");
    if (identityRows.length > 1) return fail("mapping_ambiguous");

    const identity = identityRows[0];
    if (identity.nexus_actor_id !== claims.user_id || !identity.auth_user_id?.trim()) {
      return fail("mapping_absent");
    }
    if (!isUuid(identity.auth_user_id)) {
      return fail("auth_user_missing");
    }

    const authExists = await ports.authUserExists(identity.auth_user_id);
    if (!authExists) return fail("auth_user_missing");

    const orgMaps = await ports.findOrganizationMaps(claims.organization_id);
    if (orgMaps.length === 0) return fail("organization_mapping_absent");
    if (orgMaps.length > 1) return fail("organization_mapping_ambiguous");

    const orgMap = orgMaps[0];
    if (orgMap.status !== "active") return fail("organization_inactive");

    const organization = await ports.findOrganization(orgMap.organization_id);
    if (!organization) return fail("organization_missing");
    if (organization.deleted_at || organization.status !== "active") {
      return fail("organization_inactive");
    }

    const memberships = await ports.findMembershipsForUser(identity.auth_user_id);
    const selected = selectableMembershipInOrg(memberships, organization.id);
    if (!selected.ok) return fail(selected.reason);

    const appRole = mapOrganizationMembershipRoleToAppRole(selected.row.role);
    if (!appRole) return fail("role_mapping_denied");

    return {
      ok: true,
      binding: {
        nexusActorId: claims.user_id,
        nexusOrganizationId: claims.organization_id,
        nexusMembershipId: claims.membership_id,
        authUserId: identity.auth_user_id,
        organizationId: organization.id,
        membershipId: selected.row.id,
        membershipRole: selected.row.role as OrganizationMembershipRole,
        role: appRole,
      },
    };
  } catch {
    return fail("mapping_unavailable");
  }
}

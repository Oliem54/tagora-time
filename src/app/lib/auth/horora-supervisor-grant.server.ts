import "server-only";

import {
  decideStoredHororaSupervisorAccess,
  isHororaSupervisorGrantTableAbsent,
  type HororaScopedTimeAccess,
  type HororaSupervisorGrantLookup,
  type HororaSupervisorGrantRow,
  type HororaSupervisorMembershipContext,
  type HororaSupervisorTargetScope,
} from "@/app/lib/auth/horora-supervisor-grant.shared";
import type { HororaAccessCapability } from "@/app/lib/auth/horora-role-model.shared";
import { resolveActiveOrganizationMembershipForUserId } from "@/app/lib/saas/organization-membership.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type GrantTableRow = {
  auth_user_id: string | null;
  membership_id: string | null;
  organization_id: string | null;
  organization_company_id: string | null;
  effectifs_department_key: string | null;
  capabilities: string[] | null;
  status: string | null;
};

function mapRow(row: GrantTableRow): HororaSupervisorGrantRow {
  return {
    authUserId: row.auth_user_id,
    membershipId: row.membership_id,
    organizationId: row.organization_id,
    organizationCompanyId: row.organization_company_id,
    effectifsDepartmentKey: row.effectifs_department_key,
    capabilities: row.capabilities,
    status: row.status,
  };
}

export async function lookupHororaSupervisorGrants(
  authUserId: string
): Promise<HororaSupervisorGrantLookup> {
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("horora_supervisor_grants")
      .select(
        "auth_user_id, membership_id, organization_id, organization_company_id, effectifs_department_key, capabilities, status"
      )
      .eq("auth_user_id", authUserId);
    if (error) {
      return {
        ok: false,
        reason: isHororaSupervisorGrantTableAbsent(error) ? "table_absent" : "lookup_failed",
      };
    }
    return { ok: true, rows: (data ?? []).map((row) => mapRow(row as GrantTableRow)) };
  } catch {
    return { ok: false, reason: "table_absent" };
  }
}

function membershipContext(
  authUserId: string,
  resolved: Awaited<ReturnType<typeof resolveActiveOrganizationMembershipForUserId>>
): HororaSupervisorMembershipContext {
  if (!resolved.ok) {
    if (resolved.reason === "membership_inactive") {
      return { authUserId, role: "employe", status: "inactive" };
    }
    return null;
  }
  return {
    authUserId,
    membershipId: resolved.membershipId,
    role: resolved.membershipRole,
    status: resolved.membershipStatus,
  };
}

/** Employe grant read. Direction and admin never call this. Any failure denies. */
export async function readEmployeSupervisorTimeAccess(input: {
  authUserId: string;
  capability: HororaAccessCapability;
  target?: HororaSupervisorTargetScope | null;
}): Promise<HororaScopedTimeAccess> {
  try {
    const membership = await resolveActiveOrganizationMembershipForUserId(input.authUserId);
    const context = membershipContext(input.authUserId, membership);
    const lookup =
      context?.role === "employe" && context.status === "active"
        ? await lookupHororaSupervisorGrants(input.authUserId)
        : { ok: true as const, rows: [] };
    return decideStoredHororaSupervisorAccess({
      callerAuthUserId: input.authUserId,
      membership: context,
      lookup,
      capability: input.capability,
      target: input.target,
    });
  } catch {
    return { allowed: false, source: "denied", reason: "table_absent" };
  }
}

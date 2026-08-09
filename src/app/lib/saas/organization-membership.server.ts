import "server-only";

import type { User } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  isOrganizationMembershipRole,
  type OrganizationMembershipRole,
} from "@/app/lib/saas/tenant-foundation.shared";
import { mapOrganizationMembershipRoleToAppRole } from "@/app/lib/auth/organization-role-mapping.shared";
import type { AppRole } from "@/app/lib/auth/roles";
import {
  selectActiveMembershipRow,
  type MembershipRow,
  type SelectMembershipMode,
} from "@/app/lib/saas/organization-membership.shared";

export type { MembershipRow } from "@/app/lib/saas/organization-membership.shared";

export type ActiveOrganizationMembership = {
  userId: string;
  organizationId: string;
  membershipId: string;
  membershipRole: OrganizationMembershipRole;
  membershipStatus: "active";
  organizationStatus: "active";
  isDefault: boolean;
  appRole: AppRole;
};

export type ResolveMembershipFailure =
  | { ok: false; reason: "membership_absent" }
  | { ok: false; reason: "membership_inactive" }
  | { ok: false; reason: "organization_inactive" }
  | { ok: false; reason: "membership_ambiguous" }
  | { ok: false; reason: "platform_only" }
  | { ok: false; reason: "lookup_failed" };

export type ResolveMembershipResult =
  | ({ ok: true } & ActiveOrganizationMembership)
  | ResolveMembershipFailure;

/**
 * Resolves active H4 organization membership for a known auth user id.
 */
export async function resolveActiveOrganizationMembershipForUserId(
  userId: string,
  options?: { mode?: SelectMembershipMode }
): Promise<ResolveMembershipResult> {
  const mode = options?.mode ?? "strict";
  const admin = createAdminSupabaseClient();

  const [platformRes, membershipsRes] = await Promise.all([
    admin
      .from("platform_access")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1),
    admin
      .from("organization_memberships")
      .select("id, organization_id, role, status, is_default")
      .eq("user_id", userId),
  ]);

  if (membershipsRes.error) {
    return { ok: false, reason: "lookup_failed" };
  }

  const rows = (membershipsRes.data ?? []) as MembershipRow[];
  const selected = selectActiveMembershipRow(rows, mode);

  if (selected.kind === "inactive") {
    return { ok: false, reason: "membership_inactive" };
  }
  if (selected.kind === "ambiguous") {
    return { ok: false, reason: "membership_ambiguous" };
  }
  if (selected.kind === "absent") {
    if ((platformRes.data ?? []).length > 0) {
      return { ok: false, reason: "platform_only" };
    }
    return { ok: false, reason: "membership_absent" };
  }

  const preferred = selected.row;
  if (!isOrganizationMembershipRole(preferred.role)) {
    return { ok: false, reason: "membership_absent" };
  }

  const appRole = mapOrganizationMembershipRoleToAppRole(preferred.role);
  if (!appRole) {
    return { ok: false, reason: "membership_absent" };
  }

  const orgRes = await admin
    .from("organizations")
    .select("id, status, deleted_at")
    .eq("id", preferred.organization_id)
    .maybeSingle();

  if (orgRes.error) {
    return { ok: false, reason: "lookup_failed" };
  }

  const org = orgRes.data as
    | { id: string; status: string; deleted_at: string | null }
    | null;

  if (!org || org.deleted_at || org.status !== "active") {
    return { ok: false, reason: "organization_inactive" };
  }

  return {
    ok: true,
    userId,
    organizationId: preferred.organization_id,
    membershipId: preferred.id,
    membershipRole: preferred.role,
    membershipStatus: "active",
    organizationStatus: "active",
    isDefault: preferred.is_default === true,
    appRole,
  };
}

export type OrganizationAuthContext = {
  user: User;
  userId: string;
  appRole: AppRole;
  source: "membership";
  organizationId: string | null;
  membershipId: string | null;
  membershipRole: OrganizationMembershipRole | null;
};

export type OrganizationAuthContextResult =
  | { ok: true; context: OrganizationAuthContext }
  | {
      ok: false;
      status: 403;
      reason: ResolveMembershipFailure["reason"] | "no_authorization";
    }
  | { ok: false; status: 500; reason: "lookup_failed" };

/**
 * Authorization context: H4 membership is required.
 * JWT AppRole is never sufficient alone (non-member fail-closed, including JWT admin).
 * When membership is active, mapped AppRole wins even if JWT is `none`.
 */
export async function resolveOrganizationAuthContextForUser(
  user: User,
  _jwtAppRole: AppRole | null,
  options?: { mode?: SelectMembershipMode }
): Promise<OrganizationAuthContextResult> {
  const membership = await resolveActiveOrganizationMembershipForUserId(
    user.id,
    { mode: options?.mode ?? "strict" }
  );

  if (membership.ok) {
    return {
      ok: true,
      context: {
        user,
        userId: user.id,
        appRole: membership.appRole,
        source: "membership",
        organizationId: membership.organizationId,
        membershipId: membership.membershipId,
        membershipRole: membership.membershipRole,
      },
    };
  }

  if (membership.reason === "lookup_failed") {
    return { ok: false, status: 500, reason: "lookup_failed" };
  }

  return {
    ok: false,
    status: 403,
    reason: membership.reason,
  };
}

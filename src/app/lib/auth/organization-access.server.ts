import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { createAuthenticatedServerSupabaseClient } from "@/app/lib/supabase/authenticated-server";
import {
  isActiveMembershipInActiveOrganization,
  normalizeOrganizationUuid,
  resolveRequestedOrganizationId,
  type OrganizationMembershipSummary,
} from "@/app/lib/auth/organization-access.shared";

export type {
  OrganizationMembershipSummary,
} from "@/app/lib/auth/organization-access.shared";

export {
  normalizeOrganizationUuid,
  resolveRequestedOrganizationId,
  resolveObjectiveWriteOrganizationId,
  resolveSingleMembershipOrganizationPreselect,
  rejectsTextTenantAuthority,
  isActiveMembershipInActiveOrganization,
  rejectsGrantIdentityRetarget,
} from "@/app/lib/auth/organization-access.shared";

type MembershipQueryRow = {
  id: string;
  organization_id: string;
  status: string;
  organizations:
    | {
        id: string;
        display_name: string;
        status: string;
        deleted_at: string | null;
      }
    | {
        id: string;
        display_name: string;
        status: string;
        deleted_at: string | null;
      }[]
    | null;
};

/**
 * Active memberships for the authenticated user.
 *
 * Identity: JWT user id (must match auth.uid() of the request token).
 * Source: organization_memberships + organizations only.
 * Never auto-selects a membership. Never uses company_context / primary_company /
 * user_metadata.
 *
 * Note: organizations / organization_memberships table privileges are service_role
 * only in current migrations, so the directory read is scoped admin filtered by
 * userId. Access checks for writes use authenticated RPC auth.uid() when available.
 */
export async function getAuthenticatedOrganizationMemberships(
  userId: string
): Promise<
  | { ok: true; memberships: OrganizationMembershipSummary[] }
  | { ok: false; status: 403 | 500; error: string }
> {
  if (!userId.trim()) {
    return { ok: false, status: 403, error: "Utilisateur non authentifie." };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memberships")
    .select(
      "id, organization_id, status, organizations!inner(id, display_name, status, deleted_at)"
    )
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    return {
      ok: false,
      status: 500,
      error: "Impossible de charger les memberships organisation.",
    };
  }

  const memberships: OrganizationMembershipSummary[] = [];
  for (const raw of (data ?? []) as MembershipQueryRow[]) {
    const orgRaw = Array.isArray(raw.organizations)
      ? raw.organizations[0]
      : raw.organizations;
    if (!orgRaw) continue;
    if (orgRaw.status !== "active" || orgRaw.deleted_at) continue;
    const organizationId = normalizeOrganizationUuid(orgRaw.id);
    if (!organizationId) continue;
    memberships.push({
      organizationId,
      displayName:
        typeof orgRaw.display_name === "string" && orgRaw.display_name.trim()
          ? orgRaw.display_name.trim()
          : organizationId,
      membershipId: String(raw.id),
      membershipStatus: "active",
      organizationStatus: "active",
    });
  }

  if (memberships.length === 0) {
    return {
      ok: false,
      status: 403,
      error: "Aucune membership organisation active.",
    };
  }

  return { ok: true, memberships };
}

/**
 * Asserts the JWT user can access organizationId via membership.
 * Prefers authenticated RPC (auth.uid()) then falls back to membership directory.
 */
export async function assertAuthenticatedOrganizationAccess(input: {
  accessToken: string;
  userId: string;
  organizationId: unknown;
}): Promise<{ ok: true; organizationId: string } | { ok: false; status: 400 | 403 | 500; error: string }> {
  const organizationId = normalizeOrganizationUuid(input.organizationId);
  if (!organizationId) {
    return {
      ok: false,
      status: 400,
      error: "organization_id UUID valide requis.",
    };
  }

  const authenticated = createAuthenticatedServerSupabaseClient(input.accessToken);
  const rpc = await authenticated.rpc("current_user_can_access_organization", {
    p_organization_id: organizationId,
  });

  if (!rpc.error && rpc.data === true) {
    return { ok: true, organizationId };
  }

  if (!rpc.error && rpc.data === false) {
    return {
      ok: false,
      status: 403,
      error: "Membership organisation inactive ou absente pour cet UUID.",
    };
  }

  // RPC unavailable (migration not applied yet): membership directory fallback.
  const memberships = await getAuthenticatedOrganizationMemberships(input.userId);
  if (!memberships.ok) {
    return memberships;
  }

  const resolved = resolveRequestedOrganizationId({
    requestedOrganizationId: organizationId,
    memberships: memberships.memberships,
  });
  if (!resolved.ok) return resolved;
  return { ok: true, organizationId: resolved.organizationId };
}

/**
 * Targeted membership check for an arbitrary validated userId (e.g. grant viewer)
 * in a specific organization UUID already derived from the owner chauffeur.
 *
 * Query is always filtered by user_id + organization_id + status=active.
 * Never returns a membership directory. Never uses Auth metadata as tenant proof.
 */
export async function assertUserHasActiveOrganizationMembership(
  userId: string,
  organizationId: unknown
): Promise<{ ok: true } | { ok: false; status: 400 | 403 | 500; error: string }> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return { ok: false, status: 400, error: "Identifiant utilisateur requis." };
  }

  const orgId = normalizeOrganizationUuid(organizationId);
  if (!orgId) {
    return {
      ok: false,
      status: 400,
      error: "organization_id UUID valide requis.",
    };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_memberships")
    .select("id, status, organizations!inner(id, status, deleted_at)")
    .eq("user_id", trimmedUserId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      error: "Impossible de verifier la membership organisation.",
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 403,
      error: "Membership organisation inactive ou absente pour ce viewer.",
    };
  }

  const row = data as {
    status?: unknown;
    organizations?:
      | { status?: unknown; deleted_at?: unknown }
      | { status?: unknown; deleted_at?: unknown }[]
      | null;
  };
  const orgRaw = Array.isArray(row.organizations)
    ? row.organizations[0]
    : row.organizations;

  if (
    !orgRaw ||
    !isActiveMembershipInActiveOrganization({
      membershipStatus: row.status,
      organizationStatus: orgRaw.status,
      organizationDeletedAt: orgRaw.deleted_at,
    })
  ) {
    return {
      ok: false,
      status: 403,
      error: "Membership organisation inactive ou absente pour ce viewer.",
    };
  }

  return { ok: true };
}

export async function assertChauffeurOrganizationAccess(input: {
  supabase: SupabaseClient;
  accessToken: string;
  userId: string;
  chauffeurId: number;
}): Promise<
  | { ok: true; organizationId: string }
  | { ok: false; status: 403 | 404 | 500; error: string }
> {
  const { data, error } = await input.supabase
    .from("chauffeurs")
    .select("id, organization_id")
    .eq("id", input.chauffeurId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      error: "Impossible de verifier le chauffeur.",
    };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Employe introuvable." };
  }

  const organizationId = normalizeOrganizationUuid(
    (data as { organization_id?: unknown }).organization_id
  );
  if (!organizationId) {
    return {
      ok: false,
      status: 403,
      error: "Employe sans organization_id UUID — ecriture refusee.",
    };
  }

  const access = await assertAuthenticatedOrganizationAccess({
    accessToken: input.accessToken,
    userId: input.userId,
    organizationId,
  });
  if (!access.ok) {
    return {
      ok: false,
      status: access.status === 400 ? 403 : access.status,
      error:
        access.status === 403
          ? "Employe hors organisations accessibles."
          : access.error,
    };
  }

  return { ok: true, organizationId };
}

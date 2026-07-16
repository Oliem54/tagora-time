import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  isOrganizationMembershipRole,
  type OrganizationMembershipRole,
} from "@/app/lib/saas/tenant-foundation.shared";
import {
  extractPhotosDossiersObjectPath,
  isLegacyPhotosDossiersPath,
  mapModuleSourceToStorageDomain,
  pathBelongsToOrganization,
  permissionForStorageDomain,
  type StorageOrgDomain,
} from "@/app/lib/storage/photos-dossiers-contract.shared";

export type StorageOrganizationContext = {
  userId: string;
  user: User;
  organizationId: string;
  membershipId: string;
  membershipRole: OrganizationMembershipRole;
  membershipStatus: "active";
};

export type StorageOrgContextFailure =
  | { ok: false; status: 401; reason: "unauthenticated" }
  | { ok: false; status: 403; reason: "membership_absent" }
  | { ok: false; status: 403; reason: "membership_inactive" }
  | { ok: false; status: 403; reason: "platform_only" }
  | { ok: false; status: 403; reason: "client_org_rejected" }
  | { ok: false; status: 500; reason: "lookup_failed" };

export type StorageOrgContextResult =
  | ({ ok: true } & StorageOrganizationContext)
  | StorageOrgContextFailure;

type MembershipRow = {
  id: string;
  organization_id: string;
  role: string;
  status: string;
  is_default: boolean;
};

/**
 * Resolves the active organization membership for Storage Option A.
 * Never trusts client-supplied organization_id as authority.
 * Platform roles alone grant no business Storage access.
 */
export async function resolveStorageOrganizationContext(
  req: NextRequest,
  options?: { clientOrganizationId?: string | null }
): Promise<StorageOrgContextResult> {
  const { user } = await getAuthenticatedRequestUser(req);
  if (!user) {
    return { ok: false, status: 401, reason: "unauthenticated" };
  }

  const clientOrg = String(options?.clientOrganizationId ?? "").trim();
  if (clientOrg) {
    // Explicit reject: browser must not supply authoritative org.
    return { ok: false, status: 403, reason: "client_org_rejected" };
  }

  const admin = createAdminSupabaseClient();

  const platformRes = await admin
    .from("platform_access")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);

  const membershipsRes = await admin
    .from("organization_memberships")
    .select("id, organization_id, role, status, is_default")
    .eq("user_id", user.id);

  if (membershipsRes.error) {
    return { ok: false, status: 500, reason: "lookup_failed" };
  }

  const rows = (membershipsRes.data ?? []) as MembershipRow[];
  const active = rows.filter((row) => row.status === "active");

  if (active.length === 0) {
    if (rows.length > 0) {
      return { ok: false, status: 403, reason: "membership_inactive" };
    }
    // Platform-only without org membership: no business Storage.
    if ((platformRes.data ?? []).length > 0) {
      return { ok: false, status: 403, reason: "platform_only" };
    }
    return { ok: false, status: 403, reason: "membership_absent" };
  }

  const preferred =
    active.find((row) => row.is_default) ??
    active.slice().sort((a, b) => a.id.localeCompare(b.id))[0];

  if (!preferred || !isOrganizationMembershipRole(preferred.role)) {
    return { ok: false, status: 403, reason: "membership_absent" };
  }

  return {
    ok: true,
    userId: user.id,
    user,
    organizationId: preferred.organization_id,
    membershipId: preferred.id,
    membershipRole: preferred.role,
    membershipStatus: "active",
  };
}

export function assertDomainPermission(
  user: User,
  domain: StorageOrgDomain
): boolean {
  const permission = permissionForStorageDomain(domain);
  return hasUserPermission(user, permission);
}

export async function assertModuleSourceAccessible(input: {
  user: User;
  moduleSource: string;
  sourceId: string;
}): Promise<{ ok: true; domain: StorageOrgDomain } | { ok: false; status: number; reason: string }> {
  const domain = mapModuleSourceToStorageDomain(input.moduleSource);
  if (!domain) {
    return { ok: false, status: 400, reason: "domain_invalid" };
  }
  if (!assertDomainPermission(input.user, domain)) {
    return { ok: false, status: 403, reason: "permission_denied" };
  }

  const sourceId = String(input.sourceId ?? "").trim();
  if (!sourceId || sourceId.includes("/") || sourceId.includes("..") || sourceId.includes("\\")) {
    return { ok: false, status: 400, reason: "record_invalid" };
  }

  const admin = createAdminSupabaseClient();

  if (input.moduleSource === "livraison" || input.moduleSource === "ramassage") {
    const idNum = Number(sourceId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      return { ok: false, status: 400, reason: "record_invalid" };
    }
    const { data, error } = await admin
      .from("livraisons_planifiees")
      .select("id")
      .eq("id", idNum)
      .maybeSingle();
    if (error) {
      return { ok: false, status: 500, reason: "lookup_failed" };
    }
    if (!data) {
      return { ok: false, status: 404, reason: "resource_not_found" };
    }
    return { ok: true, domain };
  }

  if (input.moduleSource === "dossier") {
    const idNum = Number(sourceId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      return { ok: false, status: 400, reason: "record_invalid" };
    }
    const { data, error } = await admin
      .from("dossiers")
      .select("id")
      .eq("id", idNum)
      .maybeSingle();
    if (error) {
      return { ok: false, status: 500, reason: "lookup_failed" };
    }
    if (!data) {
      return { ok: false, status: 404, reason: "resource_not_found" };
    }
    return { ok: true, domain };
  }

  // Other modules: permission + non-empty record id (no org FK yet).
  return { ok: true, domain };
}

export function assertObjectPathReadableByOrganization(input: {
  urlOrPath: string;
  organizationId: string;
}): { ok: true; path: string } | { ok: false; reason: string } {
  const path = extractPhotosDossiersObjectPath(input.urlOrPath);
  if (!path) {
    return { ok: false, reason: "path_invalid" };
  }
  if (path.includes("..") || path.startsWith("/")) {
    return { ok: false, reason: "path_traversal" };
  }
  if (!pathBelongsToOrganization(path, input.organizationId)) {
    return { ok: false, reason: "org_mismatch" };
  }
  // Legacy paths are readable only after business auth (caller responsibility).
  if (!isLegacyPhotosDossiersPath(path) && !path.startsWith(`${input.organizationId}/`)) {
    return { ok: false, reason: "org_mismatch" };
  }
  return { ok: true, path };
}

export function storageOrgFailureMessage(reason: StorageOrgContextFailure["reason"]): string {
  switch (reason) {
    case "unauthenticated":
      return "Authentification requise.";
    case "client_org_rejected":
      return "Organisation client non autorisée.";
    case "platform_only":
      return "Accès métier Storage refusé.";
    case "membership_inactive":
      return "Membership organisationnel inactif.";
    case "membership_absent":
      return "Membership organisationnel requis.";
    default:
      return "Opération Storage impossible.";
  }
}

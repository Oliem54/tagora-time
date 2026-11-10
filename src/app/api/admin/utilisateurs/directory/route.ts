import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import {
  acceptCanonicalIdentityLinks,
  authorizeHororaDirectoryReader,
  readAuthorizedModuleDirectory,
  resolveAuthorizedDirectoryQuery,
  type HororaDirectoryServiceStatus,
} from "@/app/lib/auth/horora-authorized-module-directory-client.shared";
import {
  HORORA_AUTHORIZED_DIRECTORY_BLOCKER,
  HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
  HORORA_DIRECTORY_REFRESH_MS,
  adaptAuthorizedModuleDirectory,
  buildIsolatedDirectoryPanelFixture,
  type AuthorizedModuleDirectory,
  type HororaCanonicalIdentityLink,
  type HororaDirectoryScope,
  type HororaPreservedEmployeeDossier,
  type HororaPreservedMembership,
} from "@/app/lib/auth/horora-authorized-module-directory.shared";
import { isProcessLocalNexusFixtureEnabled } from "@/app/lib/auth/horora-local-nexus-fixture";
import { normalizePermissionList } from "@/app/lib/auth/permissions";
import { isOrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

function jsonError(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

function asMembershipStatus(
  value: unknown
): HororaPreservedMembership["status"] | null {
  if (value === "active" || value === "suspended" || value === "invited") {
    return value;
  }
  return null;
}

function serviceMessage(status: HororaDirectoryServiceStatus): string {
  if (status === "service_unavailable") {
    return "Service central indisponible. Les dossiers HORORA restent affichés. Une ligne absente n'est ni une révocation ni un accès actif.";
  }
  if (status === "query_rejected") {
    return "Filtre tenant, organisation ou module incomplet. Aucune lecture distante n'est envoyée.";
  }
  if (status === "ready") {
    return "Annuaire lu localement pour ce tenant, cette organisation et tagora_time.";
  }
  return HORORA_AUTHORIZED_DIRECTORY_BLOCKER;
}

/**
 * Read-only preparation view.
 * Does not write dossiers, memberships, auth metadata, or Nexus tables.
 * The directory transport stays held until the Nexus contract is certified.
 */
export async function GET(req: NextRequest) {
  try {
    const authenticated = await getAuthenticatedRequestUser(req);
    if (!authenticated.user) return jsonError(401, "Non authentifié.");
    if (!authorizeHororaDirectoryReader(authenticated.role)) {
      return jsonError(403, "Accès refusé.");
    }
    if (isProcessLocalNexusFixtureEnabled(req.nextUrl.hostname)) {
      const fixture = buildIsolatedDirectoryPanelFixture();
      return NextResponse.json({
        success: true,
        directoryConnected: false,
        serviceStatus: "service_uncertified",
        serviceMessage: serviceMessage("service_uncertified"),
        revocationEnforced: false,
        refreshIntervalMs: HORORA_DIRECTORY_REFRESH_MS,
        persisted: false,
        productionUnchanged: true,
        isolatedQa: true,
        scope: fixture.scope,
        blocker: fixture.view.blocker,
        rows: fixture.view.rows,
      });
    }
    if (!authenticated.organizationId) {
      return jsonError(403, "Accès refusé.");
    }

    const supabase = createAdminSupabaseClient();
    const [employeeResult, membershipResult] = await Promise.all([
      supabase
        .from("chauffeurs")
        .select("id, nom, courriel, actif, auth_user_id")
        .eq("organization_id", authenticated.organizationId)
        .order("id", { ascending: true }),
      supabase
        .from("organization_memberships")
        .select("id, user_id, role, status")
        .eq("organization_id", authenticated.organizationId),
    ]);

    if (employeeResult.error) {
      return jsonError(500, employeeResult.error.message ?? "Chargement impossible.");
    }
    if (membershipResult.error) {
      return jsonError(500, membershipResult.error.message ?? "Chargement impossible.");
    }

    const dossiers: HororaPreservedEmployeeDossier[] = (employeeResult.data ?? []).map(
      (row) => ({
        dossierId: Number(row.id),
        displayName:
          typeof row.nom === "string" && row.nom.trim().length > 0
            ? row.nom.trim()
            : "Employé",
        contactEmail: typeof row.courriel === "string" ? row.courriel : null,
        active: row.actif === true,
        authUserId: typeof row.auth_user_id === "string" ? row.auth_user_id : null,
      })
    );

    const memberships: HororaPreservedMembership[] = [];
    for (const row of membershipResult.data ?? []) {
      const status = asMembershipStatus(row.status);
      const membershipRole = String(row.role ?? "");
      if (!status || !isOrganizationMembershipRole(membershipRole)) continue;
      if (typeof row.user_id !== "string" || typeof row.id !== "string") continue;
      memberships.push({
        membershipId: row.id,
        authUserId: row.user_id,
        role: membershipRole,
        status,
      });
    }

    const validatedPermissionsByAuthUserId: Record<string, string[]> = {};
    const authIds = Array.from(
      new Set(
        dossiers
          .map((row) => row.authUserId)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );
    await Promise.all(
      authIds.map(async (authUserId) => {
        const { data, error } = await supabase.auth.admin.getUserById(authUserId);
        if (error || !data.user) return;
        validatedPermissionsByAuthUserId[authUserId] = normalizePermissionList(
          data.user.app_metadata?.permissions
        );
      })
    );

    let serviceStatus: HororaDirectoryServiceStatus = "service_uncertified";
    let directory: AuthorizedModuleDirectory | null = null;
    let scope: HororaDirectoryScope | null = null;
    let canonicalLinks: HororaCanonicalIdentityLink[] = [];
    try {
      const mapResult = await supabase
        .from("horora_nexus_organization_map")
        .select("nexus_organization_id, nexus_tenant_id, organization_id, status")
        .eq("organization_id", authenticated.organizationId ?? "");
      const resolved = mapResult.error
        ? { ok: false as const, reason: "query_rejected" as const }
        : resolveAuthorizedDirectoryQuery({
            hororaOrganizationId: authenticated.organizationId,
            organizationMaps: (mapResult.data ?? []).map((row) => ({
              nexusOrganizationId: String(row.nexus_organization_id ?? ""),
              nexusTenantId:
                typeof row.nexus_tenant_id === "string" ? row.nexus_tenant_id : null,
              organizationId: String(row.organization_id ?? ""),
              status: String(row.status ?? ""),
            })),
          });
      if (!resolved.ok) {
        serviceStatus = "query_rejected";
      } else {
        scope = resolved.query;
        const read = await readAuthorizedModuleDirectory({ query: resolved.query });
        serviceStatus = read.status;
        if (read.ok) directory = read.directory;
        const identityResult = await supabase
          .from("horora_nexus_identity_map")
          .select("nexus_actor_id, auth_user_id, disabled_at");
        if (!identityResult.error) {
          canonicalLinks = acceptCanonicalIdentityLinks(
            (identityResult.data ?? []).map((row) => ({
              nexusUserId: row.nexus_actor_id,
              authUserId: row.auth_user_id,
              organizationId: resolved.query.organizationId,
              disabledAt: row.disabled_at,
            }))
          );
        }
      }
    } catch {
      serviceStatus = "service_unavailable";
      directory = null;
      canonicalLinks = [];
    }

    const view = adaptAuthorizedModuleDirectory({
      directory: directory ?? {
        technicalKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
        connected: false,
        entries: [],
      },
      dossiers,
      memberships,
      validatedPermissionsByAuthUserId,
      canonicalLinks,
      scope,
    });

    return NextResponse.json({
      success: true,
      directoryConnected: view.directoryConnected,
      serviceStatus,
      serviceMessage: serviceMessage(serviceStatus),
      revocationEnforced: false,
      refreshIntervalMs: HORORA_DIRECTORY_REFRESH_MS,
      persisted: false,
      productionUnchanged: true,
      isolatedQa: false,
      scope,
      blocker: view.blocker,
      rows: view.rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chargement impossible.";
    return jsonError(500, message);
  }
}

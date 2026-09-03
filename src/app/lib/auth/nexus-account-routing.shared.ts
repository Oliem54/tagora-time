/**
 * Separates Nexus identity, HORORA entitlement, and HORORA membership role.
 * Destination comes only from organization_memberships.role.
 * Nexus entry_role never chooses employe, direction, or admin.
 */

import { mapOrganizationMembershipRoleToAppRole } from "@/app/lib/auth/organization-role-mapping.shared";
import type { AppRole } from "@/app/lib/auth/roles";

export type NexusIdentityType =
  | "utilisateur_interne"
  | "administrateur_interne"
  | "direction"
  | "utilisateur_externe"
  | "unclassified";

export type HororaModuleEntitlement = "active" | "refused";

export type HororaModuleRole =
  | "employe"
  | "direction"
  | "organization_admin"
  | "organization_owner";

export type HororaDestinationDecision =
  | {
      ok: true;
      appRole: AppRole;
      path: "/admin/dashboard" | "/direction/dashboard" | "/employe/dashboard";
    }
  | {
      ok: false;
      reason: "membership_missing" | "membership_ambiguous" | "role_mapping_denied";
    };

export function classifyNexusIdentityType(
  entryRole: string | null | undefined
): NexusIdentityType {
  if (entryRole === "NEXUS_ENTRY_OPERATOR") return "administrateur_interne";
  if (entryRole === "NEXUS_ENTRY_MEMBER") return "utilisateur_interne";
  return "unclassified";
}

export function classifyHororaModuleEntitlement(active: boolean): HororaModuleEntitlement {
  return active ? "active" : "refused";
}

export function pathForHororaAppRole(
  role: AppRole
): "/admin/dashboard" | "/direction/dashboard" | "/employe/dashboard" {
  if (role === "admin") return "/admin/dashboard";
  if (role === "direction") return "/direction/dashboard";
  return "/employe/dashboard";
}

export function resolveHororaDestinationFromMembershipRole(
  membershipRole: string | null | undefined
): HororaDestinationDecision {
  if (membershipRole == null || membershipRole === "") {
    return { ok: false, reason: "membership_missing" };
  }
  const appRole = mapOrganizationMembershipRoleToAppRole(membershipRole);
  if (!appRole) {
    return { ok: false, reason: "role_mapping_denied" };
  }
  return { ok: true, appRole, path: pathForHororaAppRole(appRole) };
}

export function nexusEntryRoleDoesNotAuthorizeHororaDestination(
  entryRole: string | null | undefined
): boolean {
  const identity = classifyNexusIdentityType(entryRole);
  return (
    identity !== "direction" &&
    identity !== "utilisateur_externe" &&
    resolveHororaDestinationFromMembershipRole(entryRole).ok === false
  );
}

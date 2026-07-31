/**
 * Pure organization UUID helpers for tenant write security.
 * Authority is organizations.id (UUID) via memberships — never company_context,
 * primary_company, or user_metadata.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OrganizationMembershipSummary = {
  organizationId: string;
  displayName: string;
  membershipId: string;
  membershipStatus: "active";
  organizationStatus: "active";
};

export function normalizeOrganizationUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !UUID_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Validates a client-requested organization UUID against active memberships.
 * Never auto-selects the first membership when several exist.
 * Never falls back to company_context / primary_company / user_metadata.
 */
export function resolveRequestedOrganizationId(input: {
  requestedOrganizationId: unknown;
  memberships: ReadonlyArray<Pick<OrganizationMembershipSummary, "organizationId">>;
}):
  | { ok: true; organizationId: string }
  | { ok: false; status: 400 | 403; error: string } {
  const organizationId = normalizeOrganizationUuid(input.requestedOrganizationId);
  if (!organizationId) {
    return {
      ok: false,
      status: 400,
      error: "organization_id UUID valide requis.",
    };
  }

  const allowed = new Set(
    input.memberships.map((row) => row.organizationId.toLowerCase())
  );
  if (!allowed.has(organizationId)) {
    return {
      ok: false,
      status: 403,
      error: "Membership organisation inactive ou absente pour cet UUID.",
    };
  }

  return { ok: true, organizationId };
}

/**
 * Personal objective: tenant comes from chauffeurs.organization_id.
 * Team objective: explicit organization_id UUID is required.
 * Contradictory requested UUID vs chauffeur org is refused.
 */
export function resolveObjectiveWriteOrganizationId(input: {
  chauffeurId: number | null;
  chauffeurOrganizationId: unknown;
  requestedOrganizationId: unknown;
}):
  | { ok: true; organizationId: string | null; mode: "personal" | "team" }
  | { ok: false; status: 400 | 403; error: string } {
  if (input.chauffeurId != null && input.chauffeurId > 0) {
    const chauffeurOrg = normalizeOrganizationUuid(input.chauffeurOrganizationId);
    if (!chauffeurOrg) {
      return {
        ok: false,
        status: 403,
        error: "Employe sans organization_id UUID — ecriture refusee.",
      };
    }

    if (
      input.requestedOrganizationId != null &&
      input.requestedOrganizationId !== ""
    ) {
      const requested = normalizeOrganizationUuid(input.requestedOrganizationId);
      if (!requested) {
        return {
          ok: false,
          status: 400,
          error: "organization_id UUID invalide.",
        };
      }
      if (requested !== chauffeurOrg) {
        return {
          ok: false,
          status: 403,
          error: "organization_id contradictoire avec le tenant du chauffeur.",
        };
      }
    }

    return { ok: true, organizationId: chauffeurOrg, mode: "personal" };
  }

  const teamOrg = normalizeOrganizationUuid(input.requestedOrganizationId);
  if (!teamOrg) {
    return {
      ok: false,
      status: 400,
      error: "organization_id UUID requis pour un objectif d'equipe.",
    };
  }

  return { ok: true, organizationId: teamOrg, mode: "team" };
}

/**
 * UI may preselect organization_id only when exactly one active membership exists.
 * With zero or many memberships, leave empty — never pick the first of many.
 */
export function resolveSingleMembershipOrganizationPreselect(
  memberships: ReadonlyArray<Pick<OrganizationMembershipSummary, "organizationId">>
): string {
  if (memberships.length !== 1) return "";
  return memberships[0]?.organizationId ?? "";
}

export function rejectsTextTenantAuthority(body: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(body, "company_context") ||
    Object.prototype.hasOwnProperty.call(body, "primary_company") ||
    Object.prototype.hasOwnProperty.call(body, "user_metadata")
  );
}

/**
 * Pure gate for a targeted membership row already filtered by
 * user_id + organization_id + status=active at the query layer.
 */
export function isActiveMembershipInActiveOrganization(input: {
  membershipStatus: unknown;
  organizationStatus: unknown;
  organizationDeletedAt: unknown;
}): boolean {
  if (input.membershipStatus !== "active") return false;
  if (input.organizationStatus !== "active") return false;
  if (input.organizationDeletedAt != null && input.organizationDeletedAt !== "") {
    return false;
  }
  return true;
}

/** PATCH must not retarget owner/viewer across tenants. */
export function rejectsGrantIdentityRetarget(body: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(body, "owner_chauffeur_id") ||
    Object.prototype.hasOwnProperty.call(body, "viewer_user_id")
  );
}

/**
 * Contexte organisation pour le module plans / résultats de commissions.
 * Ne remplace pas resolveRequestedOrganizationId global : ajoute uniquement
 * les repli sécurisés exigés pour les fiches Admin (URL → session → unique).
 */

import {
  normalizeOrganizationUuid,
  type OrganizationMembershipSummary,
} from "@/app/lib/auth/organization-access.shared";

export const PAY_PLAN_ORGANIZATION_SESSION_KEY =
  "tagora.admin.commissions.organization_id";

export type PayPlanOrganizationMembership = Pick<
  OrganizationMembershipSummary,
  "organizationId"
>;

export type ResolvePayPlanOrganizationContextResult =
  | {
      ok: true;
      organizationId: string;
      source: "url" | "session" | "single_membership";
    }
  | { ok: false; status: 400 | 403; error: string };

function allowedOrganizationIds(
  memberships: ReadonlyArray<PayPlanOrganizationMembership>
): Set<string> {
  return new Set(
    memberships
      .map((row) => normalizeOrganizationUuid(row.organizationId))
      .filter((value): value is string => Boolean(value))
  );
}

/**
 * Résolution sécurisée :
 * 1. organization_id URL / requête explicite, si membership active;
 * 2. organisation de session module (si membership active);
 * 3. organisation unique autorisée;
 * 4. erreur contrôlée sinon.
 *
 * Ne choisit jamais le premier membership parmi plusieurs.
 */
export function resolvePayPlanOrganizationContext(input: {
  requestedOrganizationId?: unknown;
  sessionOrganizationId?: unknown;
  memberships: ReadonlyArray<PayPlanOrganizationMembership>;
}): ResolvePayPlanOrganizationContextResult {
  const allowed = allowedOrganizationIds(input.memberships);

  const requested = normalizeOrganizationUuid(input.requestedOrganizationId);
  if (requested) {
    if (!allowed.has(requested)) {
      return {
        ok: false,
        status: 403,
        error: "Membership organisation inactive ou absente pour cet UUID.",
      };
    }
    return { ok: true, organizationId: requested, source: "url" };
  }

  const session = normalizeOrganizationUuid(input.sessionOrganizationId);
  if (session) {
    if (!allowed.has(session)) {
      return {
        ok: false,
        status: 403,
        error: "Membership organisation inactive ou absente pour cet UUID.",
      };
    }
    return { ok: true, organizationId: session, source: "session" };
  }

  if (input.memberships.length === 1) {
    const only = normalizeOrganizationUuid(
      input.memberships[0]?.organizationId
    );
    if (only && allowed.has(only)) {
      return {
        ok: true,
        organizationId: only,
        source: "single_membership",
      };
    }
  }

  if (input.memberships.length === 0) {
    return {
      ok: false,
      status: 403,
      error: "Aucune organisation autorisée.",
    };
  }

  return {
    ok: false,
    status: 400,
    error: "organization_id UUID valide requis.",
  };
}

/** Ajoute ou remplace organization_id en préservant query/hash existants. */
export function withOrganizationId(
  href: string,
  organizationId: string | null | undefined
): string {
  const org = normalizeOrganizationUuid(organizationId);
  const raw = String(href || "").trim();
  if (!raw || !org) return raw;

  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";

  const qIndex = beforeHash.indexOf("?");
  const pathname = qIndex >= 0 ? beforeHash.slice(0, qIndex) : beforeHash;
  const query = qIndex >= 0 ? beforeHash.slice(qIndex + 1) : "";
  const params = new URLSearchParams(query);
  params.set("organization_id", org);
  const nextQuery = params.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ""}${hash}`;
}

export function readPayPlanOrganizationSession(): string {
  if (typeof window === "undefined") return "";
  try {
    return normalizeOrganizationUuid(
      window.sessionStorage.getItem(PAY_PLAN_ORGANIZATION_SESSION_KEY)
    ) || "";
  } catch {
    return "";
  }
}

export function writePayPlanOrganizationSession(
  organizationId: string | null | undefined
): void {
  if (typeof window === "undefined") return;
  const org = normalizeOrganizationUuid(organizationId);
  try {
    if (!org) {
      window.sessionStorage.removeItem(PAY_PLAN_ORGANIZATION_SESSION_KEY);
      return;
    }
    window.sessionStorage.setItem(PAY_PLAN_ORGANIZATION_SESSION_KEY, org);
  } catch {
    // sessionStorage indisponible — non bloquant
  }
}

export function syncOrganizationIdInBrowserUrl(organizationId: string): void {
  if (typeof window === "undefined") return;
  const org = normalizeOrganizationUuid(organizationId);
  if (!org) return;
  const next = withOrganizationId(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    org
  );
  if (next && next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, "", next);
  }
}

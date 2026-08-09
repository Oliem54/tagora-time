/**
 * SaaS 1B.1 — Tenant foundation constants and validators (NON-RUNTIME wiring).
 * Mirrors SQL constraints in supabase/migrations/20260712220*.sql
 * Does not claim multi-tenant is implemented.
 */

export const ORGANIZATION_STATUSES = ["active", "suspended", "pending"] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const ORGANIZATION_MEMBERSHIP_ROLES = [
  "organization_owner",
  "organization_admin",
  "direction",
  "employe",
] as const;
export type OrganizationMembershipRole =
  (typeof ORGANIZATION_MEMBERSHIP_ROLES)[number];

export const ORGANIZATION_MEMBERSHIP_STATUSES = [
  "active",
  "suspended",
  "invited",
] as const;
export type OrganizationMembershipStatus =
  (typeof ORGANIZATION_MEMBERSHIP_STATUSES)[number];

export const ORGANIZATION_INVITATION_STATUSES = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;

export const PLATFORM_ACCESS_LEVELS = [
  "platform_super_admin",
  "platform_support",
] as const;
export type PlatformAccessLevel = (typeof PLATFORM_ACCESS_LEVELS)[number];

export const PLATFORM_ACCESS_STATUSES = [
  "active",
  "revoked",
  "expired",
] as const;

export const SAAS_1B1_FOUNDATION_TABLES = [
  "organizations",
  "organization_companies",
  "organization_settings",
  "organization_memberships",
  "organization_invitations",
  "platform_access",
  "platform_access_audit",
] as const;

/** Business tables that must NOT be altered in SaaS 1B.1 */
export const SAAS_1B1_FORBIDDEN_BUSINESS_TABLES = [
  "chauffeurs",
  "account_requests",
  "horodateur_events",
  "horodateur_shifts",
  "gps_positions",
  "livraisons_planifiees",
  "compensation_events",
  "compensation_accruals",
  "temps_titan",
  "commission_entries",
] as const;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPANY_CODE_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
/** Business tenant key (Martin): a-z 0-9 _; never a UUID and never an organization slug. */
const TENANT_KEY_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export function isValidOrganizationSlug(slug: string): boolean {
  return slug === slug.toLowerCase() && SLUG_RE.test(slug);
}

export function isValidCompanyCode(code: string): boolean {
  return code === code.toLowerCase() && COMPANY_CODE_RE.test(code);
}

/**
 * Validates a SaaS tenant business key (tenantKey) after trim+lower.
 * Not an organization UUID (hyphenated) and not an organizationSlug.
 */
export function isValidTenantKey(tenantKey: string): boolean {
  if (typeof tenantKey !== "string") {
    return false;
  }
  const normalized = tenantKey.trim().toLowerCase();
  return TENANT_KEY_RE.test(normalized);
}

/** Maps tenantKey (underscore) → organizations.slug (kebab). */
export function tenantKeyToOrganizationSlug(tenantKey: string): string | null {
  if (typeof tenantKey !== "string") {
    return null;
  }
  const normalized = tenantKey.trim().toLowerCase();
  if (!isValidTenantKey(normalized)) {
    return null;
  }
  const slug = normalized.replace(/_/g, "-");
  return isValidOrganizationSlug(slug) ? slug : null;
}

/** Maps organizations.slug (kebab) → tenantKey (underscore). */
export function organizationSlugToTenantKey(slug: string): string | null {
  if (typeof slug !== "string") {
    return null;
  }
  const normalized = slug.trim().toLowerCase();
  if (!isValidOrganizationSlug(normalized)) {
    return null;
  }
  const tenantKey = normalized.replace(/-/g, "_");
  return isValidTenantKey(tenantKey) ? tenantKey : null;
}

export function isOrganizationMembershipRole(
  role: string
): role is OrganizationMembershipRole {
  return (ORGANIZATION_MEMBERSHIP_ROLES as readonly string[]).includes(role);
}

export function isPlatformRoleForbiddenInMemberships(role: string): boolean {
  return (
    role === "platform_super_admin" ||
    role === "platform_support" ||
    role === "admin"
  );
}

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isInvitationExpired(
  expiresAt: Date | string,
  now: Date = new Date()
): boolean {
  const expires = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return expires.getTime() <= now.getTime();
}

export function isPlatformSupportAccessValid(options: {
  accessLevel: string;
  status: string;
  reason: string;
  expiresAt: Date | string | null | undefined;
  now?: Date;
}): boolean {
  if (options.accessLevel !== "platform_support") {
    return false;
  }
  if (options.status !== "active") {
    return false;
  }
  if (!options.reason.trim()) {
    return false;
  }
  if (!options.expiresAt) {
    return false;
  }
  return !isInvitationExpired(options.expiresAt, options.now ?? new Date());
}

export function canRemoveActiveOwner(options: {
  remainingActiveOwnersExcludingTarget: number;
}): boolean {
  return options.remainingActiveOwnersExcludingTarget >= 1;
}

export function assertJsonObjectOrNull(
  value: unknown
): value is Record<string, unknown> | null {
  return value === null || (typeof value === "object" && !Array.isArray(value));
}

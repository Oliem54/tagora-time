/**
 * V1 Oliem Solution tenant / operating-company constants and pure helpers.
 * Keeps client-specific identifiers out of generic tenant-foundation.shared.
 *
 * Naming contract:
 * - tenantKey (business) = oliem_solution
 * - organizationSlug (DB) = oliem-solution
 * - organizationId = organizations.id UUID only (never a string business key)
 * - companyCode = operating company (oliem_solutions | titan_produits_industriels)
 */

import {
  isValidCompanyCode,
  isValidTenantKey,
  tenantKeyToOrganizationSlug,
} from "@/app/lib/saas/tenant-foundation.shared";

export const OLIEM_TENANT_KEY = "oliem_solution" as const;
export const OLIEM_TENANT_SLUG = "oliem-solution" as const;

export const OLIEM_COMPANY_CODES = [
  "oliem_solutions",
  "titan_produits_industriels",
] as const;

export type OliemCompanyCode = (typeof OLIEM_COMPANY_CODES)[number];

export const OLIEM_DEFAULT_COMPANY_CODE: OliemCompanyCode = "oliem_solutions";

export function isOliemCompanyCode(
  value: string
): value is OliemCompanyCode {
  return (OLIEM_COMPANY_CODES as readonly string[]).includes(value);
}

/**
 * Rejects treating the tenant business key as a company code.
 * Throws when value equals OLIEM_TENANT_KEY (or any valid tenantKey shape
 * that is not an Oliem company code).
 */
export function assertCompanyCodeNotTenantKey(value: string): void {
  const normalized = value.trim().toLowerCase();
  if (normalized === OLIEM_TENANT_KEY || isValidTenantKey(normalized)) {
    if (!isOliemCompanyCode(normalized)) {
      throw new Error(
        `tenantKey "${normalized}" must not be used as a companyCode`
      );
    }
  }
}

/**
 * Normalizes and validates a V1 Oliem operating company code.
 * Accepts values used as primary_company / company_context.
 */
export function resolveOliemCompanyCode(
  value: unknown
): OliemCompanyCode | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === OLIEM_TENANT_KEY) {
    return null;
  }
  if (!isValidCompanyCode(normalized)) {
    return null;
  }
  if (!isOliemCompanyCode(normalized)) {
    return null;
  }
  return normalized;
}

/** Both V1 company codes belong to the same Oliem tenant (conceptual). */
export function oliemCompanyCodesShareTenant(): boolean {
  const slug = tenantKeyToOrganizationSlug(OLIEM_TENANT_KEY);
  return (
    slug === OLIEM_TENANT_SLUG &&
    OLIEM_COMPANY_CODES.length === 2 &&
    OLIEM_DEFAULT_COMPANY_CODE === "oliem_solutions"
  );
}

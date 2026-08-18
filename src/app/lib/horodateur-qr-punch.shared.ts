/**
 * Constantes zones de punch QR (alignées migration horodateur_punch_zones).
 */
import { isValidCompanyCode } from "@/app/lib/saas/tenant-foundation.shared";

export const PUNCH_ZONE_COMPANY_KEYS = [
  "all",
  "oliem_solutions",
  "titan_produits_industriels",
] as const;

export type PunchZoneCompanyKey = string;

export function isPunchZoneCompanyKey(
  value: string | null | undefined
): value is PunchZoneCompanyKey {
  return (
    typeof value === "string" &&
    (value === "all" || isValidCompanyCode(value))
  );
}

export function punchZoneCompanyLabelFr(key: PunchZoneCompanyKey): string {
  switch (key) {
    case "all":
      return "Toutes";
    case "oliem_solutions":
      return "Oliem";
    case "titan_produits_industriels":
      return "Titan";
    default:
      return key;
  }
}

export function employeeMayPunchInZone(
  employee: {
    active: boolean;
    organizationId: string | null;
    organizationCompanyId: string | null;
    canWorkForOliemSolutions: boolean;
    canWorkForTitanProduitsIndustriels: boolean;
  },
  zoneCompanyKey: PunchZoneCompanyKey,
  zone?: {
    organization_id: string;
    organization_company_id: string | null;
  }
): boolean {
  if (!employee.active) return false;
  if (zone && employee.organizationId) {
    return (
      employee.organizationId === zone.organization_id &&
      (zone.organization_company_id === null ||
        employee.organizationCompanyId === zone.organization_company_id)
    );
  }
  if (zoneCompanyKey === "all") return true;
  if (zoneCompanyKey === "oliem_solutions") {
    return employee.canWorkForOliemSolutions !== false;
  }
  if (zoneCompanyKey === "titan_produits_industriels") {
    return employee.canWorkForTitanProduitsIndustriels === true;
  }
  return false;
}

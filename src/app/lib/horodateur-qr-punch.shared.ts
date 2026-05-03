/**
 * Constantes zones de punch QR (alignées migration horodateur_punch_zones).
 */
export const PUNCH_ZONE_COMPANY_KEYS = [
  "all",
  "oliem_solutions",
  "titan_produits_industriels",
] as const;

export type PunchZoneCompanyKey = (typeof PUNCH_ZONE_COMPANY_KEYS)[number];

export function isPunchZoneCompanyKey(
  value: string | null | undefined
): value is PunchZoneCompanyKey {
  return (
    typeof value === "string" &&
    (PUNCH_ZONE_COMPANY_KEYS as readonly string[]).includes(value)
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

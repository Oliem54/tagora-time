import { shouldSkipPreCutoverMonitoring } from "@/app/lib/horodateur-v1/horodateur-alert-dedup.shared";

export type HorodateurOperationalBlockReason =
  | "organization_required"
  | "maintenance_lock"
  | "before_operational_cutover";

export function readHorodateurMaintenanceLock(raw: unknown): boolean {
  if (raw === true) return true;
  if (!raw || typeof raw !== "object") return false;
  return (raw as { active?: unknown }).active === true;
}

export function evaluateHorodateurOperationalWrite(input: {
  organizationId?: string | null;
  incidentWorkDate: string | null;
  incidentAtIso?: string | null;
  cutoverAtIso: string | null;
  cutoverWorkDate: string | null;
  maintenanceLocked: boolean;
}): { allowed: boolean; reason: HorodateurOperationalBlockReason | null } {
  const organizationId = input.organizationId?.trim() || "";
  if (!organizationId) {
    return { allowed: false, reason: "organization_required" };
  }
  if (input.maintenanceLocked) {
    return { allowed: false, reason: "maintenance_lock" };
  }
  if (
    shouldSkipPreCutoverMonitoring({
      incidentWorkDate: input.incidentWorkDate,
      incidentAtIso: input.incidentAtIso,
      cutoverAtIso: input.cutoverAtIso,
      cutoverWorkDate: input.cutoverWorkDate,
    })
  ) {
    return { allowed: false, reason: "before_operational_cutover" };
  }
  return { allowed: true, reason: null };
}

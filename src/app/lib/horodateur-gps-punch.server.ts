import "server-only";

import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  evaluateWebPunchGpsAgainstLoadedBases,
  evaluateWebPunchGpsCoordinates,
  formatHorodateurGpsJournalSuffix,
  type HorodateurGpsBaseForPunch,
  type HorodateurWebPunchGpsEvaluation,
  type HorodateurWebPunchGpsMode,
} from "@/app/lib/horodateur-web-punch-gps.shared";

export { formatHorodateurGpsJournalSuffix };
export type {
  HorodateurWebPunchGpsEvaluation,
  HorodateurWebPunchGpsFailureCode,
  HorodateurWebPunchGpsMode,
} from "@/app/lib/horodateur-web-punch-gps.shared";

type GpsBaseRow = HorodateurGpsBaseForPunch & {
  organization_id: string;
  organization_company_id: string;
  company_context: string;
};

export const HORODATEUR_RETRO_CORRECTION_GPS_UNAVAILABLE_NOTE =
  "GPS non disponible lors de la demande.";

export async function evaluateEmployeeWebPunchGps(options: {
  latitude: unknown;
  longitude: unknown;
  organizationId: string;
  organizationCompanyId: string;
  companyContext: AccountRequestCompany;
  /**
   * strict_punch : punch réel — blocage hors zone / sans bases ; GPS obligatoire.
   * retroactive_request : demande rétroactive — hors zone journalisée ; sans coordonnées, géré par la route punch.
   */
  punchGpsMode?: HorodateurWebPunchGpsMode;
}): Promise<HorodateurWebPunchGpsEvaluation> {
  const mode = options.punchGpsMode ?? "strict_punch";
  const coordinates = evaluateWebPunchGpsCoordinates(
    options.latitude,
    options.longitude,
    mode
  );
  if (!coordinates.ok) {
    return coordinates;
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("gps_bases")
    .select(
      "id, organization_id, organization_company_id, nom, adresse, latitude, longitude, rayon_m, company_context"
    )
    .eq("organization_id", options.organizationId)
    .eq("organization_company_id", options.organizationCompanyId);

  if (error) {
    console.error("[horodateur-gps-punch] gps_bases_load_failed", error.message);
    return evaluateWebPunchGpsAgainstLoadedBases({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      bases: [],
      punchGpsMode: mode,
      basesLoadFailed: true,
    });
  }

  const bases = (data ?? []) as GpsBaseRow[];

  return evaluateWebPunchGpsAgainstLoadedBases({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    bases,
    punchGpsMode: mode,
  });
}

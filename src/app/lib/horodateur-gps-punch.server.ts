import "server-only";

import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { isWithinRadiusMeters, parseNumericCoordinate } from "@/app/lib/timeclock-api.shared";

export type HorodateurWebPunchGpsFailureCode =
  | "GPS_REQUIRED"
  | "GPS_OUT_OF_ZONE"
  | "GPS_NOT_CONFIGURED";

export type HorodateurWebPunchGpsEvaluation =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      zoneValidated: boolean;
      matchedBaseName: string | null;
      matchedBaseId: string | null;
      matchedBaseAddress: string | null;
      gpsBasesConfigured: boolean;
    }
  | {
      ok: false;
      code: HorodateurWebPunchGpsFailureCode;
      message: string;
    };

type GpsBaseRow = {
  id: string;
  nom: string;
  adresse: string;
  latitude: number | string;
  longitude: number | string;
  rayon_m: number | string;
  company_context: string;
};

export type HorodateurWebPunchGpsMode = "strict_punch" | "retroactive_request";

export const HORODATEUR_RETRO_CORRECTION_GPS_UNAVAILABLE_NOTE =
  "GPS non disponible lors de la demande.";

export function formatHorodateurGpsJournalSuffix(options: {
  latitude: number;
  longitude: number;
  zoneValidated: boolean;
  matchedBaseName: string | null;
  matchedBaseAddress?: string | null;
  requestedAtIso?: string;
  basesConfigured?: boolean;
}) {
  const statutLabel =
    options.basesConfigured === false
      ? "verification impossible (bases GPS non configurees)"
      : options.zoneValidated
        ? "dans la zone autorisee"
        : "hors de la zone autorisee";

  const baseName = options.matchedBaseName?.trim() || null;
  const address = options.matchedBaseAddress?.trim() || "";

  let presDeLabel: string;
  if (address) {
    presDeLabel = `Pres de : ${address}`;
  } else if (baseName) {
    presDeLabel = `Pres de : base ${baseName}, adresse non configuree`;
  } else {
    presDeLabel = "Pres de : adresse non configuree";
  }

  const lines = [
    "[GPS]",
    `Statut : ${statutLabel}`,
    baseName ? `Base : ${baseName}` : "Base : —",
    presDeLabel,
    `Coordonnees : ${options.latitude.toFixed(5)}, ${options.longitude.toFixed(5)}`,
  ];

  if (options.requestedAtIso) {
    lines.push(`Demande enregistree le : ${options.requestedAtIso}`);
  }

  return lines.join("\n");
}

function findMatchingGpsBase(
  bases: GpsBaseRow[],
  latitude: number,
  longitude: number
): GpsBaseRow | null {
  for (const base of bases) {
    const baseLat = parseNumericCoordinate(base.latitude);
    const baseLng = parseNumericCoordinate(base.longitude);
    const radius = Number(base.rayon_m);

    if (baseLat == null || baseLng == null || !Number.isFinite(radius) || radius <= 0) {
      continue;
    }

    if (
      isWithinRadiusMeters({
        originLatitude: baseLat,
        originLongitude: baseLng,
        latitude,
        longitude,
        radiusMeters: radius,
      })
    ) {
      return base;
    }
  }

  return null;
}

export async function evaluateEmployeeWebPunchGps(options: {
  latitude: unknown;
  longitude: unknown;
  companyContext: AccountRequestCompany;
  /**
   * strict_punch : punch réel — blocage hors zone / sans bases ; GPS obligatoire.
   * retroactive_request : demande rétroactive — hors zone journalisée ; sans coordonnées, géré par la route punch.
   */
  punchGpsMode?: HorodateurWebPunchGpsMode;
}): Promise<HorodateurWebPunchGpsEvaluation> {
  const mode = options.punchGpsMode ?? "strict_punch";
  const isRetroactiveRequest = mode === "retroactive_request";
  const latitude = parseNumericCoordinate(options.latitude);
  const longitude = parseNumericCoordinate(options.longitude);

  if (latitude == null || longitude == null) {
    return {
      ok: false,
      code: "GPS_REQUIRED",
      message: isRetroactiveRequest
        ? "Autorisez la geolocalisation pour envoyer votre demande de correction."
        : "Vous devez être dans la zone autorisée pour puncher. Autorisez la géolocalisation et réessayez.",
    };
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("gps_bases")
    .select("id, nom, adresse, latitude, longitude, rayon_m, company_context")
    .eq("company_context", options.companyContext);

  if (error) {
    console.error("[horodateur-gps-punch] gps_bases_load_failed", error.message);
    if (isRetroactiveRequest) {
      return {
        ok: true,
        latitude,
        longitude,
        zoneValidated: false,
        matchedBaseName: null,
        matchedBaseId: null,
        matchedBaseAddress: null,
        gpsBasesConfigured: false,
      };
    }
    return {
      ok: false,
      code: "GPS_NOT_CONFIGURED",
      message:
        "Impossible de verifier la zone GPS. Contactez la direction (configuration des bases GPS).",
    };
  }

  const bases = (data ?? []) as GpsBaseRow[];

  if (bases.length === 0) {
    if (isRetroactiveRequest) {
      return {
        ok: true,
        latitude,
        longitude,
        zoneValidated: false,
        matchedBaseName: null,
        matchedBaseId: null,
        matchedBaseAddress: null,
        gpsBasesConfigured: false,
      };
    }
    return {
      ok: false,
      code: "GPS_NOT_CONFIGURED",
      message:
        "Aucune zone GPS autorisee n est configuree pour votre compagnie. Contactez la direction.",
    };
  }

  const matched = findMatchingGpsBase(bases, latitude, longitude);

  if (matched) {
    return {
      ok: true,
      latitude,
      longitude,
      zoneValidated: true,
      matchedBaseName: matched.nom,
      matchedBaseId: matched.id,
      matchedBaseAddress: matched.adresse?.trim() || null,
      gpsBasesConfigured: true,
    };
  }

  if (isRetroactiveRequest) {
    return {
      ok: true,
      latitude,
      longitude,
      zoneValidated: false,
      matchedBaseName: null,
      matchedBaseId: null,
      matchedBaseAddress: null,
      gpsBasesConfigured: true,
    };
  }

  return {
    ok: false,
    code: "GPS_OUT_OF_ZONE",
    message: "Vous devez être dans la zone autorisée pour puncher.",
  };
}

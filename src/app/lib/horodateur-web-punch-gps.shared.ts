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

export type HorodateurWebPunchGpsMode = "strict_punch" | "retroactive_request";

export type HorodateurGpsBaseForPunch = {
  id: string;
  nom: string;
  adresse: string;
  latitude: number | string;
  longitude: number | string;
  rayon_m: number | string;
};

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

export function findMatchingGpsBase(
  bases: HorodateurGpsBaseForPunch[],
  latitude: number,
  longitude: number
): HorodateurGpsBaseForPunch | null {
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

function isMissingPunchCoordinate(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (typeof value === "string" && value.trim() === "") {
    return true;
  }
  return false;
}

export function evaluateWebPunchGpsCoordinates(
  latitude: unknown,
  longitude: unknown,
  punchGpsMode: HorodateurWebPunchGpsMode = "strict_punch"
):
  | { ok: true; latitude: number; longitude: number }
  | Extract<HorodateurWebPunchGpsEvaluation, { ok: false }> {
  const isRetroactiveRequest = punchGpsMode === "retroactive_request";

  if (isMissingPunchCoordinate(latitude) || isMissingPunchCoordinate(longitude)) {
    return {
      ok: false,
      code: "GPS_REQUIRED",
      message: isRetroactiveRequest
        ? "Autorisez la geolocalisation pour envoyer votre demande de correction."
        : "Vous devez être dans la zone autorisée pour puncher. Autorisez la géolocalisation et réessayez.",
    };
  }

  const parsedLatitude = parseNumericCoordinate(latitude);
  const parsedLongitude = parseNumericCoordinate(longitude);

  if (parsedLatitude == null || parsedLongitude == null) {
    return {
      ok: false,
      code: "GPS_REQUIRED",
      message: isRetroactiveRequest
        ? "Autorisez la geolocalisation pour envoyer votre demande de correction."
        : "Vous devez être dans la zone autorisée pour puncher. Autorisez la géolocalisation et réessayez.",
    };
  }

  return {
    ok: true,
    latitude: parsedLatitude,
    longitude: parsedLongitude,
  };
}

export function evaluateWebPunchGpsAgainstLoadedBases(options: {
  latitude: number;
  longitude: number;
  bases: HorodateurGpsBaseForPunch[];
  punchGpsMode?: HorodateurWebPunchGpsMode;
  basesLoadFailed?: boolean;
}): HorodateurWebPunchGpsEvaluation {
  const isRetroactiveRequest = options.punchGpsMode === "retroactive_request";
  const { latitude, longitude } = options;

  if (options.basesLoadFailed) {
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

  if (options.bases.length === 0) {
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

  const matched = findMatchingGpsBase(options.bases, latitude, longitude);

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

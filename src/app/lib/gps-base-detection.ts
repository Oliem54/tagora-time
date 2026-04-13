import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";

export type GpsBaseType =
  | "siege"
  | "entrepot"
  | "chantier"
  | "client"
  | "autre";

export type GpsBaseLike = {
  id: string;
  nom: string;
  latitude: number;
  longitude: number;
  rayon_m: number;
  company_context: AccountRequestCompany | null;
  type_base: GpsBaseType;
};

export type GpsBasePositionLike = {
  id?: string | null;
  user_id?: string | null;
  chauffeur_id?: string | number | null;
  company_context?: AccountRequestCompany | null;
  latitude: number | null;
  longitude: number | null;
  recorded_at?: string | null;
};

export type GpsBaseMembershipState = "dans_base" | "hors_base";

export type GpsBaseEventName =
  | "gps_base_entered"
  | "gps_base_exited"
  | "gps_base_arrived"
  | "gps_base_returned";

export type GpsBaseMatch = {
  base: GpsBaseLike;
  distance_m: number;
  radius_m: number;
  inside: boolean;
};

export type GpsBasePreparedEvent = {
  name: GpsBaseEventName;
  label: string;
  occurred_at: string | null;
  base_id: string;
  base_name: string;
  company_context: AccountRequestCompany | null;
};

export type GpsBaseTimelineEntry = {
  position: GpsBasePositionLike;
  state: GpsBaseMembershipState;
  current_base: GpsBaseMatch | null;
  previous_base: GpsBaseMatch | null;
  events: GpsBasePreparedEvent[];
};

export type LatestGpsBaseStatus = {
  state: GpsBaseMembershipState;
  current_base: GpsBaseMatch | null;
  previous_base: GpsBaseMatch | null;
  latest_event: GpsBasePreparedEvent | null;
  timeline: GpsBaseTimelineEntry[];
};

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateGpsDistanceMeters(options: {
  originLatitude: number;
  originLongitude: number;
  latitude: number;
  longitude: number;
}) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(options.latitude - options.originLatitude);
  const dLon = toRadians(options.longitude - options.originLongitude);
  const lat1 = toRadians(options.originLatitude);
  const lat2 = toRadians(options.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

export function normalizeGpsBase(
  row: Partial<GpsBaseLike> & Record<string, unknown>
): GpsBaseLike | null {
  const latitude = toFiniteNumber(row.latitude);
  const longitude = toFiniteNumber(row.longitude);
  const rayon = toFiniteNumber(row.rayon_m);

  if (
    typeof row.id !== "string" ||
    typeof row.nom !== "string" ||
    latitude == null ||
    longitude == null ||
    rayon == null ||
    typeof row.type_base !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    nom: row.nom,
    latitude,
    longitude,
    rayon_m: rayon,
    company_context:
      row.company_context === "oliem_solutions" ||
      row.company_context === "titan_produits_industriels"
        ? row.company_context
        : null,
    type_base:
      row.type_base === "siege" ||
      row.type_base === "entrepot" ||
      row.type_base === "chantier" ||
      row.type_base === "client" ||
      row.type_base === "autre"
        ? row.type_base
        : "autre",
  };
}

export function getGpsBaseEventLabel(name: GpsBaseEventName) {
  if (name === "gps_base_entered") return "Entree dans une base";
  if (name === "gps_base_exited") return "Sortie d une base";
  if (name === "gps_base_arrived") return "Arrivee a la base";
  return "Retour a la base";
}

export function getGpsBaseStateLabel(state: GpsBaseMembershipState) {
  return state === "dans_base" ? "Dans une base" : "Hors base";
}

export function findGpsBaseMatches(
  position: GpsBasePositionLike,
  bases: GpsBaseLike[]
) {
  if (position.latitude == null || position.longitude == null) {
    return [] as GpsBaseMatch[];
  }

  return bases
    .filter((base) =>
      !position.company_context ||
      !base.company_context ||
      base.company_context === position.company_context
    )
    .map((base) => {
      const distance = calculateGpsDistanceMeters({
        originLatitude: base.latitude,
        originLongitude: base.longitude,
        latitude: position.latitude as number,
        longitude: position.longitude as number,
      });

      return {
        base,
        distance_m: Math.round(distance),
        radius_m: Math.round(base.rayon_m),
        inside: distance <= base.rayon_m,
      } satisfies GpsBaseMatch;
    })
    .filter((match) => match.inside)
    .sort((left, right) => {
      const leftCoverage = left.distance_m / Math.max(left.radius_m, 1);
      const rightCoverage = right.distance_m / Math.max(right.radius_m, 1);

      if (leftCoverage !== rightCoverage) {
        return leftCoverage - rightCoverage;
      }

      if (left.distance_m !== right.distance_m) {
        return left.distance_m - right.distance_m;
      }

      return left.base.nom.localeCompare(right.base.nom);
    });
}

export function findOfficialGpsBaseMatch(
  position: GpsBasePositionLike,
  bases: GpsBaseLike[]
) {
  return findGpsBaseMatches(position, bases)[0] ?? null;
}

export function analyzeGpsBaseTimeline(
  positions: GpsBasePositionLike[],
  bases: GpsBaseLike[]
) {
  const ordered = [...positions].sort((left, right) =>
    String(left.recorded_at ?? "").localeCompare(String(right.recorded_at ?? ""))
  );
  const timeline: GpsBaseTimelineEntry[] = [];
  const seenBaseIds = new Set<string>();

  for (const position of ordered) {
    const previousEntry = timeline[timeline.length - 1] ?? null;
    const previousBase = previousEntry?.current_base ?? null;
    const currentBase = findOfficialGpsBaseMatch(position, bases);
    const events: GpsBasePreparedEvent[] = [];

    if (previousBase && (!currentBase || previousBase.base.id !== currentBase.base.id)) {
      events.push({
        name: "gps_base_exited",
        label: getGpsBaseEventLabel("gps_base_exited"),
        occurred_at: position.recorded_at ?? null,
        base_id: previousBase.base.id,
        base_name: previousBase.base.nom,
        company_context: previousBase.base.company_context,
      });
    }

    if (currentBase && (!previousBase || previousBase.base.id !== currentBase.base.id)) {
      const semanticEventName = seenBaseIds.has(currentBase.base.id)
        ? "gps_base_returned"
        : "gps_base_arrived";

      events.push({
        name: "gps_base_entered",
        label: getGpsBaseEventLabel("gps_base_entered"),
        occurred_at: position.recorded_at ?? null,
        base_id: currentBase.base.id,
        base_name: currentBase.base.nom,
        company_context: currentBase.base.company_context,
      });
      events.push({
        name: semanticEventName,
        label: getGpsBaseEventLabel(semanticEventName),
        occurred_at: position.recorded_at ?? null,
        base_id: currentBase.base.id,
        base_name: currentBase.base.nom,
        company_context: currentBase.base.company_context,
      });
      seenBaseIds.add(currentBase.base.id);
    }

    timeline.push({
      position,
      state: currentBase ? "dans_base" : "hors_base",
      current_base: currentBase,
      previous_base: previousBase,
      events,
    });
  }

  return timeline;
}

export function buildLatestGpsBaseStatus(
  positions: GpsBasePositionLike[],
  bases: GpsBaseLike[]
): LatestGpsBaseStatus {
  const timeline = analyzeGpsBaseTimeline(positions, bases);
  const latestEntry = timeline[timeline.length - 1] ?? null;
  const latestEvent =
    [...timeline]
      .reverse()
      .flatMap((entry) => [...entry.events].reverse())
      .find(Boolean) ?? null;

  return {
    state: latestEntry?.state ?? "hors_base",
    current_base: latestEntry?.current_base ?? null,
    previous_base: latestEntry?.previous_base ?? null,
    latest_event: latestEvent,
    timeline,
  };
}

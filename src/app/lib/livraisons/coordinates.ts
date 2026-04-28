type GenericRecord = Record<string, unknown>;

export type OperationCoordinates = {
  lat: number | null;
  lng: number | null;
  source: string | null;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readPath(obj: unknown, path: string[]) {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as GenericRecord)[key];
  }
  return current;
}

const CANDIDATE_PAIRS: Array<{ latPath: string[]; lngPath: string[]; source: string }> = [
  { latPath: ["latitude"], lngPath: ["longitude"], source: "operation.latitude/operation.longitude" },
  { latPath: ["lat"], lngPath: ["lng"], source: "operation.lat/operation.lng" },
  { latPath: ["lat"], lngPath: ["lon"], source: "operation.lat/operation.lon" },
  { latPath: ["latitude_client"], lngPath: ["longitude_client"], source: "operation.latitude_client/operation.longitude_client" },
  { latPath: ["client_lat"], lngPath: ["client_lng"], source: "operation.client_lat/operation.client_lng" },
  { latPath: ["adresse_lat"], lngPath: ["adresse_lng"], source: "operation.adresse_lat/operation.adresse_lng" },
  { latPath: ["adresseLatitude"], lngPath: ["adresseLongitude"], source: "operation.adresseLatitude/operation.adresseLongitude" },
  { latPath: ["livraison_lat"], lngPath: ["livraison_lng"], source: "operation.livraison_lat/operation.livraison_lng" },
  { latPath: ["destination_lat"], lngPath: ["destination_lng"], source: "operation.destination_lat/operation.destination_lng" },
  { latPath: ["client", "latitude"], lngPath: ["client", "longitude"], source: "operation.client.latitude/operation.client.longitude" },
  { latPath: ["destination", "latitude"], lngPath: ["destination", "longitude"], source: "operation.destination.latitude/operation.destination.longitude" },
  { latPath: ["adresse", "latitude"], lngPath: ["adresse", "longitude"], source: "operation.adresse.latitude/operation.adresse.longitude" },
];

export function getOperationCoordinates(operation: unknown): OperationCoordinates {
  for (const candidate of CANDIDATE_PAIRS) {
    const lat = toFiniteNumber(readPath(operation, candidate.latPath));
    const lng = toFiniteNumber(readPath(operation, candidate.lngPath));
    if (lat != null && lng != null) {
      return { lat, lng, source: candidate.source };
    }
  }

  const coordonnees = readPath(operation, ["coordonnees"]);
  if (coordonnees && typeof coordonnees === "object") {
    const lat = toFiniteNumber((coordonnees as GenericRecord).lat ?? (coordonnees as GenericRecord).latitude);
    const lng = toFiniteNumber((coordonnees as GenericRecord).lng ?? (coordonnees as GenericRecord).longitude);
    if (lat != null && lng != null) {
      return { lat, lng, source: "operation.coordonnees.{lat,lng|latitude,longitude}" };
    }
  }

  const coordinates = readPath(operation, ["coordinates"]);
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    const lng = toFiniteNumber(coordinates[0]);
    const lat = toFiniteNumber(coordinates[1]);
    if (lat != null && lng != null) {
      return { lat, lng, source: "operation.coordinates[lng,lat]" };
    }
  }

  return { lat: null, lng: null, source: null };
}

import { NextResponse } from "next/server";
import { getOperationCoordinates } from "@/app/lib/livraisons/coordinates";

type RoutePoint = {
  label: string;
  lat: number;
  lng: number;
};

type StopInput = {
  id: string;
  nom: string;
  type: "livraison" | "ramassage";
  adresse: string;
  lat?: number | null;
  lng?: number | null;
  heurePlanifiee?: string;
};

type RequestBody = {
  depart?: RoutePoint;
  retour?: RoutePoint;
  stops?: StopInput[];
  serviceMinutesParStop?: number;
  heureDepart?: string;
  currentOrderIds?: string[];
};

type MatrixResponse = {
  distances: Array<Array<number | null>>;
  durations: Array<Array<number | null>>;
};

const DEFAULT_OSRM_URL = "https://router.project-osrm.org";
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

function normalizeAddressForGeocoding(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/pointes-aux/gi, "pointe-aux")
    .replace(/rue de la pointe-aux/gi, "rue de la Pointe-aux")
    .trim();
}

function buildGeocodeQueries(address: string) {
  const raw = String(address || "").trim();
  if (!raw) return [] as string[];
  const normalized = normalizeAddressForGeocoding(raw);
  const noCountry = normalized.replace(/,\s*Canada\s*$/i, "").trim();
  const parts = noCountry.split(",").map((p) => p.trim()).filter(Boolean);
  const withoutPostal = parts.filter((part) => !/[A-Z]\d[A-Z]\s?\d[A-Z]\d/i.test(part)).join(", ");
  const streetAndCity = parts.slice(0, 2).join(", ");
  const cityAndPostal = parts.slice(1, 3).join(", ");
  const noStreetNumber = noCountry.replace(/^\s*\d+\s+/, "").trim();
  const cityOnly = parts[1] || "";
  const regionOnly = [parts[1], parts[3]].filter(Boolean).join(", ");
  const candidates = [
    raw,
    normalized,
    noCountry,
    withoutPostal,
    streetAndCity,
    cityAndPostal,
    noStreetNumber,
    `${noStreetNumber}, ${cityOnly}`.trim().replace(/^,\s*/, ""),
    regionOnly,
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

function normalizeStreetKey(address: string) {
  const firstPart = String(address || "").split(",")[0] ?? "";
  return firstPart
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\s*\d+\s+/, "")
    .replace(/\brue\b/g, "")
    .replace(/\bavenue\b/g, "")
    .replace(/\bboulevard\b/g, "")
    .replace(/\bchemin\b/g, "")
    .replace(/\bde\b/g, "")
    .replace(/\bdu\b/g, "")
    .replace(/\bdes\b/g, "")
    .replace(/\bla\b/g, "")
    .replace(/\ble\b/g, "")
    .replace(/\bles\b/g, "")
    .replace(/\b(pointes)\b/g, "pointe")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractPostalCode(address: string) {
  const match = String(address || "")
    .toUpperCase()
    .match(/[A-Z]\d[A-Z]\s?\d[A-Z]\d/);
  return match ? match[0].replace(/\s+/g, "") : "";
}

function extractCity(address: string) {
  const parts = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return (parts[1] || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractStreetNumber(address: string) {
  const match = String(address || "").trim().match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const queries = buildGeocodeQueries(address);
  for (const query of queries) {
    if (geocodeCache.has(query)) {
      return geocodeCache.get(query) ?? null;
    }
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ca&q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "tagora-time-dev-route-suggestion/1.0",
        },
        cache: "no-store",
      });
      if (!response.ok) continue;
      const data = (await response.json()) as Array<{ lat?: string; lon?: string }>;
      const lat = Number(data?.[0]?.lat);
      const lng = Number(data?.[0]?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const hit = { lat, lng };
        geocodeCache.set(query, hit);
        return hit;
      }
      geocodeCache.set(query, null);
    } catch {
      // Continue with next query variant.
    }
  }
  return null;
}

function parseHourMinutes(value: string | undefined) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 8 * 60;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 8 * 60;
  return Math.max(0, Math.min(23, hh)) * 60 + Math.max(0, Math.min(59, mm));
}

function formatHourMinutes(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0");
  const mm = (normalized % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function toCoordString(points: Array<{ lat: number; lng: number }>) {
  return points.map((p) => `${p.lng},${p.lat}`).join(";");
}

async function fetchOsrmTable(
  osrmBaseUrl: string,
  points: Array<{ lat: number; lng: number }>
): Promise<MatrixResponse> {
  const coords = toCoordString(points);
  const url = `${osrmBaseUrl}/table/v1/driving/${coords}?annotations=distance,duration`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`OSRM table HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    code?: string;
    distances?: Array<Array<number | null>>;
    durations?: Array<Array<number | null>>;
  };
  if (data.code !== "Ok" || !data.distances || !data.durations) {
    throw new Error("OSRM table response invalide.");
  }
  return {
    distances: data.distances,
    durations: data.durations,
  };
}

async function fetchOsrmRouteGeometry(
  osrmBaseUrl: string,
  points: Array<{ lat: number; lng: number }>
) {
  if (points.length < 2) return [] as Array<[number, number]>;
  const coords = toCoordString(points);
  const url = `${osrmBaseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return [] as Array<[number, number]>;
  }
  const data = (await response.json()) as {
    code?: string;
    routes?: Array<{
      geometry?: {
        coordinates?: number[][];
      };
    }>;
  };
  if (data.code !== "Ok") return [] as Array<[number, number]>;
  const coordinates = data.routes?.[0]?.geometry?.coordinates ?? [];
  return coordinates
    .filter((xy) => Array.isArray(xy) && Number.isFinite(xy[0]) && Number.isFinite(xy[1]))
    .map((xy) => [xy[1], xy[0]] as [number, number]); // lat,lng for Leaflet
}

function buildNearestNeighborOrderByDriveTime(
  durations: Array<Array<number | null>>,
  stopCount: number
) {
  const unvisited = new Set<number>();
  for (let i = 1; i <= stopCount; i += 1) unvisited.add(i);

  const order: number[] = [];
  let current = 0; // depart
  while (unvisited.size > 0) {
    let bestNode = -1;
    let bestDuration = Number.POSITIVE_INFINITY;
    for (const candidate of unvisited) {
      const raw = durations[current]?.[candidate];
      if (!Number.isFinite(raw)) continue;
      const duration = Number(raw);
      if (duration < bestDuration) {
        bestDuration = duration;
        bestNode = candidate;
      }
    }
    if (bestNode < 0) {
      // fallback deterministic if durations are partial
      bestNode = Array.from(unvisited)[0];
    }
    order.push(bestNode);
    unvisited.delete(bestNode);
    current = bestNode;
  }
  return order;
}

function metricsFromStopOrder(params: {
  stopNodeOrder: number[];
  durations: Array<Array<number | null>>;
  distances: Array<Array<number | null>>;
  serviceMinutesPerStop: number;
  startMinutes: number;
  stopByNode: Map<number, StopInput & { lat: number; lng: number }>;
  returnNode: number;
}) {
  const {
    stopNodeOrder,
    durations,
    distances,
    serviceMinutesPerStop,
    startMinutes,
    stopByNode,
    returnNode,
  } = params;
  const ordreSuggere: Array<{
    id: string;
    ordre: number;
    nom: string;
    type: "livraison" | "ramassage";
    adresse: string;
    lat: number;
    lng: number;
    distanceDepuisPrecedentKm: number;
    tempsConduiteDepuisPrecedentMinutes: number;
    tempsServiceMinutes: number;
    arriveeEstimee: string;
    departEstime: string;
  }> = [];

  let previous = 0; // depart
  let cursorMinutes = startMinutes;
  let drivingSecondsTotal = 0;
  let distanceMetersTotal = 0;

  stopNodeOrder.forEach((node, index) => {
    const stop = stopByNode.get(node);
    if (!stop) return;
    const legDuration = Number(durations[previous]?.[node] ?? 0);
    const legDistance = Number(distances[previous]?.[node] ?? 0);
    const safeDuration = Number.isFinite(legDuration) ? legDuration : 0;
    const safeDistance = Number.isFinite(legDistance) ? legDistance : 0;
    const driveMinutes = Math.round(safeDuration / 60);
    cursorMinutes += driveMinutes;
    const arrival = cursorMinutes;
    cursorMinutes += serviceMinutesPerStop;
    const depart = cursorMinutes;

    drivingSecondsTotal += safeDuration;
    distanceMetersTotal += safeDistance;

    ordreSuggere.push({
      id: stop.id,
      ordre: index + 1,
      nom: stop.nom,
      type: stop.type,
      adresse: stop.adresse,
      lat: stop.lat,
      lng: stop.lng,
      distanceDepuisPrecedentKm: Math.round((safeDistance / 1000) * 10) / 10,
      tempsConduiteDepuisPrecedentMinutes: driveMinutes,
      tempsServiceMinutes: serviceMinutesPerStop,
      arriveeEstimee: formatHourMinutes(arrival),
      departEstime: formatHourMinutes(depart),
    });
    previous = node;
  });

  const returnDuration = Number(durations[previous]?.[returnNode] ?? 0);
  const returnDistance = Number(distances[previous]?.[returnNode] ?? 0);
  const safeReturnDuration = Number.isFinite(returnDuration) ? returnDuration : 0;
  const safeReturnDistance = Number.isFinite(returnDistance) ? returnDistance : 0;
  drivingSecondsTotal += safeReturnDuration;
  distanceMetersTotal += safeReturnDistance;
  const returnDriveMinutes = Math.round(safeReturnDuration / 60);
  const returnEstime = formatHourMinutes(cursorMinutes + returnDriveMinutes);

  const tempsConduiteTotalMinutes = Math.round(drivingSecondsTotal / 60);
  const tempsServiceTotalMinutes = serviceMinutesPerStop * stopNodeOrder.length;

  return {
    ordreSuggere,
    distanceRoutiereTotaleKm: Math.round((distanceMetersTotal / 1000) * 10) / 10,
    tempsConduiteTotalMinutes,
    tempsServiceTotalMinutes,
    tempsJourneeTotalMinutes: tempsConduiteTotalMinutes + tempsServiceTotalMinutes,
    retourEstime: returnEstime,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const depart = body.depart;
    const retour = body.retour;
    const rawStops = body.stops ?? [];
    if (!depart || !retour) {
      return NextResponse.json(
        { message: "depart et retour sont requis." },
        { status: 400 }
      );
    }

    const normalizedStops = await Promise.all(
      rawStops.map(async (stop) => {
        const coords = getOperationCoordinates(stop);
        if (coords.lat != null && coords.lng != null) {
          return {
            ...stop,
            lat: coords.lat,
            lng: coords.lng,
            coordinateSource: coords.source,
          };
        }
        const geocoded = await geocodeAddress(stop.adresse);
        return {
          ...stop,
          lat: geocoded?.lat ?? null,
          lng: geocoded?.lng ?? null,
          coordinateSource: geocoded ? "nominatim.geocode(adresse)" : null,
        };
      })
    );

    console.table(
      normalizedStops.map((stop) => ({
        id: stop.id,
        nom: stop.nom,
        adresse: stop.adresse,
        lat: stop.lat,
        lng: stop.lng,
        source: stop.coordinateSource,
        keys: Object.keys(stop).sort().join(", "),
      }))
    );

    const withStreetHints = normalizedStops.map((stop) => ({ ...stop }));
    const knownByStreet = new Map<string, { lat: number; lng: number }>();
    const knownByPostalCity = new Map<string, { lat: number; lng: number }>();
    withStreetHints.forEach((stop) => {
      if (Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) {
        const key = normalizeStreetKey(stop.adresse);
        if (key) knownByStreet.set(key, { lat: Number(stop.lat), lng: Number(stop.lng) });
        const postal = extractPostalCode(stop.adresse);
        const city = extractCity(stop.adresse);
        const postalCityKey = `${postal}|${city}`;
        if (postal && city) {
          knownByPostalCity.set(postalCityKey, { lat: Number(stop.lat), lng: Number(stop.lng) });
        }
      }
    });
    withStreetHints.forEach((stop) => {
      if (Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) return;
      const key = normalizeStreetKey(stop.adresse);
      const hint = key ? knownByStreet.get(key) : null;
      if (hint) {
        const house = extractStreetNumber(stop.adresse);
        const offsetSeed = Number.isFinite(house) ? Number(house) : Number(stop.id) || 1;
        const offset = ((offsetSeed % 13) - 6) * 0.00003;
        stop.lat = hint.lat + offset;
        stop.lng = hint.lng - offset;
        stop.coordinateSource = "heuristic.same_street_offset";
        return;
      }
      const postal = extractPostalCode(stop.adresse);
      const city = extractCity(stop.adresse);
      const postalCityHint = postal && city ? knownByPostalCity.get(`${postal}|${city}`) : null;
      if (postalCityHint) {
        stop.lat = postalCityHint.lat;
        stop.lng = postalCityHint.lng;
        stop.coordinateSource = "heuristic.same_postal_city";
      }
    });

    const stopsWithCoords = withStreetHints.filter(
      (s): s is StopInput & { lat: number; lng: number; coordinateSource: string | null } =>
        Number.isFinite(s.lat) && Number.isFinite(s.lng)
    );
    const missingCoords = withStreetHints
      .filter((s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lng))
      .map((s) => ({
        id: s.id,
        nom: s.nom,
        adresse: s.adresse,
      }));

    if (stopsWithCoords.length === 0) {
      return NextResponse.json({
        warnings: {
          stopsSansCoordonnees: missingCoords,
        },
        current: {
          ordreSuggere: [],
          distanceRoutiereTotaleKm: 0,
          tempsConduiteTotalMinutes: 0,
          tempsServiceTotalMinutes: 0,
          tempsJourneeTotalMinutes: 0,
          retourEstime: body.heureDepart || "08:00",
          orderIds: [],
          routeGeometryLatLng: [],
        },
        suggested: {
          ordreSuggere: [],
          distanceRoutiereTotaleKm: 0,
          tempsConduiteTotalMinutes: 0,
          tempsServiceTotalMinutes: 0,
          tempsJourneeTotalMinutes: 0,
          retourEstime: body.heureDepart || "08:00",
          orderIds: [],
          routeGeometryLatLng: [],
        },
      });
    }

    const osrmBaseUrl = process.env.OSRM_BASE_URL || DEFAULT_OSRM_URL;
    const serviceMinutes = Number.isFinite(body.serviceMinutesParStop)
      ? Math.max(0, Number(body.serviceMinutesParStop))
      : 30;
    const startMinutes = parseHourMinutes(body.heureDepart);

    const points = [
      { lat: depart.lat, lng: depart.lng },
      ...stopsWithCoords.map((s) => ({ lat: s.lat, lng: s.lng })),
      { lat: retour.lat, lng: retour.lng },
    ];

    const { distances, durations } = await fetchOsrmTable(osrmBaseUrl, points);
    const stopCount = stopsWithCoords.length;
    const returnNode = stopCount + 1;

    const stopByNode = new Map<number, StopInput & { lat: number; lng: number }>();
    stopsWithCoords.forEach((stop, idx) => {
      stopByNode.set(idx + 1, stop);
    });

    const nodeByStopId = new Map<string, number>();
    stopByNode.forEach((stop, node) => nodeByStopId.set(stop.id, node));

    const currentStopNodes = (body.currentOrderIds ?? [])
      .map((id) => nodeByStopId.get(id))
      .filter((node): node is number => Number.isFinite(node));

    const missingInCurrent = Array.from(stopByNode.keys()).filter(
      (node) => !currentStopNodes.includes(node)
    );
    const currentOrderNodes = [...currentStopNodes, ...missingInCurrent];

    const suggestedOrderNodes = buildNearestNeighborOrderByDriveTime(durations, stopCount);

    const currentMetrics = metricsFromStopOrder({
      stopNodeOrder: currentOrderNodes,
      durations,
      distances,
      serviceMinutesPerStop: serviceMinutes,
      startMinutes,
      stopByNode,
      returnNode,
    });

    const suggestedMetrics = metricsFromStopOrder({
      stopNodeOrder: suggestedOrderNodes,
      durations,
      distances,
      serviceMinutesPerStop: serviceMinutes,
      startMinutes,
      stopByNode,
      returnNode,
    });

    const currentGeometry = await fetchOsrmRouteGeometry(osrmBaseUrl, [
      { lat: depart.lat, lng: depart.lng },
      ...currentOrderNodes
        .map((node) => stopByNode.get(node))
        .filter((s): s is StopInput & { lat: number; lng: number } => Boolean(s))
        .map((s) => ({ lat: s.lat, lng: s.lng })),
      { lat: retour.lat, lng: retour.lng },
    ]);

    const suggestedGeometry = await fetchOsrmRouteGeometry(osrmBaseUrl, [
      { lat: depart.lat, lng: depart.lng },
      ...suggestedOrderNodes
        .map((node) => stopByNode.get(node))
        .filter((s): s is StopInput & { lat: number; lng: number } => Boolean(s))
        .map((s) => ({ lat: s.lat, lng: s.lng })),
      { lat: retour.lat, lng: retour.lng },
    ]);

    return NextResponse.json({
      warnings: {
        stopsSansCoordonnees: missingCoords,
      },
      current: {
        ...currentMetrics,
        orderIds: currentOrderNodes
          .map((node) => stopByNode.get(node)?.id)
          .filter((id): id is string => Boolean(id)),
        routeGeometryLatLng: currentGeometry,
      },
      suggested: {
        ...suggestedMetrics,
        orderIds: suggestedOrderNodes
          .map((node) => stopByNode.get(node)?.id)
          .filter((id): id is string => Boolean(id)),
        routeGeometryLatLng: suggestedGeometry,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json(
      {
        message:
          "Impossible de calculer la suggestion routiere (OSRM indisponible ou donnees invalides).",
        details: message,
      },
      { status: 502 }
    );
  }
}

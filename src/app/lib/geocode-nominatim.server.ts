import "server-only";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "TagoraTime/1.0 (geocode interne; +https://github.com/Oliem54/tagora-time)";

type NominatimHit = {
  lat: string;
  lon: string;
  display_name?: string;
  country_code?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    postcode?: string;
    country?: string;
    house_number?: string;
  };
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function scoreHit(query: string, hit: NominatimHit) {
  const q = normalizeText(query);
  const display = normalizeText(hit.display_name || "");
  const city = normalizeText(
    hit.address?.city || hit.address?.town || hit.address?.village || hit.address?.municipality || ""
  );
  const state = normalizeText(hit.address?.state || "");
  const postcode = normalizeText(hit.address?.postcode || "");
  const country = normalizeText(hit.address?.country || "");
  let score = 0;
  if (hit.country_code?.toLowerCase() === "ca" || country.includes("canada")) score += 6;
  if (q.includes("quebec") || q.includes("qc")) {
    if (state.includes("quebec")) score += 4;
  }
  if (city && q.includes(city)) score += 4;
  if (postcode && q.includes(postcode)) score += 5;
  if (/\d+/.test(q) && hit.address?.house_number) score += 4;
  if (display && q && display.includes(q)) score += 4;
  if (display && q) {
    const qTokens = q.split(" ").filter((token) => token.length >= 3);
    const overlap = qTokens.filter((token) => display.includes(token)).length;
    score += Math.min(6, overlap);
  }
  return score;
}

export type GeocodeInCanadaResult = {
  latitude: number;
  longitude: number;
  confidence: "exact" | "approximatif" | "faible";
  query: string;
  matched_display: string | null;
  score: number;
};

/**
 * Geocode une adresse libre au Canada (Nominatim).
 * Usage serveur uniquement (User-Agent, pas de quota navigateur).
 */
export async function geocodeInCanada(query: string): Promise<GeocodeInCanadaResult | null> {
  const q = query.trim();
  if (!q) return null;

  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", q);
  url.searchParams.set("countrycodes", "ca");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    console.error("[geocodeInCanada] nominatim_http", { status: res.status, q });
    return null;
  }

  const data = (await res.json()) as NominatimHit[];
  if (!data[0]) {
    console.info("[geocodeInCanada] no_result", { q });
    return null;
  }

  const ranked = data
    .map((hit) => ({ hit, score: scoreHit(q, hit) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const latitude = Number(best.hit.lat);
  const longitude = Number(best.hit.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const confidence =
    best.score >= 16 ? "exact" : best.score >= 10 ? "approximatif" : "faible";

  console.info("[geocodeInCanada] resolved", {
    q,
    bestScore: best.score,
    confidence,
    displayName: best.hit.display_name || null,
  });

  return {
    latitude,
    longitude,
    confidence,
    query: q,
    matched_display: best.hit.display_name ?? null,
    score: best.score,
  };
}

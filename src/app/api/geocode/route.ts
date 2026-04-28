import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/** Usage policy Nominatim: User-Agent; ~1 requete/s cote client (delai dans DayOperationsView). */
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

export async function GET(req: NextRequest) {
  const { user } = await getAuthenticatedRequestUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentification requise." }, { status: 401 });
  }
  if (!hasUserPermission(user, "livraisons")) {
    return NextResponse.json({ ok: false, error: "Acces refuse." }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ ok: false, error: "Parametre q requis." }, { status: 400 });
  }

  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", q);
  url.searchParams.set("countrycodes", "ca");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Nominatim HTTP ${res.status}` },
        { status: 502 }
      );
    }
    const data = (await res.json()) as NominatimHit[];
    if (!data[0]) {
      console.info("[geocode] no result", { query: q });
      return NextResponse.json({ ok: false, error: "Aucun resultat." });
    }
    const ranked = data
      .map((hit) => ({ hit, score: scoreHit(q, hit) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const latitude = Number(best.hit.lat);
    const longitude = Number(best.hit.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ ok: false, error: "Coordonnees invalides." });
    }
    const confidence =
      best.score >= 16 ? "exact" : best.score >= 10 ? "approximatif" : "faible";
    console.info("[geocode] resolved", {
      query: q,
      bestScore: best.score,
      confidence,
      displayName: best.hit.display_name || null,
      candidates: ranked.map((item) => ({
        score: item.score,
        displayName: item.hit.display_name || null,
      })),
    });
    return NextResponse.json({
      ok: true,
      latitude,
      longitude,
      query: q,
      confidence,
      matched_display: best.hit.display_name || null,
      score: best.score,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur geocodage.";
    console.error("[geocode] failed", { query: q, message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/** Usage policy Nominatim: User-Agent; ~1 requete/s cote client (delai dans DayOperationsView). */
const USER_AGENT = "TagoraTime/1.0 (geocode interne; +https://github.com/Oliem54/tagora-time)";

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
  url.searchParams.set("limit", "1");
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
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data[0]) {
      return NextResponse.json({ ok: false, error: "Aucun resultat." });
    }
    const latitude = Number(data[0].lat);
    const longitude = Number(data[0].lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ ok: false, error: "Coordonnees invalides." });
    }
    return NextResponse.json({ ok: true, latitude, longitude, query: q });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur geocodage.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

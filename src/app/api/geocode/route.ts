import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { geocodeInCanada } from "@/app/lib/geocode-nominatim.server";

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

  try {
    const hit = await geocodeInCanada(q);
    if (!hit) {
      return NextResponse.json({ ok: false, error: "Aucun resultat." });
    }
    return NextResponse.json({
      ok: true,
      latitude: hit.latitude,
      longitude: hit.longitude,
      query: hit.query,
      confidence: hit.confidence,
      matched_display: hit.matched_display,
      score: hit.score,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur geocodage.";
    console.error("[geocode] failed", { query: q, message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

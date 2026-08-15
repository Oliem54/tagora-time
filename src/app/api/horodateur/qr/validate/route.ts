import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { fetchPunchZoneByKeyAndToken } from "@/app/lib/horodateur-qr-punch.server";

/**
 * Validation publique zone + jeton (sans session).
 * Ne révèle pas la cause si invalide.
 * Ne charge jamais une zone par zone_key seul : le token_hash doit matcher.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const zoneKey = (url.searchParams.get("zone") ?? "").trim();
  const token = (url.searchParams.get("token") ?? "").trim();

  const supabase = createAdminSupabaseClient();
  const zone = await fetchPunchZoneByKeyAndToken(supabase, zoneKey, token);
  if (!zone?.active) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({
    valid: true,
    zoneLabel: zone.label,
    requiresGps: zone.requires_gps === true,
    companyKey: zone.company_key,
    locationKey: zone.location_key,
  });
}

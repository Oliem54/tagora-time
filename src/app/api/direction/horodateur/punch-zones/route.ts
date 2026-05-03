import { NextRequest, NextResponse } from "next/server";
import { requireDirectionHorodateurAccess } from "@/app/api/horodateur/_shared";
import {
  generatePunchZonePlainToken,
  hashPunchZoneToken,
} from "@/app/lib/horodateur-qr-punch.server";
import { isPunchZoneCompanyKey } from "@/app/lib/horodateur-qr-punch.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

function publicQrUrl(req: NextRequest, zoneKey: string, plainToken: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
  const u = new URL(`${base}/employe/horodateur/qr`);
  u.searchParams.set("zone", zoneKey);
  u.searchParams.set("token", plainToken);
  return u.toString();
}

export async function GET(req: NextRequest) {
  const auth = await requireDirectionHorodateurAccess(req);
  if (!auth.ok) return auth.response;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_punch_zones")
    .select(
      "id, zone_key, label, company_key, location_key, active, requires_gps, latitude, longitude, radius_meters, created_at, updated_at"
    )
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ zones: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireDirectionHorodateurAccess(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as {
    zone_key?: unknown;
    label?: unknown;
    company_key?: unknown;
    location_key?: unknown;
    requires_gps?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    radius_meters?: unknown;
  };

  const zoneKey = typeof body.zone_key === "string" ? body.zone_key.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const companyKeyRaw =
    typeof body.company_key === "string" ? body.company_key.trim() : "all";
  const locationKey =
    typeof body.location_key === "string" && body.location_key.trim()
      ? body.location_key.trim()
      : null;

  if (!zoneKey || !label) {
    return NextResponse.json(
      { error: "zone_key et label sont requis." },
      { status: 400 }
    );
  }

  if (!isPunchZoneCompanyKey(companyKeyRaw)) {
    return NextResponse.json({ error: "company_key invalide." }, { status: 400 });
  }

  const requiresGps = body.requires_gps === true;
  const lat =
    body.latitude === null || body.latitude === undefined || body.latitude === ""
      ? null
      : Number(body.latitude);
  const lng =
    body.longitude === null || body.longitude === undefined || body.longitude === ""
      ? null
      : Number(body.longitude);
  const radius =
    body.radius_meters === null ||
    body.radius_meters === undefined ||
    body.radius_meters === ""
      ? null
      : Number(body.radius_meters);

  if (requiresGps) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius)) {
      return NextResponse.json(
        { error: "GPS requis : latitude, longitude et rayon valides." },
        { status: 400 }
      );
    }
  }

  const plainToken = generatePunchZonePlainToken();
  const tokenHash = hashPunchZoneToken(plainToken);

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_punch_zones")
    .insert({
      zone_key: zoneKey,
      label,
      company_key: companyKeyRaw,
      location_key: locationKey,
      token_hash: tokenHash,
      active: true,
      requires_gps: requiresGps,
      latitude: requiresGps ? lat : null,
      longitude: requiresGps ? lng : null,
      radius_meters: requiresGps ? Math.floor(radius as number) : null,
      created_by: auth.user.id,
    })
    .select("id, zone_key, label, company_key, location_key, active, requires_gps")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Création impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    zone: data,
    plainToken,
    qrUrl: publicQrUrl(req, zoneKey, plainToken),
    message:
      "Conservez le jeton affiché : il ne sera plus montré. Le QR code utilise ce lien.",
  });
}

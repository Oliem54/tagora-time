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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireDirectionHorodateurAccess(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }

  const body = (await req.json()) as {
    label?: unknown;
    company_key?: unknown;
    location_key?: unknown;
    active?: unknown;
    requires_gps?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    radius_meters?: unknown;
    regenerate_token?: unknown;
  };

  const supabase = createAdminSupabaseClient();
  const { data: existing, error: loadErr } = await supabase
    .from("horodateur_punch_zones")
    .select("id, zone_key, label, company_key, location_key, active, requires_gps")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !existing) {
    return NextResponse.json({ error: "Zone introuvable." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.label === "string" && body.label.trim()) {
    updates.label = body.label.trim();
  }
  if (typeof body.company_key === "string") {
    const ck = body.company_key.trim();
    if (!isPunchZoneCompanyKey(ck)) {
      return NextResponse.json({ error: "company_key invalide." }, { status: 400 });
    }
    updates.company_key = ck;
  }
  if (body.location_key !== undefined) {
    updates.location_key =
      typeof body.location_key === "string" && body.location_key.trim()
        ? body.location_key.trim()
        : null;
  }
  if (typeof body.active === "boolean") {
    updates.active = body.active;
  }
  if (typeof body.requires_gps === "boolean") {
    updates.requires_gps = body.requires_gps;
  }
  if (body.latitude !== undefined) {
    updates.latitude =
      body.latitude === null || body.latitude === ""
        ? null
        : Number(body.latitude);
  }
  if (body.longitude !== undefined) {
    updates.longitude =
      body.longitude === null || body.longitude === ""
        ? null
        : Number(body.longitude);
  }
  if (body.radius_meters !== undefined) {
    updates.radius_meters =
      body.radius_meters === null || body.radius_meters === ""
        ? null
        : Number(body.radius_meters);
  }

  let plainToken: string | null = null;
  let qrUrl: string | null = null;
  if (body.regenerate_token === true) {
    plainToken = generatePunchZonePlainToken();
    updates.token_hash = hashPunchZoneToken(plainToken);
    qrUrl = publicQrUrl(req, String(existing.zone_key), plainToken);
  }

  if (Object.keys(updates).length === 0 && !plainToken) {
    return NextResponse.json({ error: "Aucune modification." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("horodateur_punch_zones")
    .update(updates)
    .eq("id", id)
    .select(
      "id, zone_key, label, company_key, location_key, active, requires_gps, latitude, longitude, radius_meters"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    zone: data,
    ...(plainToken
      ? {
          plainToken,
          qrUrl,
          message: "Nouveau jeton : enregistrez-le, il ne sera plus affiché.",
        }
      : {}),
  });
}

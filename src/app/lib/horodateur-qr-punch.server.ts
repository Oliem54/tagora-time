import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";
import { APP_ALERT_CATEGORY, APP_ALERT_PRIORITY } from "@/app/lib/app-alerts.shared";
import { insertAppAlert } from "@/app/lib/app-alerts.server";
import { getEmployeeByAuthUserId } from "@/app/lib/horodateur-v1/repository";
import type { HorodateurPhase1EmployeeProfile } from "@/app/lib/horodateur-v1/types";
import type { PunchZoneCompanyKey } from "@/app/lib/horodateur-qr-punch.shared";

export type HorodateurPunchZoneRow = {
  id: string;
  zone_key: string;
  label: string;
  company_key: string;
  location_key: string | null;
  token_hash: string;
  active: boolean;
  requires_gps: boolean;
  latitude: string | number | null;
  longitude: string | number | null;
  radius_meters: number | null;
};

function getPunchZonePepper(): string {
  return (
    process.env.PUNCH_ZONE_TOKEN_PEPPER?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "tagora-punch-zone-dev-pepper"
  );
}

/** Jeton brut à encoder dans le QR (jamais stocké en clair en base). */
export function generatePunchZonePlainToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashPunchZoneToken(plainToken: string): string {
  const pepper = getPunchZonePepper();
  return createHash("sha256").update(`${pepper}:${plainToken}`, "utf8").digest("hex");
}

export function verifyPunchZoneToken(plainToken: string, storedHash: string): boolean {
  const computed = hashPunchZoneToken(plainToken.trim());
  try {
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(storedHash.trim(), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function fetchPunchZoneByKey(
  supabase: SupabaseClient,
  zoneKey: string
): Promise<HorodateurPunchZoneRow | null> {
  const key = zoneKey.trim();
  if (!key) return null;
  const { data, error } = await supabase
    .from("horodateur_punch_zones")
    .select(
      "id, zone_key, label, company_key, location_key, token_hash, active, requires_gps, latitude, longitude, radius_meters"
    )
    .eq("zone_key", key)
    .maybeSingle<HorodateurPunchZoneRow>();

  if (error) {
    console.warn("[horodateur_punch_zones]", error.message);
    return null;
  }
  return data ?? null;
}

export function employeeMayPunchInZone(
  employee: Pick<
    HorodateurPhase1EmployeeProfile,
    "active" | "primaryCompany" | "canWorkForOliemSolutions" | "canWorkForTitanProduitsIndustriels"
  >,
  zoneCompanyKey: PunchZoneCompanyKey
): boolean {
  if (!employee.active) return false;
  if (zoneCompanyKey === "all") return true;
  if (zoneCompanyKey === "oliem_solutions") {
    return employee.canWorkForOliemSolutions !== false;
  }
  if (zoneCompanyKey === "titan_produits_industriels") {
    return employee.canWorkForTitanProduitsIndustriels === true;
  }
  return false;
}

export function resolveWorkCompanyKeyForEvent(
  zoneCompanyKey: PunchZoneCompanyKey
): AccountRequestCompany | null {
  if (zoneCompanyKey === "all") return null;
  return zoneCompanyKey;
}

/** Distance en mètres (WGS84, approximation sphère). */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function parseNumeric(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export type QrPunchEvalFailureReason =
  | "invalid_zone"
  | "no_employee"
  | "inactive"
  | "unauthorized_company"
  | "gps_required"
  | "gps_out_of_bounds";

export type QrPunchEvalResult =
  | {
      ok: true;
      zone: HorodateurPunchZoneRow;
      profile: HorodateurPhase1EmployeeProfile;
      zoneValidated: boolean;
      gpsLatitude: number | null;
      gpsLongitude: number | null;
    }
  | {
      ok: false;
      reason: QrPunchEvalFailureReason;
      zone: HorodateurPunchZoneRow | null;
      /** Présent si l’employé était identifié avant l’échec (ex. hors zone GPS). */
      employeeId?: number | null;
    };

export type QrContextBlock =
  | "invalid_zone"
  | "no_employee"
  | "inactive"
  | "unauthorized_company";

/** État pour la page QR (sans GPS : le punch valide la position). */
export async function loadQrContextState(options: {
  supabase: SupabaseClient;
  authUserId: string;
  zoneKeyRaw: string;
  tokenRaw: string;
}): Promise<
  | {
      ok: true;
      zone: HorodateurPunchZoneRow;
      profile: HorodateurPhase1EmployeeProfile;
      requiresGps: boolean;
    }
  | { ok: false; block: QrContextBlock | "invalid_zone"; zone: HorodateurPunchZoneRow | null }
> {
  const zoneKey = options.zoneKeyRaw.trim();
  const token = options.tokenRaw.trim();
  if (!zoneKey || !token) {
    return { ok: false, block: "invalid_zone", zone: null };
  }
  const zone = await fetchPunchZoneByKey(options.supabase, zoneKey);
  if (!zone?.active || !verifyPunchZoneToken(token, zone.token_hash)) {
    return { ok: false, block: "invalid_zone", zone: zone ?? null };
  }
  const profile = await getEmployeeByAuthUserId(options.authUserId);
  if (!profile) {
    return { ok: false, block: "no_employee", zone };
  }
  if (!profile.active) {
    return { ok: false, block: "inactive", zone };
  }
  const zc = zone.company_key as PunchZoneCompanyKey;
  if (zc !== "all" && zc !== "oliem_solutions" && zc !== "titan_produits_industriels") {
    return { ok: false, block: "invalid_zone", zone };
  }
  if (!employeeMayPunchInZone(profile, zc)) {
    return { ok: false, block: "unauthorized_company", zone };
  }
  return {
    ok: true,
    zone,
    profile,
    requiresGps: zone.requires_gps === true,
  };
}

/**
 * Valide zone + jeton, fiche employé, droits compagnie, GPS si requis.
 * Les coordonnées GPS sont obligatoires quand `requires_gps` si on veut autoriser le punch.
 */
export async function evaluateQrPunchAttempt(options: {
  supabase: SupabaseClient;
  authUserId: string;
  zoneKeyRaw: string;
  tokenRaw: string;
  /** Présentes si le client a envoyé la position (requis si zone.requires_gps). */
  latitude?: number | null;
  longitude?: number | null;
}): Promise<QrPunchEvalResult> {
  const { supabase, authUserId } = options;
  const zoneKey = options.zoneKeyRaw.trim();
  const token = options.tokenRaw.trim();
  if (!zoneKey || !token) {
    return { ok: false, reason: "invalid_zone", zone: null };
  }

  const zone = await fetchPunchZoneByKey(supabase, zoneKey);
  if (!zone?.active || !verifyPunchZoneToken(token, zone.token_hash)) {
    return { ok: false, reason: "invalid_zone", zone: zone ?? null };
  }

  const profile = await getEmployeeByAuthUserId(authUserId);
  if (!profile) {
    return { ok: false, reason: "no_employee", zone };
  }
  if (!profile.active) {
    return { ok: false, reason: "inactive", zone };
  }

  const zc = zone.company_key as PunchZoneCompanyKey;
  if (zc !== "all" && zc !== "oliem_solutions" && zc !== "titan_produits_industriels") {
    return { ok: false, reason: "invalid_zone", zone };
  }
  if (!employeeMayPunchInZone(profile, zc)) {
    return { ok: false, reason: "unauthorized_company", zone };
  }

  const latIn = options.latitude ?? null;
  const lngIn = options.longitude ?? null;

  if (zone.requires_gps) {
    if (latIn == null || lngIn == null || !Number.isFinite(latIn) || !Number.isFinite(lngIn)) {
      return { ok: false, reason: "gps_required", zone };
    }
    const zLat = parseNumeric(zone.latitude);
    const zLng = parseNumeric(zone.longitude);
    const radius = zone.radius_meters != null ? Number(zone.radius_meters) : null;
    if (zLat == null || zLng == null || radius == null || !Number.isFinite(radius) || radius <= 0) {
      return {
        ok: false,
        reason: "gps_out_of_bounds",
        zone,
        employeeId: profile.employeeId,
      };
    }
    const dist = haversineMeters(latIn, lngIn, zLat, zLng);
    if (dist > radius) {
      return {
        ok: false,
        reason: "gps_out_of_bounds",
        zone,
        employeeId: profile.employeeId,
      };
    }
  }

  return {
    ok: true,
    zone,
    profile,
    zoneValidated: true,
    gpsLatitude: latIn,
    gpsLongitude: lngIn,
  };
}

export async function insertQrPunchAppAlert(
  supabase: SupabaseClient,
  input: {
    alertType: string;
    title: string;
    body: string;
    priority?: "critical" | "high" | "medium" | "low";
    authUserId?: string | null;
    employeeId?: number | null;
    companyKey?: string | null;
    zoneKey?: string | null;
    dedupeKey?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await insertAppAlert(supabase, {
    category: APP_ALERT_CATEGORY.horodateur_exception,
    priority: input.priority ?? APP_ALERT_PRIORITY.high,
    title: input.title,
    body: input.body,
    sourceModule: "horodateur",
    employeeId: input.employeeId ?? null,
    companyKey: input.companyKey ?? null,
    dedupeKey: input.dedupeKey ?? null,
    metadata: {
      alert_type: input.alertType,
      auth_user_id: input.authUserId ?? null,
      zone_key: input.zoneKey ?? null,
      ...input.metadata,
    },
  });
}

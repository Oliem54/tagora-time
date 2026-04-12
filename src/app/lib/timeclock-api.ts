import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  buildUserCompanyAccess,
  normalizeCompany,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { getAuthenticatedRequestUser, getStrictDirectionRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";

export const AUTHORIZATION_REQUEST_TYPES = [
  "early_start",
  "out_of_zone_punch",
  "lunch_shift_change",
  "manual_punch_override",
] as const;

export type AuthorizationRequestType =
  (typeof AUTHORIZATION_REQUEST_TYPES)[number];

export const GPS_STATUSES = [
  "actif",
  "deplacement",
  "arret",
  "arrive",
  "inactif",
] as const;

export type GpsStatus = (typeof GPS_STATUSES)[number];

export function isAuthorizationRequestType(
  value: unknown
): value is AuthorizationRequestType {
  return AUTHORIZATION_REQUEST_TYPES.includes(
    value as AuthorizationRequestType
  );
}

export function isGpsStatus(value: unknown): value is GpsStatus {
  return GPS_STATUSES.includes(value as GpsStatus);
}

export function parseNumericCoordinate(value: unknown) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

export function normalizePhoneNumber(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^\d+]/g, "");
}

export function resolveCompanyContext(
  user: User,
  requestedCompany: unknown
): AccountRequestCompany {
  const companyAccess = buildUserCompanyAccess(user);
  const normalizedRequestedCompany = normalizeCompany(requestedCompany);

  if (
    normalizedRequestedCompany &&
    companyAccess.allowedCompanies.includes(normalizedRequestedCompany)
  ) {
    return normalizedRequestedCompany;
  }

  return companyAccess.primaryCompany ?? companyAccess.company ?? "oliem_solutions";
}

export async function requireAuthenticatedUser(
  req: NextRequest,
  permission?: "terrain" | "livraisons" | "documents" | "dossiers" | "ressources"
) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return {
      ok: false as const,
      response: { error: "Authentification requise.", status: 401 },
    };
  }

  if (permission && !hasUserPermission(user, permission)) {
    return {
      ok: false as const,
      response: { error: "Acces refuse.", status: 403 },
    };
  }

  return {
    ok: true as const,
    user,
    role,
    companyContext: resolveCompanyContext(user, null),
  };
}

export async function requireDirectionUser(
  req: NextRequest,
  permission: "terrain" | "livraisons" | "ressources"
) {
  const { user, role } = await getStrictDirectionRequestUser(req);

  if (!user || role !== "direction") {
    return {
      ok: false as const,
      response: { error: "Acces refuse.", status: 403 },
    };
  }

  if (!hasUserPermission(user, permission)) {
    return {
      ok: false as const,
      response: { error: "Permission insuffisante.", status: 403 },
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export function isWithinRadiusMeters(options: {
  originLatitude: number | null;
  originLongitude: number | null;
  latitude: number;
  longitude: number;
  radiusMeters: number | null | undefined;
}) {
  if (
    options.originLatitude == null ||
    options.originLongitude == null ||
    options.radiusMeters == null
  ) {
    return true;
  }

  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(options.latitude - options.originLatitude);
  const dLon = toRadians(options.longitude - options.originLongitude);
  const lat1 = toRadians(options.originLatitude);
  const lat2 = toRadians(options.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceMeters = earthRadiusMeters * c;

  return distanceMeters <= options.radiusMeters;
}

export function isWithinScheduledWindow(
  now: Date,
  scheduleStart: string | null | undefined,
  scheduleEnd: string | null | undefined
) {
  if (!scheduleStart || !scheduleEnd) {
    return true;
  }

  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const [startHour, startMinute] = scheduleStart.split(":").map(Number);
  const [endHour, endMinute] = scheduleEnd.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;

  if (Number.isNaN(startTotal) || Number.isNaN(endTotal)) {
    return true;
  }

  if (startTotal <= endTotal) {
    return currentMinutes >= startTotal && currentMinutes <= endTotal;
  }

  return currentMinutes >= startTotal || currentMinutes <= endTotal;
}

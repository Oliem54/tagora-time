import "server-only";

import type { NextRequest } from "next/server";
import { getAuthenticatedRequestUser, getStrictDirectionRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import {
  AUTHORIZATION_REQUEST_TYPES,
  GPS_STATUSES,
  isAuthorizationRequestType,
  isGpsStatus,
  parseNumericCoordinate,
  normalizePhoneNumber,
  resolveCompanyContext,
  isWithinRadiusMeters,
  isWithinScheduledWindow,
  type AuthorizationRequestType,
  type GpsStatus,
} from "@/app/lib/timeclock-api.shared";

export {
  AUTHORIZATION_REQUEST_TYPES,
  GPS_STATUSES,
  isAuthorizationRequestType,
  isGpsStatus,
  parseNumericCoordinate,
  normalizePhoneNumber,
  resolveCompanyContext,
  isWithinRadiusMeters,
  isWithinScheduledWindow,
};

export type { AuthorizationRequestType, GpsStatus };

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
  const { user, role, mfaError } = await getStrictDirectionRequestUser(req);

  if (mfaError) {
    return {
      ok: false as const,
      response: {
        error:
          "Vérification en deux étapes requise. Complétez le MFA puis réessayez.",
        status: 403,
        code: "MFA_AAL2_REQUIRED" as const,
      },
    };
  }

  if (!user || (role !== "direction" && role !== "admin")) {
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

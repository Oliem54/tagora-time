import "server-only";

import type { NextRequest } from "next/server";
import {
  getAuthenticatedRequestUser,
  getRequestAccessToken,
} from "@/app/lib/account-requests.server";
import { hasAdminFinanceAccess } from "@/app/lib/auth/admin-finance";
import { isJwtExplicitlyAal1Only } from "@/app/lib/auth/jwt-access-token";

/**
 * Garde serveur pour routes paie / remuneration / confidentiel (phase 2B-1).
 * Reserve au role admin (admin_finance phase 1 = admin uniquement).
 */
export async function requireAdminFinanceUser(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return {
      ok: false as const,
      response: {
        error: "Authentification requise.",
        status: 401 as const,
      },
    };
  }

  if (!hasAdminFinanceAccess(user)) {
    return {
      ok: false as const,
      response: {
        error:
          "Acces reserve a l administration (donnees de paie, remuneration et confidentiel).",
        status: 403 as const,
      },
    };
  }

  const token = getRequestAccessToken(req).token;
  if (isJwtExplicitlyAal1Only(token)) {
    return {
      ok: false as const,
      response: {
        error:
          "Verification en deux etapes requise. Completez le MFA puis reessayez.",
        status: 403 as const,
        code: "MFA_AAL2_REQUIRED" as const,
      },
    };
  }

  return { ok: true as const, user, role };
}

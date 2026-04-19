import { NextResponse } from "next/server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import {
  getAuthenticatedRequestUser,
  getCookieToken,
  resolveDirectionRequestUser,
} from "@/app/lib/account-requests.server";
import { HORODATEUR_PHASE1_EVENT_TYPES, HORODATEUR_PHASE1_EXCEPTION_TYPES, HorodateurPhase1Error, type HorodateurPhase1EventType, type HorodateurPhase1ExceptionType } from "@/app/lib/horodateur-v1/types";
import type { NextRequest } from "next/server";
import { APP_SESSION_COOKIE_NAME } from "@/app/lib/auth/session-cookie";

export function buildHorodateurErrorResponse(error: unknown) {
  const isDev = process.env.NODE_ENV !== "production";

  if (error instanceof HorodateurPhase1Error) {
    console.error("[horodateur] phase1 error", {
      message: error.message,
      code: error.code,
      details: null,
      hint: null,
      status: error.status,
      stack: error.stack ?? null,
    });

    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        code: error.code,
        details: null,
        hint: null,
        ...(isDev && error.stack ? { stack: error.stack } : {}),
      },
      { status: error.status }
    );
  }

  const errorLike =
    error && typeof error === "object"
      ? (error as {
          message?: unknown;
          code?: unknown;
          details?: unknown;
          hint?: unknown;
        })
      : null;

  const message =
    error instanceof Error
      ? error.message
      : typeof errorLike?.message === "string" && errorLike.message.trim()
        ? errorLike.message
        : "Erreur serveur horodateur.";

  const code =
    typeof errorLike?.code === "string" && errorLike.code.trim()
      ? errorLike.code
      : null;
  const details =
    typeof errorLike?.details === "string" && errorLike.details.trim()
      ? errorLike.details
      : null;
  const hint =
    typeof errorLike?.hint === "string" && errorLike.hint.trim()
      ? errorLike.hint
      : null;

  console.error("[horodateur] unexpected error", {
    message,
    code,
    details,
    hint,
    stack: error instanceof Error ? error.stack ?? null : null,
    raw: error,
  });

  return NextResponse.json(
    {
      ok: false,
      error: message,
      code,
      details,
      hint,
      ...(isDev && error instanceof Error && error.stack
        ? { stack: error.stack }
        : {}),
    },
    { status: 500 }
  );
}

export function isHorodateurPhase1EventType(value: unknown): value is HorodateurPhase1EventType {
  return HORODATEUR_PHASE1_EVENT_TYPES.includes(
    value as HorodateurPhase1EventType
  );
}

export function isHorodateurPhase1ExceptionType(
  value: unknown
): value is HorodateurPhase1ExceptionType {
  return HORODATEUR_PHASE1_EXCEPTION_TYPES.includes(
    value as HorodateurPhase1ExceptionType
  );
}

export async function requireEmployeeHorodateurAccess(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user || role !== "employe") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Acces refuse." }, { status: 403 }),
    };
  }

  if (!hasUserPermission(user, "terrain")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Permission terrain requise." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export async function requireDirectionHorodateurAccess(req: NextRequest) {
  const authenticated = await getAuthenticatedRequestUser(req);
  const directionResolution = await resolveDirectionRequestUser(req);
  const user = authenticated.user ?? directionResolution.user;
  const role = authenticated.role;
  const authSource = authenticated.authSource ?? directionResolution.debug.authSource;
  const hasDirectionAccess = role === "direction";
  const hasTerrainPermission = hasUserPermission(authenticated.user, "terrain");
  const isDev = process.env.NODE_ENV !== "production";
  const cookieValue = getCookieToken(req);

  const debug = {
    userId: user?.id ?? null,
    email: user?.email ?? null,
    authSource,
    directionCheck: hasDirectionAccess,
    reason: !authenticated.user
      ? directionResolution.debug.apiBlockReason ?? "authenticated_user_missing"
      : !hasDirectionAccess
        ? directionResolution.debug.apiBlockReason ?? "direction_role_missing"
        : !hasTerrainPermission
          ? "terrain_permission_missing"
          : null,
    auth: {
      role,
      permissionTerrain: hasTerrainPermission,
      tokenUserId: authenticated.user?.id ?? null,
      tokenEmail: authenticated.user?.email ?? null,
      cookieRead: {
        cookieName: APP_SESSION_COOKIE_NAME,
        valuePresent: Boolean(cookieValue),
        valueLength: cookieValue?.length ?? 0,
      },
      strict: directionResolution.debug,
    },
  };

  if (!authenticated.user || !hasDirectionAccess) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "Acces refuse.",
          ...(isDev ? { debug } : {}),
        },
        { status: 403 }
      ),
    };
  }

  if (!hasTerrainPermission) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "Permission terrain requise.",
          ...(isDev ? { debug } : {}),
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    user: authenticated.user,
    debug,
  };
}

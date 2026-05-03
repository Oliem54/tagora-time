import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { createPublicServerSupabaseClient } from "@/app/lib/supabase/server";
import { normalizeEmail } from "@/app/lib/account-requests.shared";
import { APP_SESSION_COOKIE_NAME } from "@/app/lib/auth/session-cookie";
import {
  decodeSupabaseJwtPayload,
  getJwtAal,
  isJwtExplicitlyAal1Only,
} from "@/app/lib/auth/jwt-access-token";

export { getJwtAal };

const ACCOUNT_REQUESTS_CLIENT_MARKER_HEADER = "x-account-requests-client";
const ACCOUNT_REQUESTS_CLIENT_MARKER_VALUE = "browser-authenticated";

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
}

export function getCookieToken(req: NextRequest) {
  return req.cookies.get(APP_SESSION_COOKIE_NAME)?.value ?? null;
}

export function getRequestAccessToken(req: NextRequest) {
  const bearerToken = getBearerToken(req);

  if (bearerToken) {
    return {
      token: bearerToken,
      source: "bearer" as const,
    };
  }

  const cookieToken = getCookieToken(req);

  if (cookieToken) {
    return {
      token: cookieToken,
      source: "cookie" as const,
    };
  }

  return {
    token: null,
    source: "none" as const,
  };
}

function normalizeAppRole(value: unknown): "direction" | "employe" | "admin" | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "admin") {
    return "admin";
  }

  if (normalized === "direction" || normalized === "manager") {
    return "direction";
  }

  if (
    normalized === "employe" ||
    normalized === "employee" ||
    normalized === "chauffeur"
  ) {
    return "employe";
  }

  return null;
}

export function extractRoleFromUser(
  user: User | null | undefined
): "direction" | "employe" | "admin" | null {
  if (!user) {
    return null;
  }

  const appRole = (user.app_metadata as { role?: unknown } | null)?.role;
  const userMetaRole = (user.user_metadata as { role?: unknown } | null)?.role;

  return normalizeAppRole(appRole ?? userMetaRole ?? null);
}

export function getAccountRequestsClientMarkerHeader() {
  return ACCOUNT_REQUESTS_CLIENT_MARKER_HEADER;
}

export function getAccountRequestsClientMarkerValue() {
  return ACCOUNT_REQUESTS_CLIENT_MARKER_VALUE;
}

export function getAccountRequestsRequestDebug(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const clientMarker = req.headers.get(ACCOUNT_REQUESTS_CLIENT_MARKER_HEADER);
  const secFetchMode = req.headers.get("sec-fetch-mode");
  const secFetchDest = req.headers.get("sec-fetch-dest");
  const userAgent = req.headers.get("user-agent");
  const referer = req.headers.get("referer");
  const inferredSource =
    clientMarker === ACCOUNT_REQUESTS_CLIENT_MARKER_VALUE
      ? "client-browser"
      : "server-or-unmarked";

  return {
    hasAuthorizationHeader: Boolean(authHeader),
    hasClientMarker: clientMarker === ACCOUNT_REQUESTS_CLIENT_MARKER_VALUE,
    clientMarker,
    inferredSource,
    secFetchMode,
    secFetchDest,
    referer,
    userAgent,
  };
}

export type DirectionAccessDebug = {
  apiBlockReason: string | null;
  authSource: "bearer" | "cookie" | "none";
  jwtRole: string | null;
  tokenRole: string | null;
  adminRole: string | null;
  userId: string | null;
  email: string | null;
  hasAuthorizationHeader: boolean;
  hasSessionCookie: boolean;
  tokenReadable: boolean;
  adminReadable: boolean;
  roleMismatch: boolean;
};

export async function resolveDirectionRequestUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const accessToken = getRequestAccessToken(req);
  const token = accessToken.token;
  const hasAuthorizationHeader = Boolean(authHeader);
  const hasSessionCookie = Boolean(getCookieToken(req));

  if (!token) {
    return {
      user: null,
      role: null,
      debug: {
        apiBlockReason: "missing_session_token",
        authSource: accessToken.source,
        jwtRole: null,
        tokenRole: null,
        adminRole: null,
        userId: null,
        email: null,
        hasAuthorizationHeader,
        hasSessionCookie,
        tokenReadable: false,
        adminReadable: false,
        roleMismatch: false,
      } satisfies DirectionAccessDebug,
    };
  }

  const jwtPayload = decodeSupabaseJwtPayload(token);
  const appMeta = jwtPayload?.app_metadata as { role?: unknown } | undefined;
  const userMeta = jwtPayload?.user_metadata as { role?: unknown } | undefined;
  const jwtRole = normalizeAppRole(
    appMeta?.role ?? userMeta?.role ?? jwtPayload?.role ?? null
  );

  const publicSupabase = createPublicServerSupabaseClient();
  const { data, error } = await publicSupabase.auth.getUser(token);

  const tokenUser = data.user;
  const tokenReadable = !error && Boolean(tokenUser);
  const tokenRole = extractRoleFromUser(tokenUser);

  if (error || !tokenUser) {
    return {
      user: null,
      role: null,
      debug: {
        apiBlockReason: error ? "token_user_lookup_failed" : "authenticated_user_missing",
        authSource: accessToken.source,
        jwtRole,
        tokenRole,
        adminRole: null,
        userId: tokenUser?.id ?? null,
        email: tokenUser?.email ?? null,
        hasAuthorizationHeader,
        hasSessionCookie,
        tokenReadable,
        adminReadable: false,
        roleMismatch: false,
      } satisfies DirectionAccessDebug,
    };
  }

  const adminSupabase = createAdminSupabaseClient();
  const { data: adminUserData, error: adminUserError } =
    await adminSupabase.auth.admin.getUserById(tokenUser.id);
  const adminUser = adminUserData.user ?? null;
  const adminReadable = !adminUserError && Boolean(adminUser);
  const adminRole = extractRoleFromUser(adminUser);

  const directionConfirmed =
    jwtRole === "direction" ||
    tokenRole === "direction" ||
    adminRole === "direction" ||
    jwtRole === "admin" ||
    tokenRole === "admin" ||
    adminRole === "admin";

  const roleMismatch =
    new Set([jwtRole, tokenRole, adminRole].filter(Boolean)).size > 1;

  if (!directionConfirmed) {
    return {
      user: adminUser ?? tokenUser,
      role: null,
      debug: {
        apiBlockReason: adminUserError
          ? "admin_user_lookup_failed"
          : adminUser
            ? "direction_role_missing"
            : "admin_user_missing",
        authSource: accessToken.source,
        jwtRole,
        tokenRole,
        adminRole,
        userId: adminUser?.id ?? tokenUser.id ?? null,
        email: adminUser?.email ?? tokenUser.email ?? null,
        hasAuthorizationHeader,
        hasSessionCookie,
        tokenReadable,
        adminReadable,
        roleMismatch,
      } satisfies DirectionAccessDebug,
    };
  }

  const resolvedRole =
    adminRole === "admin" || tokenRole === "admin" || jwtRole === "admin"
      ? ("admin" as const)
      : ("direction" as const);

  return {
    user: adminUser ?? tokenUser,
    role: resolvedRole,
    debug: {
      apiBlockReason: null,
      authSource: accessToken.source,
      jwtRole,
      tokenRole,
      adminRole,
      userId: adminUser?.id ?? tokenUser.id ?? null,
      email: adminUser?.email ?? tokenUser.email ?? null,
      hasAuthorizationHeader,
      hasSessionCookie,
      tokenReadable,
      adminReadable,
      roleMismatch,
    } satisfies DirectionAccessDebug,
  };
}

export function getRequestIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");

  return forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "unknown";
}

export async function getAuthenticatedRequestUser(req: NextRequest) {
  const accessToken = getRequestAccessToken(req);
  const token = accessToken.token;

  if (!token) {
    return { user: null, role: null, authSource: accessToken.source };
  }

  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, role: null, authSource: accessToken.source };
  }

  return {
    user: data.user,
    role: extractRoleFromUser(data.user),
    authSource: accessToken.source,
  };
}

export async function getStrictDirectionRequestUser(req: NextRequest) {
  const result = await resolveDirectionRequestUser(req);
  const token = getRequestAccessToken(req).token;

  if (
    result.user &&
    result.role &&
    (result.role === "direction" || result.role === "admin") &&
    isJwtExplicitlyAal1Only(token)
  ) {
    return {
      user: result.user,
      role: result.role,
      mfaError: NextResponse.json(
        {
          error:
            "Vérification en deux étapes requise. Complétez le MFA dans l’application puis réessayez.",
          code: "MFA_AAL2_REQUIRED",
        },
        { status: 403 }
      ),
    };
  }

  return {
    user: result.user,
    role: result.role,
    mfaError: null as NextResponse | null,
  };
}

export async function consumeDurableAccountRequestRateLimit(
  req: NextRequest,
  email: string
) {
  const supabase = createPublicServerSupabaseClient();
  const normalizedEmail = normalizeEmail(email);
  const ip = getRequestIp(req);

  const applyLimit = async (
    scope: "ip" | "email",
    identifier: string,
    maxAttempts: number,
    windowSeconds: number,
    blockSeconds: number
  ) => {
    const { data, error } = await supabase.rpc(
      "consume_account_request_rate_limit",
      {
        p_scope: scope,
        p_identifier: identifier,
        p_max_attempts: maxAttempts,
        p_window_seconds: windowSeconds,
        p_block_seconds: blockSeconds,
      }
    );

    if (error) {
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;

    return {
      allowed: Boolean(result?.allowed),
      retryAfterSeconds: Number(result?.retry_after_seconds ?? 0),
    };
  };

  const ipResult = await applyLimit("ip", ip, 6, 10 * 60, 15 * 60);

  if (!ipResult.allowed) {
    return { ok: false, retryAfterSeconds: ipResult.retryAfterSeconds, key: "ip" };
  }

  const emailResult = await applyLimit(
    "email",
    normalizedEmail,
    3,
    60 * 60,
    60 * 60
  );

  if (!emailResult.allowed) {
    return {
      ok: false,
      retryAfterSeconds: emailResult.retryAfterSeconds,
      key: "email",
    };
  }

  return { ok: true };
}


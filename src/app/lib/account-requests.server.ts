import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { createPublicServerSupabaseClient } from "@/app/lib/supabase/server";
import { normalizeEmail } from "@/app/lib/account-requests.shared";
import { APP_SESSION_COOKIE_NAME } from "@/app/lib/auth/session-cookie";
import { getJwtAal } from "@/app/lib/auth/jwt-access-token";
import { bindEffectiveAppRole } from "@/app/lib/auth/permissions";
import { NEXUS_BROKERED_SESSION_COOKIE_NAME } from "@/app/lib/auth/nexus-handoff-config";
import { resolveBrokeredHororaSessionFromCookies } from "@/app/lib/auth/nexus-brokered-session";

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
  const authenticated = await getAuthenticatedRequestUser(req);
  const hasAuthorizationHeader = Boolean(req.headers.get("authorization"));
  const hasSessionCookie = Boolean(getCookieToken(req));
  const hasNexusCookie = Boolean(
    req.cookies.get(NEXUS_BROKERED_SESSION_COOKIE_NAME)?.value
  );
  const directionConfirmed =
    authenticated.sessionSource === "nexus_handoff" &&
    (authenticated.role === "direction" || authenticated.role === "admin");

  if (!authenticated.user || authenticated.sessionSource !== "nexus_handoff") {
    return {
      user: null,
      role: null,
      debug: {
        apiBlockReason: hasNexusCookie ? "session_missing" : "nexus_handoff_required",
        authSource: authenticated.authSource,
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

  if (!directionConfirmed) {
    return {
      user: authenticated.user,
      role: null,
      debug: {
        apiBlockReason: "direction_role_missing",
        authSource: authenticated.authSource,
        jwtRole: null,
        tokenRole: authenticated.role,
        adminRole: authenticated.role === "admin" ? authenticated.role : null,
        userId: null,
        email: null,
        hasAuthorizationHeader,
        hasSessionCookie,
        tokenReadable: true,
        adminReadable: true,
        roleMismatch: false,
      } satisfies DirectionAccessDebug,
    };
  }

  return {
    user: authenticated.user,
    role: authenticated.role === "admin" ? ("admin" as const) : ("direction" as const),
    debug: {
      apiBlockReason: null,
      authSource: authenticated.authSource,
      jwtRole: null,
      tokenRole: authenticated.role,
      adminRole: authenticated.role === "admin" ? "admin" : null,
      userId: null,
      email: null,
      hasAuthorizationHeader,
      hasSessionCookie,
      tokenReadable: true,
      adminReadable: true,
      roleMismatch: false,
    } satisfies DirectionAccessDebug,
  };
}

export function getRequestIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");

  return forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || "unknown";
}

export type AuthenticatedSessionSource = "nexus_handoff" | null;

function unauthenticatedRequestUser(authSource: "bearer" | "cookie" | "none") {
  return {
    user: null,
    role: null,
    authSource,
    organizationId: null as string | null,
    membershipId: null as string | null,
    membershipRole: null as string | null,
    authorizationSource: null as "membership" | null,
    sessionSource: null as AuthenticatedSessionSource,
  };
}

export async function getAuthenticatedRequestUser(req: NextRequest) {
  const brokeredCookie = req.cookies.get(NEXUS_BROKERED_SESSION_COOKIE_NAME)?.value ?? null;
  if (!brokeredCookie) {
    return unauthenticatedRequestUser("none");
  }

  const resolved = await resolveBrokeredHororaSessionFromCookies({
    get(name: string) {
      return req.cookies.get(name)?.value;
    },
  });
  if (!resolved.ok) {
    return unauthenticatedRequestUser("cookie");
  }

  let admin;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return unauthenticatedRequestUser("none");
  }

  const { data, error } = await admin.auth.admin.getUserById(resolved.principal.authUserId);
  if (error || !data.user || data.user.id !== resolved.principal.authUserId) {
    return unauthenticatedRequestUser("none");
  }

  bindEffectiveAppRole(data.user, resolved.principal.role);
  return {
    user: data.user,
    role: resolved.principal.role,
    authSource: "cookie" as const,
    organizationId: resolved.principal.organizationId,
    membershipId: resolved.principal.membershipId,
    membershipRole: resolved.principal.membershipRole,
    authorizationSource: "membership" as const,
    sessionSource: "nexus_handoff" as AuthenticatedSessionSource,
  };
}

export async function getStrictDirectionRequestUser(req: NextRequest) {
  const result = await resolveDirectionRequestUser(req);
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


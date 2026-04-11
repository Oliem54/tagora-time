import "server-only";

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { createPublicServerSupabaseClient } from "@/app/lib/supabase/server";
import { normalizeEmail } from "@/app/lib/account-requests.shared";

const ACCOUNT_REQUESTS_CLIENT_MARKER_HEADER = "x-account-requests-client";
const ACCOUNT_REQUESTS_CLIENT_MARKER_VALUE = "browser-authenticated";

function getBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
}

function normalizeAppRole(value: unknown): "direction" | "employe" | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized === "direction" ||
    normalized === "admin" ||
    normalized === "manager"
  ) {
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

export function extractRoleFromUser(user: any): "direction" | "employe" | null {
  return normalizeAppRole(
    user?.app_metadata?.role ?? user?.user_metadata?.role ?? user?.role ?? null
  );
}

function decodeJwtPayload(token: string) {
  try {
    const [, payloadPart] = token.split(".");

    if (!payloadPart) {
      return null;
    }

    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );

    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
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
  jwtRole: string | null;
  tokenRole: string | null;
  adminRole: string | null;
  userId: string | null;
  email: string | null;
  hasAuthorizationHeader: boolean;
  tokenReadable: boolean;
  adminReadable: boolean;
  roleMismatch: boolean;
};

export async function resolveDirectionRequestUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = getBearerToken(req);
  const hasAuthorizationHeader = Boolean(authHeader);

  if (!token) {
    return {
      user: null,
      role: null,
      debug: {
        apiBlockReason: "missing_bearer_token",
        jwtRole: null,
        tokenRole: null,
        adminRole: null,
        userId: null,
        email: null,
        hasAuthorizationHeader,
        tokenReadable: false,
        adminReadable: false,
        roleMismatch: false,
      } satisfies DirectionAccessDebug,
    };
  }

  const jwtPayload = decodeJwtPayload(token);
  const jwtRole = normalizeAppRole(
    jwtPayload?.app_metadata?.role ??
      jwtPayload?.user_metadata?.role ??
      jwtPayload?.role ??
      null
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
        jwtRole,
        tokenRole,
        adminRole: null,
        userId: tokenUser?.id ?? null,
        email: tokenUser?.email ?? null,
        hasAuthorizationHeader,
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
    adminRole === "direction";

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
        jwtRole,
        tokenRole,
        adminRole,
        userId: adminUser?.id ?? tokenUser.id ?? null,
        email: adminUser?.email ?? tokenUser.email ?? null,
        hasAuthorizationHeader,
        tokenReadable,
        adminReadable,
        roleMismatch,
      } satisfies DirectionAccessDebug,
    };
  }

  return {
    user: adminUser ?? tokenUser,
    role: "direction" as const,
    debug: {
      apiBlockReason: null,
      jwtRole,
      tokenRole,
      adminRole,
      userId: adminUser?.id ?? tokenUser.id ?? null,
      email: adminUser?.email ?? tokenUser.email ?? null,
      hasAuthorizationHeader,
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
  const token = getBearerToken(req);

  if (!token) {
    return { user: null, role: null };
  }

  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, role: null };
  }

  return {
    user: data.user,
    role: extractRoleFromUser(data.user),
  };
}

export async function getStrictDirectionRequestUser(req: NextRequest) {
  const result = await resolveDirectionRequestUser(req);

  return {
    user: result.user,
    role: result.role,
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

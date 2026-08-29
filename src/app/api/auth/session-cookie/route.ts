import { NextRequest, NextResponse } from "next/server";
import { createPublicServerSupabaseClient } from "@/app/lib/supabase/server";
import { getJwtAal } from "@/app/lib/auth/jwt-access-token";
import {
  APP_SESSION_COOKIE_NAME,
  buildAppSessionCookieWriteDebug,
  evaluateSessionCookiePersistRequest,
  getAppSessionCookieOptions,
  type SessionCookiePersistPurpose,
} from "@/app/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function isSecureRequest(req: NextRequest) {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  return forwardedProto === "https" || req.nextUrl.protocol === "https:";
}

function readPurpose(value: unknown): SessionCookiePersistPurpose {
  if (value === "login" || value === "clear" || value === "mfa") {
    return value;
  }
  return "mfa";
}

function applyCookie(
  response: NextResponse,
  value: string,
  secure: boolean,
  maxAge?: number
) {
  const options = getAppSessionCookieOptions(secure);
  response.cookies.set(APP_SESSION_COOKIE_NAME, value, {
    ...options,
    ...(typeof maxAge === "number" ? { maxAge } : {}),
  });
}

export async function POST(req: NextRequest) {
  const secure = isSecureRequest(req);
  let purpose: SessionCookiePersistPurpose = "mfa";

  try {
    const body = (await req.json().catch(() => null)) as { purpose?: unknown } | null;
    purpose = readPurpose(body?.purpose);
  } catch {
    purpose = "mfa";
  }

  const includeDebug = process.env.NODE_ENV !== "production";

  if (purpose === "clear") {
    const response = NextResponse.json({
      ok: true,
      action: "cleared",
      ...(includeDebug
        ? { debug: buildAppSessionCookieWriteDebug(null, secure) }
        : {}),
    });
    applyCookie(response, "", secure, 0);
    return response;
  }

  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, action: "denied", reason: "unauthenticated" },
      { status: 401 }
    );
  }

  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  const hasAuthenticatedUser = Boolean(!error && data.user?.id);
  const decision = evaluateSessionCookiePersistRequest({
    purpose,
    hasAuthenticatedUser,
    aal: getJwtAal(token),
    tokenLength: token.length,
  });

  if (!decision.ok) {
    const status = decision.reason === "unauthenticated" ? 401 : 403;
    return NextResponse.json(
      { ok: false, action: "denied", reason: decision.reason },
      { status }
    );
  }

  const response = NextResponse.json({
    ok: true,
    action: "written",
    ...(includeDebug
      ? { debug: buildAppSessionCookieWriteDebug(token, secure) }
      : {}),
  });
  applyCookie(response, token, secure);
  console.info("[auth-cookie] server session cookie written", {
    purpose,
    cookieName: APP_SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    domain: null,
    valuePresent: true,
    valueLength: token.length,
  });
  return response;
}

export async function DELETE(req: NextRequest) {
  const secure = isSecureRequest(req);
  const response = NextResponse.json({
    ok: true,
    action: "cleared",
    ...(process.env.NODE_ENV !== "production"
      ? { debug: buildAppSessionCookieWriteDebug(null, secure) }
      : {}),
  });
  applyCookie(response, "", secure, 0);
  return response;
}

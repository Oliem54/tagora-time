export const APP_SESSION_COOKIE_NAME = "tagora_app_session";
export const APP_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60;
export const APP_SESSION_COOKIE_MAX_VALUE_BYTES = 3500;

export type AppSessionCookieWriteDebug = {
  action: "written" | "cleared";
  cookieName: string;
  valuePresent: boolean;
  valueLength: number;
  path: "/";
  sameSite: "lax";
  secure: boolean;
  httpOnly: true;
  maxAge: number;
  domain: null;
};

export type SessionCookiePersistPurpose = "mfa" | "login" | "clear";

export type SessionCookiePersistDecision =
  | { ok: true; action: "written" | "cleared" }
  | { ok: false; action: "denied"; reason: "unauthenticated" | "aal2_required" | "token_too_large" };

export function getAppSessionCookieOptions(secure: boolean) {
  return {
    path: "/" as const,
    sameSite: "lax" as const,
    secure,
    httpOnly: true as const,
    maxAge: APP_SESSION_COOKIE_MAX_AGE_SECONDS,
  };
}

export function evaluateSessionCookiePersistRequest(input: {
  purpose: SessionCookiePersistPurpose;
  hasAuthenticatedUser: boolean;
  aal: "aal1" | "aal2" | null;
  tokenLength: number;
}): SessionCookiePersistDecision {
  if (input.purpose === "clear") {
    return { ok: true, action: "cleared" };
  }

  if (!input.hasAuthenticatedUser) {
    return { ok: false, action: "denied", reason: "unauthenticated" };
  }

  if (input.tokenLength <= 0 || input.tokenLength > APP_SESSION_COOKIE_MAX_VALUE_BYTES) {
    return { ok: false, action: "denied", reason: "token_too_large" };
  }

  if (input.purpose === "mfa" && input.aal !== "aal2") {
    return { ok: false, action: "denied", reason: "aal2_required" };
  }

  return { ok: true, action: "written" };
}

export function buildAppSessionCookieWriteDebug(
  accessToken: string | null,
  secure: boolean
): AppSessionCookieWriteDebug {
  return {
    action: accessToken ? "written" : "cleared",
    cookieName: APP_SESSION_COOKIE_NAME,
    valuePresent: Boolean(accessToken),
    valueLength: accessToken?.length ?? 0,
    path: "/",
    sameSite: "lax",
    secure,
    httpOnly: true,
    maxAge: accessToken ? APP_SESSION_COOKIE_MAX_AGE_SECONDS : 0,
    domain: null,
  };
}

export async function persistServerSessionCookie(
  accessToken: string,
  purpose: Exclude<SessionCookiePersistPurpose, "clear">
): Promise<{ ok: boolean }> {
  try {
    const response = await fetch("/api/auth/session-cookie", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ purpose }),
    });
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}

export async function clearServerSessionCookie(): Promise<void> {
  try {
    await fetch("/api/auth/session-cookie", {
      method: "DELETE",
      credentials: "same-origin",
    });
  } catch {
    // Best-effort: local cookie clear still runs.
  }
}

export function writeBrowserSessionCookie(accessToken: string | null) {
  if (!accessToken) {
    void clearServerSessionCookie();
  }

  if (typeof document === "undefined") {
    return;
  }

  const secureAttribute =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const baseAttributes = "Path=/; SameSite=Lax";
  const debug = buildAppSessionCookieWriteDebug(accessToken, secure);

  if (!accessToken) {
    document.cookie = `${APP_SESSION_COOKIE_NAME}=; ${baseAttributes}; Max-Age=0${secureAttribute}`;
    if (process.env.NODE_ENV === "development") {
      console.info("[auth-cookie] cookie written", debug);
    }
    return;
  }

  const encodedToken = encodeURIComponent(accessToken);
  document.cookie = `${APP_SESSION_COOKIE_NAME}=${encodedToken}; ${baseAttributes}; Max-Age=${APP_SESSION_COOKIE_MAX_AGE_SECONDS}${secureAttribute}`;
  if (process.env.NODE_ENV === "development") {
    console.info("[auth-cookie] cookie written", debug);
  }
}

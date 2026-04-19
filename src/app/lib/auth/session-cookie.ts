export const APP_SESSION_COOKIE_NAME = "tagora_app_session";
export const APP_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60;

export type AppSessionCookieWriteDebug = {
  action: "written" | "cleared";
  cookieName: string;
  valuePresent: boolean;
  valueLength: number;
  path: "/";
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
  domain: null;
};

export function getAppSessionCookieOptions(secure: boolean) {
  return {
    path: "/" as const,
    sameSite: "lax" as const,
    secure,
    maxAge: APP_SESSION_COOKIE_MAX_AGE_SECONDS,
  };
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
    maxAge: accessToken ? APP_SESSION_COOKIE_MAX_AGE_SECONDS : 0,
    domain: null,
  };
}

export function writeBrowserSessionCookie(accessToken: string | null) {
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

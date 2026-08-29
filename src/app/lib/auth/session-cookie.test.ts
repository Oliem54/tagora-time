import { describe, expect, it } from "vitest";
import {
  APP_SESSION_COOKIE_MAX_AGE_SECONDS,
  APP_SESSION_COOKIE_MAX_VALUE_BYTES,
  APP_SESSION_COOKIE_NAME,
  evaluateSessionCookiePersistRequest,
  getAppSessionCookieOptions,
} from "@/app/lib/auth/session-cookie";

describe("getAppSessionCookieOptions", () => {
  it("writes a host-only HttpOnly Secure SameSite=Lax cookie", () => {
    expect(getAppSessionCookieOptions(true)).toEqual({
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: true,
      maxAge: APP_SESSION_COOKIE_MAX_AGE_SECONDS,
    });
    expect(APP_SESSION_COOKIE_NAME).toBe("tagora_app_session");
    expect(getAppSessionCookieOptions(true)).not.toHaveProperty("domain");
  });

  it("keeps HttpOnly on clear/local http options", () => {
    expect(getAppSessionCookieOptions(false).httpOnly).toBe(true);
    expect(getAppSessionCookieOptions(false).secure).toBe(false);
    expect(getAppSessionCookieOptions(false).sameSite).toBe("lax");
  });
});

describe("evaluateSessionCookiePersistRequest", () => {
  it("writes the MFA cookie only for an authenticated AAL2 session", () => {
    expect(
      evaluateSessionCookiePersistRequest({
        purpose: "mfa",
        hasAuthenticatedUser: true,
        aal: "aal2",
        tokenLength: 800,
      })
    ).toEqual({ ok: true, action: "written" });
  });

  it("refuses to persist an AAL1 token as an MFA session cookie", () => {
    expect(
      evaluateSessionCookiePersistRequest({
        purpose: "mfa",
        hasAuthenticatedUser: true,
        aal: "aal1",
        tokenLength: 800,
      })
    ).toEqual({ ok: false, action: "denied", reason: "aal2_required" });
  });

  it("allows an AAL1 login cookie without treating it as an MFA session", () => {
    expect(
      evaluateSessionCookiePersistRequest({
        purpose: "login",
        hasAuthenticatedUser: true,
        aal: "aal1",
        tokenLength: 800,
      })
    ).toEqual({ ok: true, action: "written" });
  });

  it("refuses unauthenticated or oversized cookie writes", () => {
    expect(
      evaluateSessionCookiePersistRequest({
        purpose: "mfa",
        hasAuthenticatedUser: false,
        aal: "aal2",
        tokenLength: 800,
      })
    ).toEqual({ ok: false, action: "denied", reason: "unauthenticated" });
    expect(
      evaluateSessionCookiePersistRequest({
        purpose: "mfa",
        hasAuthenticatedUser: true,
        aal: "aal2",
        tokenLength: APP_SESSION_COOKIE_MAX_VALUE_BYTES + 1,
      })
    ).toEqual({ ok: false, action: "denied", reason: "token_too_large" });
  });
});

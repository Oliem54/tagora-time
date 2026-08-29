import { describe, expect, it } from "vitest";
import { getJwtAal } from "@/app/lib/auth/jwt-access-token";
import {
  classifyMfaVerifyDenial,
  extractMfaVerifySessionTokens,
  resolveMfaVerifyPersistence,
  shouldRefreshSessionAfterSuccessfulMfa,
} from "@/app/lib/auth/mfa-verify-session.shared";

function unsignedJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url"
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

const aal2AccessToken = unsignedJwt({
  sub: "user-1",
  aal: "aal2",
  amr: ["password", "sms"],
});
const aal2RefreshToken = "refresh-token-placeholder";

describe("classifyMfaVerifyDenial", () => {
  it("denies a wrong code and does not persist a session", () => {
    expect(classifyMfaVerifyDenial({ code: "mfa_verification_failed" })).toBe(
      "wrong_code"
    );
    expect(
      resolveMfaVerifyPersistence({
        error: { code: "mfa_verification_failed", message: "Invalid TOTP code." },
        data: { access_token: aal2AccessToken, refresh_token: aal2RefreshToken },
      })
    ).toEqual({
      ok: false,
      deny: "wrong_code",
      persistSession: false,
      refreshSession: false,
      accessToken: null,
      refreshToken: null,
    });
  });

  it("denies an expired code and does not persist a session", () => {
    expect(classifyMfaVerifyDenial({ code: "mfa_challenge_expired" })).toBe(
      "expired_code"
    );
    expect(
      resolveMfaVerifyPersistence({
        error: { code: "mfa_challenge_expired", message: "Challenge expired." },
        data: { access_token: aal2AccessToken },
      })
    ).toMatchObject({
      ok: false,
      deny: "expired_code",
      persistSession: false,
      refreshSession: false,
    });
  });

  it("denies a replayed code and does not persist a session", () => {
    expect(
      classifyMfaVerifyDenial({
        code: "mfa_challenge_already_verified",
        message: "Challenge has already been verified.",
      })
    ).toBe("replayed_code");
    expect(
      resolveMfaVerifyPersistence({
        error: { message: "Challenge has already been used." },
        data: { session: { access_token: aal2AccessToken } },
      })
    ).toMatchObject({
      ok: false,
      deny: "replayed_code",
      persistSession: false,
      refreshSession: false,
    });
  });
});

describe("resolveMfaVerifyPersistence", () => {
  it("persists the AAL2 session from verify and does not refresh", () => {
    const decision = resolveMfaVerifyPersistence({
      error: null,
      data: {
        access_token: aal2AccessToken,
        refresh_token: aal2RefreshToken,
      },
    });

    expect(decision).toEqual({
      ok: true,
      deny: null,
      persistSession: true,
      refreshSession: false,
      accessToken: aal2AccessToken,
      refreshToken: aal2RefreshToken,
    });
    expect(getJwtAal(decision.ok ? decision.accessToken : null)).toBe("aal2");
    expect(shouldRefreshSessionAfterSuccessfulMfa(aal2AccessToken)).toBe(false);
  });

  it("reads a nested session object from supabase verify", () => {
    const decision = resolveMfaVerifyPersistence({
      data: {
        session: {
          access_token: aal2AccessToken,
          refresh_token: aal2RefreshToken,
        },
      },
    });

    expect(decision.ok).toBe(true);
    expect(decision.persistSession).toBe(true);
    expect(decision.refreshSession).toBe(false);
    expect(extractMfaVerifySessionTokens({ session: { access_token: aal2AccessToken } })).toEqual({
      accessToken: aal2AccessToken,
      refreshToken: null,
    });
  });

  it("does not persist when verify succeeded but no session was returned", () => {
    expect(resolveMfaVerifyPersistence({ data: {} })).toEqual({
      ok: false,
      deny: "session_missing",
      persistSession: false,
      refreshSession: false,
      accessToken: null,
      refreshToken: null,
    });
    expect(shouldRefreshSessionAfterSuccessfulMfa(null)).toBe(true);
  });
});

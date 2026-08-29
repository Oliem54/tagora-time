import { describe, expect, it } from "vitest";
import {
  canPersistAppModuleCookie,
  resolveFreshLoginDestination,
  resolveFreshSessionAccess,
} from "@/app/lib/auth/mfa-fresh-session.shared";
import {
  isMfaProtectedAppPath,
  isStagingQaMfaBypassAllowed,
  resolveMandatoryMfaGateFromAssessment,
  shouldBlockJwtAal1ForMandatoryMfaRole,
  STAGING_QA_SUPABASE_PROJECT_REF,
} from "@/app/lib/auth/mfa.shared";
import { classifyMfaVerifyDenial, shouldRefreshSessionAfterSuccessfulMfa } from "@/app/lib/auth/mfa-verify-session.shared";

const STAGING_SUPABASE_URL = `https://${STAGING_QA_SUPABASE_PROJECT_REF}.supabase.co`;
const PREVIEW_HOST = "tagora-time-nbng30hpr-oliem54s-projects.vercel.app";

describe("fresh login MFA enforcement", () => {
  it("sends a fresh AAL1 login to MFA verify, not the dashboard", () => {
    expect(
      resolveFreshLoginDestination({
        role: "admin",
        jwtAal: "aal1",
        hasVerifiedMfa: true,
      })
    ).toBe("/auth/mfa/verify");
    expect(
      resolveFreshSessionAccess({
        hasSession: true,
        jwtAal: "aal1",
        role: "direction",
        membershipAuthorized: true,
        areaRole: "direction",
        hasVerifiedMfa: true,
      })
    ).toBe("mfa_verify");
  });

  it("refuses an absent session", () => {
    expect(
      resolveFreshSessionAccess({
        hasSession: false,
        jwtAal: null,
        role: null,
        membershipAuthorized: false,
        areaRole: "admin",
        hasVerifiedMfa: false,
      })
    ).toBe("login");
  });

  it("blocks AAL1 from protected routes and APIs on Vercel Preview", () => {
    expect(isMfaProtectedAppPath("/admin/dashboard")).toBe(true);
    expect(isMfaProtectedAppPath("/direction/dashboard")).toBe(true);
    expect(isMfaProtectedAppPath("/auth/mfa/verify")).toBe(false);
    expect(isMfaProtectedAppPath("/direction/login")).toBe(false);
    expect(
      shouldBlockJwtAal1ForMandatoryMfaRole({
        role: "admin",
        isExplicitlyAal1Only: true,
        hostname: PREVIEW_HOST,
        supabaseUrl: STAGING_SUPABASE_URL,
      })
    ).toBe(true);
    expect(canPersistAppModuleCookie("aal1")).toBe(false);
  });

  it("upgrades a valid MFA session to AAL2 and persists the module cookie", () => {
    expect(
      resolveFreshSessionAccess({
        hasSession: true,
        jwtAal: "aal2",
        role: "admin",
        membershipAuthorized: true,
        areaRole: "admin",
        hasVerifiedMfa: true,
      })
    ).toBe("dashboard");
    expect(canPersistAppModuleCookie("aal2")).toBe(true);
    expect(shouldRefreshSessionAfterSuccessfulMfa("aal2-access-token")).toBe(false);
  });

  it("keeps the post-MFA redirect on the dashboard instead of looping to login", () => {
    expect(
      resolveFreshLoginDestination({
        role: "admin",
        jwtAal: "aal2",
        hasVerifiedMfa: true,
      })
    ).toBe("/admin/dashboard");
  });

  it("denies wrong, expired and replayed MFA codes", () => {
    expect(classifyMfaVerifyDenial({ code: "mfa_verification_failed" })).toBe("wrong_code");
    expect(classifyMfaVerifyDenial({ code: "mfa_challenge_expired" })).toBe("expired_code");
    expect(
      classifyMfaVerifyDenial({
        code: "mfa_challenge_already_verified",
        message: "Challenge has already been used.",
      })
    ).toBe("replayed_code");
  });

  it("denies the wrong role and the wrong tenant", () => {
    expect(
      resolveFreshSessionAccess({
        hasSession: true,
        jwtAal: "aal2",
        role: "employe",
        membershipAuthorized: true,
        areaRole: "admin",
        hasVerifiedMfa: false,
      })
    ).toBe("wrong_role");
    expect(
      resolveFreshSessionAccess({
        hasSession: true,
        jwtAal: "aal1",
        role: "admin",
        membershipAuthorized: false,
        areaRole: "admin",
        hasVerifiedMfa: true,
      })
    ).toBe("wrong_tenant");
  });

  it("fails closed when AAL assessment is missing instead of granting the dashboard", () => {
    expect(
      resolveMandatoryMfaGateFromAssessment({
        role: "admin",
        bypassAllowed: false,
        hasVerifiedMfa: true,
        factorAssessmentFailed: false,
        jwtAal: "aal1",
        currentAal: null,
        aalAssessmentFailed: true,
      })
    ).toEqual({ kind: "verify" });
  });

  it("does not bypass MFA on a Vercel Preview hostname", () => {
    expect(
      isStagingQaMfaBypassAllowed({
        role: "admin",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: PREVIEW_HOST,
      })
    ).toBe(false);
  });
});

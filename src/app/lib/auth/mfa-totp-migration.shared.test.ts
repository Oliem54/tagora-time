import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { roleRequiresMandatoryMfa } from "@/app/lib/auth/mfa.shared";
import {
  canRemovePhoneFactor,
  describeTotpEnrollError,
  phoneVerificationBeforeTotpEnrollPath,
  resolveLoginMfaFactorMode,
  resolveTotpEnrollmentGate,
  TOTP_ENROLL_REQUIRES_PHONE_AAL2,
} from "@/app/lib/auth/mfa-totp-migration.shared";

describe("HORORA MFA phone to TOTP preparation", () => {
  it("asks the user to choose when phone and TOTP are both verified", () => {
    expect(
      resolveLoginMfaFactorMode({ hasVerifiedPhone: true, hasVerifiedTotp: true })
    ).toBe("choose");
  });

  it("keeps phone-only login on the texto factor", () => {
    expect(
      resolveLoginMfaFactorMode({ hasVerifiedPhone: true, hasVerifiedTotp: false })
    ).toBe("phone");
  });

  it("uses TOTP alone when the phone factor is absent", () => {
    expect(
      resolveLoginMfaFactorMode({ hasVerifiedPhone: false, hasVerifiedTotp: true })
    ).toBe("totp");
  });

  it("sends an account with no verified factor to setup", () => {
    expect(
      resolveLoginMfaFactorMode({ hasVerifiedPhone: false, hasVerifiedTotp: false })
    ).toBe("setup");
  });

  it("blocks individual phone removal until a TOTP factor is verified", () => {
    expect(canRemovePhoneFactor({ factorType: "phone", hasVerifiedTotp: false })).toEqual({
      allowed: false,
      reason: "Ajoutez et vérifiez une application Authenticator avant de retirer le texto.",
    });
    expect(canRemovePhoneFactor({ factorType: "phone", hasVerifiedTotp: true })).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("does not block removal of a non-phone factor", () => {
    expect(canRemovePhoneFactor({ factorType: "totp", hasVerifiedTotp: true }).allowed).toBe(
      true
    );
  });

  it("keeps AAL2 mandatory for administrator and direction", () => {
    expect(roleRequiresMandatoryMfa("admin")).toBe(true);
    expect(roleRequiresMandatoryMfa("direction")).toBe(true);
    expect(roleRequiresMandatoryMfa("employe")).toBe(false);
  });

  it("requires the phone factor to reach AAL2 before Authenticator enrollment", () => {
    expect(
      resolveTotpEnrollmentGate({
        hasVerifiedPhone: true,
        hasVerifiedTotp: false,
        currentAal: "aal1",
      })
    ).toEqual({ action: "verify_phone_first" });
    expect(
      resolveTotpEnrollmentGate({
        hasVerifiedPhone: true,
        hasVerifiedTotp: false,
        currentAal: null,
      })
    ).toEqual({ action: "verify_phone_first" });
    expect(
      resolveTotpEnrollmentGate({
        hasVerifiedPhone: true,
        hasVerifiedTotp: false,
        currentAal: "aal2",
      })
    ).toEqual({ action: "enroll_keep_phone" });
  });

  it("keeps the explicit factor choice when phone and TOTP are already verified", () => {
    expect(
      resolveTotpEnrollmentGate({
        hasVerifiedPhone: true,
        hasVerifiedTotp: true,
        currentAal: "aal1",
      })
    ).toEqual({ action: "verify_phone_first" });
    expect(
      resolveTotpEnrollmentGate({
        hasVerifiedPhone: true,
        hasVerifiedTotp: true,
        currentAal: "aal2",
      })
    ).toEqual({ action: "already_has_both" });
    expect(
      resolveLoginMfaFactorMode({ hasVerifiedPhone: true, hasVerifiedTotp: true })
    ).toBe("choose");
  });

  it("sends an insufficient_aal enrollment error back to phone verification", () => {
    expect(describeTotpEnrollError("insufficient_aal", "raw supabase error")).toBe(
      TOTP_ENROLL_REQUIRES_PHONE_AAL2
    );
    expect(describeTotpEnrollError(undefined, "raw", "AAL2 required: insufficient_aal")).toBe(
      TOTP_ENROLL_REQUIRES_PHONE_AAL2
    );
    expect(TOTP_ENROLL_REQUIRES_PHONE_AAL2).toContain("sans retirer le texto");
    expect(describeTotpEnrollError("mfa_challenge_expired", "Code invalide.")).toBe(
      "Code invalide."
    );
    expect(phoneVerificationBeforeTotpEnrollPath()).toBe(
      "/auth/mfa/verify?next=%2Fauth%2Fmfa%2Fsetup%3Fmethod%3Dtotp"
    );
  });

  it("does not offer Authenticator enrollment on the phone challenge before AAL2", () => {
    const verify = readFileSync(
      join(process.cwd(), "src/app/auth/mfa/verify/page.tsx"),
      "utf8"
    );
    const setup = readFileSync(
      join(process.cwd(), "src/app/auth/mfa/setup/page.tsx"),
      "utf8"
    );
    expect(verify).toContain("resolveTotpEnrollmentGate");
    expect(verify).toContain("authenticatorOfferHref");
    expect(verify).not.toContain('mode === "phone" && phoneFactorId && !totpFactorId');
    expect(verify.indexOf("authenticatorOfferHref")).toBeLessThan(
      verify.indexOf("Ajouter une application Authenticator sans retirer le texto")
    );
    expect(setup).toContain("verify_phone_first");
    expect(setup).toContain("describeTotpEnrollError");
    expect(setup).not.toContain("unenrollMfaFactor");
  });
});

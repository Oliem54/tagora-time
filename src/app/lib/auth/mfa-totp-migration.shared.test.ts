import { describe, expect, it } from "vitest";
import { roleRequiresMandatoryMfa } from "@/app/lib/auth/mfa.shared";
import {
  canRemovePhoneFactor,
  resolveLoginMfaFactorMode,
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
});

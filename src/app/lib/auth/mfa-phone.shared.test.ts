import { describe, expect, it } from "vitest";
import {
  buildMfaPhoneFactorMismatchMessage,
  mfaPhonesMatch,
  normalizeMfaPhoneForCompare,
  normalizePhoneToE164,
} from "@/app/lib/auth/mfa-phone.shared";

describe("normalizeMfaPhoneForCompare", () => {
  it.each([
    ["14188701784", "14188701784"],
    ["+14188701784", "14188701784"],
    ["4188701784", "14188701784"],
    ["(418) 870-1784", "14188701784"],
    ["14184073370", "14184073370"],
    ["4184073370", "14184073370"],
  ])("normalise %s vers %s", (input, expected) => {
    expect(normalizeMfaPhoneForCompare(input)).toBe(expected);
  });
});

describe("mfaPhonesMatch", () => {
  it("considère équivalents des formats différents du même numéro", () => {
    expect(mfaPhonesMatch("+14188701784", "4188701784")).toBe(true);
    expect(mfaPhonesMatch("+14188701784", "14188701784")).toBe(true);
    expect(mfaPhonesMatch("+14188701784", "(418) 870-1784")).toBe(true);
  });

  it("rejette des numéros différents", () => {
    expect(mfaPhonesMatch("+14188701784", "14184073370")).toBe(false);
    expect(mfaPhonesMatch("+14188701784", "4184073370")).toBe(false);
  });
});

describe("buildMfaPhoneFactorMismatchMessage", () => {
  it("affiche seulement les 4 derniers chiffres", () => {
    const message = buildMfaPhoneFactorMismatchMessage("4188701784", "14184073370");
    expect(message).toContain("····1784");
    expect(message).toContain("····3370");
    expect(message).toContain("aucun SMS n’a été envoyé");
    expect(message).not.toContain("4188701784");
    expect(message).not.toContain("4184073370");
  });
});

describe("normalizePhoneToE164 integration", () => {
  it("normalise 4188701784 vers +14188701784", () => {
    const result = normalizePhoneToE164("4188701784");
    expect(result).toEqual({ ok: true, e164: "+14188701784" });
  });
});

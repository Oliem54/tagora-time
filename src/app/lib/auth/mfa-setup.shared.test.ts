import { describe, expect, it } from "vitest";
import { resolveEnsureUnverifiedPhoneFactor } from "@/app/lib/auth/mfa-setup.shared";

const pendingFactor = {
  id: "d63d489e-2b1f-4df5-94b1-b0fbbd4bc097",
  factor_type: "phone",
  status: "unverified",
  phone: "14184073370",
};

describe("resolveEnsureUnverifiedPhoneFactor", () => {
  it("bloque le cache si le facteur verrouillé ne correspond plus au numéro demandé", () => {
    const result = resolveEnsureUnverifiedPhoneFactor({
      requestedE164: "+14188701784",
      cachedFactorId: pendingFactor.id,
      cachedLockedE164: "+14188701784",
      enrolledFactorId: null,
      enrollErrorCode: undefined,
      enrollErrorMessage: "",
      listedFactors: [pendingFactor],
    });

    expect(result.kind).toBe("mismatch");
  });

  it("réutilise le cache quand le numéro verrouillé correspond", () => {
    const result = resolveEnsureUnverifiedPhoneFactor({
      requestedE164: "+14188701784",
      cachedFactorId: "cached-factor",
      cachedLockedE164: "+14188701784",
      enrolledFactorId: null,
      enrollErrorCode: undefined,
      enrollErrorMessage: "",
      listedFactors: [
        {
          id: "cached-factor",
          factor_type: "phone",
          status: "unverified",
          phone: "14188701784",
        },
      ],
    });

    expect(result).toEqual({
      kind: "ok",
      factorId: "cached-factor",
      source: "cached",
    });
  });

  it("réutilise un facteur unverified quand le numéro correspond", () => {
    const matchingFactor = { ...pendingFactor, phone: "14188701784" };
    const result = resolveEnsureUnverifiedPhoneFactor({
      requestedE164: "+14188701784",
      cachedFactorId: null,
      cachedLockedE164: null,
      enrolledFactorId: null,
      enrollErrorCode: "too_many_enrolled_mfa_factors",
      enrollErrorMessage: "already exists",
      listedFactors: [matchingFactor],
    });

    expect(result).toEqual({
      kind: "ok",
      factorId: matchingFactor.id,
      source: "pending",
    });
  });

  it("bloque quand le facteur unverified ne correspond pas au numéro demandé", () => {
    const result = resolveEnsureUnverifiedPhoneFactor({
      requestedE164: "+14188701784",
      cachedFactorId: null,
      cachedLockedE164: null,
      enrolledFactorId: null,
      enrollErrorCode: "too_many_enrolled_mfa_factors",
      enrollErrorMessage: "already exists",
      listedFactors: [pendingFactor],
    });

    expect(result.kind).toBe("mismatch");
    if (result.kind === "mismatch") {
      expect(result.pendingFactorId).toBe(pendingFactor.id);
      expect(result.error).toContain("····1784");
      expect(result.error).toContain("····3370");
      expect(result.error).toContain("aucun SMS n’a été envoyé");
    }
  });

  it("enrôle normalement quand aucun facteur unverified n'existe", () => {
    const result = resolveEnsureUnverifiedPhoneFactor({
      requestedE164: "+14188701784",
      cachedFactorId: null,
      cachedLockedE164: null,
      enrolledFactorId: "new-factor-id",
      enrollErrorCode: undefined,
      enrollErrorMessage: "",
      listedFactors: [],
    });

    expect(result).toEqual({
      kind: "ok",
      factorId: "new-factor-id",
      source: "enrolled",
    });
  });

  it("retourne une erreur d'enrôlement si enroll échoue sans facteur pending", () => {
    const result = resolveEnsureUnverifiedPhoneFactor({
      requestedE164: "+14188701784",
      cachedFactorId: null,
      cachedLockedE164: null,
      enrolledFactorId: null,
      enrollErrorCode: "phone_provider_disabled",
      enrollErrorMessage: "disabled",
      listedFactors: [],
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toContain("texto est désactivé");
    }
  });
});

import {
  buildMfaPhoneFactorMismatchMessage,
  describeSupabaseMfaPhoneError,
  mfaPhonesMatch,
  mfaPhoneLast4,
} from "@/app/lib/auth/mfa-phone.shared";

export type MfaPhoneFactorRow = {
  id: string;
  factor_type: string;
  status: string;
  phone?: string | null;
};

export type EnsureUnverifiedPhoneFactorResolution =
  | { kind: "ok"; factorId: string; source: "cached" | "enrolled" | "pending" }
  | {
      kind: "mismatch";
      error: string;
      pendingFactorId: string;
      pendingFactorPhone: string | null;
    }
  | { kind: "error"; error: string };

export function maskMfaFactorIdForLog(factorId: string): string {
  const t = factorId.trim();
  if (t.length <= 12) {
    return "…";
  }
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

export function maskEmailForLog(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) {
    return null;
  }
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return null;
  }
  const maskedLocal = local.length <= 1 ? "*" : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

export function buildMfaPhoneFactorMismatchLog(params: {
  requestedE164: string;
  factorPhone: string | null | undefined;
  factorId: string;
  userEmail?: string | null;
}) {
  return {
    event: "mfa_phone_factor_mismatch" as const,
    currentInputLast4: mfaPhoneLast4(params.requestedE164),
    factorPhoneLast4: mfaPhoneLast4(params.factorPhone),
    factorId: maskMfaFactorIdForLog(params.factorId),
    userEmail: maskEmailForLog(params.userEmail),
  };
}

export function resolveEnsureUnverifiedPhoneFactor(params: {
  requestedE164: string;
  cachedFactorId: string | null;
  cachedLockedE164: string | null;
  enrolledFactorId: string | null;
  enrollErrorCode: string | undefined;
  enrollErrorMessage: string;
  listedFactors: MfaPhoneFactorRow[];
}): EnsureUnverifiedPhoneFactorResolution {
  const {
    requestedE164,
    cachedFactorId,
    cachedLockedE164,
    enrolledFactorId,
    enrollErrorCode,
    enrollErrorMessage,
    listedFactors,
  } = params;

  if (cachedFactorId && cachedLockedE164 === requestedE164) {
    const cachedFactor = listedFactors.find((f) => f.id === cachedFactorId);
    if (
      cachedFactor?.factor_type === "phone" &&
      cachedFactor.status === "unverified" &&
      !mfaPhonesMatch(requestedE164, cachedFactor.phone)
    ) {
      return {
        kind: "mismatch",
        error: buildMfaPhoneFactorMismatchMessage(requestedE164, cachedFactor.phone),
        pendingFactorId: cachedFactor.id,
        pendingFactorPhone: cachedFactor.phone ?? null,
      };
    }
    return { kind: "ok", factorId: cachedFactorId, source: "cached" };
  }

  if (enrolledFactorId) {
    return { kind: "ok", factorId: enrolledFactorId, source: "enrolled" };
  }

  const pending = listedFactors.find(
    (f) => f.factor_type === "phone" && f.status === "unverified"
  );
  if (pending) {
    if (mfaPhonesMatch(requestedE164, pending.phone)) {
      return { kind: "ok", factorId: pending.id, source: "pending" };
    }
    return {
      kind: "mismatch",
      error: buildMfaPhoneFactorMismatchMessage(requestedE164, pending.phone),
      pendingFactorId: pending.id,
      pendingFactorPhone: pending.phone ?? null,
    };
  }

  return {
    kind: "error",
    error: describeSupabaseMfaPhoneError(
      enrollErrorCode,
      enrollErrorMessage || "Impossible d’enregistrer ce numéro pour le MFA."
    ),
  };
}

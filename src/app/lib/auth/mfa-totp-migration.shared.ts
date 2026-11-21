/**
 * Préparation locale du passage MFA Phone payant → TOTP Supabase inclus.
 * Aucune de ces fonctions ne retire un facteur ni n'appelle Supabase.
 */

export type LoginMfaFactorMode = "setup" | "phone" | "totp" | "choose";

export type AssuranceLevel = "aal1" | "aal2" | null;

export type TotpEnrollmentGate =
  | { action: "verify_phone_first" }
  | { action: "enroll_keep_phone" }
  | { action: "already_has_both" }
  | { action: "enroll_without_phone" };

export const PHONE_REMOVAL_BLOCKED_UNTIL_TOTP =
  "Ajoutez et vérifiez une application Authenticator avant de retirer le texto.";

export const TOTP_ENROLL_REQUIRES_PHONE_AAL2 =
  "Vérifiez d’abord le code reçu par texto. L’application Authenticator s’ajoute ensuite, sans retirer le texto.";

export const TOTP_SETUP_PATH = "/auth/mfa/setup?method=totp";

export function resolveLoginMfaFactorMode(input: {
  hasVerifiedPhone: boolean;
  hasVerifiedTotp: boolean;
}): LoginMfaFactorMode {
  if (input.hasVerifiedPhone && input.hasVerifiedTotp) {
    return "choose";
  }
  if (input.hasVerifiedTotp) {
    return "totp";
  }
  if (input.hasVerifiedPhone) {
    return "phone";
  }
  return "setup";
}

export function resolveTotpEnrollmentGate(input: {
  hasVerifiedPhone: boolean;
  hasVerifiedTotp: boolean;
  currentAal: AssuranceLevel;
}): TotpEnrollmentGate {
  if (input.hasVerifiedPhone && input.currentAal !== "aal2") {
    return { action: "verify_phone_first" };
  }
  if (input.hasVerifiedPhone && input.hasVerifiedTotp) {
    return { action: "already_has_both" };
  }
  if (input.hasVerifiedPhone) {
    return { action: "enroll_keep_phone" };
  }
  return { action: "enroll_without_phone" };
}

export function phoneVerificationBeforeTotpEnrollPath(): string {
  const params = new URLSearchParams();
  params.set("next", TOTP_SETUP_PATH);
  return `/auth/mfa/verify?${params.toString()}`;
}

export function isInsufficientAalError(
  code: string | null | undefined,
  message?: string | null
): boolean {
  if (code === "insufficient_aal") {
    return true;
  }
  return (message ?? "").toLowerCase().includes("insufficient_aal");
}

export function describeTotpEnrollError(
  code: string | null | undefined,
  fallback: string,
  message?: string | null
): string {
  if (isInsufficientAalError(code, message)) {
    return TOTP_ENROLL_REQUIRES_PHONE_AAL2;
  }
  return fallback;
}

export function canRemovePhoneFactor(input: {
  factorType: string;
  hasVerifiedTotp: boolean;
}): { allowed: boolean; reason: string | null } {
  if (input.factorType !== "phone") {
    return { allowed: true, reason: null };
  }
  if (!input.hasVerifiedTotp) {
    return { allowed: false, reason: PHONE_REMOVAL_BLOCKED_UNTIL_TOTP };
  }
  return { allowed: true, reason: null };
}

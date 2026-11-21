/**
 * Préparation locale du passage MFA Phone payant → TOTP Supabase inclus.
 * Aucune de ces fonctions ne retire un facteur ni n'appelle Supabase.
 */

export type LoginMfaFactorMode = "setup" | "phone" | "totp" | "choose";

export const PHONE_REMOVAL_BLOCKED_UNTIL_TOTP =
  "Ajoutez et vérifiez une application Authenticator avant de retirer le texto.";

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

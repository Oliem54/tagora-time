/** Normalise un numéro saisi vers E.164 minimal (sans libphonenumber). */

export type NormalizePhoneResult =
  | { ok: true; e164: string }
  | { ok: false; message: string };

export function normalizePhoneToE164(raw: string): NormalizePhoneResult {
  const t = raw.trim();
  if (!t) {
    return { ok: false, message: "Entrez un numéro de téléphone." };
  }

  const digitsOnly = (s: string) => s.replace(/\D/g, "");

  if (t.startsWith("+")) {
    const body = digitsOnly(t.slice(1));
    if (body.length < 8 || body.length > 15) {
      return {
        ok: false,
        message: "Numéro international invalide (longueur incorrecte).",
      };
    }
    if (!/^[1-9]/.test(body)) {
      return {
        ok: false,
        message: "L’indicatif pays doit commencer par un chiffre autre que 0.",
      };
    }
    const e164 = `+${body}`;
    if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
      return {
        ok: false,
        message: "Format international invalide (ex. +15819912047).",
      };
    }
    return { ok: true, e164 };
  }

  let body = digitsOnly(t);
  if (body.length === 10) {
    body = `1${body}`;
  }
  if (body.length >= 8 && body.length <= 15 && /^[1-9]/.test(body)) {
    const e164 = `+${body}`;
    if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
      return {
        ok: false,
        message: "Numéro invalide après normalisation.",
      };
    }
    return { ok: true, e164 };
  }

  return {
    ok: false,
    message:
      "Utilisez le format international avec « + » et l’indicatif pays (ex. +15819912047). Pour un numéro nord-américain à 10 chiffres, vous pouvez omettre le « + » : nous ajoutons +1 automatiquement.",
  };
}

export function describeSupabaseMfaPhoneError(code: string | undefined, fallbackMessage: string): string {
  switch (code) {
    case "mfa_phone_enroll_not_enabled":
    case "mfa_phone_verify_not_enabled":
      return "La vérification par texto n’est pas encore configurée sur le serveur d’authentification. Contactez l’administrateur.";
    case "phone_provider_disabled":
      return "L’envoi de texto est désactivé pour ce projet. Contactez l’administrateur.";
    case "mfa_verification_failed":
    case "mfa_challenge_expired":
      return "Code invalide ou expiré. Demandez un nouveau code.";
    case "mfa_verified_factor_exists":
      return "Un facteur MFA vérifié existe déjà pour ce compte.";
    case "too_many_enrolled_mfa_factors":
      return "Nombre maximal de facteurs MFA atteint. Retirez un facteur existant dans la sécurité du compte.";
    default:
      return fallbackMessage;
  }
}

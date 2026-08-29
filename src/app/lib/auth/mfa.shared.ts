import type { AppRole } from "@/app/lib/auth/roles";
import {
  isCanonicalProductionHostname,
  isCanonicalStagingHostname,
  isLocalHostname,
  isVercelPreviewHostname,
  normalizeHostname,
} from "@/app/lib/canonical-domains";

/** Phase 1 : MFA obligatoire pour ces rôles (SMS recommandé ; TOTP option avancé). */
export const MFA_REQUIRED_ROLES = ["admin", "direction"] as const satisfies readonly AppRole[];

/** Supabase staging utilisé pour la QA preview PR #45 — bypass MFA strictement limité à ce projet. */
export const STAGING_QA_SUPABASE_PROJECT_REF = "qokyobcvplzufshydhih";

export function roleRequiresMandatoryMfa(role: AppRole | null | undefined): boolean {
  return role === "admin" || role === "direction";
}

/**
 * Production TAGORA Time (DEC-015) : uniquement `time.tagora.ca`.
 * `app.tagora.ca` (Nexus), staging Time et sous-domaines inconnus ne sont pas Production.
 */
export function isProductionTagoraHostname(hostname: string | null | undefined): boolean {
  return isCanonicalProductionHostname(hostname);
}

/**
 * Environnements non-production autorisés pour le bypass MFA QA :
 * localhost, previews Vercel, et staging Time canonique.
 */
export function isStagingPreviewHostname(hostname: string | null | undefined): boolean {
  if (!normalizeHostname(hostname)) {
    return false;
  }
  if (isCanonicalProductionHostname(hostname)) {
    return false;
  }
  if (isCanonicalStagingHostname(hostname)) {
    return true;
  }
  if (isLocalHostname(hostname)) {
    return true;
  }
  return isVercelPreviewHostname(hostname);
}

/** QA locale / staging Time uniquement pour le bypass MFA. Les previews Vercel restent fail-closed. */
export function readConfiguredSupabasePublicUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** Hostname HTTP(S) sans port — priorité aux en-têtes proxy (Vercel preview). */
export function readRequestHostname(
  headers: Headers,
  fallbackHostname?: string | null
): string | null {
  const forwardedHost = headers.get("x-forwarded-host");
  if (forwardedHost) {
    const first = forwardedHost.split(",")[0]?.trim().toLowerCase();
    if (first) {
      return first.split(":")[0]?.trim() || null;
    }
  }

  const host = headers.get("host");
  if (host) {
    return host.split(":")[0]?.trim().toLowerCase() || null;
  }

  const fallback = String(fallbackHostname ?? "")
    .trim()
    .toLowerCase();
  return fallback || null;
}

export function isStagingQaMfaBypassAllowed(options: {
  role: AppRole | null | undefined;
  supabaseUrl: string | null | undefined;
  hostname: string | null | undefined;
}): boolean {
  if (!roleRequiresMandatoryMfa(options.role)) {
    return false;
  }

  const supabaseUrl = String(options.supabaseUrl ?? "")
    .trim()
    .toLowerCase();
  if (!supabaseUrl.includes(STAGING_QA_SUPABASE_PROJECT_REF)) {
    return false;
  }

  const hostname = options.hostname;
  // Vérifications spécifiques avant règles génériques (DEC-015).
  if (isCanonicalProductionHostname(hostname)) {
    return false;
  }
  if (isCanonicalStagingHostname(hostname)) {
    return true;
  }

  // Local QA + canonical Time staging only. Vercel Preview must enforce MFA
  // for real-user security retests (fresh AAL1 session).
  return isLocalHostname(hostname);
}

/** Garde-fou serveur/API : bloquer admin/direction en JWT aal1 sauf bypass staging/preview QA. */
export function shouldBlockJwtAal1ForMandatoryMfaRole(options: {
  role: AppRole | null | undefined;
  isExplicitlyAal1Only: boolean;
  hostname: string | null | undefined;
  supabaseUrl?: string | null | undefined;
}): boolean {
  if (!options.isExplicitlyAal1Only) {
    return false;
  }

  if (!roleRequiresMandatoryMfa(options.role)) {
    return false;
  }

  return !isStagingQaMfaBypassAllowed({
    role: options.role,
    supabaseUrl: options.supabaseUrl ?? readConfiguredSupabasePublicUrl(),
    hostname: options.hostname,
  });
}

export function isAuthMfaPath(pathname: string): boolean {
  return (
    pathname === "/auth/mfa/setup" ||
    pathname === "/auth/mfa/verify" ||
    pathname.startsWith("/auth/mfa/")
  );
}

export function isMfaProtectedAppPath(pathname: string): boolean {
  if (isAuthMfaPath(pathname)) {
    return false;
  }
  if (
    pathname === "/direction" ||
    pathname === "/direction/login" ||
    pathname === "/login" ||
    pathname === "/connexion" ||
    pathname === "/employe/login"
  ) {
    return false;
  }
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/direction/") ||
    pathname.startsWith("/account")
  );
}

export type MandatoryMfaGateKind = "none" | "setup" | "verify";

export function resolveMandatoryMfaGateFromAssessment(input: {
  role: AppRole | null | undefined;
  bypassAllowed: boolean;
  hasVerifiedMfa: boolean;
  factorAssessmentFailed: boolean;
  jwtAal: "aal1" | "aal2" | null;
  currentAal: "aal1" | "aal2" | null;
  aalAssessmentFailed: boolean;
}): { kind: MandatoryMfaGateKind; message?: string } {
  if (!roleRequiresMandatoryMfa(input.role)) {
    return { kind: "none" };
  }

  if (input.bypassAllowed) {
    return { kind: "none" };
  }

  // AAL2 on the JWT or assurance API is the only proof of a completed step-up.
  // Missing/failed assessments stay on verify instead of granting the dashboard.
  if (input.jwtAal === "aal2" || input.currentAal === "aal2") {
    return { kind: "none" };
  }

  if (!input.hasVerifiedMfa && !input.factorAssessmentFailed) {
    return {
      kind: "setup",
      message:
        "Votre rôle exige la vérification en deux étapes. Configurez-la pour continuer.",
    };
  }

  return { kind: "verify" };
}

export function resolvePostLoginPathFromMfaGate(
  gateKind: MandatoryMfaGateKind,
  homePath: string
): string {
  if (gateKind === "setup") {
    return "/auth/mfa/setup?required=1";
  }
  if (gateKind === "verify") {
    return "/auth/mfa/verify";
  }
  return homePath;
}

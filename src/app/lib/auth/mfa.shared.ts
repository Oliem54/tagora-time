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

/** QA preview uniquement : admin/direction + Supabase staging + hôte local ou Vercel preview (jamais tagora.ca). */
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

  return isStagingPreviewHostname(hostname);
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

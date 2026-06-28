import type { AppRole } from "@/app/lib/auth/roles";

/** Phase 1 : MFA obligatoire pour ces rôles (SMS recommandé ; TOTP option avancé). */
export const MFA_REQUIRED_ROLES = ["admin", "direction"] as const satisfies readonly AppRole[];

/** Supabase staging utilisé pour la QA preview PR #45 — bypass MFA strictement limité à ce projet. */
export const STAGING_QA_SUPABASE_PROJECT_REF = "qokyobcvplzufshydhih";

export function roleRequiresMandatoryMfa(role: AppRole | null | undefined): boolean {
  return role === "admin" || role === "direction";
}

export function isProductionTagoraHostname(hostname: string | null | undefined): boolean {
  const host = String(hostname ?? "")
    .trim()
    .toLowerCase();
  if (!host) {
    return false;
  }
  return host === "tagora.ca" || host.endsWith(".tagora.ca");
}

export function isStagingPreviewHostname(hostname: string | null | undefined): boolean {
  const host = String(hostname ?? "")
    .trim()
    .toLowerCase();
  if (!host) {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1") {
    return true;
  }
  return host.endsWith(".vercel.app");
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
  if (isProductionTagoraHostname(hostname)) {
    return false;
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

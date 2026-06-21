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

export function isAuthMfaPath(pathname: string): boolean {
  return (
    pathname === "/auth/mfa/setup" ||
    pathname === "/auth/mfa/verify" ||
    pathname.startsWith("/auth/mfa/")
  );
}

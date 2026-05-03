import type { AppRole } from "@/app/lib/auth/roles";

/** Phase 1 : MFA obligatoire pour ces rôles (SMS recommandé ; TOTP option avancé). */
export const MFA_REQUIRED_ROLES = ["admin", "direction"] as const satisfies readonly AppRole[];

export function roleRequiresMandatoryMfa(role: AppRole | null | undefined): boolean {
  return role === "admin" || role === "direction";
}

export function isAuthMfaPath(pathname: string): boolean {
  return (
    pathname === "/auth/mfa/setup" ||
    pathname === "/auth/mfa/verify" ||
    pathname.startsWith("/auth/mfa/")
  );
}

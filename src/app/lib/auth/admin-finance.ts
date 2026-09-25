import type { User } from "@supabase/supabase-js";
import { getUserRole, type AppRole } from "@/app/lib/auth/roles";
import type { AppPermission } from "@/app/lib/auth/permissions";

/**
 * Permission code pour paie, remuneration, commissions et donnees confidentielles.
 * Phase 1 : accordee uniquement au role admin dans le code (pas de changement JWT prod).
 * Alias historique pour les prochaines phases.
 */
export const ADMIN_FINANCE_PERMISSION = "admin_finance" as const;
export const PAYROLL_FINANCE_PERMISSION = ADMIN_FINANCE_PERMISSION;

export type AdminFinancePermission = typeof ADMIN_FINANCE_PERMISSION;

/** Routes Admin dediees aux modules financiers (phase 1). */
export const CANONICAL_ADMIN_COMMISSIONS_PATH = "/admin/commissions";

export const ADMIN_FINANCE_ROUTE_PREFIXES = [
  "/admin/paie",
  "/admin/paie-compagnies",
  "/admin/temps-titan-finance",
  "/admin/facturation-titan",
  "/admin/commissions",
  "/admin/compensation",
  "/admin/remuneration",
] as const;

export function isAdminFinancePath(pathname: string): boolean {
  return ADMIN_FINANCE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Acces finance (montants, commissions, remuneration).
 * Nexus / H4 `admin` is authoritative. JWT `admin` remains valid when no
 * effective membership role is supplied. Direction and employe never inherit
 * dollar-level finance from a stale JWT admin claim.
 */
export function hasAdminFinanceAccess(
  user: User | null | undefined,
  effectiveRole?: AppRole | null
): boolean {
  if (!user) {
    return false;
  }
  if (effectiveRole === "admin") {
    return true;
  }
  if (effectiveRole === "direction" || effectiveRole === "employe") {
    return false;
  }
  return getUserRole(user) === "admin";
}

/** Ecrans *FinancePage : admin ou permission terrain (Direction). */
export function hasFinanceModuleAccess(
  user: User | null | undefined,
  hasPermission: (permission: AppPermission) => boolean,
  effectiveRole?: AppRole | null
): boolean {
  if (!user) return false;
  if (hasAdminFinanceAccess(user, effectiveRole)) return true;
  return hasPermission("terrain");
}

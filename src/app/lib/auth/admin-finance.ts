import type { User } from "@supabase/supabase-js";
import { getUserRole } from "@/app/lib/auth/roles";

/**
 * Permission code pour paie, remuneration, commissions et donnees confidentielles.
 * Phase 1 : accordee uniquement au role admin dans le code (pas de changement JWT prod).
 * Alias historique pour les prochaines phases.
 */
export const ADMIN_FINANCE_PERMISSION = "admin_finance" as const;
export const PAYROLL_FINANCE_PERMISSION = ADMIN_FINANCE_PERMISSION;

export type AdminFinancePermission = typeof ADMIN_FINANCE_PERMISSION;

/** Routes Admin dediees aux modules financiers (phase 1). */
export const ADMIN_FINANCE_ROUTE_PREFIXES = [
  "/admin/paie",
  "/admin/paie-compagnies",
  "/admin/temps-titan-finance",
  "/admin/facturation-titan",
  "/admin/commissions",
  "/admin/remuneration",
] as const;

export function isAdminFinancePath(pathname: string): boolean {
  return ADMIN_FINANCE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Acces finance : role admin uniquement (phase 1, sans JWT prod). */
export function hasAdminFinanceAccess(user: User | null | undefined): boolean {
  return getUserRole(user) === "admin";
}

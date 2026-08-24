import type { User } from "@supabase/supabase-js";
import {
  ADMIN_FINANCE_PERMISSION,
  hasAdminFinanceAccess,
  isAdminFinancePath,
} from "@/app/lib/auth/admin-finance";
import type { AppRole } from "@/app/lib/auth/roles";
import { getUserRole } from "@/app/lib/auth/roles";

export const APP_PERMISSION_DEFINITIONS = [
  {
    value: "documents",
    label: "Documents",
    module: "documents",
    description: "Acces aux documents terrain, medias et confirmations.",
    sortOrder: 10,
  },
  {
    value: "dossiers",
    label: "Dossiers",
    module: "dossiers",
    description: "Acces aux dossiers terrain et a leurs notes.",
    sortOrder: 20,
  },
  {
    value: "terrain",
    label: "Terrain",
    module: "terrain",
    description: "Acces aux sorties terrain et operations reliees.",
    sortOrder: 30,
  },
  {
    value: "livraisons",
    label: "Livraisons",
    module: "livraisons",
    description: "Acces a la planification et au suivi des livraisons.",
    sortOrder: 40,
  },
  {
    value: "ressources",
    label: "Ressources",
    module: "ressources",
    description: "Acces aux ressources direction comme vehicules et remorques.",
    sortOrder: 50,
  },
  {
    value: "commissions",
    label: "Commissions",
    module: "commissions",
    description: "Acces aux objectifs de vente et au suivi des commissions.",
    sortOrder: 60,
  },
  {
    value: ADMIN_FINANCE_PERMISSION,
    label: "Finance admin",
    module: "admin_finance",
    description:
      "Paie, remuneration, commissions monetaires et donnees confidentielles (role admin uniquement, phase 1).",
    sortOrder: 70,
  },
  {
    value: "horodateur_payroll_read",
    label: "Rapport comptable horodateur — lecture",
    module: "horodateur_payroll",
    description:
      "Lecture des cycles et rapports comptables bihebdomadaires HORORA (aperçu, snapshots émis, journaux).",
    sortOrder: 80,
  },
  {
    value: "horodateur_payroll_manage",
    label: "Rapport comptable horodateur — gestion",
    module: "horodateur_payroll",
    description:
      "Gestion des cycles, destinataires, émission et renvoi des rapports comptables bihebdomadaires HORORA.",
    sortOrder: 90,
  },
] as const;

export const HORODATEUR_PAYROLL_READ_PERMISSION = "horodateur_payroll_read" as const;
export const HORODATEUR_PAYROLL_MANAGE_PERMISSION =
  "horodateur_payroll_manage" as const;

export type AppPermission = (typeof APP_PERMISSION_DEFINITIONS)[number]["value"];

const permissionValues = new Set<string>(
  APP_PERMISSION_DEFINITIONS.map((permission) => permission.value)
);

export function normalizePermission(value: unknown): AppPermission | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();

  return permissionValues.has(normalized)
    ? (normalized as AppPermission)
    : null;
}

export function normalizePermissionList(value: unknown): AppPermission[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => normalizePermission(item))
        .filter((item): item is AppPermission => Boolean(item))
    )
  );
}

export function getAppMetadataPermissionsOnly(
  user: User | null | undefined
): AppPermission[] {
  if (!user) return [];
  return normalizePermissionList(user.app_metadata?.permissions);
}

export function getUserPermissions(user: User | null | undefined): AppPermission[] {
  if (!user) return [];

  const appMetadataPermissions = getAppMetadataPermissionsOnly(user);

  if (appMetadataPermissions.length > 0) {
    return appMetadataPermissions;
  }

  return normalizePermissionList(user.user_metadata?.permissions);
}

function isHorodateurPayrollPermission(
  permission: AppPermission
): permission is
  | typeof HORODATEUR_PAYROLL_READ_PERMISSION
  | typeof HORODATEUR_PAYROLL_MANAGE_PERMISSION {
  return (
    permission === HORODATEUR_PAYROLL_READ_PERMISSION ||
    permission === HORODATEUR_PAYROLL_MANAGE_PERMISSION
  );
}

function hasHorodateurPayrollPermission(
  user: User | null | undefined,
  permission:
    | typeof HORODATEUR_PAYROLL_READ_PERMISSION
    | typeof HORODATEUR_PAYROLL_MANAGE_PERMISSION,
  resolved: {
    mode: "explicit" | "bound" | "legacy";
    role: AppRole | null | undefined;
  }
): boolean {
  const appMetadataPermissions = getAppMetadataPermissionsOnly(user);

  if (resolved.mode === "explicit" || resolved.mode === "bound") {
    if (resolved.role === "admin") {
      return true;
    }
    if (resolved.role !== "direction") {
      return false;
    }
    if (permission === HORODATEUR_PAYROLL_MANAGE_PERMISSION) {
      return appMetadataPermissions.includes(HORODATEUR_PAYROLL_MANAGE_PERMISSION);
    }
    return (
      appMetadataPermissions.includes(HORODATEUR_PAYROLL_READ_PERMISSION) ||
      appMetadataPermissions.includes(HORODATEUR_PAYROLL_MANAGE_PERMISSION)
    );
  }

  return false;
}

/** Request-scoped H4 AppRole bound to the User instance from getAuthenticatedRequestUser. */
const boundEffectiveAppRole = new WeakMap<User, AppRole | null>();

export function bindEffectiveAppRole(
  user: User,
  effectiveRole: AppRole | null
): void {
  boundEffectiveAppRole.set(user, effectiveRole);
}

function resolveEffectiveRoleForPermission(
  user: User | null | undefined,
  effectiveRole: AppRole | null | undefined,
  explicitEffectiveRole: boolean
): { mode: "explicit" | "bound" | "legacy"; role: AppRole | null | undefined } {
  if (explicitEffectiveRole) {
    return { mode: "explicit", role: effectiveRole };
  }
  if (user && boundEffectiveAppRole.has(user)) {
    return { mode: "bound", role: boundEffectiveAppRole.get(user) };
  }
  return { mode: "legacy", role: undefined };
}

/**
 * Organizational module permission check.
 *
 * When `effectiveRole` is provided (H4 membership AppRole), it is authoritative:
 * - admin → grant non-finance module permissions for the active organization
 * - other roles → require the permission in JWT permission lists (Direction/Employé)
 * - null → no admin bypass (non-member / unauthorized)
 *
 * When omitted, prefers a role bound via `bindEffectiveAppRole` (set by
 * getAuthenticatedRequestUser). Otherwise legacy JWT `role===admin` bypass.
 * Finance (`admin_finance`) stays JWT-admin only.
 */
export function hasUserPermission(
  user: User | null | undefined,
  permission: AppPermission,
  effectiveRole?: AppRole | null
) {
  if (permission === ADMIN_FINANCE_PERMISSION) {
    return hasAdminFinanceAccess(user);
  }

  if (isHorodateurPayrollPermission(permission)) {
    const payrollResolved = resolveEffectiveRoleForPermission(
      user,
      effectiveRole,
      arguments.length >= 3
    );
    return hasHorodateurPayrollPermission(user, permission, payrollResolved);
  }

  const resolved = resolveEffectiveRoleForPermission(
    user,
    effectiveRole,
    arguments.length >= 3
  );

  if (resolved.mode === "explicit" || resolved.mode === "bound") {
    if (resolved.role === "admin") {
      return true;
    }
    return getUserPermissions(user).includes(permission);
  }

  if (getUserRole(user) === "admin") {
    return true;
  }
  return getUserPermissions(user).includes(permission);
}

export function getRequiredPermissionForPath(pathname: string) {
  if (isAdminFinancePath(pathname)) {
    return ADMIN_FINANCE_PERMISSION;
  }

  if (
    pathname === "/direction/horodateur/rapport-comptable" ||
    pathname.startsWith("/direction/horodateur/rapport-comptable/")
  ) {
    return HORODATEUR_PAYROLL_READ_PERMISSION;
  }

  if (
    pathname.startsWith("/employe/documents") ||
    pathname.startsWith("/direction/documents")
  ) {
    return "documents" as const;
  }

  if (pathname.startsWith("/employe/dossiers")) {
    return "dossiers" as const;
  }

  if (
    pathname.startsWith("/employe/terrain") ||
    pathname.startsWith("/direction/terrain") ||
    pathname.startsWith("/direction/horodateur") ||
    pathname.startsWith("/direction/sorties-terrain") ||
    pathname.startsWith("/direction/temps-titan") ||
    pathname.startsWith("/direction/facturation-titan")
  ) {
    return "terrain" as const;
  }

  if (
    pathname.startsWith("/employe/livraisons") ||
    pathname.startsWith("/direction/livraisons")
  ) {
    return "livraisons" as const;
  }

  if (pathname.startsWith("/direction/ressources")) {
    return "ressources" as const;
  }

  if (pathname.startsWith("/direction/commissions")) {
    return "commissions" as const;
  }

  return null;
}

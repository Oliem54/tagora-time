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
] as const;

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

export function getUserPermissions(user: User | null | undefined): AppPermission[] {
  if (!user) return [];

  const appMetadataPermissions = normalizePermissionList(
    user.app_metadata?.permissions
  );

  if (appMetadataPermissions.length > 0) {
    return appMetadataPermissions;
  }

  return normalizePermissionList(user.user_metadata?.permissions);
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

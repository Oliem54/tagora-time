import type { User } from "@supabase/supabase-js";

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

export function hasUserPermission(
  user: User | null | undefined,
  permission: AppPermission
) {
  return getUserPermissions(user).includes(permission);
}

export function getRequiredPermissionForPath(pathname: string) {
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

  return null;
}

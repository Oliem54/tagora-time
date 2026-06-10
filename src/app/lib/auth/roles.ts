import type { User } from "@supabase/supabase-js";

export type AppRole = "employe" | "direction" | "admin";

function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== "string") return null;

  const role = value.trim().toLowerCase();

  if (role === "employe" || role === "employee" || role === "chauffeur") {
    return "employe";
  }

  if (role === "admin") {
    return "admin";
  }

  if (role === "direction" || role === "manager") {
    return "direction";
  }

  return null;
}

export function getUserRole(user: User | null | undefined): AppRole | null {
  if (!user) return null;

  return (
    normalizeRole(user.app_metadata?.role) ??
    normalizeRole(user.user_metadata?.role)
  );
}

export function getHomePathForRole(role: AppRole): string {
  return getDashboardPathForRole(role);
}

/** Tableau de bord principal selon le role JWT (admin, direction, employe). */
export function getDashboardPathForRole(role: AppRole): string {
  if (role === "employe") {
    return "/employe/dashboard";
  }

  if (role === "admin") {
    return "/admin/dashboard";
  }

  return "/direction/dashboard";
}

export function getDashboardLabelForRole(role: AppRole): string {
  if (role === "employe") {
    return "Tableau de bord employe";
  }

  if (role === "admin") {
    return "Tableau de bord admin";
  }

  return "Tableau de bord direction";
}

export function getLoginPathForRole(role: AppRole): string {
  if (role === "employe") {
    return "/employe/login";
  }

  return "/direction/login";
}

export function getPasswordChangePathForRole(role: AppRole): string {
  return role === "employe" ? "/employe/mot-de-passe" : "/direction/login";
}

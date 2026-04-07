import type { User } from "@supabase/supabase-js";

export type AppRole = "employe" | "direction";

function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== "string") return null;

  const role = value.trim().toLowerCase();

  if (role === "employe" || role === "employee" || role === "chauffeur") {
    return "employe";
  }

  if (role === "direction" || role === "admin" || role === "manager") {
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
  return role === "direction" ? "/direction/dashboard" : "/employe/dashboard";
}

export function getLoginPathForRole(role: AppRole): string {
  return role === "direction" ? "/direction/login" : "/employe/login";
}

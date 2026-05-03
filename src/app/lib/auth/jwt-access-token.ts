import type { AppRole } from "@/app/lib/auth/roles";

function normalizeAppRole(value: unknown): AppRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "admin") {
    return "admin";
  }

  if (normalized === "direction" || normalized === "manager") {
    return "direction";
  }

  if (
    normalized === "employe" ||
    normalized === "employee" ||
    normalized === "chauffeur"
  ) {
    return "employe";
  }

  return null;
}

export function decodeSupabaseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payloadPart] = token.split(".");

    if (!payloadPart) {
      return null;
    }

    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );

    const json = atob(padded);

    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Revendication `aal` du JWT Supabase (après MFA : `aal2`). */
export function getJwtAal(token: string | null | undefined): "aal1" | "aal2" | null {
  if (!token) return null;
  const payload = decodeSupabaseJwtPayload(token);
  const raw = payload?.aal;
  if (raw === "aal2") return "aal2";
  if (raw === "aal1") return "aal1";
  return null;
}

export function getJwtAppRole(token: string | null | undefined): AppRole | null {
  if (!token) return null;
  const payload = decodeSupabaseJwtPayload(token);
  if (!payload) return null;

  const appMeta = payload.app_metadata as { role?: unknown } | undefined;
  const userMeta = payload.user_metadata as { role?: unknown } | undefined;

  return normalizeAppRole(
    appMeta?.role ?? userMeta?.role ?? payload.role ?? null
  );
}

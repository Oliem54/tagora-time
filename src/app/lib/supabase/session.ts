"use client";

import type { Session, User } from "@supabase/supabase-js";
import { SUPABASE_AUTH_STORAGE_KEY, supabase } from "@/app/lib/supabase/client";

type SafeAuthResult<T> = {
  data: T | null;
  invalidRefreshToken: boolean;
};

function isInvalidRefreshTokenMessage(message: string | null | undefined) {
  const normalized = String(message ?? "").trim().toLowerCase();

  return (
    normalized.includes("invalid refresh token") ||
    normalized.includes("refresh token not found") ||
    normalized.includes("jwt expired")
  );
}

function clearSupabaseStorage() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
}

export async function clearLocalSupabaseSession() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Silent on purpose: local cleanup must not surface an auth error to the UI.
  } finally {
    clearSupabaseStorage();
  }
}

export async function getSafeSupabaseSession(): Promise<SafeAuthResult<Session>> {
  const { data, error } = await supabase.auth.getSession();

  if (isInvalidRefreshTokenMessage(error?.message)) {
    await clearLocalSupabaseSession();
    return {
      data: null,
      invalidRefreshToken: true,
    };
  }

  return {
    data: data.session ?? null,
    invalidRefreshToken: false,
  };
}

export async function getSafeSupabaseUser(): Promise<SafeAuthResult<User>> {
  const { data, error } = await supabase.auth.getUser();

  if (isInvalidRefreshTokenMessage(error?.message)) {
    await clearLocalSupabaseSession();
    return {
      data: null,
      invalidRefreshToken: true,
    };
  }

  return {
    data: data.user ?? null,
    invalidRefreshToken: false,
  };
}

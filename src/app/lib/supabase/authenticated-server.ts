import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server Supabase client scoped to the end-user JWT.
 * Uses the public anon/publishable key and forwards Authorization so Postgres
 * sees auth.uid() and applies RLS. Never uses the service role key.
 */
export function createAuthenticatedServerSupabaseClient(
  accessToken: string
): SupabaseClient {
  const token = accessToken.trim();
  if (!token) {
    throw new Error("Session Supabase requise pour le client authentifie.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!publicKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  return createClient(supabaseUrl, publicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

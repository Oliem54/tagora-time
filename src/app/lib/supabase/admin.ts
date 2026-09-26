import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  isHororaOpaqueSupabaseSecret,
  wrapFetchForOpaqueSupabaseSecret,
} from "@/app/lib/supabase/opaque-secret-fetch.shared";
import { resolveHororaRuntimeSupabaseUrl } from "@/app/lib/supabase/supabase-host.shared";

export function createAdminSupabaseClient() {
  const supabaseUrl = resolveHororaRuntimeSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(isHororaOpaqueSupabaseSecret(serviceRoleKey)
      ? {
          global: {
            fetch: wrapFetchForOpaqueSupabaseSecret(serviceRoleKey),
          },
        }
      : {}),
  });
}


import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabaseProjectRef = new URL(supabaseUrl).hostname.split(".")[0] ?? "local";

export const SUPABASE_AUTH_STORAGE_KEY = `sb-${supabaseProjectRef}-auth-token`;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
  },
});

/**
 * New Supabase secret keys (sb_secret_) are not JWTs.
 * supabase-js fetchWithAuth still sets Authorization: Bearer before this
 * wrapper runs. That JWT parse fails and PostgREST stays on anon.
 * Mapping SELECT must not use this path. See service-role-postgrest.shared.ts.
 */

export function isHororaOpaqueSupabaseSecret(key: string): boolean {
  return key.startsWith("sb_secret_");
}

export function wrapFetchForOpaqueSupabaseSecret(
  secretKey: string,
  baseFetch: typeof fetch = fetch
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("apikey", secretKey);
    headers.delete("Authorization");
    return baseFetch(input, { ...init, headers });
  };
}

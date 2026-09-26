/**
 * New Supabase secret keys (sb_secret_) are not JWTs.
 * supabase-js still sends them as Authorization: Bearer, which leaves
 * PostgREST on anon. Mapping tables revoke anon, so SELECT fails as
 * permission denied. Official guidance: send sb_secret on apikey only.
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

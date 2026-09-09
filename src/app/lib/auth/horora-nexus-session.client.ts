/**
 * Browser calls to HORORA APIs authenticate from the Nexus-brokered cookie.
 * Do not require a Supabase Auth JWT in the browser.
 */

import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";

export function hororaNexusSessionRequestInit(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.delete("Authorization");
  return {
    cache: "no-store",
    ...init,
    headers,
    credentials: "same-origin",
  };
}

export function isMissingHororaNexusSessionStatus(status: number): boolean {
  return status === 401;
}

export function redirectToNexusLoginIfUnauthenticated(status: number): boolean {
  if (!isMissingHororaNexusSessionStatus(status)) {
    return false;
  }
  if (typeof window !== "undefined") {
    window.location.assign(NEXUS_PUBLIC_LOGIN_URL);
  }
  return true;
}

export async function fetchHororaNexusSession(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, hororaNexusSessionRequestInit(init));
  if (redirectToNexusLoginIfUnauthenticated(response.status)) {
    throw new Error("Authentification Nexus requise.");
  }
  return response;
}

/**
 * Browser calls to HORORA APIs authenticate from the Nexus-brokered cookie.
 * Do not require a Supabase Auth JWT in the browser.
 */

import { resolveHororaNexusLoginUrl } from "@/app/lib/auth/nexus-handoff-config";

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
    window.location.assign(resolveHororaNexusLoginUrl());
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

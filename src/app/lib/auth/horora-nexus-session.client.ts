/**
 * Browser calls to HORORA APIs authenticate from the Nexus-brokered cookie.
 * Do not require a Supabase Auth JWT in the browser.
 */

import { isLocalHostname, NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";
import { HORORA_LOCAL_FIXTURE_COOKIE_NAME } from "@/app/lib/auth/horora-local-nexus-fixture";

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

export function isBrowserLocalNexusFixture(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  if (!isLocalHostname(window.location.hostname)) return false;
  const needle = `${HORORA_LOCAL_FIXTURE_COOKIE_NAME}=1`;
  return document.cookie.split(";").some((part) => part.trim() === needle);
}

export function assignHororaModuleLogin(productionLoginUrl: string = NEXUS_PUBLIC_LOGIN_URL): void {
  if (typeof window === "undefined") return;
  if (isBrowserLocalNexusFixture()) return;
  window.location.assign(productionLoginUrl);
}

export function redirectToNexusLoginIfUnauthenticated(status: number): boolean {
  if (!isMissingHororaNexusSessionStatus(status)) {
    return false;
  }
  if (isBrowserLocalNexusFixture()) {
    return false;
  }
  assignHororaModuleLogin(NEXUS_PUBLIC_LOGIN_URL);
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

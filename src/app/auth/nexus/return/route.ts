import { NextResponse } from "next/server";
import { resolveNexusPortalReturnUrl } from "@/app/lib/auth/nexus-handoff-config";
import { redirectFailClosed } from "@/app/lib/auth/nexus-callback.server";
import {
  applyClearedBrokeredSessionCookie,
  readBrokeredSessionCookieFromHeader,
  resolveBrokeredCookieEnvironment,
  revokeBrokeredHororaSessionFromCookies,
} from "@/app/lib/auth/nexus-brokered-session";

export const runtime = "nodejs";

function localLoginRedirect(requestUrl: string): NextResponse {
  return redirectFailClosed(requestUrl, "handoff_refused");
}

function logLocalLogout(fingerprint: string | null): void {
  console.info("[horora.nexus.return]", {
    decision: "local_logout",
    fingerprint: fingerprint ?? "none",
  });
}

async function withLocalLogout(response: NextResponse, request: Request): Promise<NextResponse> {
  const cookies = readBrokeredSessionCookieFromHeader(request.headers.get("cookie"));
  const revoked = await revokeBrokeredHororaSessionFromCookies(cookies);
  logLocalLogout(revoked.fingerprint);
  applyClearedBrokeredSessionCookie(response, resolveBrokeredCookieEnvironment());
  return response;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const logoutRequested = url.searchParams.get("logout") === "1";
  const candidate = url.searchParams.get("next") ?? url.searchParams.get("return_to");
  if (candidate) {
    const denied = localLoginRedirect(request.url);
    return logoutRequested ? withLocalLogout(denied, request) : denied;
  }

  const allowlisted = resolveNexusPortalReturnUrl();
  if (!allowlisted.ok) {
    const denied = localLoginRedirect(request.url);
    return logoutRequested ? withLocalLogout(denied, request) : denied;
  }

  const response = NextResponse.redirect(allowlisted.url, 303);
  return logoutRequested ? withLocalLogout(response, request) : response;
}

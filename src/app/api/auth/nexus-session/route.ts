import { NextRequest, NextResponse } from "next/server";
import {
  applyClearedBrokeredSessionCookie,
  readBrokeredSessionCookieFromHeader,
  resolveBrokeredCookieEnvironment,
  revokeBrokeredHororaSessionFromCookies,
} from "@/app/lib/auth/nexus-brokered-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const cookies = readBrokeredSessionCookieFromHeader(request.headers.get("cookie"));
  await revokeBrokeredHororaSessionFromCookies(cookies);
  const response = NextResponse.json({ ok: true });
  applyClearedBrokeredSessionCookie(response, resolveBrokeredCookieEnvironment());
  return response;
}

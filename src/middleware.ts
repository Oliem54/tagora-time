import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NEXUS_BROKERED_SESSION_COOKIE_NAME } from "@/app/lib/auth/nexus-handoff-config";
import {
  HORORA_LOCAL_FIXTURE_COOKIE_NAME,
  isProcessLocalNexusFixtureEnabled,
} from "@/app/lib/auth/horora-local-nexus-fixture";
import { resolveHororaRequestAccess } from "@/app/lib/auth/horora-session-contract";

export function middleware(request: NextRequest) {
  try {
    const isProd = process.env.NODE_ENV === "production";
    const path = request.nextUrl.pathname;

    if (isProd && (path.startsWith("/test-tailwind") || path.startsWith("/test-supabase"))) {
      return new NextResponse(null, { status: 404 });
    }

    const localFixture = isProcessLocalNexusFixtureEnabled(request.nextUrl.hostname);
    const brokeredCookie = request.cookies.get(NEXUS_BROKERED_SESSION_COOKIE_NAME)?.value ?? null;
    if (!localFixture) {
      const gate = resolveHororaRequestAccess({
        pathname: path,
        hasBrokeredSessionCookie: Boolean(brokeredCookie),
      });
      if (gate.action === "redirect") {
        return NextResponse.redirect(new URL(gate.location), 303);
      }
    }

    const response = NextResponse.next();
    if (localFixture) {
      response.cookies.set(HORORA_LOCAL_FIXTURE_COOKIE_NAME, "1", {
        path: "/",
        sameSite: "lax",
        httpOnly: false,
        secure: false,
      });
    } else if (request.cookies.get(HORORA_LOCAL_FIXTURE_COOKIE_NAME)) {
      response.cookies.set(HORORA_LOCAL_FIXTURE_COOKIE_NAME, "", {
        path: "/",
        maxAge: 0,
      });
    }
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
    return response;
  } catch (e) {
    console.error("[middleware] unexpected", e);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

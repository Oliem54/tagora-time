import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { APP_SESSION_COOKIE_NAME } from "@/app/lib/auth/session-cookie";
import { getJwtAal, getJwtAppRole } from "@/app/lib/auth/jwt-access-token";

function readApiAccessToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }
  return request.cookies.get(APP_SESSION_COOKIE_NAME)?.value ?? null;
}

function isMfaExemptApiPath(path: string): boolean {
  if (path.startsWith("/api/auth/")) return true;
  if (path === "/api/account-requests/sync-activation") return true;
  if (path.startsWith("/api/security/mfa-audit")) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const path = request.nextUrl.pathname;

  if (isProd && (path.startsWith("/test-tailwind") || path.startsWith("/test-supabase"))) {
    return new NextResponse(null, { status: 404 });
  }

  if (path.startsWith("/api/") && !isMfaExemptApiPath(path)) {
    const token = readApiAccessToken(request);
    const jwtRole = getJwtAppRole(token);
    if (
      (jwtRole === "direction" || jwtRole === "admin") &&
      getJwtAal(token) !== "aal2"
    ) {
      return NextResponse.json(
        {
          error:
            "Vérification en deux étapes requise. Complétez le MFA puis réessayez.",
          code: "MFA_AAL2_REQUIRED",
        },
        { status: 403 }
      );
    }
  }

  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

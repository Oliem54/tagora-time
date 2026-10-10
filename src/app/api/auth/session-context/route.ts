import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { HORORA_LOCAL_FIXTURE_SESSION_SOURCE } from "@/app/lib/auth/horora-local-nexus-fixture";
import { readReliableHororaSessionDisplay } from "@/app/lib/auth/horora-session-display.shared";

export const dynamic = "force-dynamic";

/**
 * Returns organization authorization context for AuthGate.
 * Serving session is accepted only from a verified Nexus handoff.
 */
export async function GET(req: NextRequest) {
  try {
    const authenticated = await getAuthenticatedRequestUser(req);
    const { user, sessionSource } = authenticated;
    if (
      !user ||
      (sessionSource !== "nexus_handoff" &&
        sessionSource !== HORORA_LOCAL_FIXTURE_SESSION_SOURCE) ||
      !authenticated.role ||
      !authenticated.organizationId ||
      !authenticated.membershipId
    ) {
      return NextResponse.json(
        { authenticated: false, authorized: false, reason: "unauthenticated", userId: null },
        { status: 401 }
      );
    }

    const display = readReliableHororaSessionDisplay(user);

    if (sessionSource === HORORA_LOCAL_FIXTURE_SESSION_SOURCE) {
      return NextResponse.json({
        authenticated: true,
        authorized: true,
        reason: null,
        userId: user.id,
        jwtAppRole: null,
        appRole: authenticated.role,
        organizationId: authenticated.organizationId,
        membershipId: authenticated.membershipId,
        membershipRole: authenticated.membershipRole,
        source: "local_nexus_fixture",
        displayName: display.displayName,
        email: display.email,
      });
    }

    return NextResponse.json({
      authenticated: true,
      authorized: true,
      reason: null,
      userId: user.id,
      jwtAppRole: null,
      appRole: authenticated.role,
      organizationId: authenticated.organizationId,
      membershipId: authenticated.membershipId,
      membershipRole: authenticated.membershipRole,
      source: "nexus_handoff",
      displayName: display.displayName,
      email: display.email,
    });
  } catch {
    return NextResponse.json(
      { authenticated: false, authorized: false, reason: "lookup_failed", userId: null },
      { status: 500 }
    );
  }
}

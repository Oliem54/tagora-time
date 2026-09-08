import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";

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
      sessionSource !== "nexus_handoff" ||
      !authenticated.role ||
      !authenticated.organizationId ||
      !authenticated.membershipId
    ) {
      return NextResponse.json(
        { authenticated: false, authorized: false, reason: "unauthenticated", userId: null },
        { status: 401 }
      );
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
    });
  } catch {
    return NextResponse.json(
      { authenticated: false, authorized: false, reason: "lookup_failed", userId: null },
      { status: 500 }
    );
  }
}

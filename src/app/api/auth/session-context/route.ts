import { NextRequest, NextResponse } from "next/server";
import {
  extractRoleFromUser,
  getAuthenticatedRequestUser,
} from "@/app/lib/account-requests.server";
import { resolveOrganizationAuthContextForUser } from "@/app/lib/saas/organization-membership.server";

export const dynamic = "force-dynamic";

/**
 * Returns organization authorization context for AuthGate.
 * Authenticated identity from Supabase Auth; authorization from H4 memberships.
 */
export async function GET(req: NextRequest) {
  try {
    const authenticated = await getAuthenticatedRequestUser(req);
    const { user, sessionSource } = authenticated;
    if (!user) {
      return NextResponse.json(
        { authenticated: false, authorized: false, reason: "unauthenticated", userId: null },
        { status: 401 }
      );
    }

    if (
      sessionSource === "nexus_handoff" &&
      authenticated.role &&
      authenticated.organizationId &&
      authenticated.membershipId
    ) {
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
    }

    const jwtAppRole = extractRoleFromUser(user);
    const resolved = await resolveOrganizationAuthContextForUser(user, jwtAppRole);

    if (!resolved.ok) {
      return NextResponse.json(
        {
          authenticated: true,
          authorized: false,
          reason: resolved.reason,
          jwtAppRole,
          appRole: null,
          organizationId: null,
          membershipId: null,
          membershipRole: null,
          userId: user.id,
          source: null,
        },
        { status: resolved.status === 500 ? 500 : 403 }
      );
    }

    const { context } = resolved;
    return NextResponse.json({
      authenticated: true,
      authorized: true,
      reason: null,
      jwtAppRole,
      appRole: context.appRole,
      organizationId: context.organizationId,
      membershipId: context.membershipId,
      membershipRole: context.membershipRole,
      userId: user.id,
      source: sessionSource === "nexus_handoff" ? "nexus_handoff" : context.source,
    });
  } catch {
    return NextResponse.json(
      { authenticated: false, authorized: false, reason: "lookup_failed", userId: null },
      { status: 500 }
    );
  }
}

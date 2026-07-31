import { NextRequest, NextResponse } from "next/server";
import { requireAdminFinanceCommissionsAccess } from "@/app/api/direction/commissions/_lib";
import { getAuthenticatedOrganizationMemberships } from "@/app/lib/auth/organization-access.server";

export const dynamic = "force-dynamic";

/**
 * Active organization memberships for the authenticated admin finance user.
 * Returns organizations.id UUID + display_name. Never auto-selects.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;

    const result = await getAuthenticatedOrganizationMemberships(auth.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      organizations: result.memberships.map((row) => ({
        id: row.organizationId,
        display_name: row.displayName,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur serveur organisations commissions.",
      },
      { status: 500 }
    );
  }
}

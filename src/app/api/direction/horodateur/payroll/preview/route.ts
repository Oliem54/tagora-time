import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
} from "@/app/api/horodateur/_shared";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { resolveActiveOrganizationMembershipForUserId } from "@/app/lib/saas/organization-membership.server";
import { previewPayrollAccountantReportSnapshot } from "@/app/lib/horodateur-v1/payroll-report-snapshot.server";

const ROUTE = "/api/direction/horodateur/payroll/preview";

function readString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value : null;
}

export async function POST(req: NextRequest) {
  try {
    const authenticated = await getAuthenticatedRequestUser(req);
    if (!authenticated.user) {
      return buildHorodateurValidationErrorResponse({
        error: "Acces refuse.",
        code: "forbidden",
        status: 403,
        route: ROUTE,
      });
    }

    const membership = await resolveActiveOrganizationMembershipForUserId(
      authenticated.user.id
    );
    if (!membership.ok) {
      return buildHorodateurValidationErrorResponse({
        error: "Membership organisation active requise.",
        code: "organization_membership_required",
        status: 403,
        route: ROUTE,
      });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return buildHorodateurValidationErrorResponse({
        error: "Corps JSON invalide.",
        code: "invalid_json",
        route: ROUTE,
      });
    }

    const result = await previewPayrollAccountantReportSnapshot({
      user: authenticated.user,
      membership: {
        role: membership.membershipRole,
        status: membership.membershipStatus,
      },
      membershipOrganizationId: membership.organizationId,
      required: "read",
      query: {
        organizationId: membership.organizationId,
        organizationCompanyId: readString(body, "organizationCompanyId"),
        periodStart: readString(body, "periodStart"),
        periodEnd: readString(body, "periodEnd"),
        timezone: readString(body, "timezone"),
        cycleId: readString(body, "cycleId"),
        untrustedBrowserOrganizationId: readString(body, "organizationId"),
      },
      untrustedBrowserOrganizationCompanyId: readString(
        body,
        "organizationCompanyId"
      ),
    });

    if (!result.ok) {
      if ("access" in result && result.access && !result.access.allowed) {
        return buildHorodateurValidationErrorResponse({
          error: "Permission horodateur_payroll_read requise.",
          code: result.access.reason,
          status: 403,
          route: ROUTE,
        });
      }
      const reason =
        "reason" in result && typeof result.reason === "string"
          ? result.reason
          : "period_invalid";
      return buildHorodateurValidationErrorResponse({
        error: "Parametres de previsualisation invalides.",
        code: reason,
        route: ROUTE,
      });
    }

    return NextResponse.json({
      success: true,
      preview: true,
      persisted: false,
      datesAdjustedFromCycle: result.datesAdjustedFromCycle,
      sourceHash: result.snapshot.sourceHash,
      completenessStatus: result.snapshot.completenessStatus,
      canIssue: result.snapshot.canIssue,
      totals: result.snapshot.totals,
      payload: result.snapshot.payload,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, { route: ROUTE });
  }
}

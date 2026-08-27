import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildHorodateurErrorResponse } from "@/app/api/horodateur/_shared";
import { persistPayrollAccountantOperational } from "@/app/lib/horodateur-v1/payroll-accountant-operational.server";
import {
  payrollDenialResponse,
  readPayrollBodyString,
  readPayrollJsonBody,
  requirePayrollAccountantApiAccess,
} from "../_shared";

const ROUTE = "/api/direction/horodateur/payroll/issue";

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePayrollAccountantApiAccess(req, ROUTE);
    if (!auth.ok) return auth.response;

    const parsed = await readPayrollJsonBody(req, ROUTE);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;

    const result = await persistPayrollAccountantOperational({
      user: auth.user,
      membership: auth.membership,
      membershipOrganizationId: auth.membershipOrganizationId,
      operation: "issue",
      confirmIssue: body.confirmIssue === true,
      query: {
        organizationCompanyId: readPayrollBodyString(body, "organizationCompanyId"),
        periodStart: readPayrollBodyString(body, "periodStart"),
        periodEnd: readPayrollBodyString(body, "periodEnd"),
        timezone: readPayrollBodyString(body, "timezone"),
        cycleId: readPayrollBodyString(body, "cycleId"),
        untrustedBrowserOrganizationId: readPayrollBodyString(body, "organizationId"),
      },
      untrustedBrowserOrganizationCompanyId: readPayrollBodyString(
        body,
        "organizationCompanyId"
      ),
      forceEmitReason: readPayrollBodyString(body, "forceEmitReason"),
    });

    if (!result.ok) {
      return payrollDenialResponse(result, ROUTE);
    }

    return NextResponse.json({
      success: true,
      persisted: true,
      result: result.result,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, { route: ROUTE });
  }
}

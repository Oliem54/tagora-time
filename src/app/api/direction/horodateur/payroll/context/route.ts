import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildHorodateurErrorResponse } from "@/app/api/horodateur/_shared";
import { loadPayrollAccountantOperationalContext } from "@/app/lib/horodateur-v1/payroll-accountant-operational.server";
import {
  payrollDenialResponse,
  readPayrollBodyString,
  requirePayrollAccountantApiAccess,
} from "../_shared";

const ROUTE = "/api/direction/horodateur/payroll/context";

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePayrollAccountantApiAccess(req, ROUTE);
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const result = await loadPayrollAccountantOperationalContext({
      user: auth.user,
      membership: auth.membership,
      membershipOrganizationId: auth.membershipOrganizationId,
      organizationCompanyId: readPayrollBodyString(body, "organizationCompanyId"),
      untrustedBrowserOrganizationId: readPayrollBodyString(body, "organizationId"),
    });

    if (!result.ok) {
      return payrollDenialResponse(result, ROUTE);
    }

    return NextResponse.json({
      success: true,
      organizationId: result.organizationId,
      companies: result.companies,
      selectedCompanyId: result.selectedCompanyId,
      cycles: result.cycles,
      selectedCycleId: result.selectedCycleId,
      defaultPeriod: result.defaultPeriod,
      latestIssued: result.latestIssued,
      latestDraft: result.latestDraft,
      canManage: result.access.canManage,
      canRead: result.access.canRead,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, { route: ROUTE });
  }
}

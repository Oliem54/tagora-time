import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildHorodateurErrorResponse } from "@/app/api/horodateur/_shared";
import {
  buildPayrollAccountantPdfBytes,
  payrollAccountantExportFileStem,
} from "@/app/lib/horodateur-v1/payroll-accountant-export.shared";
import { resolvePayrollAccountantExportSnapshot } from "@/app/lib/horodateur-v1/payroll-accountant-operational.server";
import {
  payrollDenialResponse,
  readPayrollBodyString,
  readPayrollJsonBody,
  requirePayrollAccountantApiAccess,
} from "../../_shared";

const ROUTE = "/api/direction/horodateur/payroll/export/pdf";

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePayrollAccountantApiAccess(req, ROUTE);
    if (!auth.ok) return auth.response;

    const parsed = await readPayrollJsonBody(req, ROUTE);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;

    const result = await resolvePayrollAccountantExportSnapshot({
      user: auth.user,
      membership: auth.membership,
      membershipOrganizationId: auth.membershipOrganizationId,
      reportId: readPayrollBodyString(body, "reportId"),
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
    });

    if (!result.ok) {
      return payrollDenialResponse(result, ROUTE);
    }

    const pdf = buildPayrollAccountantPdfBytes(result.snapshot, result.meta);
    const filename = `${payrollAccountantExportFileStem(result.snapshot.payload)}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, { route: ROUTE });
  }
}

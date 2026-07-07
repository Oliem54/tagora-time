import { NextRequest, NextResponse } from "next/server";
import { requireAdminFinanceCommissionsAccess } from "@/app/api/direction/commissions/_lib";
import { compensationAccrualsServiceResultToResponse } from "@/app/api/direction/commissions/accruals/_lib";
import { getCompensationAccrualsService } from "@/app/lib/commissions/compensation-accruals.service.factory.server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const service = getCompensationAccrualsService();
    const accrualResult = await service.getAccrualById(id);
    if (!accrualResult.ok) {
      return compensationAccrualsServiceResultToResponse(accrualResult);
    }

    const historyResult = await service.listAccrualStatusHistory(id);
    if (!historyResult.ok) {
      return compensationAccrualsServiceResultToResponse(historyResult);
    }

    return NextResponse.json({
      accrual: accrualResult.value,
      history: historyResult.value,
    });
  } catch (error) {
    return compensationAccrualsServiceResultToResponse({
      ok: false,
      code: "PERSISTENCE",
      errors: [error instanceof Error ? error.message : "Erreur serveur accrual."],
    });
  }
}

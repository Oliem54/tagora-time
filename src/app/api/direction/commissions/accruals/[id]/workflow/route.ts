import { NextRequest } from "next/server";
import { requireAdminFinanceCommissionsAccess } from "@/app/api/direction/commissions/_lib";
import {
  accrualWorkflowResultToResponse,
  compensationAccrualsServiceResultToResponse,
  parseAccrualWorkflowActionFromBody,
} from "@/app/api/direction/commissions/accruals/_lib";
import { getCompensationAccrualsService } from "@/app/lib/commissions/compensation-accruals.service.factory.server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseAccrualWorkflowActionFromBody(body);
    if (!parsed.ok) {
      return compensationAccrualsServiceResultToResponse({
        ok: false,
        code: "VALIDATION",
        errors: parsed.errors,
      });
    }

    const service = getCompensationAccrualsService();
    const options = { actorUserId: auth.user.id, reason: parsed.reason };

    const result =
      parsed.action === "submit_review"
        ? await service.submitForReview(id, options)
        : parsed.action === "validate"
          ? await service.validateAccrual(id, options)
          : await service.sendBackToCalculated(id, options);

    return accrualWorkflowResultToResponse(result);
  } catch (error) {
    return accrualWorkflowResultToResponse({
      ok: false,
      code: "PERSISTENCE",
      errors: [error instanceof Error ? error.message : "Erreur serveur workflow accrual."],
    });
  }
}

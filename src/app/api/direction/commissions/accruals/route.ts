import { NextRequest } from "next/server";
import { requireAdminFinanceCommissionsAccess } from "@/app/api/direction/commissions/_lib";
import {
  compensationAccrualsServiceResultToResponse,
  parseAccrualListFilters,
} from "@/app/api/direction/commissions/accruals/_lib";
import { getCompensationAccrualsService } from "@/app/lib/commissions/compensation-accruals.service.factory.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;

    const filters = parseAccrualListFilters(req.nextUrl.searchParams);
    if (!filters.ok) {
      return compensationAccrualsServiceResultToResponse({
        ok: false,
        code: "VALIDATION",
        errors: filters.errors,
      });
    }

    const service = getCompensationAccrualsService();
    const result = await service.listAccrualsByEventId(filters.compensationEventId);

    return compensationAccrualsServiceResultToResponse(result, { pluralKey: "accruals" });
  } catch (error) {
    return compensationAccrualsServiceResultToResponse({
      ok: false,
      code: "PERSISTENCE",
      errors: [error instanceof Error ? error.message : "Erreur serveur accruals."],
    });
  }
}

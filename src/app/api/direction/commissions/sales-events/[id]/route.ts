import { NextRequest } from "next/server";
import { requireAdminFinanceCommissionsAccess } from "@/app/api/direction/commissions/_lib";
import {
  compensationEventInputFromBody,
  compensationEventServiceResultToResponse,
} from "@/app/api/direction/commissions/sales-events/_lib";
import { getCompensationEventsService } from "@/app/lib/commissions/compensation-events.service.factory.server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const service = getCompensationEventsService();
    const result = await service.getSaleEvent(id);

    return compensationEventServiceResultToResponse(result, { singularKey: "event" });
  } catch (error) {
    return compensationEventServiceResultToResponse({
      ok: false,
      code: "PERSISTENCE",
      errors: [error instanceof Error ? error.message : "Erreur serveur sales event."],
    });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const service = getCompensationEventsService();
    const result = await service.updateSaleEvent(id, compensationEventInputFromBody(body), {
      actorUserId: auth.user.id,
    });

    return compensationEventServiceResultToResponse(result, { singularKey: "event" });
  } catch (error) {
    return compensationEventServiceResultToResponse({
      ok: false,
      code: "PERSISTENCE",
      errors: [error instanceof Error ? error.message : "Erreur serveur mise a jour sales event."],
    });
  }
}

import { NextRequest } from "next/server";
import { requireAdminFinanceCommissionsAccess } from "@/app/api/direction/commissions/_lib";
import {
  compensationEventInputFromBody,
  compensationEventServiceResultToResponse,
  parseSalesEventListFilters,
} from "@/app/api/direction/commissions/sales-events/_lib";
import { COMPENSATION_EVENT_TYPE_SALE } from "@/app/lib/commissions/compensation-events.shared";
import { getCompensationEventsService } from "@/app/lib/commissions/compensation-events.service.factory.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;

    const service = getCompensationEventsService();
    const filters = parseSalesEventListFilters(req.nextUrl.searchParams);
    const result = await service.listSaleEvents(filters);

    return compensationEventServiceResultToResponse(result, { pluralKey: "events" });
  } catch (error) {
    return compensationEventServiceResultToResponse({
      ok: false,
      code: "PERSISTENCE",
      errors: [error instanceof Error ? error.message : "Erreur serveur sales events."],
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = compensationEventInputFromBody({
      ...body,
      event_type: body.event_type ?? COMPENSATION_EVENT_TYPE_SALE,
    });

    const service = getCompensationEventsService();
    const result = await service.createSaleEvent(input, { actorUserId: auth.user.id });

    return compensationEventServiceResultToResponse(result, {
      successStatus: 201,
      singularKey: "event",
    });
  } catch (error) {
    return compensationEventServiceResultToResponse({
      ok: false,
      code: "PERSISTENCE",
      errors: [error instanceof Error ? error.message : "Erreur serveur creation sales event."],
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createEmployeePunch } from "@/app/lib/horodateur-v1/service";
import { buildHorodateurErrorResponse, isHorodateurPhase1EventType, requireEmployeeHorodateurAccess } from "../_shared";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireEmployeeHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json()) as {
      eventType?: unknown;
      occurredAt?: unknown;
      note?: unknown;
      companyContext?: unknown;
      metadata?: Record<string, unknown>;
      relatedEventId?: unknown;
    };

    if (!isHorodateurPhase1EventType(body.eventType)) {
      return NextResponse.json({ error: "Type d evenement invalide." }, { status: 400 });
    }

    const result = await createEmployeePunch({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      eventType: body.eventType,
      occurredAt:
        typeof body.occurredAt === "string" && body.occurredAt.trim()
          ? body.occurredAt
          : undefined,
      note: typeof body.note === "string" ? body.note : null,
      companyContext:
        body.companyContext === "oliem_solutions" ||
        body.companyContext === "titan_produits_industriels"
          ? body.companyContext
          : null,
      metadata:
        body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
      relatedEventId:
        typeof body.relatedEventId === "string" && body.relatedEventId.trim()
          ? body.relatedEventId
          : null,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return buildHorodateurErrorResponse(error);
  }
}

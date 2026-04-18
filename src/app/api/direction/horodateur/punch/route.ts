import { NextRequest, NextResponse } from "next/server";
import { createDirectionPunch } from "@/app/lib/horodateur-v1/service";
import { buildHorodateurErrorResponse, isHorodateurPhase1EventType, isHorodateurPhase1ExceptionType, requireDirectionHorodateurAccess } from "@/app/api/horodateur/_shared";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json()) as {
      employeeId?: unknown;
      eventType?: unknown;
      occurredAt?: unknown;
      note?: unknown;
      companyContext?: unknown;
      metadata?: Record<string, unknown>;
      relatedEventId?: unknown;
      forcedExceptionType?: unknown;
    };

    const employeeId = Number(body.employeeId);

    if (!Number.isFinite(employeeId)) {
      return NextResponse.json({ error: "employeeId invalide." }, { status: 400 });
    }

    if (!isHorodateurPhase1EventType(body.eventType)) {
      return NextResponse.json({ error: "Type d evenement invalide." }, { status: 400 });
    }

    const result = await createDirectionPunch({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      employeeId,
      eventType: body.eventType,
      occurredAt:
        typeof body.occurredAt === "string" && body.occurredAt.trim()
          ? body.occurredAt
          : undefined,
      note: typeof body.note === "string" ? body.note : "",
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
      forcedExceptionType: isHorodateurPhase1ExceptionType(body.forcedExceptionType)
        ? body.forcedExceptionType
        : null,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return buildHorodateurErrorResponse(error);
  }
}

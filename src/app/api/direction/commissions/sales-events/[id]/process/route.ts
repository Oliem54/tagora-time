import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  parseProcessRequestBody,
  processingServiceResultToResponse,
  requireProcessRouteAuth,
} from "@/app/api/direction/commissions/sales-events/[id]/process/_lib";
import { DEFAULT_PROCESSING_RULES } from "@/app/lib/commissions/compensation-processing-api.shared";
import { getCompensationProcessingService } from "@/app/lib/commissions/compensation-processing.service.factory.server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = new Date().toISOString();
  const correlationId = req.headers.get("x-correlation-id")?.trim() || randomUUID();
  const sessionId = randomUUID();
  const runId = randomUUID();

  try {
    const auth = await requireProcessRouteAuth(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    await parseProcessRequestBody(req);

    const service = getCompensationProcessingService();
    const result = await service.processCompensationEventById(
      id,
      DEFAULT_PROCESSING_RULES,
      undefined,
      { actorUserId: auth.user.id }
    );

    const finishedAt = new Date().toISOString();

    return processingServiceResultToResponse(result, {
      sessionId,
      runId,
      correlationId,
      startedAt,
      finishedAt,
      actorUserId: auth.user.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur serveur traitement compensation.",
        correlation_id: correlationId,
      },
      { status: 500 }
    );
  }
}

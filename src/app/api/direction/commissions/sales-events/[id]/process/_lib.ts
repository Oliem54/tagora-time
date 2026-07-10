import { NextRequest, NextResponse } from "next/server";
import { requireAdminFinanceCommissionsAccess } from "@/app/api/direction/commissions/_lib";
import {
  mapDomainErrorToApiCode,
  mapDomainErrorToHttpStatus,
  mapProcessingSuccessToDto,
  type ProcessingApiErrorCode,
  type ProcessingResponseMeta,
} from "@/app/lib/commissions/compensation-processing-api.shared";
import type { CompensationProcessingResult } from "@/app/lib/commissions/compensation-processing.shared";

export type ProcessRequestBody = {
  idempotency_key?: string | null;
  definition_ref?: { id?: string; version?: string } | null;
};

export async function requireProcessRouteAuth(req: NextRequest) {
  const auth = await requireAdminFinanceCommissionsAccess(req);
  if (!auth.ok) {
    const status = auth.response.status;
    let errorMessage =
      status === 401 ? "Authentification requise." : "Acces reserve a l administration finance.";

    try {
      const body = (await auth.response.json()) as { error?: string };
      if (body.error?.trim()) {
        errorMessage = body.error.trim();
      }
    } catch {
      // Keep default message when auth response body is not JSON.
    }

    const code: ProcessingApiErrorCode = status === 401 ? "UNAUTHORIZED" : "FORBIDDEN";
    return {
      ok: false as const,
      response: NextResponse.json({ error: errorMessage, code }, { status }),
    };
  }

  return auth;
}

export async function parseProcessRequestBody(req: NextRequest): Promise<ProcessRequestBody> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const idempotencyKey =
    typeof body.idempotency_key === "string" ? body.idempotency_key.trim() || null : null;

  const definitionRef =
    body.definition_ref && typeof body.definition_ref === "object"
      ? {
          id:
            typeof (body.definition_ref as Record<string, unknown>).id === "string"
              ? ((body.definition_ref as Record<string, unknown>).id as string)
              : undefined,
          version:
            typeof (body.definition_ref as Record<string, unknown>).version === "string"
              ? ((body.definition_ref as Record<string, unknown>).version as string)
              : undefined,
        }
      : null;

  return {
    idempotency_key: idempotencyKey,
    definition_ref: definitionRef,
  };
}

export function processingServiceResultToResponse(
  result: CompensationProcessingResult,
  meta: ProcessingResponseMeta
) {
  if (result.ok) {
    return NextResponse.json(
      { result: mapProcessingSuccessToDto(result.value, meta) },
      { status: 200 }
    );
  }

  const code = mapDomainErrorToApiCode(result.code);
  const status = mapDomainErrorToHttpStatus(code);

  return NextResponse.json(
    {
      error: result.errors[0] ?? "Traitement compensation impossible.",
      code,
      errors: result.errors,
      correlation_id: meta.correlationId,
    },
    { status }
  );
}

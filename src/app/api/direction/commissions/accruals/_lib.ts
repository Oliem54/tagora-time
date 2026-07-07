import { NextResponse } from "next/server";
import type { AccrualWorkflowTransitionResult } from "@/app/lib/commissions/accrual-workflow.server";
import type { CompensationAccrualsServiceResult } from "@/app/lib/commissions/compensation-accruals.service.server";

export type AccrualWorkflowAction = "submit_review" | "validate" | "send_back";

const ACCRUAL_WORKFLOW_ACTIONS: AccrualWorkflowAction[] = [
  "submit_review",
  "validate",
  "send_back",
];

export function isAccrualWorkflowAction(value: unknown): value is AccrualWorkflowAction {
  return typeof value === "string" && ACCRUAL_WORKFLOW_ACTIONS.includes(value as AccrualWorkflowAction);
}

export function parseAccrualListFilters(searchParams: URLSearchParams):
  | { ok: true; compensationEventId: string }
  | { ok: false; errors: string[] } {
  const compensationEventId = searchParams.get("compensation_event_id")?.trim() ?? "";
  if (!compensationEventId) {
    return {
      ok: false,
      errors: ["Le parametre compensation_event_id est requis."],
    };
  }

  return { ok: true, compensationEventId };
}

export function parseAccrualWorkflowActionFromBody(body: Record<string, unknown>):
  | { ok: true; action: AccrualWorkflowAction; reason: string | null }
  | { ok: false; errors: string[] } {
  if (!isAccrualWorkflowAction(body.action)) {
    return {
      ok: false,
      errors: [
        "Action workflow invalide. Valeurs acceptees: submit_review, validate, send_back.",
      ],
    };
  }

  const reason =
    body.reason == null
      ? null
      : typeof body.reason === "string"
        ? body.reason.trim() || null
        : null;

  return { ok: true, action: body.action, reason };
}

export function compensationAccrualsServiceResultToResponse<T>(
  result: CompensationAccrualsServiceResult<T>,
  options?: {
    successStatus?: number;
    singularKey?: string;
    pluralKey?: string;
  }
) {
  if (result.ok) {
    const status = options?.successStatus ?? 200;
    if (options?.singularKey) {
      return NextResponse.json({ [options.singularKey]: result.value }, { status });
    }
    if (options?.pluralKey) {
      return NextResponse.json({ [options.pluralKey]: result.value }, { status });
    }
    return NextResponse.json({ data: result.value }, { status });
  }

  if (result.code === "NOT_FOUND") {
    return NextResponse.json({ error: result.errors[0] ?? "Introuvable." }, { status: 404 });
  }

  if (result.code === "VALIDATION" || result.code === "INELIGIBLE") {
    return NextResponse.json(
      { error: result.errors[0] ?? "Donnees invalides.", errors: result.errors },
      { status: 400 }
    );
  }

  if (result.code === "INVALID_TRANSITION") {
    return NextResponse.json(
      { error: result.errors[0] ?? "Transition workflow invalide.", errors: result.errors },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { error: result.errors[0] ?? "Erreur persistance accrual." },
    { status: 500 }
  );
}

export function accrualWorkflowResultToResponse(result: AccrualWorkflowTransitionResult) {
  if (result.ok) {
    return NextResponse.json({ accrual: result.accrual }, { status: 200 });
  }

  if (result.code === "NOT_FOUND") {
    return NextResponse.json({ error: result.errors[0] ?? "Introuvable." }, { status: 404 });
  }

  if (result.code === "INVALID_TRANSITION") {
    return NextResponse.json(
      { error: result.errors[0] ?? "Transition workflow invalide.", errors: result.errors },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { error: result.errors[0] ?? "Erreur workflow accrual." },
    { status: 500 }
  );
}

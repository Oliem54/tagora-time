import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import type { Accrual, AccrualStatusHistoryEntry } from "@/app/lib/commissions/accruals.shared";
import type { CompensationEventRow } from "@/app/lib/commissions/compensation-events.mapper.server";
import type {
  CompensationProcessingResultDto,
  ProcessingApiErrorCode,
} from "@/app/lib/commissions/compensation-processing-api.shared";
import type { EligibilityResult } from "@/app/lib/commissions/eligibility.server";

export type CompensationSaleEvent = CompensationEventRow & {
  eligibility: EligibilityResult;
};

export type AccrualWorkflowAction = "submit_review" | "validate" | "send_back";

export type AccrualWithHistory = {
  accrual: Accrual;
  history: AccrualStatusHistoryEntry[];
};

export class CompensationProcessingApiError extends Error {
  code: ProcessingApiErrorCode | string | null;

  constructor(message: string, code: ProcessingApiErrorCode | string | null = null) {
    super(message);
    this.name = "CompensationProcessingApiError";
    this.code = code;
  }
}

async function parseJson<T>(
  response: Response
): Promise<T & { error?: string; errors?: string[]; code?: string }> {
  return (await response.json().catch(() => ({}))) as T & {
    error?: string;
    errors?: string[];
    code?: string;
  };
}

function throwProcessingApiError(
  payload: { error?: string; errors?: string[]; code?: string },
  fallback: string
): never {
  throw new CompensationProcessingApiError(
    payload.error ?? payload.errors?.[0] ?? fallback,
    payload.code ?? null
  );
}

export async function fetchCompensationSaleEvents(searchParams?: URLSearchParams) {
  const query = searchParams?.toString();
  const url = `/api/direction/commissions/sales-events${query ? `?${query}` : ""}`;
  const response = await commissionsFetch(url);
  const payload = await parseJson<{ events?: CompensationSaleEvent[] }>(response);

  if (!response.ok) {
    throw new Error(
      payload.error ?? payload.errors?.[0] ?? "Impossible de charger le livre de commissions."
    );
  }

  return Array.isArray(payload.events) ? payload.events : [];
}

export async function fetchCompensationSaleEvent(eventId: string) {
  const response = await commissionsFetch(`/api/direction/commissions/sales-events/${eventId}`);
  const payload = await parseJson<{ event?: CompensationSaleEvent }>(response);

  if (!response.ok) {
    throw new Error(
      payload.error ?? payload.errors?.[0] ?? "Entrée de commission introuvable."
    );
  }

  if (!payload.event) {
    throw new Error("Entrée de commission introuvable.");
  }

  return payload.event;
}

export async function updateCompensationSaleEvent(
  eventId: string,
  patch: Record<string, unknown>
) {
  const response = await commissionsFetch(
    `/api/direction/commissions/sales-events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    }
  );
  const payload = await parseJson<{ event?: CompensationSaleEvent }>(response);

  if (!response.ok) {
    throw new Error(
      payload.error ?? payload.errors?.[0] ?? "Mise à jour de l'événement impossible."
    );
  }

  if (!payload.event) {
    throw new Error("Réponse de mise à jour invalide.");
  }

  return payload.event;
}

export async function fetchAccrualsForEvent(compensationEventId: string) {
  const response = await commissionsFetch(
    `/api/direction/commissions/accruals?compensation_event_id=${encodeURIComponent(compensationEventId)}`
  );
  const payload = await parseJson<{ accruals?: Accrual[] }>(response);

  if (!response.ok) {
    throw new Error(payload.error ?? payload.errors?.[0] ?? "Impossible de charger les accruals.");
  }

  return Array.isArray(payload.accruals) ? payload.accruals : [];
}

export async function fetchAccrualDetail(accrualId: string) {
  const response = await commissionsFetch(`/api/direction/commissions/accruals/${accrualId}`);
  const payload = await parseJson<{
    accrual?: Accrual;
    history?: AccrualStatusHistoryEntry[];
  }>(response);

  if (!response.ok) {
    throw new Error(payload.error ?? payload.errors?.[0] ?? "Accrual introuvable.");
  }

  if (!payload.accrual) {
    throw new Error("Accrual introuvable.");
  }

  return {
    accrual: payload.accrual,
    history: Array.isArray(payload.history) ? payload.history : [],
  } satisfies AccrualWithHistory;
}

export async function patchAccrualWorkflow(
  accrualId: string,
  action: AccrualWorkflowAction,
  reason?: string | null
) {
  const response = await commissionsFetch(
    `/api/direction/commissions/accruals/${accrualId}/workflow`,
    {
      method: "PATCH",
      body: JSON.stringify({ action, reason: reason ?? null }),
    }
  );
  const payload = await parseJson<{ accrual?: Accrual; error?: string; errors?: string[] }>(
    response
  );

  if (!response.ok) {
    throw new Error(payload.error ?? payload.errors?.[0] ?? "Transition workflow impossible.");
  }

  if (!payload.accrual) {
    throw new Error("Reponse workflow invalide.");
  }

  return payload.accrual;
}

export async function processCompensationSaleEvent(eventId: string) {
  const response = await commissionsFetch(
    `/api/direction/commissions/sales-events/${encodeURIComponent(eventId)}/process`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
  const payload = await parseJson<{ result?: CompensationProcessingResultDto }>(response);

  if (!response.ok) {
    throwProcessingApiError(payload, "Traitement compensation impossible.");
  }

  if (!payload.result) {
    throw new CompensationProcessingApiError("Reponse traitement invalide.");
  }

  return payload.result;
}

export async function recalculateCompensationSaleEvent(eventId: string) {
  const response = await commissionsFetch(
    `/api/direction/commissions/sales-events/${encodeURIComponent(eventId)}/recalculate`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
  const payload = await parseJson<{ result?: CompensationProcessingResultDto }>(response);

  if (!response.ok) {
    throwProcessingApiError(payload, "Recalcul compensation impossible.");
  }

  if (!payload.result) {
    throw new CompensationProcessingApiError("Reponse recalcul invalide.");
  }

  return payload.result;
}

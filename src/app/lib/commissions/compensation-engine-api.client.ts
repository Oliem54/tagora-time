import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import type { Accrual, AccrualStatusHistoryEntry } from "@/app/lib/commissions/accruals.shared";
import type { CompensationEventRow } from "@/app/lib/commissions/compensation-events.mapper.server";
import type { EligibilityResult } from "@/app/lib/commissions/eligibility.server";

export type CompensationSaleEvent = CompensationEventRow & {
  eligibility: EligibilityResult;
};

export type AccrualWorkflowAction = "submit_review" | "validate" | "send_back";

export type AccrualWithHistory = {
  accrual: Accrual;
  history: AccrualStatusHistoryEntry[];
};

async function parseJson<T>(response: Response): Promise<T & { error?: string; errors?: string[] }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string; errors?: string[] };
}

export async function fetchCompensationSaleEvents(searchParams?: URLSearchParams) {
  const query = searchParams?.toString();
  const url = `/api/direction/commissions/sales-events${query ? `?${query}` : ""}`;
  const response = await commissionsFetch(url);
  const payload = await parseJson<{ events?: CompensationSaleEvent[] }>(response);

  if (!response.ok) {
    throw new Error(payload.error ?? payload.errors?.[0] ?? "Impossible de charger les ventes.");
  }

  return Array.isArray(payload.events) ? payload.events : [];
}

export async function fetchCompensationSaleEvent(eventId: string) {
  const response = await commissionsFetch(`/api/direction/commissions/sales-events/${eventId}`);
  const payload = await parseJson<{ event?: CompensationSaleEvent }>(response);

  if (!response.ok) {
    throw new Error(payload.error ?? payload.errors?.[0] ?? "Vente introuvable.");
  }

  if (!payload.event) {
    throw new Error("Vente introuvable.");
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

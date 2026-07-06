import { NextResponse } from "next/server";
import {
  isCompensationEventSaleState,
  isCompensationEventStatus,
  type CompensationEventInput,
} from "@/app/lib/commissions/compensation-events.shared";
import type { CompensationEventListFilters } from "@/app/lib/commissions/compensation-events.persistence.shared";
import type { CompensationEventServiceResult } from "@/app/lib/commissions/compensation-events.service.server";

function asNumber(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSalesEventListFilters(
  searchParams: URLSearchParams
): CompensationEventListFilters {
  const filters: CompensationEventListFilters = {};

  const chauffeurId = asNumber(searchParams.get("chauffeur_id"));
  if (chauffeurId != null && chauffeurId > 0) {
    filters.chauffeur_id = Math.trunc(chauffeurId);
  }

  const status = searchParams.get("status");
  if (status && isCompensationEventStatus(status)) {
    filters.status = status;
  }

  const saleState = searchParams.get("sale_state");
  if (saleState && isCompensationEventSaleState(saleState)) {
    filters.sale_state = saleState;
  }

  const limit = asNumber(searchParams.get("limit"));
  if (limit != null && limit > 0) {
    filters.limit = Math.trunc(limit);
  }

  return filters;
}

export function compensationEventInputFromBody(
  body: Record<string, unknown>
): CompensationEventInput {
  return {
    event_type: body.event_type,
    status: body.status,
    sale_state: body.sale_state,
    chauffeur_id: body.chauffeur_id,
    amount: body.amount,
    sold_at: body.sold_at,
    delivered_at: body.delivered_at,
    invoiced_at: body.invoiced_at,
    collected_at: body.collected_at,
    company_context: body.company_context,
    external_reference: body.external_reference,
    label: body.label,
    notes: body.notes,
  };
}

export function compensationEventServiceResultToResponse<T>(
  result: CompensationEventServiceResult<T>,
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

  if (result.code === "VALIDATION") {
    return NextResponse.json({ error: result.errors[0] ?? "Donnees invalides.", errors: result.errors }, { status: 400 });
  }

  return NextResponse.json(
    { error: result.errors[0] ?? "Erreur persistance compensation event." },
    { status: 500 }
  );
}

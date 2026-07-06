import {
  COMPENSATION_EVENT_TYPE_SALE,
  isCompensationEventSaleState,
  isCompensationEventStatus,
  isCompensationEventType,
  type CompensationEvent,
  type CompensationEventSaleState,
  type CompensationEventStatus,
  type CompensationEventType,
} from "@/app/lib/commissions/compensation-events.shared";

export type CompensationEventRow = CompensationEvent & {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type CompensationEventInsertPayload = Omit<
  CompensationEvent,
  "id"
> & {
  created_by?: string | null;
  updated_by?: string | null;
};

export type CompensationEventUpdatePayload = CompensationEventInsertPayload;

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalDate(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text.slice(0, 10) : null;
}

function normalizeDateField(value: string | null): string | null {
  return asOptionalDate(value);
}

function normalizeEventType(value: unknown): CompensationEventType {
  return isCompensationEventType(value) ? value : COMPENSATION_EVENT_TYPE_SALE;
}

function normalizeStatus(value: unknown): CompensationEventStatus {
  return isCompensationEventStatus(value) ? value : "active";
}

function normalizeSaleState(value: unknown): CompensationEventSaleState {
  return isCompensationEventSaleState(value) ? value : "sold";
}

export function mapCompensationEventRow(
  row: Record<string, unknown>
): CompensationEventRow {
  return {
    id: String(row.id ?? ""),
    event_type: normalizeEventType(row.event_type),
    status: normalizeStatus(row.status),
    sale_state: normalizeSaleState(row.sale_state),
    chauffeur_id: Math.trunc(asNumber(row.chauffeur_id)),
    amount: asNumber(row.amount),
    sold_at: asOptionalDate(row.sold_at),
    delivered_at: asOptionalDate(row.delivered_at),
    invoiced_at: asOptionalDate(row.invoiced_at),
    collected_at: asOptionalDate(row.collected_at),
    company_context: asOptionalText(row.company_context),
    external_reference: asOptionalText(row.external_reference),
    label: asOptionalText(row.label),
    notes: asOptionalText(row.notes),
    created_by: asOptionalText(row.created_by),
    updated_by: asOptionalText(row.updated_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function mapDomainToCompensationEventInsertPayload(
  event: CompensationEvent,
  audit?: { actorUserId?: string | null }
): CompensationEventInsertPayload {
  return {
    event_type: event.event_type,
    status: event.status,
    sale_state: event.sale_state,
    chauffeur_id: event.chauffeur_id,
    amount: event.amount,
    sold_at: event.sold_at,
    delivered_at: event.delivered_at,
    invoiced_at: event.invoiced_at,
    collected_at: event.collected_at,
    company_context: event.company_context,
    external_reference: event.external_reference,
    label: event.label,
    notes: event.notes,
    created_by: audit?.actorUserId ?? null,
    updated_by: audit?.actorUserId ?? null,
  };
}

export function mapDomainToCompensationEventUpdatePayload(
  event: CompensationEvent,
  audit?: { actorUserId?: string | null }
): CompensationEventUpdatePayload {
  return {
    ...mapDomainToCompensationEventInsertPayload(event, audit),
    created_by: undefined,
    updated_by: audit?.actorUserId ?? null,
  };
}

export function mapInsertPayloadToDatabaseRow(
  payload: CompensationEventInsertPayload
): Record<string, unknown> {
  return {
    event_type: payload.event_type,
    status: payload.status,
    sale_state: payload.sale_state,
    chauffeur_id: payload.chauffeur_id,
    amount: payload.amount,
    sold_at: normalizeDateField(payload.sold_at),
    delivered_at: normalizeDateField(payload.delivered_at),
    invoiced_at: normalizeDateField(payload.invoiced_at),
    collected_at: normalizeDateField(payload.collected_at),
    company_context: payload.company_context,
    external_reference: payload.external_reference,
    label: payload.label,
    notes: payload.notes,
    created_by: payload.created_by ?? null,
    updated_by: payload.updated_by ?? null,
  };
}

export function mapUpdatePayloadToDatabaseRow(
  payload: CompensationEventUpdatePayload
): Record<string, unknown> {
  const row = mapInsertPayloadToDatabaseRow(payload);
  delete row.created_by;
  return row;
}

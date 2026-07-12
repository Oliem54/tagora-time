export const COMPENSATION_EVENT_TYPE_SALE = "sale" as const;

export type CompensationEventType = typeof COMPENSATION_EVENT_TYPE_SALE;

export const PHASE1_COMPENSATION_EVENT_TYPES = [COMPENSATION_EVENT_TYPE_SALE] as const;

export type CompensationEventStatus = "active" | "cancelled" | "corrected";

export type CompensationEventSaleState = "sold" | "delivered" | "invoiced" | "collected";

export const COMPENSATION_EVENT_STATUS_ACTIVE = "active" as const;
export const COMPENSATION_EVENT_STATUS_CANCELLED = "cancelled" as const;
export const COMPENSATION_EVENT_STATUS_CORRECTED = "corrected" as const;

export const COMPENSATION_EVENT_SALE_STATE_SOLD = "sold" as const;
export const COMPENSATION_EVENT_SALE_STATE_DELIVERED = "delivered" as const;
export const COMPENSATION_EVENT_SALE_STATE_INVOICED = "invoiced" as const;
export const COMPENSATION_EVENT_SALE_STATE_COLLECTED = "collected" as const;

export const DELIVERED_COMPENSATION_EVENT_SALE_STATES: readonly CompensationEventSaleState[] = [
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_SALE_STATE_INVOICED,
  COMPENSATION_EVENT_SALE_STATE_COLLECTED,
];

export const COMPENSATION_EVENT_TYPE_LABELS: Record<CompensationEventType, string> = {
  sale: "Événement",
};

export const COMPENSATION_EVENT_STATUS_LABELS: Record<CompensationEventStatus, string> = {
  active: "Actif",
  cancelled: "Annulé",
  corrected: "Corrigé",
};

export const COMPENSATION_EVENT_SALE_STATE_LABELS: Record<CompensationEventSaleState, string> = {
  sold: "Consigné",
  delivered: "Livré",
  invoiced: "Facturé",
  collected: "Encaissé",
};

export type CompensationEvent = {
  id?: string;
  event_type: CompensationEventType;
  status: CompensationEventStatus;
  sale_state: CompensationEventSaleState;
  chauffeur_id: number | null;
  amount: number;
  sold_at: string | null;
  delivered_at: string | null;
  invoiced_at: string | null;
  collected_at: string | null;
  company_context: string | null;
  external_reference: string | null;
  label: string | null;
  notes: string | null;
};

export type CompensationEventInput = {
  event_type: unknown;
  status?: unknown;
  sale_state?: unknown;
  chauffeur_id?: unknown;
  amount?: unknown;
  sold_at?: unknown;
  delivered_at?: unknown;
  invoiced_at?: unknown;
  collected_at?: unknown;
  company_context?: unknown;
  external_reference?: unknown;
  label?: unknown;
  notes?: unknown;
};

export type CompensationEventValidationResult =
  | { ok: true; value: CompensationEvent }
  | { ok: false; errors: string[] };

function asOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalIsoDate(value: unknown): string | null {
  const text = asOptionalText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return text;
}

function asNumber(value: unknown, fallback: number | null = null): number | null {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isCompensationEventType(value: unknown): value is CompensationEventType {
  return value === COMPENSATION_EVENT_TYPE_SALE;
}

export function isCompensationEventStatus(value: unknown): value is CompensationEventStatus {
  return (
    value === COMPENSATION_EVENT_STATUS_ACTIVE ||
    value === COMPENSATION_EVENT_STATUS_CANCELLED ||
    value === COMPENSATION_EVENT_STATUS_CORRECTED
  );
}

export function isCompensationEventSaleState(value: unknown): value is CompensationEventSaleState {
  return (
    value === COMPENSATION_EVENT_SALE_STATE_SOLD ||
    value === COMPENSATION_EVENT_SALE_STATE_DELIVERED ||
    value === COMPENSATION_EVENT_SALE_STATE_INVOICED ||
    value === COMPENSATION_EVENT_SALE_STATE_COLLECTED
  );
}

export function isDeliveredCompensationEventSaleState(
  saleState: CompensationEventSaleState
): boolean {
  return DELIVERED_COMPENSATION_EVENT_SALE_STATES.includes(saleState);
}

export function isSaleCompensationEventDelivered(
  event: Pick<CompensationEvent, "sale_state" | "delivered_at">
): boolean {
  if (isDeliveredCompensationEventSaleState(event.sale_state)) return true;
  return asOptionalIsoDate(event.delivered_at) != null;
}

export function isSaleCompensationEventActive(
  event: Pick<CompensationEvent, "status">
): boolean {
  return event.status === COMPENSATION_EVENT_STATUS_ACTIVE;
}

function validateSaleStateDateCoherence(input: {
  sale_state: CompensationEventSaleState;
  sold_at: string | null;
  delivered_at: string | null;
  invoiced_at: string | null;
  collected_at: string | null;
}): string[] {
  const errors: string[] = [];

  if (input.sale_state !== COMPENSATION_EVENT_SALE_STATE_SOLD && !input.sold_at) {
    errors.push("sold_at est requis lorsque l'événement n'est plus au stade consigné.");
  }

  if (
    isDeliveredCompensationEventSaleState(input.sale_state) &&
    !input.delivered_at &&
    input.sale_state !== COMPENSATION_EVENT_SALE_STATE_SOLD
  ) {
    errors.push("delivered_at est requis lorsque l'événement est livré ou au-delà.");
  }

  if (
    (input.sale_state === COMPENSATION_EVENT_SALE_STATE_INVOICED ||
      input.sale_state === COMPENSATION_EVENT_SALE_STATE_COLLECTED) &&
    !input.invoiced_at
  ) {
    errors.push("invoiced_at est requis lorsque l'événement est facturé ou encaissé.");
  }

  if (input.sale_state === COMPENSATION_EVENT_SALE_STATE_COLLECTED && !input.collected_at) {
    errors.push("collected_at est requis lorsque l'événement est encaissé.");
  }

  return errors;
}

export function validateSaleCompensationEventInput(
  input: CompensationEventInput
): CompensationEventValidationResult {
  const errors: string[] = [];

  if (!isCompensationEventType(input.event_type)) {
    return {
      ok: false,
      errors: ["Type d'événement hors périmètre Phase 1."],
    };
  }

  const status = isCompensationEventStatus(input.status)
    ? input.status
    : COMPENSATION_EVENT_STATUS_ACTIVE;
  if (input.status != null && !isCompensationEventStatus(input.status)) {
    errors.push("Statut d'événement invalide.");
  }

  const sale_state = isCompensationEventSaleState(input.sale_state)
    ? input.sale_state
    : COMPENSATION_EVENT_SALE_STATE_SOLD;
  if (input.sale_state != null && !isCompensationEventSaleState(input.sale_state)) {
    errors.push("État source invalide.");
  }

  const chauffeur_id = asNumber(input.chauffeur_id);
  if (chauffeur_id == null || chauffeur_id <= 0) {
    errors.push("Un employé assigné est requis.");
  }

  const amount = asNumber(input.amount);
  if (amount == null || amount < 0) {
    errors.push("Le montant doit être un nombre positif ou nul.");
  }

  const sold_at = asOptionalIsoDate(input.sold_at);
  const delivered_at = asOptionalIsoDate(input.delivered_at);
  const invoiced_at = asOptionalIsoDate(input.invoiced_at);
  const collected_at = asOptionalIsoDate(input.collected_at);

  if (input.sold_at != null && input.sold_at !== "" && !sold_at) {
    errors.push("sold_at invalide.");
  }
  if (input.delivered_at != null && input.delivered_at !== "" && !delivered_at) {
    errors.push("delivered_at invalide.");
  }
  if (input.invoiced_at != null && input.invoiced_at !== "" && !invoiced_at) {
    errors.push("invoiced_at invalide.");
  }
  if (input.collected_at != null && input.collected_at !== "" && !collected_at) {
    errors.push("collected_at invalide.");
  }

  errors.push(
    ...validateSaleStateDateCoherence({
      sale_state,
      sold_at,
      delivered_at,
      invoiced_at,
      collected_at,
    })
  );

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      event_type: COMPENSATION_EVENT_TYPE_SALE,
      status,
      sale_state,
      chauffeur_id: Math.trunc(chauffeur_id!),
      amount: amount!,
      sold_at,
      delivered_at,
      invoiced_at,
      collected_at,
      company_context: asOptionalText(input.company_context),
      external_reference: asOptionalText(input.external_reference),
      label: asOptionalText(input.label),
      notes: asOptionalText(input.notes),
    },
  };
}

export function validateSaleCompensationEventUpdateInput(
  current: CompensationEvent,
  patch: CompensationEventInput
): CompensationEventValidationResult {
  return validateSaleCompensationEventInput({
    event_type: patch.event_type ?? current.event_type,
    status: patch.status ?? current.status,
    sale_state: patch.sale_state ?? current.sale_state,
    chauffeur_id: patch.chauffeur_id ?? current.chauffeur_id,
    amount: patch.amount ?? current.amount,
    sold_at: patch.sold_at ?? current.sold_at,
    delivered_at: patch.delivered_at ?? current.delivered_at,
    invoiced_at: patch.invoiced_at ?? current.invoiced_at,
    collected_at: patch.collected_at ?? current.collected_at,
    company_context: patch.company_context ?? current.company_context,
    external_reference: patch.external_reference ?? current.external_reference,
    label: patch.label ?? current.label,
    notes: patch.notes ?? current.notes,
  });
}

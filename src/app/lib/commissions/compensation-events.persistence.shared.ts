import type {
  CompensationEventInsertPayload,
  CompensationEventRow,
  CompensationEventUpdatePayload,
} from "@/app/lib/commissions/compensation-events.mapper.server";
import type {
  CompensationEventSaleState,
  CompensationEventStatus,
} from "@/app/lib/commissions/compensation-events.shared";

export type CompensationEventListFilters = {
  chauffeur_id?: number;
  status?: CompensationEventStatus;
  sale_state?: CompensationEventSaleState;
  limit?: number;
};

export type CompensationEventsRepository = {
  list(filters?: CompensationEventListFilters): Promise<CompensationEventRow[]>;
  getById(id: string): Promise<CompensationEventRow | null>;
  insert(payload: CompensationEventInsertPayload): Promise<CompensationEventRow>;
  update(
    id: string,
    payload: CompensationEventUpdatePayload
  ): Promise<CompensationEventRow | null>;
};

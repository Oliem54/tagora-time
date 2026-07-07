import type {
  Accrual,
  AccrualStatusHistoryEntry,
  AccrualWorkflowStatusPhase1,
} from "@/app/lib/commissions/accruals.shared";
import type {
  AccrualInsertPayload,
  AccrualStatusHistoryInsertPayload,
} from "@/app/lib/commissions/accruals.mapper.server";

export type AccrualsListFilters = {
  compensation_event_id?: string;
  status?: AccrualWorkflowStatusPhase1;
  limit?: number;
};

export type AccrualsRepository = {
  list(filters?: AccrualsListFilters): Promise<Accrual[]>;
  listByEventId(compensationEventId: string): Promise<Accrual[]>;
  getById(id: string): Promise<Accrual | null>;
  insertMany(payloads: AccrualInsertPayload[]): Promise<Accrual[]>;
  updateStatus(
    id: string,
    status: AccrualWorkflowStatusPhase1,
    audit?: { actorUserId?: string | null }
  ): Promise<Accrual | null>;
  deleteByEventIdAndStatuses(
    compensationEventId: string,
    statuses: AccrualWorkflowStatusPhase1[]
  ): Promise<number>;
};

export type AccrualStatusHistoryRepository = {
  listByAccrualId(accrualId: string): Promise<AccrualStatusHistoryEntry[]>;
  append(payload: AccrualStatusHistoryInsertPayload): Promise<AccrualStatusHistoryEntry>;
};

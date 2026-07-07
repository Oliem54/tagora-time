import {
  isAccrualWorkflowStatusPhase1,
  type Accrual,
  type AccrualDraft,
  type AccrualStatusHistoryEntry,
  type AccrualWorkflowStatusPhase1,
} from "@/app/lib/commissions/accruals.shared";
import { isCompensationComponent } from "@/app/lib/commissions/commissions.shared";

export type AccrualInsertPayload = Omit<
  Accrual,
  "id" | "created_at" | "updated_at"
>;

export type AccrualStatusHistoryInsertPayload = {
  accrual_id: string;
  from_status: AccrualWorkflowStatusPhase1 | null;
  to_status: AccrualWorkflowStatusPhase1;
  changed_by?: string | null;
  reason?: string | null;
};

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

function normalizeStatus(value: unknown): AccrualWorkflowStatusPhase1 {
  return isAccrualWorkflowStatusPhase1(value) ? value : "draft";
}

function normalizeComponent(value: unknown) {
  return isCompensationComponent(value) ? value : "commission";
}

export function mapAccrualRow(row: Record<string, unknown>): Accrual {
  return {
    id: String(row.id ?? ""),
    compensation_event_id: String(row.compensation_event_id ?? ""),
    component: normalizeComponent(row.component),
    rule_name: String(row.rule_name ?? ""),
    label: String(row.label ?? ""),
    sales_basis_amount: asNumber(row.sales_basis_amount),
    calculated_amount: asNumber(row.calculated_amount),
    status: normalizeStatus(row.status),
    period_start: asOptionalDate(row.period_start),
    period_end: asOptionalDate(row.period_end),
    created_by: asOptionalText(row.created_by),
    updated_by: asOptionalText(row.updated_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function mapAccrualStatusHistoryRow(
  row: Record<string, unknown>
): AccrualStatusHistoryEntry {
  const fromStatus = row.from_status;
  return {
    id: String(row.id ?? ""),
    accrual_id: String(row.accrual_id ?? ""),
    from_status:
      fromStatus == null
        ? null
        : isAccrualWorkflowStatusPhase1(fromStatus)
          ? fromStatus
          : null,
    to_status: normalizeStatus(row.to_status),
    changed_at: String(row.changed_at ?? ""),
    changed_by: asOptionalText(row.changed_by),
    reason: asOptionalText(row.reason),
  };
}

export function mapAccrualDraftToInsertPayload(
  draft: AccrualDraft,
  options?: {
    status?: AccrualWorkflowStatusPhase1;
    actorUserId?: string | null;
  }
): AccrualInsertPayload {
  return {
    compensation_event_id: draft.compensation_event_id,
    component: draft.component,
    rule_name: draft.rule_name,
    label: draft.label,
    sales_basis_amount: draft.sales_basis_amount,
    calculated_amount: draft.calculated_amount,
    status: options?.status ?? "calculated",
    period_start: draft.period_start,
    period_end: draft.period_end,
    created_by: options?.actorUserId ?? null,
    updated_by: options?.actorUserId ?? null,
  };
}

export function mapAccrualInsertPayloadToDatabaseRow(
  payload: AccrualInsertPayload
): Record<string, unknown> {
  return {
    compensation_event_id: payload.compensation_event_id,
    component: payload.component,
    rule_name: payload.rule_name,
    label: payload.label,
    sales_basis_amount: payload.sales_basis_amount,
    calculated_amount: payload.calculated_amount,
    status: payload.status,
    period_start: asOptionalDate(payload.period_start),
    period_end: asOptionalDate(payload.period_end),
    created_by: payload.created_by ?? null,
    updated_by: payload.updated_by ?? null,
  };
}

export function mapAccrualStatusHistoryInsertPayloadToDatabaseRow(
  payload: AccrualStatusHistoryInsertPayload
): Record<string, unknown> {
  return {
    accrual_id: payload.accrual_id,
    from_status: payload.from_status,
    to_status: payload.to_status,
    changed_by: payload.changed_by ?? null,
    reason: payload.reason ?? null,
  };
}

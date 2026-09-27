import { isAutoMissingExpectedPunchException } from "@/app/lib/horodateur-expected-punch-missing.shared";

export const EXCEPTION_BULK_ACTIONS = [
  "preview",
  "approve",
  "refuse",
  "resolve",
  "archive",
  "restore",
  "soft_delete",
  "export",
] as const;

export type ExceptionBulkAction = (typeof EXCEPTION_BULK_ACTIONS)[number];

export const EXCEPTION_BULK_MUTATIONS = [
  "approve",
  "refuse",
  "resolve",
  "archive",
  "restore",
  "soft_delete",
] as const;

export type ExceptionBulkMutation = (typeof EXCEPTION_BULK_MUTATIONS)[number];

export type ExceptionBulkFilter = {
  organizationId: string;
  organizationCompanyId: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  employeeId?: number | null;
  exceptionType?: string | null;
  status?: string | null;
  gravity?: "critique" | "standard" | null;
  expectedEventType?: string | null;
  punchPresence?: "present" | "absent" | null;
  notificationState?: "pending" | "sent" | "failed" | null;
  search?: string | null;
  archiveState?: "active" | "archived" | "all" | null;
  includeDeleted?: boolean;
};

export type ExceptionBulkCandidate = {
  id: string;
  organizationId: string;
  organizationCompanyId: string;
  employeeId: number;
  exceptionType: string;
  status: string;
  requestedAt: string;
  workDate: string | null;
  reasonLabel: string;
  details: string | null;
  expectedEventType: string | null;
  directionEmailNotifiedAt: string | null;
  directionSmsNotifiedAt: string | null;
  directionReminderEmailNotifiedAt: string | null;
  directionReminderSmsNotifiedAt: string | null;
  notificationFailed: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
};

const BULK_ROLES = new Set([
  "organization_owner",
  "organization_admin",
  "admin",
  "direction",
]);

export function canRunExceptionBulkAction(role: string | null | undefined): boolean {
  return BULK_ROLES.has((role ?? "").trim());
}

export function deriveExceptionGravity(exceptionType: string): "critique" | "standard" {
  if (exceptionType === "missing_punch_adjustment" || exceptionType === "shift_too_long") {
    return "critique";
  }
  return "standard";
}

export function exceptionNotificationState(
  row: Pick<
    ExceptionBulkCandidate,
    | "directionEmailNotifiedAt"
    | "directionSmsNotifiedAt"
    | "directionReminderEmailNotifiedAt"
    | "directionReminderSmsNotifiedAt"
    | "notificationFailed"
  >
): "pending" | "sent" | "failed" {
  if (row.notificationFailed) return "failed";
  if (
    row.directionEmailNotifiedAt ||
    row.directionSmsNotifiedAt ||
    row.directionReminderEmailNotifiedAt ||
    row.directionReminderSmsNotifiedAt
  ) {
    return "sent";
  }
  return "pending";
}

export function exceptionPunchPresence(
  row: Pick<ExceptionBulkCandidate, "exceptionType" | "reasonLabel" | "details" | "expectedEventType">
): "present" | "absent" {
  if (
    isAutoMissingExpectedPunchException({
      reasonLabel: row.reasonLabel,
      details: row.details,
    })
  ) {
    return "absent";
  }
  if (!row.expectedEventType) return "absent";
  return "present";
}

export function exceptionMatchesBulkFilter(
  row: ExceptionBulkCandidate,
  filter: ExceptionBulkFilter
): boolean {
  if (row.organizationId !== filter.organizationId) return false;
  if (row.organizationCompanyId !== filter.organizationCompanyId) return false;
  if (!filter.includeDeleted && row.deletedAt) return false;
  const archiveState = filter.archiveState ?? "active";
  if (archiveState === "active" && row.archivedAt) return false;
  if (archiveState === "archived" && !row.archivedAt) return false;
  if (filter.employeeId && row.employeeId !== filter.employeeId) return false;
  if (filter.exceptionType && row.exceptionType !== filter.exceptionType) return false;
  if (filter.status && row.status !== filter.status) return false;
  if (filter.gravity && deriveExceptionGravity(row.exceptionType) !== filter.gravity) return false;
  if (filter.expectedEventType && row.expectedEventType !== filter.expectedEventType) return false;
  if (filter.punchPresence && exceptionPunchPresence(row) !== filter.punchPresence) return false;
  if (
    filter.notificationState &&
    exceptionNotificationState(row) !== filter.notificationState
  ) {
    return false;
  }
  const workDate = row.workDate ?? row.requestedAt.slice(0, 10);
  if (filter.periodFrom && workDate < filter.periodFrom) return false;
  if (filter.periodTo && workDate > filter.periodTo) return false;
  const search = filter.search?.trim().toLowerCase() ?? "";
  if (search) {
    const haystack = `${row.reasonLabel} ${row.details ?? ""} ${row.exceptionType}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}

export type ExceptionBulkPatch =
  | { kind: "noop" }
  | { kind: "reject"; code: string }
  | { kind: "update"; values: Record<string, string | null> };

const FORBIDDEN_PATCH_KEYS = [
  "employee_id",
  "shift_id",
  "source_event_id",
  "impact_minutes",
  "approved_minutes",
  "organization_id",
  "organization_company_id",
];

export function buildExceptionBulkPatch(input: {
  row: Pick<ExceptionBulkCandidate, "status" | "archivedAt" | "deletedAt">;
  action: ExceptionBulkMutation;
  actorUserId: string;
  motif: string | null;
  bulkActionId: string;
  nowIso: string;
}): ExceptionBulkPatch {
  const { row, action, actorUserId, motif, bulkActionId, nowIso } = input;
  if (action === "restore") {
    if (!row.archivedAt && !row.deletedAt) return { kind: "noop" };
    return {
      kind: "update",
      values: {
        archived_at: null,
        archived_by: null,
        deleted_at: null,
        deleted_by: null,
        bulk_action_id: bulkActionId,
        motif,
        updated_at: nowIso,
      },
    };
  }
  if (row.deletedAt && action !== "soft_delete") {
    return { kind: "reject", code: "exception_deleted" };
  }
  if (action === "soft_delete") {
    if (row.deletedAt) return { kind: "noop" };
    return {
      kind: "update",
      values: {
        deleted_at: nowIso,
        deleted_by: actorUserId,
        bulk_action_id: bulkActionId,
        motif,
        updated_at: nowIso,
      },
    };
  }
  if (action === "archive") {
    if (row.archivedAt) return { kind: "noop" };
    return {
      kind: "update",
      values: {
        archived_at: nowIso,
        archived_by: actorUserId,
        bulk_action_id: bulkActionId,
        motif,
        updated_at: nowIso,
      },
    };
  }
  const targetStatus =
    action === "approve" ? "approuve" : action === "refuse" ? "refuse" : "modifie";
  if (row.status === targetStatus) return { kind: "noop" };
  if (row.status !== "en_attente") {
    return { kind: "reject", code: "exception_already_reviewed" };
  }
  return {
    kind: "update",
    values: {
      status: targetStatus,
      reviewed_at: nowIso,
      reviewed_by_user_id: actorUserId,
      review_note: motif,
      bulk_action_id: bulkActionId,
      motif,
      updated_at: nowIso,
    },
  };
}

export function assertBulkPatchDoesNotTouchOperationalTime(patch: ExceptionBulkPatch): boolean {
  if (patch.kind !== "update") return true;
  return FORBIDDEN_PATCH_KEYS.every((key) => !(key in patch.values));
}

export function paginateMatched<T>(rows: T[], page: number, pageSize: number) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.floor(pageSize))) : 25;
  const start = (safePage - 1) * safeSize;
  return {
    page: safePage,
    pageSize: safeSize,
    total: rows.length,
    rows: rows.slice(start, start + safeSize),
  };
}

export function bulkResultLabel(successCount: number, failureCount: number): "success" | "partial" | "failed" {
  if (failureCount === 0) return "success";
  if (successCount === 0) return "failed";
  return "partial";
}

export function sameIdempotentBulkRequest(input: {
  previousAction: string;
  action: string;
  previousCount: number;
  confirmedCount: number;
}): boolean {
  return input.previousAction === input.action && input.previousCount === input.confirmedCount;
}

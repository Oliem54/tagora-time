import "server-only";

import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { HorodateurPhase1Error } from "@/app/lib/horodateur-v1/types";
import {
  assertBulkPatchDoesNotTouchOperationalTime,
  buildExceptionBulkPatch,
  bulkResultLabel,
  deriveExceptionGravity,
  type ExceptionBulkAction,
  type ExceptionBulkCandidate,
  type ExceptionBulkFilter,
  type ExceptionBulkMutation,
  exceptionMatchesBulkFilter,
  paginateMatched,
  sameIdempotentBulkRequest,
  EXCEPTION_BULK_MUTATIONS,
} from "@/app/lib/horodateur-v1/horodateur-exception-bulk.shared";

type ExceptionRow = {
  id: string;
  organization_id: string | null;
  organization_company_id: string | null;
  employee_id: number;
  exception_type: string;
  status: string;
  requested_at: string;
  reason_label: string;
  details: string | null;
  direction_email_notified_at: string | null;
  direction_sms_notified_at: string | null;
  direction_reminder_email_notified_at: string | null;
  direction_reminder_sms_notified_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  event: { work_date: string | null; event_type: string | null; status: string | null } | null;
};

function mapRow(row: ExceptionRow, failedIds: Set<string>): ExceptionBulkCandidate | null {
  if (!row.organization_id || !row.organization_company_id) return null;
  const event = Array.isArray(row.event) ? row.event[0] : row.event;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationCompanyId: row.organization_company_id,
    employeeId: row.employee_id,
    exceptionType: row.exception_type,
    status: row.status,
    requestedAt: row.requested_at,
    workDate: event?.work_date ?? null,
    reasonLabel: row.reason_label,
    details: row.details,
    expectedEventType: event?.event_type ?? null,
    directionEmailNotifiedAt: row.direction_email_notified_at,
    directionSmsNotifiedAt: row.direction_sms_notified_at,
    directionReminderEmailNotifiedAt: row.direction_reminder_email_notified_at,
    directionReminderSmsNotifiedAt: row.direction_reminder_sms_notified_at,
    notificationFailed: failedIds.has(row.id),
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
  };
}

async function assertCompanyInOrganization(organizationId: string, organizationCompanyId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("organization_companies")
    .select("id")
    .eq("id", organizationCompanyId)
    .eq("organization_id", organizationId)
    .maybeSingle<{ id: string }>();
  if (error || !data) {
    throw new HorodateurPhase1Error("Compagnie hors de l organisation.", {
      code: "company_scope_mismatch",
      status: 403,
    });
  }
}

async function loadFailedExceptionIds(organizationId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("app_alerts")
    .select("ref_id")
    .eq("ref_table", "horodateur_exceptions")
    .eq("status", "failed");
  if (error) return new Set<string>();
  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (typeof row.ref_id === "string" && row.ref_id) ids.add(row.ref_id);
  }
  void organizationId;
  return ids;
}

async function loadCandidates(filter: ExceptionBulkFilter) {
  const supabase = createAdminSupabaseClient();
  const pageSize = 1000;
  const rows: ExceptionRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("horodateur_exceptions")
      .select(
        "id, organization_id, organization_company_id, employee_id, exception_type, status, requested_at, reason_label, details, direction_email_notified_at, direction_sms_notified_at, direction_reminder_email_notified_at, direction_reminder_sms_notified_at, archived_at, deleted_at, event:horodateur_events!horodateur_exceptions_source_event_id_fkey(work_date, event_type, status)"
      )
      .eq("organization_id", filter.organizationId)
      .eq("organization_company_id", filter.organizationCompanyId)
      .order("requested_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      throw new HorodateurPhase1Error("Lecture des exceptions impossible.", {
        code: "exception_bulk_read_failed",
        status: 500,
      });
    }
    const batch = (data ?? []) as unknown as ExceptionRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  const failedIds = await loadFailedExceptionIds(filter.organizationId);
  return rows
    .map((row) => mapRow(row, failedIds))
    .filter((row): row is ExceptionBulkCandidate => row !== null)
    .filter((row) => exceptionMatchesBulkFilter(row, filter));
}

function selectTargets(
  matched: ExceptionBulkCandidate[],
  selection: "page" | "all_filtered",
  ids: string[] | undefined,
  page: number,
  pageSize: number
) {
  if (selection === "all_filtered") return matched;
  const pageIds = new Set(paginateMatched(matched, page, pageSize).rows.map((row) => row.id));
  const requested = new Set(ids ?? []);
  return matched.filter((row) => pageIds.has(row.id) && requested.has(row.id));
}

async function findIdempotentAudit(input: {
  organizationId: string;
  idempotencyKey: string;
  action: ExceptionBulkAction;
  confirmedCount: number;
}) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("horodateur_exception_bulk_audit")
    .select("action, requested_count, result_payload")
    .eq("organization_id", input.organizationId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle<{
      action: string;
      requested_count: number;
      result_payload: Record<string, unknown> | null;
    }>();
  if (error || !data) return null;
  if (
    !sameIdempotentBulkRequest({
      previousAction: data.action,
      action: input.action,
      previousCount: data.requested_count,
      confirmedCount: input.confirmedCount,
    })
  ) {
    throw new HorodateurPhase1Error("Cle d idempotence deja utilisee pour une autre action.", {
      code: "idempotency_conflict",
      status: 409,
    });
  }
  return data.result_payload;
}

async function writeAudit(input: {
  bulkActionId: string;
  organizationId: string;
  organizationCompanyId: string;
  actorUserId: string;
  action: ExceptionBulkAction;
  filters: ExceptionBulkFilter;
  requestedCount: number;
  successCount: number;
  failureCount: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}) {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("horodateur_exception_bulk_audit").insert({
    bulk_action_id: input.bulkActionId,
    organization_id: input.organizationId,
    organization_company_id: input.organizationCompanyId,
    actor_user_id: input.actorUserId,
    action: input.action,
    filters: input.filters,
    requested_count: input.requestedCount,
    success_count: input.successCount,
    failure_count: input.failureCount,
    result: bulkResultLabel(input.successCount, input.failureCount),
    idempotency_key: input.idempotencyKey,
    result_payload: input.payload,
  });
  if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) {
    throw new HorodateurPhase1Error("Journal d audit indisponible.", {
      code: "exception_bulk_audit_failed",
      status: 500,
    });
  }
}

export async function listExceptionBulkCompanies(organizationId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("organization_companies")
    .select("id, company_code, status")
    .eq("organization_id", organizationId)
    .order("company_code", { ascending: true });
  if (error) {
    throw new HorodateurPhase1Error("Compagnies introuvables.", {
      code: "company_list_failed",
      status: 500,
    });
  }
  return data ?? [];
}

export async function runExceptionBulkAction(input: {
  organizationId: string;
  actorUserId: string;
  action: ExceptionBulkAction;
  selection: "page" | "all_filtered";
  ids?: string[];
  filter: ExceptionBulkFilter;
  page?: number;
  pageSize?: number;
  confirmedCount?: number;
  idempotencyKey?: string;
  motif?: string | null;
}) {
  const organizationId = input.organizationId.trim();
  const organizationCompanyId = input.filter.organizationCompanyId.trim();
  if (!organizationId || !organizationCompanyId) {
    throw new HorodateurPhase1Error("Organisation et compagnie obligatoires.", {
      code: "organization_and_company_required",
      status: 400,
    });
  }
  if (input.filter.organizationId !== organizationId) {
    throw new HorodateurPhase1Error("Filtre organisation incoherent.", {
      code: "organization_scope_mismatch",
      status: 403,
    });
  }
  await assertCompanyInOrganization(organizationId, organizationCompanyId);
  const filter = { ...input.filter, organizationId, organizationCompanyId };
  const matched = await loadCandidates(filter);
  const page = paginateMatched(matched, input.page ?? 1, input.pageSize ?? 25);
  const targets = selectTargets(matched, input.selection, input.ids, page.page, page.pageSize);

  if (input.action === "preview" || input.action === "export") {
    const payload = {
      ok: true,
      action: input.action,
      total: matched.length,
      page: page.page,
      pageSize: page.pageSize,
      selectedCount: targets.length,
      rows: (input.action === "export" ? matched : page.rows).map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        exceptionType: row.exceptionType,
        status: row.status,
        requestedAt: row.requestedAt,
        workDate: row.workDate,
        gravity: deriveExceptionGravity(row.exceptionType),
        notificationState: row.notificationFailed
          ? "failed"
          : row.directionEmailNotifiedAt || row.directionSmsNotifiedAt
            ? "sent"
            : "pending",
      })),
    };
    return payload;
  }

  if (!EXCEPTION_BULK_MUTATIONS.includes(input.action as ExceptionBulkMutation)) {
    throw new HorodateurPhase1Error("Action en lot inconnue.", {
      code: "unknown_bulk_action",
      status: 400,
    });
  }
  const confirmedCount = input.confirmedCount;
  if (confirmedCount !== targets.length) {
    throw new HorodateurPhase1Error("Le nombre confirme ne correspond pas a la selection.", {
      code: "confirmed_count_mismatch",
      status: 409,
    });
  }
  const idempotencyKey = input.idempotencyKey?.trim() ?? "";
  if (!idempotencyKey) {
    throw new HorodateurPhase1Error("Cle d idempotence obligatoire.", {
      code: "idempotency_key_required",
      status: 400,
    });
  }
  const previous = await findIdempotentAudit({
    organizationId,
    idempotencyKey,
    action: input.action,
    confirmedCount,
  });
  if (previous) {
    return { ...previous, idempotentReplay: true };
  }

  const bulkActionId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const motif = input.motif?.trim() || null;
  let successCount = 0;
  let failureCount = 0;
  const failures: Array<{ id: string; code: string }> = [];
  const supabase = createAdminSupabaseClient();

  for (const row of targets) {
    const patch = buildExceptionBulkPatch({
      row,
      action: input.action,
      actorUserId: input.actorUserId,
      motif,
      bulkActionId,
      nowIso,
    });
    if (!assertBulkPatchDoesNotTouchOperationalTime(patch)) {
      failureCount += 1;
      failures.push({ id: row.id, code: "operational_time_protected" });
      continue;
    }
    if (patch.kind === "noop") {
      successCount += 1;
      continue;
    }
    if (patch.kind === "reject") {
      failureCount += 1;
      failures.push({ id: row.id, code: patch.code });
      continue;
    }
    const { error } = await supabase
      .from("horodateur_exceptions")
      .update(patch.values)
      .eq("id", row.id)
      .eq("organization_id", organizationId)
      .eq("organization_company_id", organizationCompanyId);
    if (error) {
      failureCount += 1;
      failures.push({ id: row.id, code: "exception_update_failed" });
    } else {
      successCount += 1;
    }
  }

  const payload = {
    ok: failureCount === 0,
    action: input.action,
    bulkActionId,
    requestedCount: targets.length,
    successCount,
    failureCount,
    result: bulkResultLabel(successCount, failureCount),
    failures,
    idempotentReplay: false,
  };
  await writeAudit({
    bulkActionId,
    organizationId,
    organizationCompanyId,
    actorUserId: input.actorUserId,
    action: input.action,
    filters: filter,
    requestedCount: targets.length,
    successCount,
    failureCount,
    idempotencyKey,
    payload,
  });
  return payload;
}

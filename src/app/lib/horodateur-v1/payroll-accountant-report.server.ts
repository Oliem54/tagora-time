import "server-only";

import type { User } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  evaluateHorodateurPayrollAccessForUser,
  type HorodateurPayrollAccessAction,
} from "./payroll-access.server";
import type { PayrollAccountantSnapshotResult } from "./payroll-accountant-snapshot.shared";
import {
  PAYROLL_ACCOUNTANT_PERSIST_RPC,
  assertPayrollAccountantPersistSourceHash,
  buildPayrollPersistRpcArgs,
  mapPayrollPersistRpcError,
  requirePayrollReportReadScope,
  snapshotMatchesCycle,
  snapshotMatchesTenant,
  type PayrollPersistOperation,
  type PayrollPersistResultMeta,
  type PayrollStoredCycle,
  type PayrollStoredReport,
} from "./payroll-accountant-report.shared";

type AccessInput = {
  user: User | null | undefined;
  membership: { role: string; status?: string } | null;
  required?: HorodateurPayrollAccessAction;
  tenant: {
    organizationId: string;
    organizationCompanyId: string;
    cycleId: string;
  };
  untrustedBrowserOrganizationCompanyId?: string | null;
};

function authorize(input: AccessInput) {
  void input.user?.user_metadata;

  const access = evaluateHorodateurPayrollAccessForUser(
    input.user,
    input.membership,
    input.required ?? "read"
  );
  if (!access.allowed) {
    return { ok: false as const, access };
  }

  const browserCompany = (input.untrustedBrowserOrganizationCompanyId ?? "").trim();
  if (browserCompany && browserCompany !== input.tenant.organizationCompanyId) {
    return {
      ok: false as const,
      access: {
        canRead: false,
        canManage: false,
        allowed: false,
        source: "denied" as const,
        reason: "browser_company_rejected",
      },
    };
  }

  return { ok: true as const, access };
}

function mapCycleRow(row: {
  id: string;
  organization_id: string;
  organization_company_id: string;
  period_start: string;
  period_end: string;
  timezone: string;
}): PayrollStoredCycle {
  return {
    cycleId: row.id,
    organizationId: row.organization_id,
    organizationCompanyId: row.organization_company_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    timezone: row.timezone,
  };
}

function mapReportRow(row: {
  id: string;
  organization_id: string;
  organization_company_id: string;
  cycle_id: string;
  revision: number;
  status: "draft" | "issued";
  timezone: string;
  period_start: string;
  period_end: string;
  source_hash: string;
  completeness_status: PayrollStoredReport["completenessStatus"];
  force_emit_reason: string | null;
  payload: PayrollStoredReport["payload"];
  totals: PayrollStoredReport["totals"];
  issued_at: string | null;
  issued_by: string | null;
}): PayrollStoredReport {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationCompanyId: row.organization_company_id,
    cycleId: row.cycle_id,
    revision: row.revision,
    status: row.status,
    timezone: row.timezone,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    sourceHash: row.source_hash,
    completenessStatus: row.completeness_status,
    forceEmitReason: row.force_emit_reason,
    payload: row.payload,
    totals: row.totals,
    issuedAt: row.issued_at,
    issuedBy: row.issued_by,
  };
}

async function loadScopedCycle(tenant: AccessInput["tenant"]) {
  const scoped = requirePayrollReportReadScope({
    mode: "revisions",
    organizationId: tenant.organizationId,
    organizationCompanyId: tenant.organizationCompanyId,
    cycleId: tenant.cycleId,
  });
  if (!scoped.ok) {
    return scoped;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("horodateur_payroll_cycles")
    .select(
      "id, organization_id, organization_company_id, period_start, period_end, timezone"
    )
    .eq("organization_id", scoped.scope.organizationId)
    .eq("organization_company_id", scoped.scope.organizationCompanyId)
    .eq("id", scoped.scope.cycleId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, reason: "cycle_tenant_mismatch" as const };
  }
  if (!data) {
    return { ok: false as const, reason: "cycle_tenant_mismatch" as const };
  }
  return { ok: true as const, cycle: mapCycleRow(data) };
}

function parsePersistMeta(data: unknown): PayrollPersistResultMeta | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const row = data as Record<string, unknown>;
  if (
    typeof row.report_id !== "string" ||
    typeof row.revision !== "number" ||
    (row.status !== "draft" && row.status !== "issued") ||
    typeof row.source_hash !== "string" ||
    (row.completeness_status !== "complete" &&
      row.completeness_status !== "blocked_incomplete" &&
      row.completeness_status !== "forced")
  ) {
    return null;
  }
  return {
    reportId: row.report_id,
    revision: row.revision,
    status: row.status,
    sourceHash: row.source_hash,
    completenessStatus: row.completeness_status,
    idempotent: Boolean(row.idempotent),
    auditId: typeof row.audit_id === "string" ? row.audit_id : null,
  };
}

async function persistAuthorizedSnapshot(input: AccessInput & {
  snapshot: PayrollAccountantSnapshotResult;
  operation: PayrollPersistOperation;
}) {
  const required: HorodateurPayrollAccessAction =
    input.operation === "issue" ? "manage" : "read";
  const authorized = authorize({ ...input, required });
  if (!authorized.ok) {
    return authorized;
  }

  if (!snapshotMatchesTenant(input.snapshot, input.tenant)) {
    return { ok: false as const, reason: "payload_tenant_mismatch" as const };
  }

  const hashCheck = assertPayrollAccountantPersistSourceHash(input.snapshot);
  if (!hashCheck.ok) {
    return hashCheck;
  }

  const persistSnapshot = {
    ...input.snapshot,
    sourceHash: hashCheck.sourceHash,
  };

  const cycle = await loadScopedCycle(input.tenant);
  if (!cycle.ok) {
    return cycle;
  }
  if (!snapshotMatchesCycle(input.snapshot, cycle.cycle)) {
    return { ok: false as const, reason: "cycle_period_mismatch" as const };
  }

  if (input.operation === "issue") {
    if (!input.snapshot.canIssue) {
      return { ok: false as const, reason: "blocked_incomplete" as const };
    }
    if (
      input.snapshot.completenessStatus === "forced" &&
      !(input.snapshot.payload.forceEmitReason ?? "").trim()
    ) {
      return { ok: false as const, reason: "forced_reason_required" as const };
    }
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc(
    PAYROLL_ACCOUNTANT_PERSIST_RPC,
    buildPayrollPersistRpcArgs({
      operation: input.operation,
      snapshot: persistSnapshot,
      actorUserId: input.user?.id ?? null,
      actorKind: "user",
    })
  );

  if (error) {
    return {
      ok: false as const,
      reason: mapPayrollPersistRpcError(error.message),
    };
  }

  const result = parsePersistMeta(data);
  if (!result) {
    return { ok: false as const, reason: "cycle_tenant_mismatch" as const };
  }

  return {
    ok: true as const,
    access: authorized.access,
    result,
  };
}

export async function saveAuthorizedPayrollAccountantDraft(
  input: AccessInput & { snapshot: PayrollAccountantSnapshotResult }
) {
  return persistAuthorizedSnapshot({ ...input, operation: "save_draft" });
}

export async function issueAuthorizedPayrollAccountantReport(
  input: AccessInput & { snapshot: PayrollAccountantSnapshotResult }
) {
  return persistAuthorizedSnapshot({ ...input, operation: "issue" });
}

export async function loadAuthorizedPayrollAccountantDraft(
  input: AccessInput
) {
  const authorized = authorize(input);
  if (!authorized.ok) {
    return authorized;
  }

  const scoped = requirePayrollReportReadScope({
    mode: "draft",
    organizationId: input.tenant.organizationId,
    organizationCompanyId: input.tenant.organizationCompanyId,
    cycleId: input.tenant.cycleId,
  });
  if (!scoped.ok) {
    return scoped;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("horodateur_payroll_reports")
    .select(
      "id, organization_id, organization_company_id, cycle_id, revision, status, timezone, period_start, period_end, source_hash, completeness_status, force_emit_reason, payload, totals, issued_at, issued_by"
    )
    .eq("organization_id", scoped.scope.organizationId)
    .eq("organization_company_id", scoped.scope.organizationCompanyId)
    .eq("cycle_id", scoped.scope.cycleId)
    .eq("status", "draft")
    .maybeSingle();

  if (error) {
    return { ok: false as const, reason: "cycle_tenant_mismatch" as const };
  }

  return {
    ok: true as const,
    access: authorized.access,
    report: data ? mapReportRow(data) : null,
  };
}

export async function loadAuthorizedPayrollAccountantReport(
  input: AccessInput & { reportId?: string | null }
) {
  const authorized = authorize(input);
  if (!authorized.ok) {
    return authorized;
  }

  const scoped = requirePayrollReportReadScope({
    mode: "report",
    organizationId: input.tenant.organizationId,
    organizationCompanyId: input.tenant.organizationCompanyId,
    cycleId: input.tenant.cycleId,
    reportId: input.reportId,
  });
  if (!scoped.ok) {
    return scoped;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("horodateur_payroll_reports")
    .select(
      "id, organization_id, organization_company_id, cycle_id, revision, status, timezone, period_start, period_end, source_hash, completeness_status, force_emit_reason, payload, totals, issued_at, issued_by"
    )
    .eq("organization_id", scoped.scope.organizationId)
    .eq("organization_company_id", scoped.scope.organizationCompanyId)
    .eq("cycle_id", scoped.scope.cycleId)
    .eq("id", scoped.reportId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, reason: "cycle_tenant_mismatch" as const };
  }

  return {
    ok: true as const,
    access: authorized.access,
    report: data ? mapReportRow(data) : null,
  };
}

export async function listAuthorizedPayrollAccountantRevisions(
  input: AccessInput
) {
  const authorized = authorize(input);
  if (!authorized.ok) {
    return authorized;
  }

  const scoped = requirePayrollReportReadScope({
    mode: "revisions",
    organizationId: input.tenant.organizationId,
    organizationCompanyId: input.tenant.organizationCompanyId,
    cycleId: input.tenant.cycleId,
  });
  if (!scoped.ok) {
    return scoped;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("horodateur_payroll_reports")
    .select(
      "id, organization_id, organization_company_id, cycle_id, revision, status, timezone, period_start, period_end, source_hash, completeness_status, force_emit_reason, payload, totals, issued_at, issued_by"
    )
    .eq("organization_id", scoped.scope.organizationId)
    .eq("organization_company_id", scoped.scope.organizationCompanyId)
    .eq("cycle_id", scoped.scope.cycleId)
    .order("revision", { ascending: true });

  if (error) {
    return { ok: false as const, reason: "cycle_tenant_mismatch" as const };
  }

  return {
    ok: true as const,
    access: authorized.access,
    reports: (data ?? []).map(mapReportRow),
  };
}

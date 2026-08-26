import {
  hashPayrollSnapshotSource,
  type PayrollAccountantSnapshotPayload,
  type PayrollAccountantSnapshotResult,
  type PayrollCompletenessStatus,
} from "./payroll-accountant-snapshot.shared";

const SOURCE_HASH_PATTERN = /^[a-f0-9]{64}$/;

export const PAYROLL_ACCOUNTANT_PERSIST_RPC =
  "persist_horodateur_payroll_accountant_report" as const;

export type PayrollPersistOperation = "save_draft" | "issue";

export type PayrollReportReadMode = "draft" | "report" | "revisions";

export type PayrollTenantScope = {
  organizationId: string;
  organizationCompanyId: string;
  cycleId: string;
};

export type PayrollReportIdentityScope = PayrollTenantScope & {
  reportId: string;
};

export type PayrollPersistResultMeta = {
  reportId: string;
  revision: number;
  status: "draft" | "issued";
  sourceHash: string;
  completenessStatus: PayrollCompletenessStatus;
  idempotent: boolean;
  auditId: string | null;
};

export type PayrollStoredCycle = PayrollTenantScope & {
  timezone: string;
  periodStart: string;
  periodEnd: string;
};

export type PayrollStoredReport = {
  id: string;
  organizationId: string;
  organizationCompanyId: string;
  cycleId: string;
  revision: number;
  status: "draft" | "issued";
  timezone: string;
  periodStart: string;
  periodEnd: string;
  sourceHash: string;
  completenessStatus: PayrollCompletenessStatus;
  forceEmitReason: string | null;
  payload: PayrollAccountantSnapshotPayload;
  totals: PayrollAccountantSnapshotPayload["companyTotals"];
  issuedAt: string | null;
  issuedBy: string | null;
};

export type PayrollStoredAudit = {
  id: string;
  organizationId: string;
  organizationCompanyId: string;
  cycleId: string;
  reportId: string;
  action: "recalculate" | "emit";
  metadata: Record<string, unknown>;
};

export type PayrollPersistMemoryStore = {
  cycles: PayrollStoredCycle[];
  reports: PayrollStoredReport[];
  audits: PayrollStoredAudit[];
  failNextAudit?: boolean;
};

export type PayrollPersistDenialReason =
  | "tenant_required"
  | "cycle_tenant_mismatch"
  | "cycle_period_mismatch"
  | "payload_tenant_mismatch"
  | "blocked_incomplete"
  | "forced_reason_required"
  | "issued_immutable"
  | "id_only_read_forbidden"
  | "source_hash_mismatch"
  | "completeness_mismatch"
  | "audit_write_failed";

function nonEmpty(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function requirePayrollTenantScope(input: {
  organizationId?: string | null;
  organizationCompanyId?: string | null;
  cycleId?: string | null;
}):
  | { ok: true; scope: PayrollTenantScope }
  | { ok: false; reason: "tenant_required" } {
  const organizationId = nonEmpty(input.organizationId);
  const organizationCompanyId = nonEmpty(input.organizationCompanyId);
  const cycleId = nonEmpty(input.cycleId);
  if (!organizationId || !organizationCompanyId || !cycleId) {
    return { ok: false, reason: "tenant_required" };
  }
  return {
    ok: true,
    scope: { organizationId, organizationCompanyId, cycleId },
  };
}

export function requirePayrollReportReadScope(input: {
  mode: PayrollReportReadMode;
  organizationId?: string | null;
  organizationCompanyId?: string | null;
  cycleId?: string | null;
  reportId?: string | null;
}):
  | { ok: true; scope: PayrollTenantScope; reportId?: string }
  | { ok: false; reason: PayrollPersistDenialReason } {
  const reportId = nonEmpty(input.reportId);
  const organizationId = nonEmpty(input.organizationId);
  const organizationCompanyId = nonEmpty(input.organizationCompanyId);
  const cycleId = nonEmpty(input.cycleId);

  if (reportId && (!organizationId || !organizationCompanyId || !cycleId)) {
    return { ok: false, reason: "id_only_read_forbidden" };
  }

  const tenant = requirePayrollTenantScope({
    organizationId,
    organizationCompanyId,
    cycleId,
  });
  if (!tenant.ok) {
    return tenant;
  }

  if (input.mode === "report") {
    if (!reportId) {
      return { ok: false, reason: "tenant_required" };
    }
    return { ok: true, scope: tenant.scope, reportId };
  }

  return { ok: true, scope: tenant.scope };
}

export function snapshotMatchesTenant(
  snapshot: PayrollAccountantSnapshotResult,
  scope: PayrollTenantScope
) {
  return (
    snapshot.payload.organizationId === scope.organizationId &&
    snapshot.payload.organizationCompanyId === scope.organizationCompanyId &&
    snapshot.payload.cycleId === scope.cycleId
  );
}

export function recomputePayrollAccountantPersistSourceHash(
  payload: PayrollAccountantSnapshotPayload
) {
  return hashPayrollSnapshotSource(payload);
}

export function assertPayrollAccountantPersistSourceHash(
  snapshot: PayrollAccountantSnapshotResult
):
  | { ok: true; sourceHash: string }
  | { ok: false; reason: "source_hash_mismatch" } {
  const received = snapshot.sourceHash.trim();
  if (!SOURCE_HASH_PATTERN.test(received)) {
    return { ok: false, reason: "source_hash_mismatch" };
  }
  const recomputed = recomputePayrollAccountantPersistSourceHash(
    snapshot.payload
  );
  if (!SOURCE_HASH_PATTERN.test(recomputed) || recomputed !== received) {
    return { ok: false, reason: "source_hash_mismatch" };
  }
  return { ok: true, sourceHash: recomputed };
}

export function bindPayrollAccountantPersistSourceHash(
  snapshot: PayrollAccountantSnapshotResult
): PayrollAccountantSnapshotResult {
  return {
    ...snapshot,
    sourceHash: recomputePayrollAccountantPersistSourceHash(snapshot.payload),
  };
}

export function snapshotMatchesCycle(
  snapshot: PayrollAccountantSnapshotResult,
  cycle: PayrollStoredCycle
) {
  return (
    cycle.organizationId === snapshot.payload.organizationId &&
    cycle.organizationCompanyId === snapshot.payload.organizationCompanyId &&
    cycle.cycleId === snapshot.payload.cycleId &&
    cycle.periodStart === snapshot.payload.periodStart &&
    cycle.periodEnd === snapshot.payload.periodEnd &&
    cycle.timezone === snapshot.payload.timezone
  );
}

function nextRevision(reports: PayrollStoredReport[], scope: PayrollTenantScope) {
  return (
    reports.reduce((max, row) => {
      if (
        row.organizationId === scope.organizationId &&
        row.organizationCompanyId === scope.organizationCompanyId &&
        row.cycleId === scope.cycleId
      ) {
        return Math.max(max, row.revision);
      }
      return max;
    }, 0) + 1
  );
}

function findCycle(store: PayrollPersistMemoryStore, scope: PayrollTenantScope) {
  return (
    store.cycles.find(
      (row) =>
        row.cycleId === scope.cycleId &&
        row.organizationId === scope.organizationId &&
        row.organizationCompanyId === scope.organizationCompanyId
    ) ?? null
  );
}

function findDraft(store: PayrollPersistMemoryStore, scope: PayrollTenantScope) {
  return (
    store.reports.find(
      (row) =>
        row.status === "draft" &&
        row.cycleId === scope.cycleId &&
        row.organizationId === scope.organizationId &&
        row.organizationCompanyId === scope.organizationCompanyId
    ) ?? null
  );
}

function newId(prefix: string) {
  return `${prefix}-${storeCounter++}`;
}

let storeCounter = 1;

export function resetPayrollPersistIdCounter() {
  storeCounter = 1;
}

export function persistPayrollAccountantReportInMemory(
  store: PayrollPersistMemoryStore,
  input: {
    operation: PayrollPersistOperation;
    snapshot: PayrollAccountantSnapshotResult;
    actorUserId: string | null;
  }
):
  | { ok: true; result: PayrollPersistResultMeta; store: PayrollPersistMemoryStore }
  | { ok: false; reason: PayrollPersistDenialReason } {
  const snapshot = input.snapshot;
  const scopeResult = requirePayrollTenantScope({
    organizationId: snapshot.payload.organizationId,
    organizationCompanyId: snapshot.payload.organizationCompanyId,
    cycleId: snapshot.payload.cycleId,
  });
  if (!scopeResult.ok) {
    return scopeResult;
  }
  const scope = scopeResult.scope;

  if (!snapshotMatchesTenant(snapshot, scope)) {
    return { ok: false, reason: "payload_tenant_mismatch" };
  }

  if (snapshot.payload.completenessStatus !== snapshot.completenessStatus) {
    return { ok: false, reason: "completeness_mismatch" };
  }

  const hashCheck = assertPayrollAccountantPersistSourceHash(snapshot);
  if (!hashCheck.ok) {
    return hashCheck;
  }
  const expectedHash = hashCheck.sourceHash;

  const cycle = findCycle(store, scope);
  if (!cycle) {
    return { ok: false, reason: "cycle_tenant_mismatch" };
  }
  if (!snapshotMatchesCycle(snapshot, cycle)) {
    return { ok: false, reason: "cycle_period_mismatch" };
  }

  const working: PayrollPersistMemoryStore = {
    cycles: store.cycles.map((row) => ({ ...row })),
    reports: store.reports.map((row) => ({ ...row })),
    audits: store.audits.map((row) => ({ ...row })),
  };

  const forceReason =
    snapshot.completenessStatus === "forced"
      ? (snapshot.payload.forceEmitReason ?? "").trim() || null
      : snapshot.completenessStatus === "complete"
        ? null
        : snapshot.payload.forceEmitReason;

  let report: PayrollStoredReport;
  let idempotent = false;
  let action: PayrollStoredAudit["action"] | null = null;

  if (input.operation === "issue") {
    if (snapshot.completenessStatus === "blocked_incomplete" || !snapshot.canIssue) {
      return { ok: false, reason: "blocked_incomplete" };
    }
    if (snapshot.completenessStatus === "forced" && !forceReason) {
      return { ok: false, reason: "forced_reason_required" };
    }

    const existingIssued = working.reports.find(
      (row) =>
        row.status === "issued" &&
        row.organizationId === scope.organizationId &&
        row.organizationCompanyId === scope.organizationCompanyId &&
        row.cycleId === scope.cycleId &&
        row.sourceHash === expectedHash
    );
    if (existingIssued) {
      store.cycles = working.cycles;
      store.reports = working.reports;
      store.audits = working.audits;
      return {
        ok: true,
        store,
        result: {
          reportId: existingIssued.id,
          revision: existingIssued.revision,
          status: existingIssued.status,
          sourceHash: existingIssued.sourceHash,
          completenessStatus: existingIssued.completenessStatus,
          idempotent: true,
          auditId: null,
        },
      };
    }

    report = {
      id: newId("report"),
      organizationId: scope.organizationId,
      organizationCompanyId: scope.organizationCompanyId,
      cycleId: scope.cycleId,
      revision: nextRevision(working.reports, scope),
      status: "issued",
      timezone: snapshot.payload.timezone,
      periodStart: snapshot.payload.periodStart,
      periodEnd: snapshot.payload.periodEnd,
      sourceHash: expectedHash,
      completenessStatus: snapshot.completenessStatus,
      forceEmitReason: forceReason,
      payload: snapshot.payload,
      totals: snapshot.totals,
      issuedAt: "NOW",
      issuedBy: input.actorUserId,
    };
    working.reports.push(report);
    action = "emit";
  } else {
    const draft = findDraft(working, scope);
    if (draft && draft.status !== "draft") {
      return { ok: false, reason: "issued_immutable" };
    }
    if (draft && draft.sourceHash === expectedHash) {
      report = draft;
      idempotent = true;
    } else if (draft) {
      report = {
        ...draft,
        timezone: snapshot.payload.timezone,
        periodStart: snapshot.payload.periodStart,
        periodEnd: snapshot.payload.periodEnd,
        sourceHash: expectedHash,
        completenessStatus: snapshot.completenessStatus,
        forceEmitReason: forceReason,
        payload: snapshot.payload,
        totals: snapshot.totals,
      };
      working.reports = working.reports.map((row) =>
        row.id === draft.id ? report : row
      );
      action = "recalculate";
    } else {
      report = {
        id: newId("report"),
        organizationId: scope.organizationId,
        organizationCompanyId: scope.organizationCompanyId,
        cycleId: scope.cycleId,
        revision: nextRevision(working.reports, scope),
        status: "draft",
        timezone: snapshot.payload.timezone,
        periodStart: snapshot.payload.periodStart,
        periodEnd: snapshot.payload.periodEnd,
        sourceHash: expectedHash,
        completenessStatus: snapshot.completenessStatus,
        forceEmitReason: forceReason,
        payload: snapshot.payload,
        totals: snapshot.totals,
        issuedAt: null,
        issuedBy: null,
      };
      working.reports.push(report);
      action = "recalculate";
    }
  }

  if (action) {
    if (store.failNextAudit || working.failNextAudit) {
      return { ok: false, reason: "audit_write_failed" };
    }
    const audit: PayrollStoredAudit = {
      id: newId("audit"),
      organizationId: scope.organizationId,
      organizationCompanyId: scope.organizationCompanyId,
      cycleId: scope.cycleId,
      reportId: report.id,
      action,
      metadata: {
        source_hash: expectedHash,
        completeness_status: snapshot.completenessStatus,
        revision: report.revision,
        operation: input.operation,
      },
    };
    working.audits.push(audit);
    store.cycles = working.cycles;
    store.reports = working.reports;
    store.audits = working.audits;
    return {
      ok: true,
      store,
      result: {
        reportId: report.id,
        revision: report.revision,
        status: report.status,
        sourceHash: report.sourceHash,
        completenessStatus: report.completenessStatus,
        idempotent,
        auditId: audit.id,
      },
    };
  }

  store.cycles = working.cycles;
  store.reports = working.reports;
  store.audits = working.audits;
  return {
    ok: true,
    store,
    result: {
      reportId: report.id,
      revision: report.revision,
      status: report.status,
      sourceHash: report.sourceHash,
      completenessStatus: report.completenessStatus,
      idempotent: true,
      auditId: null,
    },
  };
}

export function readPayrollAccountantDraftInMemory(
  store: PayrollPersistMemoryStore,
  input: {
    organizationId?: string | null;
    organizationCompanyId?: string | null;
    cycleId?: string | null;
    reportId?: string | null;
  }
) {
  const scoped = requirePayrollReportReadScope({ ...input, mode: "draft" });
  if (!scoped.ok) {
    return scoped;
  }
  const draft =
    store.reports.find(
      (row) =>
        row.status === "draft" &&
        row.organizationId === scoped.scope.organizationId &&
        row.organizationCompanyId === scoped.scope.organizationCompanyId &&
        row.cycleId === scoped.scope.cycleId
    ) ?? null;
  return { ok: true as const, report: draft };
}

export function readPayrollAccountantReportInMemory(
  store: PayrollPersistMemoryStore,
  input: {
    organizationId?: string | null;
    organizationCompanyId?: string | null;
    cycleId?: string | null;
    reportId?: string | null;
  }
) {
  const scoped = requirePayrollReportReadScope({ ...input, mode: "report" });
  if (!scoped.ok) {
    return scoped;
  }
  const report =
    store.reports.find(
      (row) =>
        row.id === scoped.reportId &&
        row.organizationId === scoped.scope.organizationId &&
        row.organizationCompanyId === scoped.scope.organizationCompanyId &&
        row.cycleId === scoped.scope.cycleId
    ) ?? null;
  return { ok: true as const, report };
}

export function listPayrollAccountantRevisionsInMemory(
  store: PayrollPersistMemoryStore,
  input: {
    organizationId?: string | null;
    organizationCompanyId?: string | null;
    cycleId?: string | null;
    reportId?: string | null;
  }
) {
  const scoped = requirePayrollReportReadScope({
    ...input,
    mode: "revisions",
  });
  if (!scoped.ok) {
    return scoped;
  }
  const reports = store.reports
    .filter(
      (row) =>
        row.organizationId === scoped.scope.organizationId &&
        row.organizationCompanyId === scoped.scope.organizationCompanyId &&
        row.cycleId === scoped.scope.cycleId
    )
    .sort((a, b) => a.revision - b.revision);
  return { ok: true as const, reports };
}

export function mapPayrollPersistRpcError(message: string | null | undefined) {
  const value = (message ?? "").trim();
  const known: PayrollPersistDenialReason[] = [
    "tenant_required",
    "cycle_tenant_mismatch",
    "cycle_period_mismatch",
    "payload_tenant_mismatch",
    "blocked_incomplete",
    "forced_reason_required",
    "issued_immutable",
    "id_only_read_forbidden",
    "source_hash_mismatch",
    "completeness_mismatch",
    "audit_write_failed",
  ];
  return known.includes(value as PayrollPersistDenialReason)
    ? (value as PayrollPersistDenialReason)
    : "cycle_tenant_mismatch";
}

export function buildPayrollPersistRpcArgs(input: {
  operation: PayrollPersistOperation;
  snapshot: PayrollAccountantSnapshotResult;
  actorUserId: string | null;
  actorKind?: "user" | "scheduler";
}) {
  return {
    p_operation: input.operation,
    p_organization_id: input.snapshot.payload.organizationId,
    p_organization_company_id: input.snapshot.payload.organizationCompanyId,
    p_cycle_id: input.snapshot.payload.cycleId,
    p_timezone: input.snapshot.payload.timezone,
    p_period_start: input.snapshot.payload.periodStart,
    p_period_end: input.snapshot.payload.periodEnd,
    p_source_hash: input.snapshot.sourceHash,
    p_completeness_status: input.snapshot.completenessStatus,
    p_force_emit_reason: input.snapshot.payload.forceEmitReason,
    p_payload: input.snapshot.payload,
    p_totals: input.snapshot.totals,
    p_actor_user_id: input.actorUserId,
    p_actor_kind: input.actorKind ?? "user",
  };
}

import "server-only";

import type { User } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { defaultBiweeklyPayrollPeriod } from "./payroll-accountant-snapshot.shared";
import {
  bindPayrollAccountantPersistSourceHash,
} from "./payroll-accountant-report.shared";
import {
  issueAuthorizedPayrollAccountantReport,
  loadAuthorizedPayrollAccountantDraft,
  loadAuthorizedPayrollAccountantReport,
  listAuthorizedPayrollAccountantRevisions,
  saveAuthorizedPayrollAccountantDraft,
} from "./payroll-accountant-report.server";
import {
  evaluateHorodateurPayrollAccessForUser,
  type HorodateurPayrollAccessAction,
} from "./payroll-access.server";
import { previewPayrollAccountantReportSnapshot } from "./payroll-report-snapshot.server";
import type { PayrollReportSnapshotQueryInput } from "./payroll-report-snapshot.shared";

type OperationalAuth = {
  user: User;
  membership: { role: string; status?: string };
  membershipOrganizationId: string;
};

export async function loadPayrollAccountantOperationalContext(input: OperationalAuth & {
  organizationCompanyId?: string | null;
  untrustedBrowserOrganizationId?: string | null;
  required?: HorodateurPayrollAccessAction;
}) {
  const access = evaluateHorodateurPayrollAccessForUser(
    input.user,
    input.membership,
    input.required ?? "read"
  );
  if (!access.allowed) {
    return { ok: false as const, access };
  }

  const organizationId = input.membershipOrganizationId.trim();
  const browserOrg = (input.untrustedBrowserOrganizationId ?? "").trim();
  if (browserOrg && browserOrg !== organizationId) {
    return { ok: false as const, reason: "browser_organization_rejected" as const };
  }

  const admin = createAdminSupabaseClient();
  const { data: companyRows, error: companyError } = await admin
    .from("organization_companies")
    .select("id, display_name, legal_name, company_code, is_default, status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("display_name", { ascending: true });
  if (companyError) {
    return { ok: false as const, reason: "company_tenant_mismatch" as const };
  }

  const companies = (companyRows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.display_name || row.legal_name || row.company_code || "").trim(),
    code: String(row.company_code ?? ""),
    isDefault: Boolean(row.is_default),
  }));

  const requestedCompany = (input.organizationCompanyId ?? "").trim();
  const selectedCompany =
    companies.find((row) => row.id === requestedCompany) ??
    companies.find((row) => row.isDefault) ??
    companies[0] ??
    null;

  if (requestedCompany && !companies.some((row) => row.id === requestedCompany)) {
    return { ok: false as const, reason: "company_tenant_mismatch" as const };
  }

  let cycles: Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    timezone: string;
    kind: string;
    status: string;
  }> = [];

  if (selectedCompany) {
    const { data: cycleRows, error: cycleError } = await admin
      .from("horodateur_payroll_cycles")
      .select("id, period_start, period_end, timezone, kind, status")
      .eq("organization_id", organizationId)
      .eq("organization_company_id", selectedCompany.id)
      .neq("status", "cancelled")
      .order("period_start", { ascending: false });
    if (cycleError) {
      return { ok: false as const, reason: "cycle_tenant_mismatch" as const };
    }
    cycles = (cycleRows ?? []).map((row) => ({
      id: String(row.id),
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      timezone: String(row.timezone),
      kind: String(row.kind),
      status: String(row.status),
    }));
  }

  const today = new Date().toISOString().slice(0, 10);
  const covering = cycles.find(
    (cycle) => cycle.periodStart <= today && cycle.periodEnd >= today
  );
  const selectedCycle = covering ?? cycles[0] ?? null;
  const defaultPeriod = selectedCycle
    ? {
        periodStart: selectedCycle.periodStart,
        periodEnd: selectedCycle.periodEnd,
        timezone: selectedCycle.timezone,
      }
    : {
        ...defaultBiweeklyPayrollPeriod(today),
        timezone: "America/Toronto",
      };

  let latestIssued: { id: string; revision: number; sourceHash: string } | null =
    null;
  let latestDraft: { id: string; revision: number; sourceHash: string } | null =
    null;
  if (selectedCompany && selectedCycle) {
    const revisions = await listAuthorizedPayrollAccountantRevisions({
      user: input.user,
      membership: input.membership,
      tenant: {
        organizationId,
        organizationCompanyId: selectedCompany.id,
        cycleId: selectedCycle.id,
      },
    });
    if (revisions.ok) {
      const issued = [...revisions.reports]
        .filter((row) => row.status === "issued")
        .at(-1);
      const draft = revisions.reports.find((row) => row.status === "draft") ?? null;
      if (issued) {
        latestIssued = {
          id: issued.id,
          revision: issued.revision,
          sourceHash: issued.sourceHash,
        };
      }
      if (draft) {
        latestDraft = {
          id: draft.id,
          revision: draft.revision,
          sourceHash: draft.sourceHash,
        };
      }
    }
  }

  return {
    ok: true as const,
    access,
    organizationId,
    companies,
    selectedCompanyId: selectedCompany?.id ?? null,
    cycles,
    selectedCycleId: selectedCycle?.id ?? null,
    defaultPeriod,
    latestIssued,
    latestDraft,
  };
}

export async function rebuildPayrollAccountantOperationalSnapshot(input: OperationalAuth & {
  query: PayrollReportSnapshotQueryInput;
  untrustedBrowserOrganizationCompanyId?: string | null;
  forceEmitReason?: string | null;
  required?: HorodateurPayrollAccessAction;
}) {
  return previewPayrollAccountantReportSnapshot({
    user: input.user,
    membership: input.membership,
    membershipOrganizationId: input.membershipOrganizationId,
    required: input.required ?? "read",
    query: {
      ...input.query,
      organizationId: input.membershipOrganizationId,
    },
    untrustedBrowserOrganizationCompanyId:
      input.untrustedBrowserOrganizationCompanyId,
    forceEmitReason: input.forceEmitReason,
  });
}

export async function persistPayrollAccountantOperational(input: OperationalAuth & {
  operation: "save_draft" | "issue";
  query: PayrollReportSnapshotQueryInput;
  untrustedBrowserOrganizationCompanyId?: string | null;
  forceEmitReason?: string | null;
  confirmIssue?: boolean;
}) {
  if (input.operation === "issue" && input.confirmIssue !== true) {
    return { ok: false as const, reason: "confirm_required" as const };
  }

  const required: HorodateurPayrollAccessAction =
    input.operation === "issue" ? "manage" : "read";
  const rebuilt = await rebuildPayrollAccountantOperationalSnapshot({
    ...input,
    required,
  });
  if (!rebuilt.ok) {
    return rebuilt;
  }

  const cycleId = (rebuilt.snapshot.payload.cycleId ?? "").trim();
  if (!cycleId) {
    return { ok: false as const, reason: "cycle_tenant_mismatch" as const };
  }

  const snapshot = bindPayrollAccountantPersistSourceHash(rebuilt.snapshot);
  const tenant = {
    organizationId: input.membershipOrganizationId,
    organizationCompanyId: snapshot.payload.organizationCompanyId,
    cycleId,
  };

  const persist =
    input.operation === "issue"
      ? issueAuthorizedPayrollAccountantReport
      : saveAuthorizedPayrollAccountantDraft;

  return persist({
    user: input.user,
    membership: input.membership,
    required,
    tenant,
    snapshot,
    untrustedBrowserOrganizationCompanyId:
      input.untrustedBrowserOrganizationCompanyId,
  });
}

export async function loadPayrollAccountantOperationalReport(input: OperationalAuth & {
  organizationCompanyId: string;
  cycleId: string;
  reportId?: string | null;
  untrustedBrowserOrganizationCompanyId?: string | null;
}) {
  const tenant = {
    organizationId: input.membershipOrganizationId,
    organizationCompanyId: input.organizationCompanyId,
    cycleId: input.cycleId,
  };
  if (input.reportId) {
    return loadAuthorizedPayrollAccountantReport({
      user: input.user,
      membership: input.membership,
      tenant,
      reportId: input.reportId,
      untrustedBrowserOrganizationCompanyId:
        input.untrustedBrowserOrganizationCompanyId,
    });
  }
  return loadAuthorizedPayrollAccountantDraft({
    user: input.user,
    membership: input.membership,
    tenant,
    untrustedBrowserOrganizationCompanyId:
      input.untrustedBrowserOrganizationCompanyId,
  });
}

export async function listPayrollAccountantOperationalRevisions(input: OperationalAuth & {
  organizationCompanyId: string;
  cycleId: string;
  untrustedBrowserOrganizationCompanyId?: string | null;
}) {
  return listAuthorizedPayrollAccountantRevisions({
    user: input.user,
    membership: input.membership,
    tenant: {
      organizationId: input.membershipOrganizationId,
      organizationCompanyId: input.organizationCompanyId,
      cycleId: input.cycleId,
    },
    untrustedBrowserOrganizationCompanyId:
      input.untrustedBrowserOrganizationCompanyId,
  });
}

export async function resolvePayrollAccountantExportSnapshot(input: OperationalAuth & {
  query: PayrollReportSnapshotQueryInput;
  untrustedBrowserOrganizationCompanyId?: string | null;
  reportId?: string | null;
}) {
  const reportId = (input.reportId ?? "").trim();
  if (reportId) {
    const cycleId = (input.query.cycleId ?? "").trim();
    const organizationCompanyId = (input.query.organizationCompanyId ?? "").trim();
    if (!cycleId || !organizationCompanyId) {
      return { ok: false as const, reason: "tenant_required" as const };
    }
    const loaded = await loadAuthorizedPayrollAccountantReport({
      user: input.user,
      membership: input.membership,
      tenant: {
        organizationId: input.membershipOrganizationId,
        organizationCompanyId,
        cycleId,
      },
      reportId,
      untrustedBrowserOrganizationCompanyId:
        input.untrustedBrowserOrganizationCompanyId,
    });
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.report) {
      return { ok: false as const, reason: "id_only_read_forbidden" as const };
    }
    if (loaded.report.organizationId !== input.membershipOrganizationId) {
      return { ok: false as const, reason: "payload_tenant_mismatch" as const };
    }
    return {
      ok: true as const,
      access: loaded.access,
      snapshot: {
        payload: loaded.report.payload,
        totals: loaded.report.totals,
        sourceHash: loaded.report.sourceHash,
        completenessStatus: loaded.report.completenessStatus,
        canIssue: loaded.report.status === "issued" || loaded.report.completenessStatus !== "blocked_incomplete",
      },
      meta: {
        reportId: loaded.report.id,
        revision: loaded.report.revision,
        status: loaded.report.status,
        issuedAt: loaded.report.issuedAt,
      },
    };
  }

  const rebuilt = await rebuildPayrollAccountantOperationalSnapshot(input);
  if (!rebuilt.ok) {
    return rebuilt;
  }
  return {
    ok: true as const,
    access: rebuilt.access,
    snapshot: rebuilt.snapshot,
    meta: {
      reportId: null,
      revision: null,
      status: "preview" as const,
      issuedAt: null,
    },
  };
}

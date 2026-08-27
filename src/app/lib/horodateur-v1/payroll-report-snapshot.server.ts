import "server-only";

import type { User } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  evaluateHorodateurPayrollAccessForUser,
  type HorodateurPayrollAccessAction,
} from "./payroll-access.server";
import { buildAuthorizedPayrollAccountantSnapshot } from "./payroll-accountant-snapshot.server";
import {
  getEmployeesByIdsForRegistre,
  listHorodateurEventsInWorkDateRange,
  listHorodateurExceptionsForEmployees,
  listShiftsInWorkDateRange,
} from "./repository";
import {
  resolvePayrollReportSnapshotQuery,
  type PayrollReportSnapshotCycleHint,
  type PayrollReportSnapshotDenialReason,
  type PayrollReportSnapshotQueryInput,
} from "./payroll-report-snapshot.shared";
import type { HorodateurPhase1ExceptionRecord } from "./types";

function exceptionWorkDate(
  ex: HorodateurPhase1ExceptionRecord & {
    source_event?: { work_date?: string } | Array<{ work_date?: string }>;
  }
) {
  const src = ex.source_event;
  if (Array.isArray(src)) {
    return src[0]?.work_date ?? null;
  }
  return src?.work_date ?? null;
}

function assertLoadedTenantRows(
  rows: Array<{
    organization_id?: string | null;
    organization_company_id?: string | null;
  }>,
  organizationId: string,
  organizationCompanyId: string,
  label: string
) {
  for (const row of rows) {
    const orgId = (row.organization_id ?? "").trim();
    const companyId = (row.organization_company_id ?? "").trim();
    if (!orgId) {
      throw new Error(`isolation tenant: ${label} organization_id absent.`);
    }
    if (orgId !== organizationId) {
      throw new Error(`isolation tenant: ${label} hors organisation.`);
    }
    if (!companyId) {
      throw new Error(
        `isolation tenant: ${label} organization_company_id absent.`
      );
    }
    if (companyId !== organizationCompanyId) {
      throw new Error(`isolation tenant: ${label} hors compagnie.`);
    }
  }
}

async function loadOrganization(organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organizations")
    .select("id, display_name, legal_name")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return {
    id: data.id as string,
    name: String(data.display_name || data.legal_name || "").trim() || null,
  };
}

async function loadCompanyInOrganization(
  organizationId: string,
  organizationCompanyId: string
) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_companies")
    .select("id, organization_id, display_name, legal_name")
    .eq("id", organizationCompanyId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return {
    id: data.id as string,
    organizationId: data.organization_id as string,
    name: String(data.display_name || data.legal_name || "").trim() || null,
  };
}

async function loadCycleHint(
  organizationId: string,
  organizationCompanyId: string,
  cycleId: string
): Promise<PayrollReportSnapshotCycleHint | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("horodateur_payroll_cycles")
    .select(
      "id, organization_id, organization_company_id, period_start, period_end, timezone, kind"
    )
    .eq("id", cycleId)
    .eq("organization_id", organizationId)
    .eq("organization_company_id", organizationCompanyId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  if (data.kind !== "recurring" && data.kind !== "exceptional") {
    return null;
  }
  return {
    id: data.id as string,
    organizationId: data.organization_id as string,
    organizationCompanyId: data.organization_company_id as string,
    periodStart: data.period_start as string,
    periodEnd: data.period_end as string,
    timezone: data.timezone as string,
    kind: data.kind,
  };
}

/**
 * Direction preview: reads the existing HORORA registre sources and builds a
 * deterministic snapshot. No payroll row writes, no email, no files.
 */
export async function previewPayrollAccountantReportSnapshot(input: {
  user: User | null | undefined;
  membership: { role: string; status?: string } | null;
  membershipOrganizationId: string;
  required?: HorodateurPayrollAccessAction;
  query: PayrollReportSnapshotQueryInput;
  untrustedBrowserOrganizationCompanyId?: string | null;
  forceEmitReason?: string | null;
}) {
  void input.user?.user_metadata;

  const access = evaluateHorodateurPayrollAccessForUser(
    input.user,
    input.membership,
    input.required ?? "read"
  );
  if (!access.allowed) {
    return { ok: false as const, access };
  }

  const organizationId = (input.membershipOrganizationId ?? "").trim();
  const organizationCompanyId = (
    input.query.organizationCompanyId ?? ""
  ).trim();
  if (!organizationId || !organizationCompanyId) {
    return {
      ok: false as const,
      reason: (organizationId
        ? "organization_company_id_required"
        : "organization_id_required") as PayrollReportSnapshotDenialReason,
    };
  }

  const [organization, company] = await Promise.all([
    loadOrganization(organizationId),
    loadCompanyInOrganization(organizationId, organizationCompanyId),
  ]);
  if (!organization || !company) {
    return { ok: false as const, reason: "company_tenant_mismatch" as const };
  }

  const requestedCycleId = (input.query.cycleId ?? "").trim();
  let cycle: PayrollReportSnapshotCycleHint | null = null;
  if (requestedCycleId) {
    cycle = await loadCycleHint(
      organizationId,
      organizationCompanyId,
      requestedCycleId
    );
    if (!cycle) {
      return { ok: false as const, reason: "cycle_tenant_mismatch" as const };
    }
  }

  const resolved = resolvePayrollReportSnapshotQuery(
    {
      ...input.query,
      organizationId,
      organizationCompanyId,
      untrustedBrowserOrganizationId:
        input.query.untrustedBrowserOrganizationId ??
        input.query.organizationId,
    },
    cycle
  );
  if (!resolved.ok) {
    return resolved;
  }

  const tenant = {
    ...resolved.tenant,
    organizationName: organization.name,
    organizationCompanyName: company.name,
  };

  const shifts = await listShiftsInWorkDateRange({
    startWorkDate: tenant.periodStart,
    endWorkDate: tenant.periodEnd,
    organizationId: tenant.organizationId,
    organizationCompanyId: tenant.organizationCompanyId,
  });
  assertLoadedTenantRows(
    shifts,
    tenant.organizationId,
    tenant.organizationCompanyId,
    "shift"
  );

  const employeeIds = Array.from(new Set(shifts.map((row) => row.employee_id)));
  const events =
    employeeIds.length > 0
      ? await listHorodateurEventsInWorkDateRange({
          startWorkDate: tenant.periodStart,
          endWorkDate: tenant.periodEnd,
          employeeIds,
          organizationId: tenant.organizationId,
          organizationCompanyId: tenant.organizationCompanyId,
        })
      : [];
  assertLoadedTenantRows(
    events,
    tenant.organizationId,
    tenant.organizationCompanyId,
    "event"
  );

  const exceptionsRaw =
    employeeIds.length > 0
      ? await listHorodateurExceptionsForEmployees(employeeIds, {
          organizationId: tenant.organizationId,
          organizationCompanyId: tenant.organizationCompanyId,
        })
      : [];
  assertLoadedTenantRows(
    exceptionsRaw,
    tenant.organizationId,
    tenant.organizationCompanyId,
    "exception"
  );
  const exceptions = exceptionsRaw.filter((item) => {
    const workDate = exceptionWorkDate(item);
    if (!workDate) {
      return false;
    }
    return workDate >= tenant.periodStart && workDate <= tenant.periodEnd;
  });
  const profiles =
    employeeIds.length > 0 ? await getEmployeesByIdsForRegistre(employeeIds) : [];

  const built = buildAuthorizedPayrollAccountantSnapshot({
    user: input.user,
    membership: input.membership,
    required: input.required ?? "read",
    tenant,
    untrustedBrowserOrganizationCompanyId:
      input.untrustedBrowserOrganizationCompanyId,
    profiles,
    shifts,
    events,
    exceptions,
    forceEmitReason: input.forceEmitReason,
  });
  if (!built.ok) {
    return built;
  }
  return {
    ...built,
    datesAdjustedFromCycle: resolved.datesAdjustedFromCycle,
  };
}

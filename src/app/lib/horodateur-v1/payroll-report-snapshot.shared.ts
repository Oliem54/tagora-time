import {
  inclusiveDayCount,
  type PayrollAccountantSnapshotTenant,
} from "./payroll-accountant-snapshot.shared";

export const PAYROLL_REPORT_SNAPSHOT_MAX_INCLUSIVE_DAYS = 62;

export type PayrollReportSnapshotCycleHint = {
  id: string;
  organizationId: string;
  organizationCompanyId: string;
  periodStart: string;
  periodEnd: string;
  timezone: string;
  kind: "recurring" | "exceptional";
};

export type PayrollReportSnapshotQueryInput = {
  organizationId?: string | null;
  organizationCompanyId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  timezone?: string | null;
  cycleId?: string | null;
  untrustedBrowserOrganizationId?: string | null;
};

export type PayrollReportSnapshotDenialReason =
  | "organization_id_required"
  | "organization_company_id_required"
  | "period_required"
  | "period_invalid"
  | "period_order_invalid"
  | "period_too_long"
  | "timezone_required"
  | "browser_organization_rejected"
  | "cycle_tenant_mismatch"
  | "company_tenant_mismatch";

function isoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function nonEmpty(value: string | null | undefined) {
  return (value ?? "").trim();
}

/**
 * Resolves the preview window. Cycle is optional. Request dates win so the
 * accountant can shorten or extend the cycle window. Membership organization
 * is authoritative; a mismatched browser organization_id is rejected.
 */
export function resolvePayrollReportSnapshotQuery(
  input: PayrollReportSnapshotQueryInput,
  cycle?: PayrollReportSnapshotCycleHint | null
):
  | { ok: true; tenant: PayrollAccountantSnapshotTenant; datesAdjustedFromCycle: boolean }
  | { ok: false; reason: PayrollReportSnapshotDenialReason } {
  const organizationId = nonEmpty(input.organizationId);
  const organizationCompanyId = nonEmpty(input.organizationCompanyId);
  if (!organizationId) {
    return { ok: false, reason: "organization_id_required" };
  }
  if (!organizationCompanyId) {
    return { ok: false, reason: "organization_company_id_required" };
  }

  const browserOrg = nonEmpty(input.untrustedBrowserOrganizationId);
  if (browserOrg && browserOrg !== organizationId) {
    return { ok: false, reason: "browser_organization_rejected" };
  }

  if (cycle) {
    if (
      cycle.organizationId !== organizationId ||
      cycle.organizationCompanyId !== organizationCompanyId ||
      (nonEmpty(input.cycleId) && nonEmpty(input.cycleId) !== cycle.id)
    ) {
      return { ok: false, reason: "cycle_tenant_mismatch" };
    }
  } else if (nonEmpty(input.cycleId)) {
    return { ok: false, reason: "cycle_tenant_mismatch" };
  }

  const requestedStart = nonEmpty(input.periodStart);
  const requestedEnd = nonEmpty(input.periodEnd);
  const periodStart = requestedStart || cycle?.periodStart || "";
  const periodEnd = requestedEnd || cycle?.periodEnd || "";
  if (!periodStart || !periodEnd) {
    return { ok: false, reason: "period_required" };
  }
  if (!isoDate(periodStart) || !isoDate(periodEnd)) {
    return { ok: false, reason: "period_invalid" };
  }
  if (periodStart > periodEnd) {
    return { ok: false, reason: "period_order_invalid" };
  }
  if (inclusiveDayCount(periodStart, periodEnd) > PAYROLL_REPORT_SNAPSHOT_MAX_INCLUSIVE_DAYS) {
    return { ok: false, reason: "period_too_long" };
  }

  const timezone = nonEmpty(input.timezone) || cycle?.timezone || "";
  if (!timezone) {
    return { ok: false, reason: "timezone_required" };
  }

  const datesAdjustedFromCycle = Boolean(
    cycle &&
      (periodStart !== cycle.periodStart || periodEnd !== cycle.periodEnd)
  );

  return {
    ok: true,
    datesAdjustedFromCycle,
    tenant: {
      organizationId,
      organizationCompanyId,
      cycleId: cycle?.id ?? null,
      timezone,
      periodStart,
      periodEnd,
      cycleKind: cycle && !datesAdjustedFromCycle ? cycle.kind : undefined,
    },
  };
}

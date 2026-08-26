import { describe, expect, it } from "vitest";
import {
  PAYROLL_REPORT_SNAPSHOT_MAX_INCLUSIVE_DAYS,
  resolvePayrollReportSnapshotQuery,
} from "./payroll-report-snapshot.shared";
import { inclusiveDayCount } from "./payroll-accountant-snapshot.shared";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const OTHER_COMPANY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CYCLE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const CYCLE_HINT = {
  id: CYCLE,
  organizationId: ORG,
  organizationCompanyId: COMPANY,
  periodStart: "2026-08-10",
  periodEnd: "2026-08-23",
  timezone: "America/Toronto",
  kind: "recurring" as const,
};

describe("resolvePayrollReportSnapshotQuery", () => {
  it("requires organization and company", () => {
    expect(
      resolvePayrollReportSnapshotQuery({
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
      })
    ).toEqual({ ok: false, reason: "organization_id_required" });
    expect(
      resolvePayrollReportSnapshotQuery({
        organizationId: ORG,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
      })
    ).toEqual({ ok: false, reason: "organization_company_id_required" });
  });

  it("rejects a browser organization that does not match membership", () => {
    expect(
      resolvePayrollReportSnapshotQuery({
        organizationId: ORG,
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
        timezone: "America/Toronto",
        untrustedBrowserOrganizationId: OTHER_ORG,
      })
    ).toEqual({ ok: false, reason: "browser_organization_rejected" });
  });

  it("accepts an optional cycle and uses its dates and timezone", () => {
    const resolved = resolvePayrollReportSnapshotQuery(
      {
        organizationId: ORG,
        organizationCompanyId: COMPANY,
        cycleId: CYCLE,
      },
      CYCLE_HINT
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.tenant.cycleId).toBe(CYCLE);
    expect(resolved.tenant.periodStart).toBe("2026-08-10");
    expect(resolved.tenant.periodEnd).toBe("2026-08-23");
    expect(resolved.tenant.timezone).toBe("America/Toronto");
    expect(resolved.tenant.cycleKind).toBe("recurring");
    expect(resolved.datesAdjustedFromCycle).toBe(false);
  });

  it("lets the accountant override cycle dates without forcing the 14-day kind", () => {
    const resolved = resolvePayrollReportSnapshotQuery(
      {
        organizationId: ORG,
        organizationCompanyId: COMPANY,
        cycleId: CYCLE,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-16",
        timezone: "America/Toronto",
      },
      CYCLE_HINT
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.datesAdjustedFromCycle).toBe(true);
    expect(resolved.tenant.cycleKind).toBeUndefined();
    expect(resolved.tenant.periodEnd).toBe("2026-08-16");
    expect(resolved.tenant.cycleId).toBe(CYCLE);
  });

  it("resolves dates without a cycle", () => {
    const resolved = resolvePayrollReportSnapshotQuery({
      organizationId: ORG,
      organizationCompanyId: COMPANY,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-07",
      timezone: "America/Toronto",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.tenant.cycleId).toBeNull();
    expect(resolved.tenant.cycleKind).toBeUndefined();
  });

  it("rejects a cycle bound to another tenant", () => {
    expect(
      resolvePayrollReportSnapshotQuery(
        {
          organizationId: ORG,
          organizationCompanyId: COMPANY,
          cycleId: CYCLE,
        },
        { ...CYCLE_HINT, organizationId: OTHER_ORG }
      )
    ).toEqual({ ok: false, reason: "cycle_tenant_mismatch" });
    expect(
      resolvePayrollReportSnapshotQuery(
        {
          organizationId: ORG,
          organizationCompanyId: COMPANY,
          cycleId: CYCLE,
        },
        { ...CYCLE_HINT, organizationCompanyId: OTHER_COMPANY }
      )
    ).toEqual({ ok: false, reason: "cycle_tenant_mismatch" });
    expect(
      resolvePayrollReportSnapshotQuery(
        {
          organizationId: ORG,
          organizationCompanyId: COMPANY,
          cycleId: CYCLE,
        },
        null
      )
    ).toEqual({ ok: false, reason: "cycle_tenant_mismatch" });
  });

  it("rejects missing, inverted, invalid, and oversized periods", () => {
    expect(
      resolvePayrollReportSnapshotQuery({
        organizationId: ORG,
        organizationCompanyId: COMPANY,
        timezone: "America/Toronto",
      })
    ).toEqual({ ok: false, reason: "period_required" });
    expect(
      resolvePayrollReportSnapshotQuery({
        organizationId: ORG,
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "not-a-date",
        timezone: "America/Toronto",
      })
    ).toEqual({ ok: false, reason: "period_invalid" });
    expect(
      resolvePayrollReportSnapshotQuery({
        organizationId: ORG,
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-23",
        periodEnd: "2026-08-10",
        timezone: "America/Toronto",
      })
    ).toEqual({ ok: false, reason: "period_order_invalid" });
    expect(
      resolvePayrollReportSnapshotQuery({
        organizationId: ORG,
        organizationCompanyId: COMPANY,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        timezone: "America/Toronto",
      })
    ).toEqual({ ok: false, reason: "period_too_long" });
    expect(inclusiveDayCount("2026-08-10", "2026-08-23")).toBe(14);
    expect(PAYROLL_REPORT_SNAPSHOT_MAX_INCLUSIVE_DAYS).toBe(62);
  });

  it("requires a timezone when the cycle does not supply one", () => {
    expect(
      resolvePayrollReportSnapshotQuery({
        organizationId: ORG,
        organizationCompanyId: COMPANY,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-23",
      })
    ).toEqual({ ok: false, reason: "timezone_required" });
  });
});

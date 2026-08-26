import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  evaluateHorodateurPayrollAccessForUser,
  type HorodateurPayrollAccessAction,
} from "./payroll-access.server";
import {
  buildPayrollAccountantSnapshot,
  planPayrollAccountantReportWrite,
  type PayrollAccountantSnapshotTenant,
  type PayrollReportWriteIntent,
  type ExistingPayrollReportRow,
} from "./payroll-accountant-snapshot.shared";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1EventRecord,
  HorodateurPhase1ExceptionRecord,
  HorodateurPhase1ShiftRecord,
} from "./types";

/**
 * Server snapshot lot: build and plan writes in-process only.
 * Tenant IDs must already be server-resolved (membership H4 / org company).
 * Browser-supplied organization_company_id is never authoritative.
 * This module does not open a Supabase client and does not persist rows.
 */
export function buildAuthorizedPayrollAccountantSnapshot(input: {
  user: User | null | undefined;
  membership: { role: string; status?: string } | null;
  required?: HorodateurPayrollAccessAction;
  tenant: PayrollAccountantSnapshotTenant;
  untrustedBrowserOrganizationCompanyId?: string | null;
  profiles: HorodateurPhase1EmployeeProfile[];
  shifts: HorodateurPhase1ShiftRecord[];
  events: HorodateurPhase1EventRecord[];
  exceptions: HorodateurPhase1ExceptionRecord[];
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

  const browserCompany = (input.untrustedBrowserOrganizationCompanyId ?? "").trim();
  if (
    browserCompany &&
    browserCompany !== input.tenant.organizationCompanyId
  ) {
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

  return {
    ok: true as const,
    access,
    snapshot: buildPayrollAccountantSnapshot({
      tenant: input.tenant,
      profiles: input.profiles,
      shifts: input.shifts,
      events: input.events,
      exceptions: input.exceptions,
      forceEmitReason: input.forceEmitReason,
    }),
  };
}

export function planAuthorizedPayrollAccountantReportWrite(input: {
  user: User | null | undefined;
  membership: { role: string; status?: string } | null;
  intent: PayrollReportWriteIntent;
  tenant: PayrollAccountantSnapshotTenant;
  profiles: HorodateurPhase1EmployeeProfile[];
  shifts: HorodateurPhase1ShiftRecord[];
  events: HorodateurPhase1EventRecord[];
  exceptions: HorodateurPhase1ExceptionRecord[];
  existingReports: ExistingPayrollReportRow[];
  forceEmitReason?: string | null;
}) {
  const required: HorodateurPayrollAccessAction =
    input.intent === "issue" ? "manage" : "read";
  const built = buildAuthorizedPayrollAccountantSnapshot({
    ...input,
    required,
  });
  if (!built.ok) {
    return built;
  }

  return {
    ok: true as const,
    access: built.access,
    snapshot: built.snapshot,
    write: planPayrollAccountantReportWrite({
      snapshot: built.snapshot,
      intent: input.intent,
      existingReports: input.existingReports,
      issuedBy: input.user?.id ?? null,
      issuedByKind: "user",
    }),
  };
}

import type { HorodateurCanonicalEventType } from "./types";

export type EmployeePunchEligibilityFailure = {
  ok: false;
  code: string;
  status: number;
  message: string;
};

export type EmployeePunchEligibilityResult =
  | { ok: true }
  | EmployeePunchEligibilityFailure;

/**
 * Tenant-scoped punch eligibility for a chauffeur profile already loaded by
 * `auth_user_id`. Membership alone is never sufficient.
 */
export function evaluateResolvedEmployeePunchProfile(input: {
  present: boolean;
  active: boolean;
  organizationId: string | null | undefined;
  organizationCompanyId: string | null | undefined;
  primaryCompany: string | null | undefined;
  requireTenantKeys?: boolean;
}): EmployeePunchEligibilityResult {
  if (!input.present) {
    return {
      ok: false,
      code: "employee_not_found_for_auth_user",
      status: 404,
      message:
        "Aucune fiche employe n est liee a ce compte Auth. Un membership seul ne suffit pas : la fiche chauffeur doit avoir auth_user_id = ce compte, organization_id et organization_company_id.",
    };
  }

  if (!input.active) {
    return {
      ok: false,
      code: "employee_inactive",
      status: 409,
      message: "La fiche employe est inactive.",
    };
  }

  if (input.requireTenantKeys !== false) {
    if (!input.organizationId || !input.organizationCompanyId) {
      return {
        ok: false,
        code: "employee_missing_tenant_keys",
        status: 409,
        message:
          "Fiche employe incomplete : organization_id ou organization_company_id manquant. Corrigez l association tenant avant de pointer.",
      };
    }

    if (!input.primaryCompany) {
      return {
        ok: false,
        code: "missing_company_context",
        status: 409,
        message: "Fiche employe incomplete : primary_company manquant.",
      };
    }
  }

  return { ok: true };
}

export function employeeMatchesCallerOrganization(
  employeeOrganizationId: string | null | undefined,
  callerOrganizationId: string
): boolean {
  return Boolean(
    employeeOrganizationId && employeeOrganizationId === callerOrganizationId
  );
}

export function shouldIgnorePaidOperationalEvent(
  employee: { pausePaid: boolean; lunchPaid: boolean },
  canonical: HorodateurCanonicalEventType | null
): boolean {
  if (!canonical) {
    return false;
  }
  if (
    employee.pausePaid &&
    (canonical === "break_start" || canonical === "break_end")
  ) {
    return true;
  }
  if (
    employee.lunchPaid &&
    (canonical === "meal_start" || canonical === "meal_end")
  ) {
    return true;
  }
  return false;
}

export function paidOperationalPunchBlock(
  employee: { pausePaid: boolean; lunchPaid: boolean },
  canonical: HorodateurCanonicalEventType | null
): EmployeePunchEligibilityFailure | null {
  if (
    employee.pausePaid &&
    (canonical === "break_start" || canonical === "break_end")
  ) {
    return {
      ok: false,
      code: "paid_break_no_punch_required",
      status: 409,
      message:
        "Pause payee : aucun pointage debut ou fin de pause n est requis (employe ni direction). La pause est incluse dans le quart.",
    };
  }
  if (
    employee.lunchPaid &&
    (canonical === "meal_start" || canonical === "meal_end")
  ) {
    return {
      ok: false,
      code: "paid_lunch_no_punch_required",
      status: 409,
      message:
        "Repas paye : aucun pointage debut ou fin de diner n est requis (employe ni direction). Le repas est inclus dans le quart.",
    };
  }
  return null;
}

export function linkedAuthUserMatchesCaller(
  chauffeurAuthUserId: string | null | undefined,
  callerAuthUserId: string
): boolean {
  return Boolean(
    chauffeurAuthUserId && chauffeurAuthUserId === callerAuthUserId
  );
}

/**
 * Future QA Lot 2 fixture link: chauffeur QA-L2-EMP-001 must reuse an already
 * authorized employee membership. Canonical column: chauffeurs.auth_user_id
 * (FK chauffeurs_auth_user_id_fkey → auth.users). Membership has no company
 * column; company is confirmed via organization_companies on the same org.
 * No Auth write. No token handling here.
 */

export const QA_LOT2_EMPLOYEE_CODE = "QA-L2-EMP-001" as const;
export const QA_LOT2_COMPANY_CODE = "qa_phase4d_lot2" as const;
export const QA_LOT2_EMPLOYEE_MEMBERSHIP_LINK_COLUMN = "auth_user_id" as const;
export const QA_LOT2_EMPLOYEE_MEMBERSHIP_LINK_FK =
  "chauffeurs_auth_user_id_fkey" as const;

export type QaLot2EmployeeMembership = {
  user_id: string;
  organization_id: string;
  role: string;
  status: string;
};

export type QaLot2OrganizationCompany = {
  id: string;
  organization_id: string;
  company_code: string;
  status: string;
};

export type QaLot2EmployeeMembershipLinkPlan =
  | {
      ok: true;
      auth_user_id: string;
      organization_id: string;
      organization_company_id: string;
      primary_company: typeof QA_LOT2_COMPANY_CODE;
      nom: typeof QA_LOT2_EMPLOYEE_CODE;
    }
  | {
      ok: false;
      reason:
        | "membership_not_employee"
        | "membership_inactive"
        | "membership_user_missing"
        | "company_inactive"
        | "company_code_mismatch"
        | "organization_mismatch"
        | "auth_user_already_linked";
    };

export function planQaLot2EmployeeMembershipLink(input: {
  membership: QaLot2EmployeeMembership;
  company: QaLot2OrganizationCompany;
  existingChauffeurAuthUserIds?: Array<string | null | undefined>;
}): QaLot2EmployeeMembershipLinkPlan {
  const userId = input.membership.user_id.trim();
  const membershipOrg = input.membership.organization_id.trim();
  const companyOrg = input.company.organization_id.trim();
  const companyId = input.company.id.trim();

  if (!userId) {
    return { ok: false, reason: "membership_user_missing" };
  }
  if (input.membership.role !== "employe") {
    return { ok: false, reason: "membership_not_employee" };
  }
  if (input.membership.status !== "active") {
    return { ok: false, reason: "membership_inactive" };
  }
  if (input.company.status !== "active") {
    return { ok: false, reason: "company_inactive" };
  }
  if (input.company.company_code !== QA_LOT2_COMPANY_CODE) {
    return { ok: false, reason: "company_code_mismatch" };
  }
  if (!membershipOrg || membershipOrg !== companyOrg || !companyId) {
    return { ok: false, reason: "organization_mismatch" };
  }
  if (
    (input.existingChauffeurAuthUserIds ?? []).some(
      (id) => typeof id === "string" && id.trim() === userId
    )
  ) {
    return { ok: false, reason: "auth_user_already_linked" };
  }

  return {
    ok: true,
    auth_user_id: userId,
    organization_id: membershipOrg,
    organization_company_id: companyId,
    primary_company: QA_LOT2_COMPANY_CODE,
    nom: QA_LOT2_EMPLOYEE_CODE,
  };
}

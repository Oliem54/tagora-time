import { describe, expect, it } from "vitest";
import {
  QA_LOT2_COMPANY_CODE,
  QA_LOT2_EMPLOYEE_CODE,
  QA_LOT2_EMPLOYEE_MEMBERSHIP_LINK_COLUMN,
  QA_LOT2_EMPLOYEE_MEMBERSHIP_LINK_FK,
  planQaLot2EmployeeMembershipLink,
} from "@/app/lib/horodateur-v1/qa-lot2-employee-membership-link.shared";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function membership(
  partial?: Partial<{
    user_id: string;
    organization_id: string;
    role: string;
    status: string;
  }>
) {
  return {
    user_id: USER,
    organization_id: ORG,
    role: "employe",
    status: "active",
    ...partial,
  };
}

function company(
  partial?: Partial<{
    id: string;
    organization_id: string;
    company_code: string;
    status: string;
  }>
) {
  return {
    id: COMPANY,
    organization_id: ORG,
    company_code: QA_LOT2_COMPANY_CODE,
    status: "active",
    ...partial,
  };
}

describe("QA Lot 2 chauffeur membership link", () => {
  it("links the chauffeur through chauffeurs.auth_user_id without creating Auth", () => {
    expect(QA_LOT2_EMPLOYEE_MEMBERSHIP_LINK_COLUMN).toBe("auth_user_id");
    expect(QA_LOT2_EMPLOYEE_MEMBERSHIP_LINK_FK).toBe(
      "chauffeurs_auth_user_id_fkey"
    );

    const planned = planQaLot2EmployeeMembershipLink({
      membership: membership(),
      company: company(),
    });

    expect(planned).toEqual({
      ok: true,
      auth_user_id: USER,
      organization_id: ORG,
      organization_company_id: COMPANY,
      primary_company: QA_LOT2_COMPANY_CODE,
      nom: QA_LOT2_EMPLOYEE_CODE,
    });
  });

  it("rejects inactive, non-employee, other-org, or already-linked memberships", () => {
    expect(
      planQaLot2EmployeeMembershipLink({
        membership: membership({ role: "direction" }),
        company: company(),
      }).ok
    ).toBe(false);
    expect(
      planQaLot2EmployeeMembershipLink({
        membership: membership({ status: "invited" }),
        company: company(),
      }).ok
    ).toBe(false);
    expect(
      planQaLot2EmployeeMembershipLink({
        membership: membership(),
        company: company({ organization_id: OTHER_ORG }),
      }).ok
    ).toBe(false);
    expect(
      planQaLot2EmployeeMembershipLink({
        membership: membership(),
        company: company({ company_code: "oliem_solutions" }),
      }).ok
    ).toBe(false);
    expect(
      planQaLot2EmployeeMembershipLink({
        membership: membership(),
        company: company(),
        existingChauffeurAuthUserIds: [USER],
      }).ok
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  employeeBelongsToActorOrganization,
  retainIdentityLinksForOrganizationAuthUsers,
  stripClientOrganizationFields,
} from "@/app/lib/employee-organization-scope.shared";

describe("employee organization scope", () => {
  it("keeps a dossier only when the organizations are exactly the same", () => {
    expect(
      employeeBelongsToActorOrganization({
        actorOrganizationId: "org-horora",
        employeeOrganizationId: "org-horora",
      })
    ).toBe(true);
  });

  it("refuses another organization, an unstamped dossier, and a missing actor", () => {
    expect(
      employeeBelongsToActorOrganization({
        actorOrganizationId: "org-horora",
        employeeOrganizationId: "org-other",
      })
    ).toBe(false);
    expect(
      employeeBelongsToActorOrganization({
        actorOrganizationId: "org-horora",
        employeeOrganizationId: null,
      })
    ).toBe(false);
    expect(
      employeeBelongsToActorOrganization({
        actorOrganizationId: "  ",
        employeeOrganizationId: "org-horora",
      })
    ).toBe(false);
    expect(
      employeeBelongsToActorOrganization({
        actorOrganizationId: null,
        employeeOrganizationId: "org-horora",
      })
    ).toBe(false);
  });

  it("does not stamp a foreign identity onto the current organization", () => {
    const kept = retainIdentityLinksForOrganizationAuthUsers(
      [
        { authUserId: "user-local", nexusUserId: "nuser_local" },
        { authUserId: "user-foreign", nexusUserId: "nuser_foreign" },
        { authUserId: "", nexusUserId: "nuser_blank" },
        { authUserId: null, nexusUserId: "nuser_null" },
      ],
      new Set(["user-local"])
    );
    expect(kept).toEqual([{ authUserId: "user-local", nexusUserId: "nuser_local" }]);
  });

  it("drops organization fields supplied by the client", () => {
    expect(
      stripClientOrganizationFields({
        nom: "Yves",
        organization_id: "org-other",
        organizationId: "org-other",
        organization_company_id: "company-other",
        organizationCompanyId: "company-other",
      })
    ).toEqual({ nom: "Yves" });
  });
});

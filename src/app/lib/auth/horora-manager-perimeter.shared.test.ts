import { describe, expect, it } from "vitest";
import { decideHororaManagerPerimeter } from "@/app/lib/auth/horora-manager-perimeter.shared";

const base = {
  actorOrganizationId: "org-a",
  targetOrganizationId: "org-a",
  targetDepartmentKey: "livreur",
  action: "approve_time" as const,
};

describe("HORORA manager perimeter", () => {
  it("limits direction to an explicitly assigned department", () => {
    expect(
      decideHororaManagerPerimeter({
        ...base,
        actorRole: "direction",
        actorDepartmentKeys: ["livreur"],
      })
    ).toMatchObject({ allowed: true, persisted: false, reason: "department_scope" });
    expect(
      decideHororaManagerPerimeter({
        ...base,
        actorRole: "direction",
        actorDepartmentKeys: ["atelier"],
      })
    ).toMatchObject({ allowed: false, reason: "outside_perimeter" });
  });

  it("denies a direction manager who has no department assignment", () => {
    expect(
      decideHororaManagerPerimeter({
        ...base,
        actorRole: "direction",
        actorDepartmentKeys: [],
      })
    ).toMatchObject({ allowed: false, reason: "manager_department_absent" });
  });

  it("keeps an employee out of team approval and correction", () => {
    for (const action of ["view_team", "approve_time", "correct_time"] as const) {
      expect(
        decideHororaManagerPerimeter({
          ...base,
          actorRole: "employe",
          actorDepartmentKeys: ["livreur"],
          action,
        })
      ).toMatchObject({ allowed: false, reason: "actor_forbidden" });
    }
  });

  it("refuses another organization for every local role", () => {
    for (const actorRole of [
      "organization_owner",
      "organization_admin",
      "direction",
      "employe",
    ] as const) {
      expect(
        decideHororaManagerPerimeter({
          ...base,
          actorRole,
          actorOrganizationId: "org-a",
          targetOrganizationId: "org-b",
          actorDepartmentKeys: ["livreur"],
        })
      ).toMatchObject({ allowed: false, reason: "cross_organization_forbidden" });
    }
  });

  it("lets an organization owner cover the organization without becoming another org admin", () => {
    expect(
      decideHororaManagerPerimeter({
        ...base,
        actorRole: "organization_owner",
        actorDepartmentKeys: [],
      })
    ).toMatchObject({
      allowed: true,
      connectedToHttp: false,
      reason: "organization_scope",
    });
  });

  it("does not treat a missing target department as a match", () => {
    expect(
      decideHororaManagerPerimeter({
        ...base,
        actorRole: "direction",
        actorDepartmentKeys: ["livreur"],
        targetDepartmentKey: "  ",
      })
    ).toMatchObject({ allowed: false, reason: "target_department_absent" });
  });
});

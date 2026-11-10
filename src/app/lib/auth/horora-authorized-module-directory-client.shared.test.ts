import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  HORORA_DIRECTORY_REVOCATION_ENFORCED_ON_EXISTING_USERS,
  adaptAuthorizedModuleDirectory,
  evaluateHororaNexusAccessRevocation,
  type AuthorizedModuleDirectoryEntry,
  type HororaPreservedEmployeeDossier,
  type HororaPreservedMembership,
} from "@/app/lib/auth/horora-authorized-module-directory.shared";
import {
  HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH,
  HORORA_FORBIDDEN_NEXUS_ADMIN_USERS_PATH,
  acceptCanonicalIdentityLinks,
  authorizeHororaDirectoryReader,
  planAuthorizedDirectoryRequest,
  readAuthorizedModuleDirectory,
  resolveAuthorizedDirectoryQuery,
} from "@/app/lib/auth/horora-authorized-module-directory-client.shared";

const root = process.cwd();
const scope = {
  tenantId: "tenant_horora",
  organizationId: "org_nexus_a",
  moduleKey: "tagora_time" as const,
};

function entry(
  overrides: Partial<AuthorizedModuleDirectoryEntry> &
    Pick<AuthorizedModuleDirectoryEntry, "userId">
): AuthorizedModuleDirectoryEntry {
  return {
    displayName: "Nexus",
    contactEmail: "same@example.test",
    technicalKey: "tagora_time",
    status: "ACTIVE",
    organizationId: "org_nexus_a",
    nexusRoleKey: "organization_admin",
    ...overrides,
  };
}

function dossier(
  overrides: Partial<HororaPreservedEmployeeDossier> &
    Pick<HororaPreservedEmployeeDossier, "dossierId">
): HororaPreservedEmployeeDossier {
  return {
    displayName: "Dossier",
    contactEmail: "same@example.test",
    active: true,
    authUserId: "auth-1",
    ...overrides,
  };
}

function membership(
  overrides: Partial<HororaPreservedMembership> = {}
): HororaPreservedMembership {
  return {
    membershipId: "mem-1",
    authUserId: "auth-1",
    role: "employe",
    status: "active",
    ...overrides,
  };
}

describe("AuthorizedModuleDirectory local client", () => {
  it("requires tenant, organization and tagora_time, and holds the remote call", async () => {
    expect(
      planAuthorizedDirectoryRequest({
        tenantId: "",
        organizationId: "org_nexus_a",
        moduleKey: "tagora_time",
      }).ok
    ).toBe(false);
    expect(
      planAuthorizedDirectoryRequest({
        ...scope,
        moduleKey: "tagora_stock_premium" as "tagora_time",
      }).ok
    ).toBe(false);
    const plan = planAuthorizedDirectoryRequest(scope);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.request.path).toBe(HORORA_AUTHORIZED_DIRECTORY_SERVICE_PATH);
    expect(plan.request.path).not.toBe(HORORA_FORBIDDEN_NEXUS_ADMIN_USERS_PATH);
    expect(plan.request.authentication).toBe("private_key_jwt");
    expect(plan.request.algorithm).toBe("ES256");
    expect(plan.request.dispatch).toBe("held");

    const transport = vi.fn();
    const held = await readAuthorizedModuleDirectory({
      query: scope,
      transport,
      dispatch: "held",
    });
    expect(held).toMatchObject({ ok: false, status: "service_uncertified" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("shows a Nexus user before a HORORA login and refuses sensitive defaults", () => {
    const view = adaptAuthorizedModuleDirectory({
      directory: { technicalKey: "tagora_time", connected: true, entries: [entry({ userId: "nuser_new" })] },
      dossiers: [],
      memberships: [],
      scope,
    });
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      nexusUserId: "nuser_new",
      dossierId: null,
      visibleWithoutHororaLogin: true,
      directoryStatus: "ACTIVE",
      revocationEnforced: false,
    });
    expect(view.rows[0].sections.every((section) => section.checked === false)).toBe(true);
  });

  it("merges only an existing canonical nuser_ mapping", () => {
    const shared = {
      directory: {
        technicalKey: "tagora_time" as const,
        connected: true,
        entries: [entry({ userId: "nuser_mapped", displayName: "Depuis Nexus" })],
      },
      dossiers: [dossier({ dossierId: 7, displayName: "Dossier local" })],
      memberships: [membership()],
      scope,
      validatedPermissionsByAuthUserId: { "auth-1": ["terrain", "documents"] },
    };
    const byEmail = adaptAuthorizedModuleDirectory(shared);
    expect(byEmail.rows).toHaveLength(2);
    expect(byEmail.rows.find((row) => row.dossierId === 7)?.nexusUserId).toBeNull();

    const byMap = adaptAuthorizedModuleDirectory({
      ...shared,
      canonicalLinks: [
        {
          nexusUserId: "nuser_mapped",
          authUserId: "auth-1",
          organizationId: "org_nexus_a",
        },
      ],
    });
    expect(byMap.rows).toHaveLength(1);
    expect(byMap.rows[0]).toMatchObject({
      dossierId: 7,
      nexusUserId: "nuser_mapped",
      membershipId: "mem-1",
    });
    expect(byMap.rows[0].sections.find((section) => section.id === "documents")?.checked).toBe(
      true
    );
    expect(byMap.rows[0].sections.find((section) => section.id === "finance")?.checked).toBe(
      false
    );
  });

  it("drops another organization and a non-canonical id", () => {
    const view = adaptAuthorizedModuleDirectory({
      directory: {
        technicalKey: "tagora_time",
        connected: true,
        entries: [
          entry({ userId: "nuser_other_org", organizationId: "org_nexus_b" }),
          entry({ userId: "same@example.test", organizationId: "org_nexus_a" }),
        ],
      },
      dossiers: [dossier({ dossierId: 3 })],
      canonicalLinks: [
        {
          nexusUserId: "nuser_other_org",
          authUserId: "auth-1",
          organizationId: "org_nexus_b",
        },
      ],
      memberships: [],
      scope,
    });
    expect(view.rows.map((row) => row.nexusUserId)).toEqual([null]);
    expect(view.rows[0].dossierId).toBe(3);
  });

  it("prepares suspended and revoked states without enforcing them on existing users", () => {
    expect(HORORA_DIRECTORY_REVOCATION_ENFORCED_ON_EXISTING_USERS).toBe(false);
    for (const status of ["SUSPENDED", "REVOKED"] as const) {
      expect(evaluateHororaNexusAccessRevocation(status)).toMatchObject({
        moduleEntryAllowed: false,
        revocationEnforced: false,
        wiredToHandoff: false,
        mutatesPunchSession: false,
      });
    }
    expect(evaluateHororaNexusAccessRevocation("ABSENT")).toMatchObject({
      reason: "absence_is_not_revocation",
      absenceProvesRevocation: false,
      absenceProvesActiveAccess: false,
    });
    const view = adaptAuthorizedModuleDirectory({
      directory: {
        technicalKey: "tagora_time",
        connected: true,
        entries: [
          entry({ userId: "nuser_pending", status: "PENDING", displayName: "En attente" }),
          entry({ userId: "nuser_suspended", status: "SUSPENDED", displayName: "Suspendu" }),
          entry({ userId: "nuser_revoked", status: "REVOKED", displayName: "Révoqué" }),
        ],
      },
      dossiers: [],
      memberships: [],
      scope,
    });
    expect(view.rows.map((row) => row.directoryStatus).sort()).toEqual([
      "PENDING",
      "REVOKED",
      "SUSPENDED",
    ]);
    expect(view.rows.every((row) => row.revocationEnforced === false)).toBe(true);
  });

  it("keeps local dossiers when the central service is unavailable", async () => {
    const unavailable = await readAuthorizedModuleDirectory({
      query: scope,
      dispatch: "test",
      transport: async () => {
        throw new Error("nexus down");
      },
    });
    expect(unavailable).toMatchObject({
      ok: false,
      status: "service_unavailable",
      directory: null,
    });
    const view = adaptAuthorizedModuleDirectory({
      directory: unavailable.directory,
      dossiers: [dossier({ dossierId: 9, displayName: "Local" })],
      memberships: [membership()],
      scope,
    });
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0].directoryStatus).toBe("ABSENT");
    expect(view.rows[0].membershipId).toBe("mem-1");
    expect(view.blocker).toContain("n'est pas une révocation");
  });

  it("refuses a direction session on the administration reader", () => {
    expect(authorizeHororaDirectoryReader("direction")).toBe(false);
    expect(authorizeHororaDirectoryReader("employe")).toBe(false);
    expect(authorizeHororaDirectoryReader(null)).toBe(false);
    expect(authorizeHororaDirectoryReader("admin")).toBe(true);
    const route = readFileSync(
      join(root, "src/app/api/admin/utilisateurs/directory/route.ts"),
      "utf8"
    );
    expect(route).toContain("authorizeHororaDirectoryReader");
    expect(route).not.toContain(HORORA_FORBIDDEN_NEXUS_ADMIN_USERS_PATH);
    expect(route).not.toContain("fetch(");
    const client = readFileSync(
      join(root, "src/app/lib/auth/horora-authorized-module-directory-client.shared.ts"),
      "utf8"
    );
    expect(client).not.toContain("fetch(");
    expect(client).toContain(HORORA_FORBIDDEN_NEXUS_ADMIN_USERS_PATH);
    const punch = readFileSync(
      join(root, "src/app/lib/employee-punch-status.shared.ts"),
      "utf8"
    );
    expect(punch).not.toContain("horora-authorized-module-directory");
  });

  it("resolves one active organization map and ignores a blank tenant", () => {
    expect(
      resolveAuthorizedDirectoryQuery({
        hororaOrganizationId: "org-horora",
        organizationMaps: [
          {
            nexusOrganizationId: "org_nexus_a",
            nexusTenantId: "tenant_horora",
            organizationId: "org-horora",
            status: "active",
          },
        ],
      })
    ).toEqual({ ok: true, query: scope });
    expect(
      resolveAuthorizedDirectoryQuery({
        hororaOrganizationId: "org-horora",
        organizationMaps: [
          {
            nexusOrganizationId: "org_nexus_a",
            nexusTenantId: null,
            organizationId: "org-horora",
            status: "active",
          },
        ],
      }).ok
    ).toBe(false);
    expect(
      acceptCanonicalIdentityLinks([
        {
          nexusUserId: "nuser_ok",
          authUserId: "auth-1",
          organizationId: "org_nexus_a",
        },
        {
          nexusUserId: "mailbox@example.test",
          authUserId: "auth-2",
          organizationId: "org_nexus_a",
        },
      ]).map((link) => link.nexusUserId)
    ).toEqual(["nuser_ok"]);
  });
});

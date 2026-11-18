import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HORORA_AUTHORIZED_DIRECTORY_BLOCKER,
  HORORA_SENSITIVE_PERMISSION_SECTION_IDS,
  adaptAuthorizedModuleDirectory,
  buildHororaPermissionSections,
  buildIsolatedDirectoryPanelFixture,
  evaluateHororaNexusAccessRevocation,
  nexusRoleGrantsSensitiveAccess,
  pageDirectoryRows,
  type AuthorizedModuleDirectoryEntry,
  type HororaPreservedEmployeeDossier,
  type HororaPreservedMembership,
} from "@/app/lib/auth/horora-authorized-module-directory.shared";

const root = process.cwd();

function dossier(
  overrides: Partial<HororaPreservedEmployeeDossier> &
    Pick<HororaPreservedEmployeeDossier, "dossierId">
): HororaPreservedEmployeeDossier {
  return {
    displayName: "Employé",
    contactEmail: null,
    active: true,
    authUserId: null,
    ...overrides,
  };
}

function membership(
  overrides: Partial<HororaPreservedMembership> &
    Pick<HororaPreservedMembership, "membershipId" | "authUserId" | "role">
): HororaPreservedMembership {
  return {
    status: "active",
    ...overrides,
  };
}

function directoryEntry(
  overrides: Partial<AuthorizedModuleDirectoryEntry> &
    Pick<AuthorizedModuleDirectoryEntry, "userId">
): AuthorizedModuleDirectoryEntry {
  return {
    displayName: "Annuaire",
    contactEmail: null,
    technicalKey: "tagora_time",
    status: "ACTIVE",
    organizationId: null,
    nexusRoleKey: "NEXUS_ENTRY_MEMBER",
    ...overrides,
  };
}

function checkedSensitive(nexusRoleKey: string) {
  return buildHororaPermissionSections({
    portalRole: null,
    validatedPermissions: [],
    nexusRoleKey,
  }).filter((section) => section.sensitive && section.checked);
}

describe("AuthorizedModuleDirectory adaptation", () => {
  it("shows a Nexus-authorized person before any HORORA login or dossier", () => {
    const view = adaptAuthorizedModuleDirectory({
      directory: {
        technicalKey: "tagora_time",
        connected: true,
        entries: [
          directoryEntry({
            userId: "nuser_new",
            displayName: "Camille Auth",
            contactEmail: "camille@example.test",
            nexusRoleKey: "organization_admin",
          }),
        ],
      },
      dossiers: [],
      memberships: [],
    });

    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      displayName: "Camille Auth",
      visibleWithoutHororaLogin: true,
      dossierId: null,
      membershipId: null,
      portalRole: null,
      moduleEntryAllowed: true,
      revocationWiredToHandoff: false,
    });
    expect(view.rows[0].sections.filter((section) => section.checked)).toEqual([]);
    expect(view.blocker).toBeNull();
  });

  it("keeps existing dossiers and memberships when the directory is absent", () => {
    const dossiers = [
      dossier({
        dossierId: 12,
        displayName: "Alex Employé",
        contactEmail: "alex@example.test",
        authUserId: "auth-alex",
      }),
    ];
    const memberships = [
      membership({
        membershipId: "mem-alex",
        authUserId: "auth-alex",
        role: "employe",
      }),
    ];
    const dossierSnapshot = structuredClone(dossiers);
    const membershipSnapshot = structuredClone(memberships);

    const view = adaptAuthorizedModuleDirectory({
      directory: { technicalKey: "tagora_time", connected: false, entries: [] },
      dossiers,
      memberships,
      validatedPermissionsByAuthUserId: {
        "auth-alex": ["terrain", "documents"],
      },
    });

    expect(dossiers).toEqual(dossierSnapshot);
    expect(memberships).toEqual(membershipSnapshot);
    expect(view.dossiersPreserved).toBe(true);
    expect(view.membershipsPreserved).toBe(true);
    expect(view.persisted).toBe(false);
    expect(view.blocker).toBe(HORORA_AUTHORIZED_DIRECTORY_BLOCKER);
    expect(view.rows[0]).toMatchObject({
      dossierId: 12,
      membershipId: "mem-alex",
      membershipRole: "employe",
      portalRole: "employe",
      visibleWithoutHororaLogin: true,
      directoryStatus: "ABSENT",
    });
    const pointage = view.rows[0].sections.find((section) => section.id === "pointage");
    const documents = view.rows[0].sections.find((section) => section.id === "documents");
    const finance = view.rows[0].sections.find((section) => section.id === "finance");
    expect(pointage?.checked).toBe(true);
    expect(pointage?.source).toBe("validated_explicit");
    expect(documents?.checked).toBe(true);
    expect(finance?.checked).toBe(false);
  });

  it("does not let a Nexus role check finance, payroll, remuneration, commissions, or administration", () => {
    for (const role of [
      "admin",
      "organization_admin",
      "organization_owner",
      "direction",
      "employe",
      "NEXUS_ENTRY_MEMBER",
      "NEXUS_ENTRY_OPERATOR",
    ]) {
      expect(nexusRoleGrantsSensitiveAccess(role)).toBe(false);
      expect(checkedSensitive(role)).toEqual([]);
    }
  });

  it("keeps finance, payroll, remuneration, commissions, and administration as separate boxes", () => {
    const sections = buildHororaPermissionSections({
      portalRole: "direction",
      validatedPermissions: ["horodateur_payroll_read", "commissions"],
      nexusRoleKey: "direction",
    });
    const byId = Object.fromEntries(sections.map((section) => [section.id, section]));
    expect(byId.finance.checked).toBe(false);
    expect(byId.remuneration.checked).toBe(false);
    expect(byId.paie_lecture.checked).toBe(true);
    expect(byId.paie_gestion.checked).toBe(false);
    expect(byId.commissions.checked).toBe(true);
    expect(byId.administration.checked).toBe(false);
    expect(new Set(sections.map((section) => section.id)).size).toBe(sections.length);
    for (const id of HORORA_SENSITIVE_PERMISSION_SECTION_IDS) {
      expect(byId[id].grantedByNexusRole).toBe(false);
      expect(byId[id].persistedByThisScreen).toBe(false);
    }
  });

  it("does not turn payroll strings on an employe into paie access", () => {
    const sections = buildHororaPermissionSections({
      portalRole: "employe",
      validatedPermissions: [
        "horodateur_payroll_read",
        "horodateur_payroll_manage",
        "admin_finance",
      ],
      nexusRoleKey: "admin",
    });
    expect(sections.find((section) => section.id === "paie_lecture")?.checked).toBe(false);
    expect(sections.find((section) => section.id === "paie_gestion")?.checked).toBe(false);
    expect(sections.find((section) => section.id === "finance")?.checked).toBe(false);
    expect(sections.find((section) => section.id === "remuneration")?.checked).toBe(false);
    expect(sections.find((section) => section.id === "pointage")?.checked).toBe(true);
  });

  it("preserves an already validated HORORA admin without taking the grant from Nexus", () => {
    const sections = buildHororaPermissionSections({
      portalRole: "admin",
      validatedPermissions: [],
      nexusRoleKey: null,
    });
    expect(sections.find((section) => section.id === "finance")).toMatchObject({
      checked: true,
      source: "validated_horora_admin_role",
      grantedByNexusRole: false,
    });
    expect(sections.find((section) => section.id === "pointage")?.checked).toBe(false);
    expect(sections.find((section) => section.id === "administration")?.checked).toBe(
      true
    );
  });

  it("revokes a session for REVOKED and SUSPENDED without treating absence as revocation", () => {
    expect(evaluateHororaNexusAccessRevocation("REVOKED")).toMatchObject({
      moduleEntryAllowed: false,
      reason: "directory_revoked",
      wiredToHandoff: true,
      revocationEnforced: true,
      mutatesPunchSession: true,
      mutatesGps: false,
      mutatesNexusIdentityMap: false,
      mutatesMembership: false,
    });
    expect(evaluateHororaNexusAccessRevocation("SUSPENDED").moduleEntryAllowed).toBe(
      false
    );
    expect(evaluateHororaNexusAccessRevocation("ABSENT")).toMatchObject({
      reason: "absence_is_not_revocation",
      mutatesMembership: false,
    });

    const view = adaptAuthorizedModuleDirectory({
      directory: {
        technicalKey: "tagora_time",
        connected: true,
        entries: [
          directoryEntry({
            userId: "nuser_revoked",
            displayName: "Revoked",
            status: "REVOKED",
            contactEmail: "revoked@example.test",
          }),
        ],
      },
      dossiers: [
        dossier({
          dossierId: 4,
          displayName: "Revoked",
          contactEmail: "revoked@example.test",
          authUserId: "auth-revoked",
        }),
      ],
      canonicalLinks: [
        {
          nexusUserId: "nuser_revoked",
          authUserId: "auth-revoked",
          organizationId: "org-horora",
        },
      ],
      memberships: [
        membership({
          membershipId: "mem-revoked",
          authUserId: "auth-revoked",
          role: "employe",
        }),
      ],
    });
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0].dossierId).toBe(4);
    expect(view.rows[0].membershipId).toBe("mem-revoked");
    expect(view.rows[0].moduleEntryAllowed).toBe(false);
    expect(view.rows[0].revocationEnforced).toBe(true);
    expect(view.rows[0].revocationWiredToHandoff).toBe(true);
    expect(view.rows[0].sections.find((section) => section.id === "pointage")?.checked).toBe(
      true
    );
  });

  it("ignores another module and does not merge duplicate emails", () => {
    const view = adaptAuthorizedModuleDirectory({
      directory: {
        technicalKey: "tagora_time",
        connected: true,
        entries: [
          directoryEntry({
            userId: "other-module",
            technicalKey: "tagora_stock_premium",
            contactEmail: "shared@example.test",
          }),
          directoryEntry({
            userId: "nuser_time_user",
            contactEmail: "shared@example.test",
            displayName: "Depuis Nexus",
          }),
        ],
      },
      dossiers: [
        dossier({
          dossierId: 1,
          displayName: "Un",
          contactEmail: "shared@example.test",
        }),
        dossier({
          dossierId: 2,
          displayName: "Deux",
          contactEmail: "shared@example.test",
        }),
      ],
      memberships: [],
    });

    expect(view.rows).toHaveLength(3);
    expect(
      view.rows
        .map((row) => row.dossierId)
        .filter((id): id is number => id != null)
        .sort((a, b) => a - b)
    ).toEqual([1, 2]);
    expect(view.rows.find((row) => row.nexusUserId === "nuser_time_user")?.dossierId).toBeNull();
    expect(view.rows.find((row) => row.nexusUserId === "other-module")).toBeUndefined();
  });

  it("keeps info@pi-titan.com and info@apexelitecredit.com unlinked", () => {
    const piEmail = "info@pi-titan.com";
    const apexEmail = "info@apexelitecredit.com";
    const view = adaptAuthorizedModuleDirectory({
      directory: {
        technicalKey: "tagora_time",
        connected: true,
        entries: [
          directoryEntry({
            userId: "nuser_pi_titan",
            displayName: "PI Titan",
            contactEmail: piEmail,
            organizationId: "org_pi_titan",
            tenantId: "tenant_pi_titan",
          }),
          directoryEntry({
            userId: "nuser_apex_elite",
            displayName: "Apex Elite Credit",
            contactEmail: apexEmail,
            organizationId: "org_apex_elite",
            tenantId: "tenant_apex_elite",
          }),
        ],
      },
      dossiers: [
        dossier({
          dossierId: 11,
          displayName: "PI Titan",
          contactEmail: piEmail,
          authUserId: "auth-pi-titan",
        }),
        dossier({
          dossierId: 22,
          displayName: "Apex Elite Credit",
          contactEmail: apexEmail,
          authUserId: "auth-apex-elite",
        }),
      ],
      memberships: [
        membership({
          membershipId: "mem-pi",
          authUserId: "auth-pi-titan",
          role: "employe",
        }),
        membership({
          membershipId: "mem-apex",
          authUserId: "auth-apex-elite",
          role: "organization_admin",
        }),
      ],
    });

    expect(view.rows).toHaveLength(4);
    expect(view.rows.find((row) => row.nexusUserId === "nuser_pi_titan")).toMatchObject({
      dossierId: null,
      contactEmail: piEmail,
      membershipId: null,
    });
    expect(view.rows.find((row) => row.nexusUserId === "nuser_apex_elite")).toMatchObject({
      dossierId: null,
      contactEmail: apexEmail,
      membershipId: null,
    });
    expect(view.rows.find((row) => row.dossierId === 11)).toMatchObject({
      nexusUserId: null,
      contactEmail: piEmail,
      membershipId: "mem-pi",
    });
    expect(view.rows.find((row) => row.dossierId === 22)).toMatchObject({
      nexusUserId: null,
      contactEmail: apexEmail,
      membershipId: "mem-apex",
    });

    const scoped = adaptAuthorizedModuleDirectory({
      directory: {
        technicalKey: "tagora_time",
        connected: true,
        entries: [
          directoryEntry({
            userId: "nuser_pi_titan",
            displayName: "PI Titan",
            contactEmail: piEmail,
            organizationId: "org_pi_titan",
            tenantId: "tenant_pi_titan",
          }),
          directoryEntry({
            userId: "nuser_apex_elite",
            displayName: "Apex Elite Credit",
            contactEmail: apexEmail,
            organizationId: "org_apex_elite",
            tenantId: "tenant_apex_elite",
          }),
        ],
      },
      dossiers: [
        dossier({
          dossierId: 11,
          displayName: "PI Titan",
          contactEmail: piEmail,
          authUserId: "auth-pi-titan",
        }),
      ],
      memberships: [
        membership({
          membershipId: "mem-pi",
          authUserId: "auth-pi-titan",
          role: "employe",
        }),
      ],
      canonicalLinks: [
        {
          nexusUserId: "nuser_apex_elite",
          authUserId: "auth-pi-titan",
          organizationId: "org_pi_titan",
        },
      ],
      scope: {
        tenantId: "tenant_pi_titan",
        organizationId: "org_pi_titan",
        moduleKey: "tagora_time",
      },
    });
    expect(scoped.rows.some((row) => row.contactEmail === apexEmail)).toBe(false);
    expect(scoped.rows.some((row) => row.nexusUserId === "nuser_apex_elite")).toBe(false);
    expect(scoped.rows.find((row) => row.dossierId === 11)?.nexusUserId).toBeNull();
  });

  it("shows one validated local nuser while the directory stays uncertified", () => {
    const view = adaptAuthorizedModuleDirectory({
      directory: { technicalKey: "tagora_time", connected: false, entries: [] },
      dossiers: [
        dossier({
          dossierId: 9,
          displayName: "Martin ST-Gelais",
          authUserId: "auth-martin",
        }),
      ],
      memberships: [
        membership({
          membershipId: "mem-martin",
          authUserId: "auth-martin",
          role: "organization_owner",
        }),
      ],
      canonicalLinks: [
        {
          nexusUserId: "nuser_5035cfcbd29a751e382fdf02f785d11f",
          authUserId: "auth-martin",
          organizationId: "org_tagora_internal",
        },
      ],
      scope: {
        tenantId: "tenant_tagora_internal",
        organizationId: "org_tagora_internal",
        moduleKey: "tagora_time",
      },
    });

    expect(view.directoryConnected).toBe(false);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      dossierId: 9,
      nexusUserId: "nuser_5035cfcbd29a751e382fdf02f785d11f",
      nexusRoleKey: null,
      directoryStatus: "ABSENT",
      identityProjection: "local_link",
      moduleEntryAllowed: false,
      revocationEnforced: false,
      membershipRole: "organization_owner",
    });
    const finance = view.rows[0].sections.find((section) => section.id === "finance");
    expect(finance?.checked).toBe(true);
    expect(finance?.grantedByNexusRole).toBe(false);
    expect(finance?.source).toBe("validated_horora_admin_role");

    const employee = adaptAuthorizedModuleDirectory({
      directory: { technicalKey: "tagora_time", connected: false, entries: [] },
      dossiers: [
        dossier({
          dossierId: 10,
          displayName: "Employé lié",
          authUserId: "auth-employee",
        }),
      ],
      memberships: [
        membership({
          membershipId: "mem-employee",
          authUserId: "auth-employee",
          role: "employe",
        }),
      ],
      canonicalLinks: [
        {
          nexusUserId: "nuser_employee_local",
          authUserId: "auth-employee",
          organizationId: "org_tagora_internal",
        },
      ],
      scope: {
        tenantId: "tenant_tagora_internal",
        organizationId: "org_tagora_internal",
        moduleKey: "tagora_time",
      },
    });
    expect(employee.rows[0]).toMatchObject({
      nexusUserId: "nuser_employee_local",
      identityProjection: "local_link",
      portalRole: "employe",
      moduleEntryAllowed: false,
    });
    expect(employee.rows[0].sections.find((section) => section.id === "administration")?.checked).toBe(
      false
    );
    expect(employee.rows[0].sections.every((section) => section.grantedByNexusRole === false)).toBe(
      true
    );
  });

  it("does not display an ambiguous, foreign, or invalid local nuser", () => {
    const scope = {
      tenantId: "tenant_tagora_internal",
      organizationId: "org_tagora_internal",
      moduleKey: "tagora_time" as const,
    };
    const base = {
      directory: { technicalKey: "tagora_time" as const, connected: false, entries: [] },
      dossiers: [
        dossier({
          dossierId: 9,
          displayName: "Martin ST-Gelais",
          authUserId: "auth-martin",
        }),
      ],
      memberships: [
        membership({
          membershipId: "mem-martin",
          authUserId: "auth-martin",
          role: "organization_owner",
        }),
      ],
      scope,
    };
    const ambiguous = adaptAuthorizedModuleDirectory({
      ...base,
      canonicalLinks: [
        {
          nexusUserId: "nuser_one",
          authUserId: "auth-martin",
          organizationId: "org_tagora_internal",
        },
        {
          nexusUserId: "nuser_two",
          authUserId: "auth-martin",
          organizationId: "org_tagora_internal",
        },
      ],
    });
    const foreign = adaptAuthorizedModuleDirectory({
      ...base,
      canonicalLinks: [
        {
          nexusUserId: "nuser_foreign",
          authUserId: "auth-martin",
          organizationId: "org_other",
        },
      ],
    });
    const invalid = adaptAuthorizedModuleDirectory({
      ...base,
      canonicalLinks: [
        {
          nexusUserId: "martin@example.test",
          authUserId: "auth-martin",
          organizationId: "org_tagora_internal",
        },
      ],
    });
    const missing = adaptAuthorizedModuleDirectory({ ...base, canonicalLinks: [] });
    const disabled = adaptAuthorizedModuleDirectory({
      ...base,
      canonicalLinks: [
        {
          nexusUserId: "nuser_5035cfcbd29a751e382fdf02f785d11f",
          authUserId: "auth-other",
          organizationId: "org_tagora_internal",
          disabledAt: "2026-11-01T00:00:00.000Z",
        },
        {
          nexusUserId: "nuser_5035cfcbd29a751e382fdf02f785d11f",
          authUserId: "auth-martin",
          organizationId: "org_tagora_internal",
          disabledAt: "2026-11-01T00:00:00.000Z",
        },
      ],
    });
    const duplicateDossier = adaptAuthorizedModuleDirectory({
      ...base,
      dossiers: [
        dossier({ dossierId: 9, displayName: "Martin ST-Gelais", authUserId: "auth-martin" }),
        dossier({ dossierId: 19, displayName: "Doublon", authUserId: "auth-martin" }),
      ],
      canonicalLinks: [
        {
          nexusUserId: "nuser_5035cfcbd29a751e382fdf02f785d11f",
          authUserId: "auth-martin",
          organizationId: "org_tagora_internal",
        },
      ],
    });
    expect(ambiguous.rows[0]).toMatchObject({
      nexusUserId: null,
      identityProjection: "unlinked",
      moduleEntryAllowed: false,
    });
    expect(foreign.rows[0].nexusUserId).toBeNull();
    expect(invalid.rows[0].nexusUserId).toBeNull();
    expect(missing.rows[0].nexusUserId).toBeNull();
    expect(disabled.rows[0].nexusUserId).toBeNull();
    expect(duplicateDossier.rows.every((row) => row.nexusUserId === null)).toBe(true);
    expect(foreign.rows[0].directoryStatus).toBe("ABSENT");
  });

  it("keeps a certified denial or a certified absence ahead of the local link", () => {
    const scope = {
      tenantId: "tenant_tagora_internal",
      organizationId: "org_tagora_internal",
      moduleKey: "tagora_time" as const,
    };
    const link = {
      nexusUserId: "nuser_5035cfcbd29a751e382fdf02f785d11f",
      authUserId: "auth-martin",
      organizationId: "org_tagora_internal",
    };
    const revoked = adaptAuthorizedModuleDirectory({
      directory: {
        technicalKey: "tagora_time",
        connected: true,
        entries: [
          directoryEntry({
            userId: "nuser_5035cfcbd29a751e382fdf02f785d11f",
            displayName: "Martin ST-Gelais",
            status: "REVOKED",
            organizationId: "org_tagora_internal",
            tenantId: "tenant_tagora_internal",
          }),
        ],
      },
      dossiers: [
        dossier({ dossierId: 9, displayName: "Martin ST-Gelais", authUserId: "auth-martin" }),
      ],
      memberships: [
        membership({
          membershipId: "mem-martin",
          authUserId: "auth-martin",
          role: "organization_owner",
        }),
      ],
      canonicalLinks: [link],
      scope,
    });
    expect(revoked.rows).toHaveLength(1);
    expect(revoked.rows[0]).toMatchObject({
      nexusUserId: "nuser_5035cfcbd29a751e382fdf02f785d11f",
      directoryStatus: "REVOKED",
      identityProjection: "remote_denied",
      moduleEntryAllowed: false,
      revocationEnforced: true,
    });

    const absent = adaptAuthorizedModuleDirectory({
      directory: { technicalKey: "tagora_time", connected: true, entries: [] },
      dossiers: [
        dossier({ dossierId: 9, displayName: "Martin ST-Gelais", authUserId: "auth-martin" }),
      ],
      memberships: [],
      canonicalLinks: [link],
      scope,
    });
    expect(absent.rows[0]).toMatchObject({
      nexusUserId: null,
      directoryStatus: "ABSENT",
      identityProjection: "certified_absent",
      moduleEntryAllowed: false,
      revocationEnforced: false,
    });

    const unavailable = adaptAuthorizedModuleDirectory({
      directory: null,
      dossiers: [
        dossier({ dossierId: 9, displayName: "Martin ST-Gelais", authUserId: "auth-martin" }),
      ],
      memberships: [],
      canonicalLinks: [link],
      scope,
    });
    expect(unavailable.rows[0]).toMatchObject({
      nexusUserId: "nuser_5035cfcbd29a751e382fdf02f785d11f",
      identityProjection: "local_link",
      directoryStatus: "ABSENT",
      moduleEntryAllowed: false,
    });
  });

  it("stays out of punch, GPS, session, and Nexus mapping files", () => {
    const route = readFileSync(
      join(root, "src/app/api/admin/utilisateurs/directory/route.ts"),
      "utf8"
    );
    expect(route).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    const forbiddenImports = [
      "employee-punch",
      "gps",
      "nexus-identity-mapping",
      "nexus-brokered-session",
      "nexus-mapping-postgrest",
      "horora-nexus-session",
    ];
    for (const token of forbiddenImports) {
      expect(route).not.toContain(token);
    }
    const untouched = [
      "src/app/lib/auth/permissions.ts",
      "src/app/lib/auth/nexus-identity-mapping.server.ts",
      "src/app/lib/auth/nexus-brokered-session.ts",
      "src/app/lib/employee-punch-session.client.ts",
      "src/app/lib/employee-punch-geolocation.client.ts",
    ];
    for (const file of untouched) {
      expect(readFileSync(join(root, file), "utf8")).not.toContain(
        "horora-authorized-module-directory"
      );
    }
    const projection = readFileSync(
      join(root, "src/app/lib/auth/horora-authorized-module-directory.shared.ts"),
      "utf8"
    );
    expect(projection).not.toContain("horora_nexus_sessions");
    expect(projection).not.toContain("expiresAt");
  });

  it("shows isolated QA statuses without treating a missing directory row as revoked", () => {
    const { scope, view } = buildIsolatedDirectoryPanelFixture();
    expect(scope.moduleKey).toBe("tagora_time");
    expect(scope.tenantId).toBe("tenant_local_fixture");
    expect(view.directoryConnected).toBe(false);
    expect(view.blocker).toContain("n'est pas une révocation");
    const byStatus = Object.fromEntries(
      view.rows.map((row) => [row.directoryStatus, row.nexusUserId])
    );
    const active = view.rows.find((row) => row.directoryStatus === "ACTIVE");
    expect(active?.nexusUserId).toBe("nuser_local_panel_active");
    expect(active?.membershipRole).toBe("employe");
    expect(byStatus.ACTIVE).toBe("nuser_local_panel_active");
    expect(byStatus.PENDING).toBe("nuser_local_panel_pending");
    expect(byStatus.SUSPENDED).toBe("nuser_local_panel_suspended");
    expect(byStatus.REVOKED).toBe("nuser_local_panel_revoked");
    const absent = view.rows.find((row) => row.directoryStatus === "ABSENT");
    expect(absent?.nexusUserId).toBeNull();
    expect(absent?.revocationEnforced).toBe(false);
    expect(absent?.sections.find((section) => section.id === "finance")?.checked).toBe(false);
    expect(pageDirectoryRows(view.rows, 2, 2)).toMatchObject({
      page: 2,
      pageCount: 3,
      rows: expect.any(Array),
    });
    expect(pageDirectoryRows(view.rows, 2, 2).rows).toHaveLength(2);
  });
});

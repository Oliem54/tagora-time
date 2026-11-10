/**
 * Local preparation for Nexus AuthorizedModuleDirectory → HORORA admin directory.
 * Read model only. It does not write dossiers, memberships, permissions, punch,
 * GPS, sessions, or Nexus identity maps.
 */

import { ADMIN_FINANCE_PERMISSION } from "@/app/lib/auth/admin-finance";
import {
  EMPLOYEE_ROLE_BASELINE_PERMISSIONS,
  HORODATEUR_PAYROLL_MANAGE_PERMISSION,
  HORODATEUR_PAYROLL_READ_PERMISSION,
  normalizePermissionList,
  type AppPermission,
} from "@/app/lib/auth/permissions";
import { mapOrganizationMembershipRoleToAppRole } from "@/app/lib/auth/organization-role-mapping.shared";
import type { AppRole } from "@/app/lib/auth/roles";
import { HORORA_LOCAL_FIXTURE_ORGANIZATION_ID } from "@/app/lib/auth/horora-local-nexus-fixture";
import type { OrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";

export const HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY = "tagora_time" as const;

/** Held until a separate GO certifies Nexus introspection. */
export const HORORA_DIRECTORY_REVOCATION_ENFORCED_ON_EXISTING_USERS = false as const;

export const HORORA_DIRECTORY_REFRESH_MS = 30_000 as const;

const CANONICAL_NEXUS_USER_ID = /^nuser_[A-Za-z0-9_]+$/;

export function isCanonicalNexusUserId(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const id = value.trim();
  if (id.includes("@") || id.includes(" ")) return false;
  return CANONICAL_NEXUS_USER_ID.test(id);
}

export const HORORA_AUTHORIZED_DIRECTORY_BLOCKER =
  "HORORA ne lit pas AuthorizedModuleDirectory. Les dossiers employés déjà présents s'affichent sans première connexion HORORA. Un utilisateur seulement autorisé dans Nexus reste invisible tant qu'une lecture seule UserModuleAccess tagora_time n'est pas branchée. L'absence de cette lecture n'est pas une révocation." as const;

export const HORORA_DIRECTORY_ACCESS_STATUSES = [
  "ACTIVE",
  "PENDING",
  "SUSPENDED",
  "REVOKED",
  "ABSENT",
] as const;

export type HororaDirectoryAccessStatus =
  (typeof HORORA_DIRECTORY_ACCESS_STATUSES)[number];

export type AuthorizedModuleDirectoryEntry = {
  userId: string;
  displayName: string;
  contactEmail: string | null;
  technicalKey: string;
  status: Exclude<HororaDirectoryAccessStatus, "ABSENT">;
  organizationId: string | null;
  nexusRoleKey: string | null;
};

export type AuthorizedModuleDirectory = {
  technicalKey: typeof HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY;
  /** Live Nexus feed. A local preparation screen keeps this false. */
  connected: boolean;
  entries: readonly AuthorizedModuleDirectoryEntry[];
};

export type HororaCanonicalIdentityLink = {
  nexusUserId: string;
  authUserId: string;
  organizationId: string;
  disabledAt?: string | null;
};

export type HororaDirectoryScope = {
  tenantId: string;
  organizationId: string;
  moduleKey: typeof HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY;
};

export type HororaPreservedEmployeeDossier = {
  dossierId: number;
  displayName: string;
  contactEmail: string | null;
  active: boolean;
  authUserId: string | null;
};

export type HororaPreservedMembership = {
  membershipId: string;
  authUserId: string;
  role: OrganizationMembershipRole;
  status: "active" | "suspended" | "invited";
};

export const HORORA_PERMISSION_SECTION_IDS = [
  "pointage",
  "documents",
  "dossiers",
  "livraisons",
  "ressources",
  "commissions",
  "finance",
  "remuneration",
  "paie_lecture",
  "paie_gestion",
  "administration",
] as const;

export type HororaPermissionSectionId =
  (typeof HORORA_PERMISSION_SECTION_IDS)[number];

export const HORORA_SENSITIVE_PERMISSION_SECTION_IDS = [
  "finance",
  "remuneration",
  "paie_lecture",
  "paie_gestion",
  "commissions",
  "administration",
] as const satisfies readonly HororaPermissionSectionId[];

export type HororaPermissionSectionSource =
  | "validated_explicit"
  | "validated_employee_baseline"
  | "validated_horora_admin_role"
  | "off";

export type HororaPermissionSectionState = {
  id: HororaPermissionSectionId;
  label: string;
  sensitive: boolean;
  checked: boolean;
  source: HororaPermissionSectionSource;
  /** A Nexus role never fills this checkbox. */
  grantedByNexusRole: false;
  /** This preparation screen does not persist the checkbox. */
  persistedByThisScreen: false;
};

export type HororaDirectoryUserRow = {
  key: string;
  displayName: string;
  contactEmail: string | null;
  visibleWithoutHororaLogin: true;
  dossierId: number | null;
  dossierPreserved: boolean;
  membershipId: string | null;
  membershipRole: OrganizationMembershipRole | null;
  membershipStatus: HororaPreservedMembership["status"] | null;
  membershipPreserved: boolean;
  membershipAmbiguous: boolean;
  portalRole: AppRole | null;
  nexusUserId: string | null;
  nexusRoleKey: string | null;
  directoryStatus: HororaDirectoryAccessStatus;
  moduleEntryAllowed: boolean;
  revocationEnforced: false;
  revocationWiredToHandoff: false;
  sections: HororaPermissionSectionState[];
};

export type HororaAuthorizedDirectoryView = {
  directoryConnected: boolean;
  persisted: false;
  productionUnchanged: true;
  dossiersPreserved: true;
  membershipsPreserved: true;
  blocker: typeof HORORA_AUTHORIZED_DIRECTORY_BLOCKER | null;
  rows: HororaDirectoryUserRow[];
};

const SECTION_LABELS: Record<HororaPermissionSectionId, string> = {
  pointage: "Pointage",
  documents: "Documents",
  dossiers: "Dossiers",
  livraisons: "Livraisons",
  ressources: "Ressources",
  commissions: "Commissions",
  finance: "Finance",
  remuneration: "Rémunération",
  paie_lecture: "Paie — lecture",
  paie_gestion: "Paie — gestion",
  administration: "Administration",
};

const SENSITIVE = new Set<HororaPermissionSectionId>(
  HORORA_SENSITIVE_PERMISSION_SECTION_IDS
);

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length > 0 ? email : null;
}

function listed(permissions: readonly string[], value: string): boolean {
  return permissions.some((item) => item === value);
}

/**
 * Nexus entry and central roles do not grant finance, payroll, remuneration,
 * commissions, administration, or any other HORORA section.
 */
export function nexusRoleGrantsSensitiveAccess(
  nexusRoleKey: string | null | undefined
): false {
  void nexusRoleKey;
  return false;
}

export function evaluateHororaNexusAccessRevocation(
  status: HororaDirectoryAccessStatus
): {
  moduleEntryAllowed: boolean;
  reason:
    | "directory_active"
    | "directory_pending"
    | "directory_suspended"
    | "directory_revoked"
    | "absence_is_not_revocation";
  serverPrepared: true;
  wiredToHandoff: false;
  revocationEnforced: false;
  absenceProvesRevocation: false;
  absenceProvesActiveAccess: false;
  mutatesPunchSession: false;
  mutatesGps: false;
  mutatesNexusIdentityMap: false;
  mutatesMembership: false;
} {
  const held = {
    serverPrepared: true as const,
    wiredToHandoff: false as const,
    revocationEnforced: false as const,
    absenceProvesRevocation: false as const,
    absenceProvesActiveAccess: false as const,
    mutatesPunchSession: false as const,
    mutatesGps: false as const,
    mutatesNexusIdentityMap: false as const,
    mutatesMembership: false as const,
  };
  if (status === "ACTIVE") {
    return { moduleEntryAllowed: true, reason: "directory_active", ...held };
  }
  if (status === "ABSENT") {
    return {
      moduleEntryAllowed: false,
      reason: "absence_is_not_revocation",
      ...held,
    };
  }
  const reason =
    status === "PENDING"
      ? "directory_pending"
      : status === "SUSPENDED"
        ? "directory_suspended"
        : "directory_revoked";
  return { moduleEntryAllowed: false, reason, ...held };
}

function section(input: {
  id: HororaPermissionSectionId;
  checked: boolean;
  source: HororaPermissionSectionSource;
}): HororaPermissionSectionState {
  return {
    id: input.id,
    label: SECTION_LABELS[input.id],
    sensitive: SENSITIVE.has(input.id),
    checked: input.checked,
    source: input.checked ? input.source : "off",
    grantedByNexusRole: false,
    persistedByThisScreen: false,
  };
}

export function buildHororaPermissionSections(input: {
  portalRole: AppRole | null;
  validatedPermissions: readonly string[];
  nexusRoleKey?: string | null;
}): HororaPermissionSectionState[] {
  void input.nexusRoleKey;
  const explicit = normalizePermissionList([...input.validatedPermissions]);
  const admin = input.portalRole === "admin";
  const activeEmployee = input.portalRole === "employe";
  const pointageExplicit = listed(explicit, "terrain");
  const pointageBaseline =
    activeEmployee &&
    listed(EMPLOYEE_ROLE_BASELINE_PERMISSIONS, "terrain") &&
    !pointageExplicit;

  const moduleBox = (
    id: HororaPermissionSectionId,
    permission: AppPermission
  ): HororaPermissionSectionState => {
    if (listed(explicit, permission)) {
      return section({ id, checked: true, source: "validated_explicit" });
    }
    if (admin && permission !== ADMIN_FINANCE_PERMISSION) {
      return section({
        id,
        checked: true,
        source: "validated_horora_admin_role",
      });
    }
    return section({ id, checked: false, source: "off" });
  };

  // Live finance and remuneration gates follow the HORORA admin membership,
  // not a stored permission string and not a Nexus role. The boxes stay distinct.
  const financeOn = admin;
  const directionPayrollRead =
    input.portalRole === "direction" &&
    (listed(explicit, HORODATEUR_PAYROLL_READ_PERMISSION) ||
      listed(explicit, HORODATEUR_PAYROLL_MANAGE_PERMISSION));
  const directionPayrollManage =
    input.portalRole === "direction" &&
    listed(explicit, HORODATEUR_PAYROLL_MANAGE_PERMISSION);

  return [
    section({
      id: "pointage",
      checked: pointageExplicit || pointageBaseline,
      source: pointageExplicit
        ? "validated_explicit"
        : "validated_employee_baseline",
    }),
    moduleBox("documents", "documents"),
    moduleBox("dossiers", "dossiers"),
    moduleBox("livraisons", "livraisons"),
    moduleBox("ressources", "ressources"),
    moduleBox("commissions", "commissions"),
    section({
      id: "finance",
      checked: financeOn,
      source: "validated_horora_admin_role",
    }),
    section({
      id: "remuneration",
      checked: financeOn,
      source: "validated_horora_admin_role",
    }),
    section({
      id: "paie_lecture",
      checked: admin || directionPayrollRead,
      source: admin ? "validated_horora_admin_role" : "validated_explicit",
    }),
    section({
      id: "paie_gestion",
      checked: admin || directionPayrollManage,
      source: admin ? "validated_horora_admin_role" : "validated_explicit",
    }),
    section({
      id: "administration",
      checked: admin,
      source: "validated_horora_admin_role",
    }),
  ];
}

function selectMembership(
  memberships: readonly HororaPreservedMembership[]
): {
  chosen: HororaPreservedMembership | null;
  ambiguous: boolean;
} {
  const active = memberships.filter((row) => row.status === "active");
  const pool = active.length > 0 ? active : memberships;
  if (pool.length === 0) return { chosen: null, ambiguous: false };
  if (pool.length > 1) return { chosen: null, ambiguous: true };
  return { chosen: pool[0], ambiguous: false };
}

function directoryEntryAllowed(status: HororaDirectoryAccessStatus): boolean {
  const decision = evaluateHororaNexusAccessRevocation(status);
  if (decision.reason === "absence_is_not_revocation") return false;
  return decision.moduleEntryAllowed;
}

function dossierForCanonicalLink(
  entry: AuthorizedModuleDirectoryEntry,
  dossiers: readonly HororaPreservedEmployeeDossier[],
  links: readonly HororaCanonicalIdentityLink[],
  scope: HororaDirectoryScope | null
): HororaPreservedEmployeeDossier | null {
  if (!isCanonicalNexusUserId(entry.userId)) return null;
  if (scope && entry.organizationId !== scope.organizationId) return null;
  const matches = links.filter(
    (link) =>
      link.nexusUserId === entry.userId &&
      isCanonicalNexusUserId(link.nexusUserId) &&
      !link.disabledAt &&
      (!scope || link.organizationId === scope.organizationId)
  );
  if (matches.length !== 1) return null;
  const linked = dossiers.filter((row) => row.authUserId === matches[0].authUserId);
  return linked.length === 1 ? linked[0] : null;
}

export function adaptAuthorizedModuleDirectory(input: {
  directory: AuthorizedModuleDirectory | null;
  dossiers: readonly HororaPreservedEmployeeDossier[];
  memberships: readonly HororaPreservedMembership[];
  validatedPermissionsByAuthUserId?: Readonly<Record<string, readonly string[]>>;
  canonicalLinks?: readonly HororaCanonicalIdentityLink[];
  scope?: HororaDirectoryScope | null;
}): HororaAuthorizedDirectoryView {
  const dossiers = input.dossiers.map((row) => ({ ...row }));
  const memberships = input.memberships.map((row) => ({ ...row }));
  const permissionsByUser = input.validatedPermissionsByAuthUserId ?? {};
  const links = input.canonicalLinks ?? [];
  const scope = input.scope ?? null;
  const connected = input.directory?.connected === true;
  const acceptedEntries = (input.directory?.entries ?? []).filter((entry) => {
    if (entry.technicalKey !== HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY) return false;
    if (!isCanonicalNexusUserId(entry.userId)) return false;
    if (scope && scope.moduleKey !== HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY) {
      return false;
    }
    if (scope && entry.organizationId !== scope.organizationId) return false;
    return true;
  });

  const consumedDossierIds = new Set<number>();
  const rows: HororaDirectoryUserRow[] = [];

  for (const entry of acceptedEntries) {
    const dossier = dossierForCanonicalLink(entry, dossiers, links, scope);
    if (dossier) consumedDossierIds.add(dossier.dossierId);
    const email = normalizeEmail(entry.contactEmail);
    rows.push(
      buildRow({
        dossier,
        memberships,
        permissionsByUser,
        nexusUserId: entry.userId,
        nexusRoleKey: entry.nexusRoleKey,
        directoryStatus: entry.status,
        displayName:
          entry.displayName.trim() || dossier?.displayName || "Utilisateur Nexus",
        contactEmail: email ?? normalizeEmail(dossier?.contactEmail),
      })
    );
  }

  for (const dossier of dossiers) {
    if (consumedDossierIds.has(dossier.dossierId)) continue;
    rows.push(
      buildRow({
        dossier,
        memberships,
        permissionsByUser,
        nexusUserId: null,
        nexusRoleKey: null,
        directoryStatus: "ABSENT",
        displayName: dossier.displayName,
        contactEmail: normalizeEmail(dossier.contactEmail),
      })
    );
  }

  rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));

  return {
    directoryConnected: connected,
    persisted: false,
    productionUnchanged: true,
    dossiersPreserved: true,
    membershipsPreserved: true,
    blocker: connected ? null : HORORA_AUTHORIZED_DIRECTORY_BLOCKER,
    rows,
  };
}

export const HORORA_DIRECTORY_PAGE_SIZE = 20 as const;

export function pageDirectoryRows<T>(
  rows: readonly T[],
  page: number,
  pageSize: number = HORORA_DIRECTORY_PAGE_SIZE
): {
  page: number;
  pageCount: number;
  rows: T[];
} {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageCount,
    rows: rows.slice(start, start + pageSize),
  };
}

const LOCAL_PANEL_SCOPE: HororaDirectoryScope = {
  tenantId: "tenant_local_fixture",
  organizationId: "org_local_fixture",
  moduleKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
};

export function buildIsolatedDirectoryPanelFixture(): {
  scope: HororaDirectoryScope;
  view: HororaAuthorizedDirectoryView;
} {
  const view = adaptAuthorizedModuleDirectory({
    directory: {
      technicalKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
      connected: false,
      entries: [
        entryFixture("nuser_local_panel_active", "ACTIVE", "employe"),
        entryFixture("nuser_local_panel_pending", "PENDING", "employe"),
        entryFixture("nuser_local_panel_suspended", "SUSPENDED", "employe"),
        entryFixture("nuser_local_panel_revoked", "REVOKED", "employe"),
      ],
    },
    dossiers: [
      {
        dossierId: 900001,
        displayName: "Dossier local sans annuaire",
        contactEmail: "dossier.local@example.test",
        active: true,
        authUserId: "00000000-0000-4000-8000-0000000000a9",
      },
    ],
    memberships: [
      {
        membershipId: "00000000-0000-4000-8000-0000000000aa",
        authUserId: "00000000-0000-4000-8000-0000000000a9",
        role: "employe",
        status: "active",
      },
    ],
    scope: {
      ...LOCAL_PANEL_SCOPE,
      organizationId: HORORA_LOCAL_FIXTURE_ORGANIZATION_ID,
    },
  });
  return {
    scope: {
      ...LOCAL_PANEL_SCOPE,
      organizationId: HORORA_LOCAL_FIXTURE_ORGANIZATION_ID,
    },
    view: { ...view, directoryConnected: false, blocker: HORORA_AUTHORIZED_DIRECTORY_BLOCKER },
  };
}

function entryFixture(
  userId: string,
  status: Exclude<HororaDirectoryAccessStatus, "ABSENT">,
  nexusRoleKey: string
): AuthorizedModuleDirectoryEntry {
  return {
    userId,
    displayName: userId,
    contactEmail: null,
    technicalKey: HORORA_AUTHORIZED_DIRECTORY_TECHNICAL_KEY,
    status,
    organizationId: HORORA_LOCAL_FIXTURE_ORGANIZATION_ID,
    nexusRoleKey,
  };
}

function buildRow(input: {
  dossier: HororaPreservedEmployeeDossier | null;
  memberships: readonly HororaPreservedMembership[];
  permissionsByUser: Readonly<Record<string, readonly string[]>>;
  nexusUserId: string | null;
  nexusRoleKey: string | null;
  directoryStatus: HororaDirectoryAccessStatus;
  displayName: string;
  contactEmail: string | null;
}): HororaDirectoryUserRow {
  const related = input.dossier?.authUserId
    ? input.memberships.filter(
        (row) => row.authUserId === input.dossier?.authUserId
      )
    : [];
  const selected = selectMembership(related);
  const portalRole = selected.ambiguous
    ? null
    : mapOrganizationMembershipRoleToAppRole(selected.chosen?.role);
  const validated =
    input.dossier?.authUserId && !selected.ambiguous
      ? (input.permissionsByUser[input.dossier.authUserId] ?? [])
      : [];
  const revocation = evaluateHororaNexusAccessRevocation(input.directoryStatus);

  return {
    key: input.dossier
      ? `dossier:${input.dossier.dossierId}`
      : `nexus:${input.nexusUserId}`,
    displayName: input.displayName,
    contactEmail: input.contactEmail,
    visibleWithoutHororaLogin: true,
    dossierId: input.dossier?.dossierId ?? null,
    dossierPreserved: true,
    membershipId: selected.chosen?.membershipId ?? null,
    membershipRole: selected.chosen?.role ?? null,
    membershipStatus: selected.chosen?.status ?? null,
    membershipPreserved: true,
    membershipAmbiguous: selected.ambiguous,
    portalRole,
    nexusUserId: input.nexusUserId,
    nexusRoleKey: input.nexusRoleKey,
    directoryStatus: input.directoryStatus,
    moduleEntryAllowed:
      input.directoryStatus === "ABSENT"
        ? false
        : directoryEntryAllowed(input.directoryStatus) &&
          revocation.reason !== "absence_is_not_revocation",
    revocationEnforced: false,
    revocationWiredToHandoff: false,
    sections: buildHororaPermissionSections({
      portalRole,
      validatedPermissions: validated,
      nexusRoleKey: input.nexusRoleKey,
    }),
  };
}

import { buildIsolatedDirectoryPanelFixture } from "@/app/lib/auth/horora-authorized-module-directory.shared";
import { decideHororaManagerPerimeter } from "@/app/lib/auth/horora-manager-perimeter.shared";
import {
  actorCanEditLocalPresetRoles,
  describeHororaRoleRightsTransition,
  formatHororaRoleAuditActivity,
  formatHororaRoleRightList,
} from "@/app/lib/auth/horora-premium-user-central.shared";
import {
  isHororaSyntheticPreviewProjectEligible,
  type HororaSyntheticPreviewInput,
} from "@/app/lib/auth/horora-synthetic-preview-project.shared";

export const HORORA_PREMIUM_2027_DEMO_PATH = "/qa/premium-2027" as const;

export const HORORA_PREMIUM_2027_DEMO_NOTICE =
  "Démonstration Premium 2027. Données fictives. Aucune session HORORA ou Nexus. Aucune écriture." as const;

const DEMO_ORGANIZATION = "00000000-0000-4000-8000-0000000000a2";
const OTHER_ORGANIZATION = "00000000-0000-4000-8000-0000000000c9";
const ASSIGNED_DEPARTMENT = "livraison";
const OTHER_DEPARTMENT = "comptabilite";
const OWN_DOSSIER = 900002;
const OTHER_DOSSIER = 900001;

export function isHororaPremium2027SyntheticDemoEnabled(
  input: HororaSyntheticPreviewInput
): boolean {
  return isHororaSyntheticPreviewProjectEligible(input);
}

export function readHororaPremium2027SyntheticDemoContext(
  env: NodeJS.ProcessEnv = process.env,
  hostname?: string | null
): HororaSyntheticPreviewInput {
  return {
    vercelProjectId: env.VERCEL_PROJECT_ID,
    vercelEnv: env.VERCEL_ENV,
    hostname: hostname ?? null,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? null,
    serviceRoleKeyPresent: Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  };
}

function refusedWrite(reason: string) {
  return {
    persisted: false as const,
    writes: 0 as const,
    roleAfterRefusal: "employe" as const,
    reason,
  };
}

export function buildHororaPremium2027SyntheticDemo() {
  const directory = buildIsolatedDirectoryPanelFixture();
  const activeEmployee = directory.view.rows.find(
    (row) => row.contactEmail === "employe.autorise@example.test"
  );
  const revoked = directory.view.rows.find((row) => row.directoryStatus === "REVOKED");
  const suspended = directory.view.rows.find((row) => row.directoryStatus === "SUSPENDED");
  const forward = describeHororaRoleRightsTransition({
    currentRole: "employe",
    nextRole: "direction",
  });
  const rollback = describeHororaRoleRightsTransition({
    currentRole: "direction",
    nextRole: "employe",
  });
  const directionInside = decideHororaManagerPerimeter({
    actorRole: "direction",
    actorOrganizationId: DEMO_ORGANIZATION,
    actorDepartmentKeys: [ASSIGNED_DEPARTMENT],
    targetOrganizationId: DEMO_ORGANIZATION,
    targetDepartmentKey: ASSIGNED_DEPARTMENT,
    action: "approve_time",
  });
  const directionOutside = decideHororaManagerPerimeter({
    actorRole: "direction",
    actorOrganizationId: DEMO_ORGANIZATION,
    actorDepartmentKeys: [ASSIGNED_DEPARTMENT],
    targetOrganizationId: DEMO_ORGANIZATION,
    targetDepartmentKey: OTHER_DEPARTMENT,
    action: "correct_time",
  });
  const crossOrganization = decideHororaManagerPerimeter({
    actorRole: "organization_owner",
    actorOrganizationId: DEMO_ORGANIZATION,
    targetOrganizationId: OTHER_ORGANIZATION,
    targetDepartmentKey: ASSIGNED_DEPARTMENT,
    action: "view_team",
  });

  return {
    notice: HORORA_PREMIUM_2027_DEMO_NOTICE,
    session: null,
    supabaseCalled: false as const,
    persisted: false as const,
    owner: {
      title: "Propriétaire HORORA",
      canAdministerRoles: actorCanEditLocalPresetRoles("organization_owner"),
      directory: directory.view.rows.map((row) => ({
        name: row.displayName,
        email: row.contactEmail,
        dossierId: row.dossierId,
        role: row.membershipRole,
        status: row.directoryStatus,
        editor: row.moduleEntryAllowed && row.directoryStatus === "ACTIVE",
      })),
      rightsPreview: {
        gained: formatHororaRoleRightList(forward.gained),
        lost: formatHororaRoleRightList(forward.lost),
      },
      auditSimulation: formatHororaRoleAuditActivity([
        { oldRole: "employe", newRole: "direction" },
      ]),
      rollbackPreview: {
        gained: formatHororaRoleRightList(rollback.gained),
        lost: formatHororaRoleRightList(rollback.lost),
      },
      suspendedEditor: suspended?.moduleEntryAllowed === true,
      revokedEditor: revoked?.moduleEntryAllowed === true,
      writeAttempt: refusedWrite("La démonstration n'écrit aucun rôle."),
    },
    direction: {
      title: "Direction",
      dashboard: "Tableau de bord fictif — équipe Livraison",
      team: [activeEmployee?.displayName ?? "Employé local autorisé"],
      assignedDepartment: ASSIGNED_DEPARTMENT,
      approvalInsideDepartment: directionInside.allowed,
      correctionInsideDepartment: directionInside.allowed,
      outsideDepartment: directionOutside.allowed,
      outsideReason: directionOutside.reason,
      canAdministerRoles: actorCanEditLocalPresetRoles("direction"),
      writeAttempt: refusedWrite("La Direction fictive n'administre aucun rôle."),
    },
    employee: {
      title: "Employé",
      dashboard: "Tableau de bord personnel fictif",
      profile: activeEmployee?.displayName ?? "Employé local autorisé",
      dossierId: OWN_DOSSIER,
      punches: ["Arrivée fictive 08:00", "Départ fictif 16:30"],
      breaks: ["Pause fictive 12:00–12:30"],
      hours: "7 h 30 fictives",
      correctionRequest: "Demande de correction fictive, non envoyée",
      otherDossier: {
        dossierId: OTHER_DOSSIER,
        allowed: false,
        reason: "Accès bloqué. Permission requise.",
      },
      writeAttempt: refusedWrite("Le pointage fictif n'est pas enregistré."),
    },
    security: {
      crossOrganization: crossOrganization.allowed,
      crossOrganizationReason: crossOrganization.reason,
      inactiveMembership: {
        status: "inactive" as const,
        editor: false,
        writeAttempt: refusedWrite("Appartenance inactive. Aucun rôle n'a été modifié."),
      },
      revokedSession: {
        status: revoked?.directoryStatus ?? "REVOKED",
        editor: false,
        writeAttempt: refusedWrite("Session révoquée. Aucune écriture."),
      },
      writesAfterRefusal: 0 as const,
      roleAfterRefusal: activeEmployee?.membershipRole ?? "employe",
    },
  };
}

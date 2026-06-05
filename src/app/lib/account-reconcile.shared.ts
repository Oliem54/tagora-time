import type { AccountAccessRequestRecord } from "@/app/lib/account-access";
import { isAccessDisabledRequest } from "@/app/lib/account-access";
export const RECONCILE_EXISTING_ACCOUNT_CONFIRM_MESSAGE =
  "Cette action clôturera la demande comme active en la liant au compte portail déjà existant. Elle ne modifiera pas le rôle, les permissions, le téléphone, ni le statut RH de la fiche employé.";

export type AccountReconciliationDiagnostic = {
  canReconcile: boolean;
  requestStatus: string;
  employeeExists: boolean;
  employeeId: number | null;
  employeeProfileActive: boolean | null;
  scheduleActive: boolean | null;
  authLinkedOnProfile: boolean;
  authAccountExists: boolean;
  portalActive: boolean;
  portalAccessDisabled: boolean;
  requestPhone: string | null;
  profilePhone: string | null;
  phonesDivergent: boolean;
  currentRole: string | null;
  currentPermissions: string[];
  invitedUserIdOnRequest: string | null;
  authUserIdOnProfile: string | null;
  inconsistencies: string[];
};

function normalizePhone(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export function buildAccountReconciliationDiagnostic(
  request: AccountAccessRequestRecord
): AccountReconciliationDiagnostic {
  const link = request.employee_link;
  const existing = request.existing_account;
  const accessDisabled = isAccessDisabledRequest(request);
  const profilePhone = link?.profile_telephone ?? null;
  const requestPhone = request.phone ?? null;
  const phonesDivergent =
    Boolean(normalizePhone(profilePhone)) &&
    Boolean(normalizePhone(requestPhone)) &&
    normalizePhone(profilePhone) !== normalizePhone(requestPhone);

  const authUserIdOnProfile = link?.auth_user_id ?? null;
  const authAccountExists = Boolean(existing?.exists && existing.userId);
  const authLinkedOnProfile = Boolean(authUserIdOnProfile);
  const portalActive = authAccountExists && !accessDisabled && !existing?.accessDisabled;

  const inconsistencies: string[] = [];

  if (request.status === "pending" && authAccountExists) {
    inconsistencies.push("Demande en attente alors qu'un compte portail existe déjà.");
  }
  if (request.status === "pending" && link?.exists && !request.invited_user_id) {
    inconsistencies.push("Demande non liée (invited_user_id vide) malgré une fiche employé existante.");
  }
  if (authLinkedOnProfile && authAccountExists && authUserIdOnProfile !== existing?.userId) {
    inconsistencies.push("auth_user_id de la fiche et compte auth détecté par courriel diffèrent.");
  }
  if (link?.actif === false && portalActive) {
    inconsistencies.push("Fiche RH inactive alors que le portail reste actif.");
  }
  if (phonesDivergent) {
    inconsistencies.push("Téléphone de la demande différent du téléphone de la fiche employé.");
  }
  if (request.invited_user_id && existing?.userId && request.invited_user_id !== existing.userId) {
    inconsistencies.push("invited_user_id de la demande différent du compte auth actuel.");
  }

  const statusOk = request.status === "pending" || request.status === "error";
  const authIdsCompatible =
    !authUserIdOnProfile ||
    !existing?.userId ||
    authUserIdOnProfile === existing.userId;

  const canReconcile =
    statusOk &&
    Boolean(link?.id) &&
    authLinkedOnProfile &&
    authAccountExists &&
    authIdsCompatible;

  return {
    canReconcile,
    requestStatus: request.status,
    employeeExists: Boolean(link?.exists && link.id),
    employeeId: link?.id ?? null,
    employeeProfileActive: link?.actif ?? null,
    scheduleActive: link?.schedule_active ?? null,
    authLinkedOnProfile,
    authAccountExists,
    portalActive,
    portalAccessDisabled: Boolean(existing?.accessDisabled || accessDisabled),
    requestPhone,
    profilePhone,
    phonesDivergent,
    currentRole: existing?.role ?? null,
    currentPermissions: existing?.permissions ?? [],
    invitedUserIdOnRequest: request.invited_user_id ?? null,
    authUserIdOnProfile,
    inconsistencies,
  };
}

export function canReconcileExistingAccountRequest(request: AccountAccessRequestRecord) {
  return buildAccountReconciliationDiagnostic(request).canReconcile;
}

/** Cas visuellement incohérent : demande ouverte + fiche + auth détectés (badge « À réconcilier »). */
export function isReconciliationCandidate(request: AccountAccessRequestRecord) {
  const diagnostic = buildAccountReconciliationDiagnostic(request);
  const statusOk = request.status === "pending" || request.status === "error";
  return (
    statusOk &&
    diagnostic.employeeExists &&
    diagnostic.authLinkedOnProfile &&
    diagnostic.authAccountExists
  );
}

export function getReconcileUnavailableReasons(
  request: AccountAccessRequestRecord,
  options: { canManageRoles: boolean }
) {
  const diagnostic = buildAccountReconciliationDiagnostic(request);
  const reasons: string[] = [];

  if (diagnostic.canReconcile) {
    return reasons;
  }

  if (!options.canManageRoles) {
    reasons.push("Action réservée aux administrateurs.");
  }
  if (request.status !== "pending" && request.status !== "error") {
    reasons.push(
      `Statut « ${request.status} » : seules les demandes en attente ou en erreur peuvent être réconciliées.`
    );
  }
  if (!diagnostic.employeeExists) {
    reasons.push("Aucune fiche employé liée ou détectée pour cette demande.");
  }
  if (!diagnostic.authLinkedOnProfile) {
    reasons.push("La fiche employé n'a pas de compte portail lié (auth_user_id manquant).");
  }
  if (!diagnostic.authAccountExists) {
    reasons.push("Aucun compte portail détecté pour le courriel de la demande.");
  }
  if (
    diagnostic.authLinkedOnProfile &&
    diagnostic.authAccountExists &&
    diagnostic.authUserIdOnProfile &&
    request.existing_account?.userId &&
    diagnostic.authUserIdOnProfile !== request.existing_account.userId
  ) {
    reasons.push(
      "Conflit : auth_user_id de la fiche et compte portail détecté par courriel ne correspondent pas."
    );
  }

  return reasons;
}

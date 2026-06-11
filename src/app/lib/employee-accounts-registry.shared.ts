import type { AccountAccessStatus } from "@/app/lib/account-access";
import { resolveAccessDisabledFromAuditLog } from "@/app/lib/account-access";
import {
  normalizeEmail,
  readAccessDisabledFromAuthUser,
  type AccountRequestRow,
} from "@/app/lib/account-requests.shared";
import type { User } from "@supabase/supabase-js";

export type EmployeeAccountsRegistryTab =
  | "active"
  | "pending"
  | "archived"
  | "orphan"
  | "conflict";

export type EmployeeAccountsRegistryDiagnostic = {
  authUserWithoutChauffeur: boolean;
  chauffeurWithoutAuthUser: boolean;
  accountRequestStatus: AccountAccessStatus | null;
  accessDisabled: boolean;
  employeeProfileInactive: boolean;
  emailDivergent: boolean;
  phoneDivergent: boolean;
  futureMfaStatus: "unknown";
  inconsistencies: string[];
};

export type EmployeeAccountsRegistryEntry = {
  registryKey: string;
  displayName: string;
  email: string | null;
  derivedStatus: string;
  tabs: EmployeeAccountsRegistryTab[];
  chauffeurId: number | null;
  accountRequestId: string | null;
  authUserId: string | null;
  employeeProfileActive: boolean | null;
  authLinked: boolean;
  hasAccountRequest: boolean;
  accessDisabled: boolean;
  profilePhonePresent: boolean;
  conflictIndicators: string[];
  diagnostic: EmployeeAccountsRegistryDiagnostic;
};

export type ChauffeurRegistryRow = {
  id: number;
  nom: string | null;
  courriel: string | null;
  telephone: string | null;
  actif: boolean | null;
  auth_user_id: string | null;
};

function normalizePhone(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function readEmailDivergent(options: {
  requestEmail: string | null;
  profileEmail: string | null;
  authEmail: string | null;
}) {
  const values = [
    options.requestEmail ? normalizeEmail(options.requestEmail) : null,
    options.profileEmail ? normalizeEmail(options.profileEmail) : null,
    options.authEmail ? normalizeEmail(options.authEmail) : null,
  ].filter((value): value is string => Boolean(value));

  if (values.length < 2) {
    return false;
  }

  return new Set(values).size > 1;
}

function readPhoneDivergent(requestPhone: string | null, profilePhone: string | null) {
  const requestDigits = normalizePhone(requestPhone);
  const profileDigits = normalizePhone(profilePhone);

  return (
    Boolean(requestDigits) &&
    Boolean(profileDigits) &&
    requestDigits !== profileDigits
  );
}

function resolveAccessDisabled(options: {
  authUser: User | null | undefined;
  request: AccountRequestRow | null | undefined;
}) {
  if (options.authUser && readAccessDisabledFromAuthUser(options.authUser)) {
    return true;
  }

  if (options.request) {
    const auditState = resolveAccessDisabledFromAuditLog(options.request.audit_log);
    if (auditState === true) {
      return true;
    }
  }

  return false;
}

export function buildEmployeeAccountsRegistryDiagnostic(options: {
  chauffeur: ChauffeurRegistryRow | null;
  authUser: User | null;
  accountRequest: AccountRequestRow | null;
  authUserFoundForProfile: boolean;
}): EmployeeAccountsRegistryDiagnostic {
  const { chauffeur, authUser, accountRequest, authUserFoundForProfile } = options;
  const requestPhone = accountRequest?.phone ?? null;
  const profilePhone = chauffeur?.telephone ?? null;
  const phonesDivergent = readPhoneDivergent(requestPhone, profilePhone);
  const emailDivergent = readEmailDivergent({
    requestEmail: accountRequest?.email ?? null,
    profileEmail: chauffeur?.courriel ?? null,
    authEmail: authUser?.email ?? null,
  });

  const authUserIdOnProfile = chauffeur?.auth_user_id?.trim() || null;
  const authAccountExists = Boolean(authUser?.id);
  const authLinkedOnProfile = Boolean(authUserIdOnProfile);
  const accessDisabled = resolveAccessDisabled({ authUser, request: accountRequest });

  const authUserWithoutChauffeur =
    authAccountExists &&
    !chauffeur?.id &&
    !Number(
      authUser?.app_metadata?.chauffeur_id ?? authUser?.user_metadata?.chauffeur_id ?? NaN
    );

  const chauffeurWithoutAuthUser =
    Boolean(chauffeur?.id) &&
    (!authUserIdOnProfile || !authUserFoundForProfile);

  const inconsistencies: string[] = [];

  if (accountRequest?.status === "pending" && authAccountExists) {
    inconsistencies.push("Demande en attente alors qu'un compte portail existe déjà.");
  }
  if (
    accountRequest?.status === "pending" &&
    chauffeur?.id &&
    !accountRequest.invited_user_id
  ) {
    inconsistencies.push(
      "Demande non liée (invited_user_id vide) malgré une fiche employé existante."
    );
  }
  if (
    authLinkedOnProfile &&
    authAccountExists &&
    authUserIdOnProfile &&
    authUser?.id &&
    authUserIdOnProfile !== authUser.id
  ) {
    inconsistencies.push(
      "auth_user_id de la fiche et compte auth détecté par courriel diffèrent."
    );
  }
  if (chauffeur?.actif === false && authAccountExists && !accessDisabled) {
    inconsistencies.push("Fiche RH inactive alors que le portail reste actif.");
  }
  if (phonesDivergent) {
    inconsistencies.push("Téléphone de la demande différent du téléphone de la fiche employé.");
  }
  if (emailDivergent) {
    inconsistencies.push("Courriel divergent entre demande, fiche employé et/ou compte auth.");
  }
  if (
    accountRequest?.invited_user_id &&
    authUser?.id &&
    accountRequest.invited_user_id !== authUser.id
  ) {
    inconsistencies.push("invited_user_id de la demande différent du compte auth actuel.");
  }
  if (authUserWithoutChauffeur) {
    inconsistencies.push("Compte auth sans fiche employé liée.");
  }
  if (chauffeurWithoutAuthUser) {
    inconsistencies.push("Fiche employé sans compte auth lié (ou auth introuvable).");
  }

  return {
    authUserWithoutChauffeur,
    chauffeurWithoutAuthUser,
    accountRequestStatus: (accountRequest?.status as AccountAccessStatus | undefined) ?? null,
    accessDisabled,
    employeeProfileInactive: chauffeur?.actif === false,
    emailDivergent,
    phoneDivergent: phonesDivergent,
    futureMfaStatus: "unknown",
    inconsistencies,
  };
}

export function deriveRegistryTabs(
  diagnostic: EmployeeAccountsRegistryDiagnostic,
  options: {
    authLinked: boolean;
    hasAccountRequest: boolean;
  }
): EmployeeAccountsRegistryTab[] {
  const tabs: EmployeeAccountsRegistryTab[] = [];

  if (diagnostic.inconsistencies.length > 0) {
    tabs.push("conflict");
  }

  if (diagnostic.authUserWithoutChauffeur || diagnostic.chauffeurWithoutAuthUser) {
    tabs.push("orphan");
  }

  if (diagnostic.accessDisabled) {
    tabs.push("archived");
  }

  const pendingStatuses = new Set<AccountAccessStatus>(["pending", "invited", "error"]);
  if (
    diagnostic.accountRequestStatus &&
    pendingStatuses.has(diagnostic.accountRequestStatus) &&
    !diagnostic.accessDisabled
  ) {
    tabs.push("pending");
  }

  if (
    options.authLinked &&
    !diagnostic.accessDisabled &&
    (diagnostic.accountRequestStatus === "active" ||
      diagnostic.accountRequestStatus === "invited" ||
      (!options.hasAccountRequest && options.authLinked))
  ) {
    if (diagnostic.accountRequestStatus !== "pending" && diagnostic.accountRequestStatus !== "error") {
      tabs.push("active");
    }
  }

  if (tabs.length === 0) {
    tabs.push("orphan");
  }

  return Array.from(new Set(tabs));
}

export function deriveRegistryStatusLabel(
  diagnostic: EmployeeAccountsRegistryDiagnostic
): string {
  if (diagnostic.accessDisabled) {
    return "Accès désactivé";
  }
  if (diagnostic.authUserWithoutChauffeur) {
    return "Orphelin auth";
  }
  if (diagnostic.chauffeurWithoutAuthUser) {
    return "Orphelin fiche";
  }
  if (diagnostic.inconsistencies.length > 0) {
    return "Conflit";
  }
  if (diagnostic.accountRequestStatus === "pending") return "En attente";
  if (diagnostic.accountRequestStatus === "invited") return "Invité";
  if (diagnostic.accountRequestStatus === "error") return "Erreur";
  if (diagnostic.accountRequestStatus === "refused") return "Refusé";
  if (diagnostic.accountRequestStatus === "active") return "Actif";
  if (diagnostic.employeeProfileInactive) return "Fiche RH inactive";
  return "À classer";
}

export function matchesRegistryTab(
  entry: EmployeeAccountsRegistryEntry,
  tab: EmployeeAccountsRegistryTab
) {
  return entry.tabs.includes(tab);
}

export function buildRegistryEntryFromParts(options: {
  registryKey: string;
  displayName: string;
  email: string | null;
  chauffeur: ChauffeurRegistryRow | null;
  authUser: User | null;
  accountRequest: AccountRequestRow | null;
  authUserFoundForProfile: boolean;
}): EmployeeAccountsRegistryEntry {
  const diagnostic = buildEmployeeAccountsRegistryDiagnostic({
    chauffeur: options.chauffeur,
    authUser: options.authUser,
    accountRequest: options.accountRequest,
    authUserFoundForProfile: options.authUserFoundForProfile,
  });

  const authUserId =
    options.authUser?.id ?? options.chauffeur?.auth_user_id?.trim() ?? null;
  const authLinked = Boolean(
    authUserId &&
      options.authUser?.id &&
      (options.chauffeur?.auth_user_id
        ? options.chauffeur.auth_user_id === options.authUser.id
        : true)
  );

  const hasAccountRequest = Boolean(options.accountRequest?.id);
  const tabs = deriveRegistryTabs(diagnostic, {
    authLinked,
    hasAccountRequest,
  });

  return {
    registryKey: options.registryKey,
    displayName: options.displayName,
    email: options.email,
    derivedStatus: deriveRegistryStatusLabel(diagnostic),
    tabs,
    chauffeurId: options.chauffeur?.id ?? null,
    accountRequestId: options.accountRequest?.id ?? null,
    authUserId,
    employeeProfileActive: options.chauffeur?.actif ?? null,
    authLinked,
    hasAccountRequest,
    accessDisabled: diagnostic.accessDisabled,
    profilePhonePresent: Boolean(normalizePhone(options.chauffeur?.telephone)),
    conflictIndicators: diagnostic.inconsistencies,
    diagnostic,
  };
}

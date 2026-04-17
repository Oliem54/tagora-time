import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  ACCOUNT_REVIEW_LOCK_WINDOW_MS,
  appendAuditEntry,
  buildCompanyAccessFlags,
  buildExistingAccountSnapshot,
  createAuditEntry,
  getCompanyDirectoryContext,
  getReviewLockMetadata,
  hasUserActivatedAccess,
  normalizeCompany,
  normalizeEmail,
  normalizePermissions,
  type AccountRequestRow,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import {
  getAccountRequestsRequestDebug,
  getStrictDirectionRequestUser,
} from "@/app/lib/account-requests.server";
import {
  buildRequiredPasswordMetadata,
  hasPasswordChangeRequired,
} from "@/app/lib/auth/passwords";
import { getUserPermissions } from "@/app/lib/auth/permissions";
import { getUserRole, type AppRole } from "@/app/lib/auth/roles";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type AccountRequestAction =
  | "approve"
  | "refuse"
  | "update_access"
  | "save_employee_profile"
  | "reset_pending"
  | "resend_invitation"
  | "disable_access"
  | "retry";

function parseAction(value: unknown): AccountRequestAction | null {
  if (
    value === "approve" ||
    value === "refuse" ||
    value === "update_access" ||
    value === "save_employee_profile" ||
    value === "reset_pending" ||
    value === "resend_invitation" ||
    value === "disable_access" ||
    value === "retry"
  ) {
    return value;
  }

  return null;
}

function getRequestedRole(value: unknown): AppRole | null {
  return value === "direction" || value === "employe" ? value : null;
}

type EmployeeProfileInput = {
  id?: unknown;
  nom?: unknown;
  courriel?: unknown;
  telephone?: unknown;
  actif?: unknown;
  notes?: unknown;
  primary_company?: unknown;
  taux_base_titan?: unknown;
  social_benefits_percent?: unknown;
  titan_billable?: unknown;
  schedule_start?: unknown;
  schedule_end?: unknown;
  scheduled_work_days?: unknown;
  planned_daily_hours?: unknown;
  planned_weekly_hours?: unknown;
  pause_minutes?: unknown;
  expected_breaks_count?: unknown;
  break_1_label?: unknown;
  break_1_minutes?: unknown;
  break_1_paid?: unknown;
  break_2_label?: unknown;
  break_2_minutes?: unknown;
  break_2_paid?: unknown;
  break_3_label?: unknown;
  break_3_minutes?: unknown;
  break_3_paid?: unknown;
  break_am_enabled?: unknown;
  break_am_time?: unknown;
  break_am_minutes?: unknown;
  break_am_paid?: unknown;
  lunch_enabled?: unknown;
  lunch_time?: unknown;
  lunch_minutes?: unknown;
  lunch_paid?: unknown;
  break_pm_enabled?: unknown;
  break_pm_time?: unknown;
  break_pm_minutes?: unknown;
  break_pm_paid?: unknown;
  sms_alert_depart_terrain?: unknown;
  sms_alert_arrivee_terrain?: unknown;
  sms_alert_sortie?: unknown;
  sms_alert_retour?: unknown;
  sms_alert_pause_debut?: unknown;
  sms_alert_pause_fin?: unknown;
  sms_alert_dinner_debut?: unknown;
  sms_alert_dinner_fin?: unknown;
  sms_alert_quart_debut?: unknown;
  sms_alert_quart_fin?: unknown;
};

type ChauffeurRow = {
  id: number;
  auth_user_id: string | null;
  nom: string | null;
  courriel: string | null;
  telephone: string | null;
  actif: boolean | null;
  notes: string | null;
  primary_company: AccountRequestCompany | null;
  can_work_for_oliem_solutions: boolean | null;
  can_work_for_titan_produits_industriels: boolean | null;
  taux_base_titan: number | null;
  social_benefits_percent: number | null;
  titan_billable: boolean | null;
  schedule_start: string | null;
  schedule_end: string | null;
  scheduled_work_days: string[] | null;
  planned_daily_hours: number | null;
  planned_weekly_hours: number | null;
  pause_minutes: number | null;
  expected_breaks_count: number | null;
  break_1_label: string | null;
  break_1_minutes: number | null;
  break_1_paid: boolean | null;
  break_2_label: string | null;
  break_2_minutes: number | null;
  break_2_paid: boolean | null;
  break_3_label: string | null;
  break_3_minutes: number | null;
  break_3_paid: boolean | null;
  break_am_enabled: boolean | null;
  break_am_time: string | null;
  break_am_minutes: number | null;
  break_am_paid: boolean | null;
  lunch_enabled: boolean | null;
  lunch_time: string | null;
  lunch_minutes: number | null;
  lunch_paid: boolean | null;
  break_pm_enabled: boolean | null;
  break_pm_time: string | null;
  break_pm_minutes: number | null;
  break_pm_paid: boolean | null;
  sms_alert_depart_terrain: boolean | null;
  sms_alert_arrivee_terrain: boolean | null;
  sms_alert_sortie: boolean | null;
  sms_alert_retour: boolean | null;
  sms_alert_pause_debut: boolean | null;
  sms_alert_pause_fin: boolean | null;
  sms_alert_dinner_debut: boolean | null;
  sms_alert_dinner_fin: boolean | null;
  sms_alert_quart_debut: boolean | null;
  sms_alert_quart_fin: boolean | null;
};

type ManagedRouteError = Error & {
  status?: number;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type EmployeeProfileResolution = {
  profile: ChauffeurRow | null;
  foundBy: "profile_id" | "auth_user_id" | "email" | "none";
  candidateProfileIds: number[];
  conflict:
    | {
        error: string;
        details: string;
        code: string;
        hint?: string | null;
      }
    | null;
};

const CHAUFFEURS_APPROVAL_SELECT =
  "id, auth_user_id, nom, courriel, telephone, actif, notes, primary_company";

function parseNullableString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function parseNullableNumber(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function createManagedRouteError(options: {
  status: number;
  error: string;
  details?: string | null;
  code?: string | null;
  hint?: string | null;
}) {
  const error = new Error(options.error) as ManagedRouteError;
  error.status = options.status;
  error.code = options.code ?? null;
  error.details = options.details ?? null;
  error.hint = options.hint ?? null;
  return error;
}

async function findAuthUserByEmail(email: string) {
  const supabase = createAdminSupabaseClient();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const matchedUser = data.users.find(
      (item) => item.email?.toLowerCase() === email
    );

    if (matchedUser) {
      return matchedUser;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function loadRequestRow(id: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("account_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<AccountRequestRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function updateRequestRow(id: string, values: Record<string, unknown>) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("account_requests")
    .update(values)
    .eq("id", id)
    .select("*")
    .single<AccountRequestRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function loadLinkedEmployeeProfile(options: {
  profileId?: number | null;
  authUserId?: string | null;
  email: string;
}): Promise<EmployeeProfileResolution> {
  const supabase = createAdminSupabaseClient();
  const normalizedEmail = normalizeEmail(options.email);

  let byProfileId: ChauffeurRow | null = null;
  let byAuthUserId: ChauffeurRow | null = null;
  let byEmail: ChauffeurRow[] = [];

  if (options.profileId) {
    const { data, error } = await supabase
      .from("chauffeurs")
      .select(CHAUFFEURS_APPROVAL_SELECT)
      .eq("id", options.profileId)
      .maybeSingle<ChauffeurRow>();

    if (error) {
      throw error;
    }

    byProfileId = data ?? null;
  }

  if (options.authUserId) {
    const { data, error } = await supabase
      .from("chauffeurs")
      .select(CHAUFFEURS_APPROVAL_SELECT)
      .eq("auth_user_id", options.authUserId)
      .maybeSingle<ChauffeurRow>();

    if (error) {
      throw error;
    }

    byAuthUserId = data ?? null;
  }

  const { data: emailMatches, error: emailError } = await supabase
    .from("chauffeurs")
    .select(CHAUFFEURS_APPROVAL_SELECT)
    .eq("courriel", normalizedEmail)
    .order("id", { ascending: true })
    .limit(10);

  if (emailError) {
    throw emailError;
  }

  byEmail = (emailMatches ?? []) as ChauffeurRow[];

  const candidateIds = Array.from(
    new Set(
      [byProfileId, byAuthUserId, ...byEmail]
        .filter((item): item is ChauffeurRow => Boolean(item?.id))
        .map((item) => item.id)
    )
  );

  if (
    byProfileId &&
    byAuthUserId &&
    byProfileId.id !== byAuthUserId.id
  ) {
    return {
      profile: byAuthUserId,
      foundBy: "auth_user_id",
      candidateProfileIds: candidateIds,
      conflict: {
        error: "Le compte existant est deja lie a une autre fiche employe.",
        details: `Le compte Auth ${options.authUserId} est lie a la fiche employe #${byAuthUserId.id}, mais la demande tente d utiliser la fiche #${byProfileId.id}.`,
        code: "employee_profile_auth_conflict",
        hint:
          "Reutilisez la fiche employe deja liee a ce compte ou corrigez le lien avant une nouvelle approbation.",
      },
    };
  }

  if (!byProfileId && !byAuthUserId && byEmail.length > 1) {
    return {
      profile: null,
      foundBy: "none",
      candidateProfileIds: candidateIds,
      conflict: {
        error: "Plusieurs fiches employe existent deja pour ce courriel.",
        details: `Courriel ${normalizedEmail} present sur les fiches employe #${candidateIds.join(", ")}.`,
        code: "employee_profile_email_conflict",
        hint:
          "Selectionnez la bonne fiche employe ou nettoyez les doublons avant d approuver la demande.",
      },
    };
  }

  if (byAuthUserId) {
    return {
      profile: byAuthUserId,
      foundBy: "auth_user_id",
      candidateProfileIds: candidateIds,
      conflict: null,
    };
  }

  if (byProfileId) {
    return {
      profile: byProfileId,
      foundBy: "profile_id",
      candidateProfileIds: candidateIds,
      conflict: null,
    };
  }

  if (byEmail.length === 1) {
    return {
      profile: byEmail[0],
      foundBy: "email",
      candidateProfileIds: candidateIds,
      conflict: null,
    };
  }

  return {
    profile: null,
    foundBy: "none",
    candidateProfileIds: candidateIds,
    conflict: null,
  };
}

async function upsertEmployeeProfile(options: {
  input: EmployeeProfileInput | null;
  requestRow: AccountRequestRow;
  authUserId?: string | null;
}) {
  const supabase = createAdminSupabaseClient();
  const normalizedInput = options.input ?? {};
  const profileResolution = await loadLinkedEmployeeProfile({
    profileId: parseNullableNumber(normalizedInput.id),
    authUserId: options.authUserId ?? null,
    email: String(normalizedInput.courriel ?? options.requestRow.email),
  });
  const linkedProfile = profileResolution.profile;

  if (profileResolution.conflict) {
    throw createManagedRouteError({
      status: 409,
      error: profileResolution.conflict.error,
      details: profileResolution.conflict.details,
      code: profileResolution.conflict.code,
      hint: profileResolution.conflict.hint ?? null,
    });
  }

  const primaryCompany =
    normalizeCompany(normalizedInput.primary_company) ??
    linkedProfile?.primary_company ??
    options.requestRow.company;
  const payload = {
    auth_user_id: options.authUserId ?? linkedProfile?.auth_user_id ?? null,
    nom:
      parseNullableString(normalizedInput.nom) ??
      linkedProfile?.nom ??
      options.requestRow.full_name,
    courriel:
      normalizeEmail(
        parseNullableString(normalizedInput.courriel) ?? options.requestRow.email
      ) || normalizeEmail(options.requestRow.email),
    telephone:
      parseNullableString(normalizedInput.telephone) ??
      linkedProfile?.telephone ??
      options.requestRow.phone,
    actif:
      typeof normalizedInput.actif === "boolean"
        ? normalizedInput.actif
        : linkedProfile?.actif ?? true,
    notes:
      parseNullableString(normalizedInput.notes) ?? linkedProfile?.notes ?? null,
    primary_company: primaryCompany,
  };

  if (linkedProfile?.id) {
    const { data, error } = await supabase
      .from("chauffeurs")
      .update(payload)
      .eq("id", linkedProfile.id)
      .select(CHAUFFEURS_APPROVAL_SELECT)
      .single<ChauffeurRow>();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await supabase
    .from("chauffeurs")
    .insert([payload])
    .select(CHAUFFEURS_APPROVAL_SELECT)
    .single<ChauffeurRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function syncUserChauffeurMetadata(options: {
  userId: string;
  chauffeurId: number;
}) {
  const supabase = createAdminSupabaseClient();
  const { data: existingLinkedProfile, error: existingLinkedProfileError } =
    await supabase
      .from("chauffeurs")
      .select("id")
      .eq("auth_user_id", options.userId)
      .maybeSingle<{ id: number }>();

  if (existingLinkedProfileError) {
    throw existingLinkedProfileError;
  }

  if (
    existingLinkedProfile?.id &&
    existingLinkedProfile.id !== options.chauffeurId
  ) {
    throw createManagedRouteError({
      status: 409,
      error: "Ce compte existant est deja lie a une autre fiche employe.",
      details: `Le compte utilisateur ${options.userId} est deja rattache a la fiche employe #${existingLinkedProfile.id} et ne peut pas etre relie a la fiche #${options.chauffeurId}.`,
      code: "employee_profile_auth_conflict",
      hint:
        "Utilisez la fiche employe deja liee a ce compte ou corrigez le lien existant avant de reapprouver.",
    });
  }

  await supabase
    .from("chauffeurs")
    .update({ auth_user_id: options.userId })
    .eq("id", options.chauffeurId);

  const { data, error } = await supabase.auth.admin.getUserById(options.userId);

  if (error || !data.user) {
    return;
  }

  await supabase.auth.admin.updateUserById(options.userId, {
    app_metadata: {
      ...data.user.app_metadata,
      chauffeur_id: options.chauffeurId,
    },
    user_metadata: {
      ...data.user.user_metadata,
      chauffeur_id: options.chauffeurId,
    },
  });
}

function buildDesiredAccess(
  body: Record<string, unknown>,
  requestRow: AccountRequestRow
) {
  const assignedRole =
    getRequestedRole(body.assignedRole) ??
    requestRow.assigned_role ??
    requestRow.requested_role;
  const assignedPermissions = normalizePermissions(
    body.assignedPermissions ??
      requestRow.assigned_permissions ??
      requestRow.requested_permissions ??
      []
  );
  const reviewNote = String(body.reviewNote ?? "").trim() || null;
  const confirmOverwriteExistingAccount =
    body.confirmOverwriteExistingAccount === true;

  return {
    assignedRole,
    assignedPermissions,
    reviewNote,
    confirmOverwriteExistingAccount,
  };
}

function buildInvitationPayload(
  requestRow: AccountRequestRow,
  assignedRole: AppRole,
  assignedPermissions: string[],
  chauffeurId?: number | null
) {
  const companyAccessFlags = buildCompanyAccessFlags(requestRow.company, [
    requestRow.company,
  ]);

  const redirectBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const redirectTo = redirectBase
    ? `${redirectBase}/${assignedRole}/login`
    : undefined;

  return {
    email: normalizeEmail(requestRow.email),
    options: {
      data: {
        role: assignedRole,
        permissions: assignedPermissions,
        chauffeur_id: chauffeurId ?? null,
        full_name: requestRow.full_name,
        company: requestRow.company,
        ...companyAccessFlags,
        ...buildRequiredPasswordMetadata(),
        requested_from: requestRow.portal_source,
      },
      redirectTo,
    },
  };
}

function buildManagedUserMetadata(options: {
  requestRow: AccountRequestRow;
  assignedRole: AppRole;
  assignedPermissions: string[];
  actorUserId: string;
  requirePasswordChange?: boolean;
  chauffeurId?: number | null;
  existingMetadata?: Record<string, unknown> | null;
}) {
  const existingAllowedCompanies = Array.isArray(
    options.existingMetadata?.allowed_companies
  )
    ? options.existingMetadata.allowed_companies
    : [options.requestRow.company];

  return {
    ...options.existingMetadata,
    role: options.assignedRole,
    permissions: options.assignedPermissions,
    chauffeur_id: options.chauffeurId ?? options.existingMetadata?.chauffeur_id ?? null,
    company: options.requestRow.company,
    ...buildCompanyAccessFlags(options.requestRow.company, existingAllowedCompanies),
    ...(options.requirePasswordChange ? buildRequiredPasswordMetadata() : {}),
    access_disabled: false,
    approved_from_request: true,
    approved_at: new Date().toISOString(),
    approved_by: options.actorUserId,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Erreur traitement demande.";
}

function getErrorStatus(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return null;
}

function getErrorCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

function getErrorHint(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "hint" in error &&
    typeof error.hint === "string"
  ) {
    return error.hint;
  }

  return null;
}

function getErrorDetails(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "details" in error &&
    typeof error.details === "string"
  ) {
    return error.details;
  }

  return null;
}

function isDuplicateEmailError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  const details = (getErrorDetails(error) ?? "").toLowerCase();
  const code = getErrorCode(error);

  return (
    code === "23505" ||
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("email_exists") ||
    message.includes("courriel") ||
    details.includes("courriel") ||
    message.includes("duplicate key") ||
    message.includes("duplicate")
  );
}

function isDuplicateAuthUserLinkError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  const details = (getErrorDetails(error) ?? "").toLowerCase();
  const code = getErrorCode(error);

  return (
    code === "23505" &&
    (message.includes("auth_user_id") ||
      details.includes("auth_user_id") ||
      message.includes("idx_chauffeurs_auth_user_id") ||
      details.includes("idx_chauffeurs_auth_user_id"))
  );
}

function isMissingColumnError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  const details = (getErrorDetails(error) ?? "").toLowerCase();
  const code = getErrorCode(error);

  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("column") ||
    details.includes("column")
  );
}

function isMissingChauffeurAuthUserIdColumnError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  const details = (getErrorDetails(error) ?? "").toLowerCase();

  return (
    (message.includes("chauffeurs.auth_user_id") ||
      details.includes("chauffeurs.auth_user_id") ||
      message.includes("auth_user_id") ||
      details.includes("auth_user_id")) &&
    (message.includes("does not exist") ||
      details.includes("does not exist") ||
      message.includes("column") ||
      details.includes("column"))
  );
}

function getApprovalErrorResponse(error: unknown) {
  const managedStatus = getErrorStatus(error);
  const message = getErrorMessage(error);
  const code = getErrorCode(error);
  const details = getErrorDetails(error);
  const hint = getErrorHint(error);

  if (managedStatus) {
    return {
      status: managedStatus,
      error: message || "Erreur traitement demande.",
      details,
      code,
      hint,
    };
  }

  if (isMissingColumnError(error)) {
    if (isMissingChauffeurAuthUserIdColumnError(error)) {
      return {
        status: 500,
        error:
          "La colonne chauffeurs.auth_user_id est absente dans la base de donnees. Appliquez la migration SQL qui ajoute cette colonne avant de reapprouver la demande.",
        details:
          details ??
          message ??
          "column chauffeurs.auth_user_id does not exist",
        code,
        hint:
          hint ??
          "Executez la migration ensure_chauffeurs_account_request_columns pour creer les colonnes chauffeurs attendues par ce flux.",
      };
    }

    return {
      status: 500,
      error:
        "Une colonne requise est manquante ou invalide dans la base pour finaliser l approbation.",
      details: details ?? message,
      code,
      hint:
        hint ??
        "Executez la migration ensure_chauffeurs_account_request_columns pour aligner la table chauffeurs avec le flux d approbation.",
    };
  }

  if (isDuplicateAuthUserLinkError(error)) {
    return {
      status: 409,
      error: "Ce compte existant est deja lie a une autre fiche employe.",
      details: details ?? message,
      code,
      hint:
        hint ??
        "Corrigez le lien employe existant avant de reapprouver la demande.",
    };
  }

  if (isDuplicateEmailError(error)) {
    return {
      status: 409,
      error: "Un compte existe deja pour ce courriel.",
      details: details ?? message,
      code,
      hint,
    };
  }

  return {
    status: 500,
    error: message || "Erreur traitement demande.",
    details,
    code,
    hint,
  };
}

function logApprovalStep(
  step: string,
  details: Record<string, unknown> = {}
) {
  console.info("[account-requests][approve]", step, details);
}

function logPatchStep(step: string, details: Record<string, unknown> = {}) {
  console.info("[account-requests][patch]", step, details);
}

function serializeError(error: unknown) {
  return {
    message: getErrorMessage(error),
    code: getErrorCode(error),
    details: getErrorDetails(error),
    hint: getErrorHint(error),
    status: getErrorStatus(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  };
}

async function ensureManagedAuthUser(options: {
  requestRow: AccountRequestRow;
  actorUserId: string;
  assignedRole: AppRole;
  assignedPermissions: string[];
  chauffeurId?: number | null;
  existingAuthUser?: User | null;
}) {
  const supabase = createAdminSupabaseClient();
  const normalizedEmail = normalizeEmail(options.requestRow.email);

  logApprovalStep("lookup_auth_user", {
    requestId: options.requestRow.id,
    email: normalizedEmail,
    preloadedExistingUser: Boolean(options.existingAuthUser),
  });

  let authUser = options.existingAuthUser ?? (await findAuthUserByEmail(normalizedEmail));
  let created = false;

  if (!authUser) {
    logApprovalStep("create_user_start", {
      requestId: options.requestRow.id,
      email: normalizedEmail,
    });

    const provisionalMetadata = buildManagedUserMetadata({
      requestRow: options.requestRow,
      assignedRole: options.assignedRole,
      assignedPermissions: options.assignedPermissions,
      actorUserId: options.actorUserId,
      chauffeurId: options.chauffeurId,
      requirePasswordChange: true,
      existingMetadata: null,
    });

    const { data, error } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: `${crypto.randomUUID()}Aa1!`,
      email_confirm: true,
      app_metadata: provisionalMetadata,
      user_metadata: {
        ...provisionalMetadata,
        full_name: options.requestRow.full_name,
        phone: options.requestRow.phone ?? null,
      },
    });

    if (error) {
      if (isDuplicateEmailError(error)) {
        logApprovalStep("create_user_duplicate_email", {
          requestId: options.requestRow.id,
          email: normalizedEmail,
          error: getErrorMessage(error),
        });

        authUser = await findAuthUserByEmail(normalizedEmail);
      } else {
        throw error;
      }
    } else {
      authUser = data.user ?? null;
      created = true;
    }
  } else {
    logApprovalStep("existing_auth_user_detected", {
      requestId: options.requestRow.id,
      userId: authUser.id,
      email: normalizedEmail,
    });
  }

  if (!authUser) {
    throw new Error(
      "Impossible de recuperer ou creer le compte utilisateur dans Auth."
    );
  }

  const requirePasswordChange =
    !hasUserActivatedAccess(authUser) || hasPasswordChangeRequired(authUser);

  logApprovalStep("sync_auth_user", {
    requestId: options.requestRow.id,
    userId: authUser.id,
    existingUser: !created,
    requirePasswordChange,
  });

  const appMetadata = buildManagedUserMetadata({
    requestRow: options.requestRow,
    assignedRole: options.assignedRole,
    assignedPermissions: options.assignedPermissions,
    actorUserId: options.actorUserId,
    chauffeurId: options.chauffeurId,
    requirePasswordChange,
    existingMetadata: authUser.app_metadata,
  });
  const userMetadata = {
    ...buildManagedUserMetadata({
      requestRow: options.requestRow,
      assignedRole: options.assignedRole,
      assignedPermissions: options.assignedPermissions,
      actorUserId: options.actorUserId,
      chauffeurId: options.chauffeurId,
      requirePasswordChange,
      existingMetadata: authUser.user_metadata,
    }),
    full_name:
      authUser.user_metadata?.full_name ?? options.requestRow.full_name,
    phone: authUser.user_metadata?.phone ?? options.requestRow.phone ?? null,
  };

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    authUser.id,
    {
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    }
  );

  if (updateError) {
    throw updateError;
  }

  const { data: refreshedUserData, error: refreshedUserError } =
    await supabase.auth.admin.getUserById(authUser.id);

  if (refreshedUserError || !refreshedUserData.user) {
    return {
      user: authUser,
      created,
    };
  }

  return {
    user: refreshedUserData.user,
    created,
  };
}

async function finalizeApprovedRequest(options: {
  requestRow: AccountRequestRow;
  reviewLockToken: string;
  reviewedAt: string;
  actorUser: User;
  assignedRole: AppRole;
  assignedPermissions: string[];
  reviewNote: string | null;
  invitedUserId: string;
  existingUser: boolean;
  employeeProfileId: number | null;
}) {
  const supabase = createAdminSupabaseClient();
  const basePayload = {
    status: "active",
    assigned_role: options.assignedRole,
    assigned_permissions: options.assignedPermissions,
    review_note: options.reviewNote,
    reviewed_by: options.actorUser.id,
    reviewed_at: options.reviewedAt,
    invited_user_id: options.invitedUserId,
    review_lock_token: null,
    review_started_at: null,
    last_error: null,
    audit_log: createDirectionAudit(
      options.requestRow,
      options.actorUser,
      "request_activated",
      {
        previousStatus: options.requestRow.status,
        previousAssignedRole: options.requestRow.assigned_role ?? null,
        previousAssignedPermissions:
          options.requestRow.assigned_permissions ?? [],
        assignedRole: options.assignedRole,
        assignedPermissions: options.assignedPermissions,
        invitedUserId: options.invitedUserId,
        hadExistingAccount: options.existingUser,
        employeeProfileId: options.employeeProfileId,
        company: options.requestRow.company,
        companyDirectoryContext: getCompanyDirectoryContext(
          options.requestRow.company
        ),
      }
    ),
  };

  logApprovalStep("update_request_start", {
    requestId: options.requestRow.id,
    userId: options.invitedUserId,
    status: "active",
  });

  const payloadWithApprovedFields = {
    ...basePayload,
    approved_at: options.reviewedAt,
    approved_by: options.actorUser.id,
  };

  let result = await supabase
    .from("account_requests")
    .update(payloadWithApprovedFields)
    .eq("id", options.requestRow.id)
    .eq("review_lock_token", options.reviewLockToken)
    .select("*")
    .single<AccountRequestRow>();

  if (result.error && isMissingColumnError(result.error)) {
    logApprovalStep("update_request_retry_without_approved_columns", {
      requestId: options.requestRow.id,
      error: getErrorMessage(result.error),
    });

    result = await supabase
      .from("account_requests")
      .update(basePayload)
      .eq("id", options.requestRow.id)
      .eq("review_lock_token", options.reviewLockToken)
      .select("*")
      .single<AccountRequestRow>();
  }

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

async function releaseApprovalLock(options: {
  requestId: string;
  reviewLockToken: string;
  errorMessage?: string | null;
  step?: string | null;
}) {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("account_requests")
    .update({
      review_lock_token: null,
      review_started_at: null,
      ...(options.errorMessage ? { last_error: options.errorMessage } : {}),
    })
    .eq("id", options.requestId)
    .eq("review_lock_token", options.reviewLockToken);

  if (error) {
    console.error("[account-requests][patch] lock_release_failed", {
      requestId: options.requestId,
      reviewLockToken: options.reviewLockToken,
      step: options.step ?? null,
      rawError: serializeError(error),
    });
    return;
  }

  logPatchStep(
    options.errorMessage ? "lock_released_on_error" : "lock_released",
    {
      requestId: options.requestId,
      reviewLockToken: options.reviewLockToken,
      step: options.step ?? null,
      lastError: options.errorMessage ?? null,
    }
  );
}

async function markApprovalFailure(options: {
  requestRow: AccountRequestRow;
  reviewLockToken: string;
  reviewedAt: string;
  actorUser: User;
  assignedRole: AppRole;
  assignedPermissions: string[];
  reviewNote: string | null;
  step: string;
  error: unknown;
}) {
  const supabase = createAdminSupabaseClient();
  const approvalError = getApprovalErrorResponse(options.error);
  const lastError = [approvalError.error, approvalError.details]
    .filter(Boolean)
    .join(" | ");

  console.error("[account-requests][approve] failure", {
    requestId: options.requestRow.id,
    step: options.step,
    code: approvalError.code,
    error: approvalError.error,
    details: approvalError.details,
    hint: approvalError.hint,
    rawError: serializeError(options.error),
  });

  const { error: updateError } = await supabase
    .from("account_requests")
    .update({
      status: "error",
      assigned_role: options.assignedRole,
      assigned_permissions: options.assignedPermissions,
      review_note: options.reviewNote,
      reviewed_by: options.actorUser.id,
      reviewed_at: options.reviewedAt,
      review_lock_token: null,
      review_started_at: null,
      last_error: lastError,
      audit_log: createDirectionAudit(
        options.requestRow,
        options.actorUser,
        "request_error",
        {
          previousStatus: options.requestRow.status,
          assignedRole: options.assignedRole,
          assignedPermissions: options.assignedPermissions,
          reason: options.reviewNote,
          failedStep: options.step,
          error: approvalError.error,
          errorDetails: approvalError.details,
          errorCode: approvalError.code,
          company: options.requestRow.company,
          companyDirectoryContext: getCompanyDirectoryContext(
            options.requestRow.company
          ),
        }
      ),
    })
    .eq("id", options.requestRow.id)
    .eq("review_lock_token", options.reviewLockToken);

  if (updateError) {
    console.error("[account-requests][approve] failure_update_error", {
      requestId: options.requestRow.id,
      error: updateError.message,
    });

    await releaseApprovalLock({
      requestId: options.requestRow.id,
      reviewLockToken: options.reviewLockToken,
      errorMessage: lastError,
      step: options.step,
    });
  } else {
    logPatchStep("lock_released_on_error", {
      requestId: options.requestRow.id,
      reviewLockToken: options.reviewLockToken,
      step: options.step,
      status: "error",
      lastError,
    });
  }

  return approvalError;
}

async function upsertAccountAccess(options: {
  requestRow: AccountRequestRow;
  actorUserId: string;
  assignedRole: AppRole;
  assignedPermissions: string[];
  confirmOverwriteExistingAccount: boolean;
  chauffeurId?: number | null;
}) {
  const supabase = createAdminSupabaseClient();
  const normalizedEmail = normalizeEmail(options.requestRow.email);
  const existingUser = await findAuthUserByEmail(normalizedEmail);
  const existingRole = getUserRole(existingUser);
  const existingPermissions = getUserPermissions(existingUser);

  if (existingUser && !options.confirmOverwriteExistingAccount) {
    return {
      ok: false as const,
      error:
        "Un compte existe deja pour ce courriel. Activez l ecrasement pour remplacer le role et les permissions.",
      existingAccount: buildExistingAccountSnapshot(existingUser),
    };
  }

  let invitedUserId: string | null = null;
  let finalStatus: "invited" | "active" = "invited";
  let invitationResult = "not_required";

  if (existingUser) {
    const { error: updateUserError } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      {
        app_metadata: buildManagedUserMetadata({
          requestRow: options.requestRow,
          assignedRole: options.assignedRole,
          assignedPermissions: options.assignedPermissions,
          actorUserId: options.actorUserId,
          chauffeurId: options.chauffeurId,
          requirePasswordChange:
            !hasUserActivatedAccess(existingUser) ||
            hasPasswordChangeRequired(existingUser),
          existingMetadata: existingUser.app_metadata,
        }),
        user_metadata: buildManagedUserMetadata({
          requestRow: options.requestRow,
          assignedRole: options.assignedRole,
          assignedPermissions: options.assignedPermissions,
          actorUserId: options.actorUserId,
          chauffeurId: options.chauffeurId,
          requirePasswordChange:
            !hasUserActivatedAccess(existingUser) ||
            hasPasswordChangeRequired(existingUser),
          existingMetadata: existingUser.user_metadata,
        }),
      }
    );

    if (updateUserError) {
      throw updateUserError;
    }

    invitedUserId = existingUser.id;
    finalStatus = hasUserActivatedAccess(existingUser) ? "active" : "invited";
    invitationResult = "existing_account_updated";
  } else {
    const invitation = buildInvitationPayload(
      options.requestRow,
      options.assignedRole,
      options.assignedPermissions,
      options.chauffeurId
    );

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(
      invitation.email,
      invitation.options
    );

    if (error) {
      throw error;
    }

    invitedUserId = data.user?.id ?? null;
    finalStatus = "invited";
    invitationResult = invitedUserId
      ? "invite_sent"
      : "invite_created_without_user_id";
  }

  return {
    ok: true as const,
    existingUser,
    existingRole,
    existingPermissions,
    invitedUserId,
    finalStatus,
    invitationResult,
  };
}

async function acquirePendingReviewLock(id: string) {
  const supabase = createAdminSupabaseClient();
  const reviewLockToken = crypto.randomUUID();
  const reviewedAt = new Date().toISOString();
  const lockExpiryCutoff = new Date(
    Date.now() - ACCOUNT_REVIEW_LOCK_WINDOW_MS
  ).toISOString();

  const { data, error } = await supabase
    .from("account_requests")
    .update({
      review_lock_token: reviewLockToken,
      review_started_at: reviewedAt,
    })
    .eq("id", id)
    .eq("status", "pending")
    .or(`review_lock_token.is.null,review_started_at.lt.${lockExpiryCutoff}`)
    .select("*")
    .single<AccountRequestRow>();

  if (error || !data) {
    const { data: lockedRow } = await supabase
      .from("account_requests")
      .select("status, review_started_at")
      .eq("id", id)
      .maybeSingle();

    logPatchStep("lock_timeout_conflict", {
      requestId: id,
      currentStatus: lockedRow?.status ?? null,
      lock: getReviewLockMetadata(lockedRow?.review_started_at ?? null),
      rawError: error ? serializeError(error) : null,
    });

    return {
      requestRow: null,
      reviewLockToken: null,
      reviewedAt: null,
      lock: getReviewLockMetadata(lockedRow?.review_started_at ?? null),
    };
  }

  logPatchStep("lock_acquired", {
    requestId: id,
    reviewLockToken,
    reviewedAt,
  });

  return {
    requestRow: data,
    reviewLockToken,
    reviewedAt,
    lock: null,
  };
}

function createDirectionAudit(
  requestRow: AccountRequestRow,
  actorUser: User,
  event: Parameters<typeof createAuditEntry>[0],
  details: Record<string, unknown>
) {
  return appendAuditEntry(
    requestRow.audit_log,
    createAuditEntry(event, "direction", {
      actorUserId: actorUser.id,
      details: {
        decisionMaker: actorUser.email ?? actorUser.id,
        ...details,
      },
    })
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requestDebug = getAccountRequestsRequestDebug(req);

    if (!requestDebug.hasClientMarker) {
      return NextResponse.json(
        {
          error:
            "Appel refuse: la route /api/account-requests/[id] n accepte que les appels marques depuis le navigateur authentifie.",
        },
        { status: 400 }
      );
    }

    const { user, role } = await getStrictDirectionRequestUser(req);

    if (!user || role !== "direction") {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const action = parseAction(body.action);
    const employeeProfileInput = (body.employeeProfile ?? null) as EmployeeProfileInput | null;

    logPatchStep("request_received", {
      requestId: id,
      action: body.action ?? null,
      payload: body,
    });

    if (!action) {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }

    if (action === "approve" || action === "refuse") {
      const locked = await acquirePendingReviewLock(id);

      if (!locked.requestRow || !locked.reviewLockToken || !locked.reviewedAt) {
        const currentRequestRow = await loadRequestRow(id);

        if (
          action === "approve" &&
          currentRequestRow &&
          (currentRequestRow.status === "active" ||
            currentRequestRow.status === "invited")
        ) {
          logPatchStep("approve_idempotent_return", {
            requestId: id,
            currentStatus: currentRequestRow.status,
            invitedUserId: currentRequestRow.invited_user_id ?? null,
          });

          return NextResponse.json({
            success: true,
            status: currentRequestRow.status,
            userId: currentRequestRow.invited_user_id ?? null,
            alreadyProcessed: true,
          });
        }

        return NextResponse.json(
          {
            error: locked.lock?.isLocked
              ? "Cette demande est deja en cours de traitement par un autre membre de la direction."
              : currentRequestRow
                ? `Cette demande n est plus en attente et son statut actuel est ${currentRequestRow.status}.`
                : "La demande est introuvable, deja traitee ou indisponible.",
            lock: locked.lock,
            currentStatus: currentRequestRow?.status ?? null,
          },
          { status: 409 }
        );
      }

      const requestRow = locked.requestRow;
      let processingStep =
        action === "approve" ? "approval_preflight" : "refuse_start";
      try {
        const {
          assignedRole,
          assignedPermissions,
          reviewNote,
          confirmOverwriteExistingAccount,
        } = buildDesiredAccess(body, requestRow);
        const baseLockAudit = appendAuditEntry(
          requestRow.audit_log,
          createAuditEntry("review_locked", "direction", {
            actorUserId: user.id,
            details: { action },
          })
        );

        if (action === "refuse") {
          processingStep = "request_refused";
          const { error } = await createAdminSupabaseClient()
            .from("account_requests")
            .update({
              status: "refused",
              assigned_role: assignedRole,
              assigned_permissions: assignedPermissions,
              review_note: reviewNote,
              reviewed_by: user.id,
              reviewed_at: locked.reviewedAt,
              review_lock_token: null,
              review_started_at: null,
              last_error: null,
              audit_log: appendAuditEntry(
                baseLockAudit,
                createAuditEntry("request_refused", "direction", {
                  actorUserId: user.id,
                  details: {
                    previousAssignedRole: requestRow.assigned_role ?? null,
                    previousAssignedPermissions:
                      requestRow.assigned_permissions ?? [],
                    assignedRole,
                    assignedPermissions,
                    reason: reviewNote,
                    decisionMaker: user.email ?? user.id,
                  },
                })
              ),
            })
            .eq("id", id)
            .eq("review_lock_token", locked.reviewLockToken);

          if (error) {
            throw error;
          }

          logPatchStep("lock_released", {
            requestId: requestRow.id,
            reviewLockToken: locked.reviewLockToken,
            step: "request_refused",
            status: "refused",
          });

          return NextResponse.json({ success: true, status: "refused" });
        }

        const normalizedRequestEmail = normalizeEmail(requestRow.email);
        const existingAuthUser = await findAuthUserByEmail(
          normalizedRequestEmail
        );
        const employeeResolution = await loadLinkedEmployeeProfile({
          profileId: parseNullableNumber(employeeProfileInput?.id),
          authUserId: existingAuthUser?.id ?? null,
          email: String(employeeProfileInput?.courriel ?? requestRow.email),
        });

        logPatchStep("approval_context_loaded", {
          requestId: requestRow.id,
          currentStatus: requestRow.status,
          email: normalizedRequestEmail,
          existingAccount: Boolean(existingAuthUser),
          existingAccountUserId: existingAuthUser?.id ?? null,
          existingEmployee: Boolean(employeeResolution.profile),
          existingEmployeeId: employeeResolution.profile?.id ?? null,
          employeeFoundBy: employeeResolution.foundBy,
          candidateEmployeeIds: employeeResolution.candidateProfileIds,
          employeeConflict: employeeResolution.conflict,
          confirmOverwriteExistingAccount,
        });

        let approvalStep = "approve_start";
        processingStep = approvalStep;

        logApprovalStep("approve_start", {
          requestId: requestRow.id,
          email: normalizedRequestEmail,
          assignedRole,
          assignedPermissions,
          confirmOverwriteExistingAccount,
          currentStatus: requestRow.status,
          existingAccount: Boolean(existingAuthUser),
          existingAccountUserId: existingAuthUser?.id ?? null,
          existingEmployee: Boolean(employeeResolution.profile),
          existingEmployeeId: employeeResolution.profile?.id ?? null,
        });

        if (employeeResolution.conflict) {
          throw createManagedRouteError({
            status: 409,
            error: employeeResolution.conflict.error,
            details: employeeResolution.conflict.details,
            code: employeeResolution.conflict.code,
            hint: employeeResolution.conflict.hint ?? null,
          });
        }

        approvalStep = "create_or_sync_auth_user";
        processingStep = approvalStep;
        const authUserResult = await ensureManagedAuthUser({
          requestRow,
          actorUserId: user.id,
          assignedRole,
          assignedPermissions,
          existingAuthUser,
        });

        approvalStep = "upsert_employee_profile";
        processingStep = approvalStep;
        logApprovalStep("upsert_employee_start", {
          requestId: requestRow.id,
          userId: authUserResult.user.id,
          email: normalizeEmail(requestRow.email),
          primaryCompany: requestRow.company,
        });

        const employeeProfile = await upsertEmployeeProfile({
          input: employeeProfileInput,
          requestRow,
          authUserId: authUserResult.user.id,
        });

        logApprovalStep("upsert_employee_success", {
          requestId: requestRow.id,
          userId: authUserResult.user.id,
          chauffeurId: employeeProfile.id,
        });

        if (employeeProfile.id) {
          approvalStep = "sync_user_chauffeur_metadata";
          processingStep = approvalStep;
          await syncUserChauffeurMetadata({
            userId: authUserResult.user.id,
            chauffeurId: employeeProfile.id,
          });

          logApprovalStep("sync_chauffeur_metadata_success", {
            requestId: requestRow.id,
            userId: authUserResult.user.id,
            chauffeurId: employeeProfile.id,
          });
        }

        approvalStep = "update_request_status";
        processingStep = approvalStep;
        await finalizeApprovedRequest({
          requestRow,
          reviewLockToken: locked.reviewLockToken,
          reviewedAt: locked.reviewedAt,
          actorUser: user,
          assignedRole,
          assignedPermissions,
          reviewNote,
          invitedUserId: authUserResult.user.id,
          existingUser: !authUserResult.created,
          employeeProfileId: employeeProfile.id,
        });

        logPatchStep("lock_released", {
          requestId: requestRow.id,
          reviewLockToken: locked.reviewLockToken,
          step: approvalStep,
          status: "active",
        });

        logApprovalStep("approve_complete", {
          requestId: requestRow.id,
          userId: authUserResult.user.id,
          chauffeurId: employeeProfile.id,
          existingUser: !authUserResult.created,
          status: "active",
        });

        return NextResponse.json({
          success: true,
          status: "active",
          userId: authUserResult.user.id,
          chauffeurId: employeeProfile.id,
          existingUser: !authUserResult.created,
        });
      } catch (approvalError) {
        const normalizedBaseError = getApprovalErrorResponse(approvalError);
        const lastError = [normalizedBaseError.error, normalizedBaseError.details]
          .filter(Boolean)
          .join(" | ");

        if (action === "approve") {
          const {
            assignedRole,
            assignedPermissions,
            reviewNote,
          } = buildDesiredAccess(body, requestRow);
          const normalizedError = await markApprovalFailure({
            requestRow,
            reviewLockToken: locked.reviewLockToken,
            reviewedAt: locked.reviewedAt,
            actorUser: user,
            assignedRole,
            assignedPermissions,
            reviewNote,
            step: processingStep,
            error: approvalError,
          });

          return NextResponse.json(
            {
              success: false,
              error: normalizedError.error,
              details: normalizedError.details,
              code: normalizedError.code,
              hint: normalizedError.hint,
              requestId: requestRow.id,
            },
            { status: normalizedError.status }
          );
        }

        await releaseApprovalLock({
          requestId: requestRow.id,
          reviewLockToken: locked.reviewLockToken,
          errorMessage: lastError,
          step: processingStep,
        });

        return NextResponse.json(
          {
            success: false,
            error: normalizedBaseError.error,
            details: normalizedBaseError.details,
            code: normalizedBaseError.code,
            hint: normalizedBaseError.hint,
            requestId: requestRow.id,
          },
          { status: normalizedBaseError.status }
        );
      }
    }

    const requestRow = await loadRequestRow(id);

    if (!requestRow) {
      return NextResponse.json(
        { error: "Demande introuvable." },
        { status: 404 }
      );
    }

    const {
      assignedRole,
      assignedPermissions,
      reviewNote,
      confirmOverwriteExistingAccount,
    } = buildDesiredAccess(body, requestRow);
    const reviewedAt = new Date().toISOString();

    if (action === "save_employee_profile") {
      const authUser = await findAuthUserByEmail(normalizeEmail(requestRow.email));
      const employeeProfile = await upsertEmployeeProfile({
        input: employeeProfileInput,
        requestRow,
        authUserId: authUser?.id ?? null,
      });

      if (authUser?.id && employeeProfile.id) {
        await syncUserChauffeurMetadata({
          userId: authUser.id,
          chauffeurId: employeeProfile.id,
        });
      }

      const updated = await updateRequestRow(id, {
        assigned_role: assignedRole,
        assigned_permissions: assignedPermissions,
        review_note: reviewNote,
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
        last_error: null,
        audit_log: createDirectionAudit(
          requestRow,
          user,
          "request_updated",
          {
            previousStatus: requestRow.status,
            assignedRole,
            assignedPermissions,
            reason: reviewNote,
            employeeProfileId: employeeProfile.id,
            employeeProfileSaved: true,
          }
        ),
      });

      return NextResponse.json({ success: true, status: updated.status });
    }

    if (action === "reset_pending") {
      const updated = await updateRequestRow(id, {
        status: "pending",
        review_note: reviewNote,
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
        invited_user_id: null,
        review_lock_token: null,
        review_started_at: null,
        last_error: null,
        audit_log: createDirectionAudit(requestRow, user, "request_reopened", {
          previousStatus: requestRow.status,
          assignedRole,
          assignedPermissions,
          reason: reviewNote,
        }),
      });

      return NextResponse.json({ success: true, status: updated.status });
    }

    if (action === "update_access") {
      if (requestRow.status !== "invited" && requestRow.status !== "active") {
        return NextResponse.json(
          { error: "Cette action est reservee aux demandes invited ou active." },
          { status: 409 }
        );
      }

      const employeeProfile = await upsertEmployeeProfile({
        input: employeeProfileInput,
        requestRow,
      });

      const result = await upsertAccountAccess({
        requestRow,
        actorUserId: user.id,
        assignedRole,
        assignedPermissions,
        confirmOverwriteExistingAccount,
        chauffeurId: employeeProfile.id,
      });

      if (!result.ok) {
        return NextResponse.json(
          {
            error: result.error,
            existingAccount: result.existingAccount,
          },
          { status: 409 }
        );
      }

      if (result.invitedUserId && employeeProfile.id) {
        await syncUserChauffeurMetadata({
          userId: result.invitedUserId,
          chauffeurId: employeeProfile.id,
        });
      }

      const updated = await updateRequestRow(id, {
        status: result.finalStatus,
        assigned_role: assignedRole,
        assigned_permissions: assignedPermissions,
        review_note: reviewNote,
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
        invited_user_id: result.invitedUserId,
        last_error: null,
        audit_log: createDirectionAudit(requestRow, user, "request_updated", {
          previousStatus: requestRow.status,
          previousAssignedRole: requestRow.assigned_role ?? null,
          previousAssignedPermissions: requestRow.assigned_permissions ?? [],
          assignedRole,
          assignedPermissions,
          reason: reviewNote,
          hadExistingAccount: Boolean(result.existingUser),
          employeeProfileId: employeeProfile.id,
          company: requestRow.company,
          companyDirectoryContext: getCompanyDirectoryContext(requestRow.company),
        }),
      });

      return NextResponse.json({ success: true, status: updated.status });
    }

    if (action === "resend_invitation") {
      if (requestRow.status !== "invited") {
        return NextResponse.json(
          { error: "Seules les demandes invited peuvent recevoir une nouvelle invitation." },
          { status: 409 }
        );
      }

      const employeeProfile = await upsertEmployeeProfile({
        input: employeeProfileInput,
        requestRow,
      });

      const invitation = buildInvitationPayload(
        requestRow,
        assignedRole,
        assignedPermissions,
        employeeProfile.id
      );
      const { data, error } = await createAdminSupabaseClient().auth.admin.inviteUserByEmail(
        invitation.email,
        invitation.options
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (data.user?.id && employeeProfile.id) {
        await syncUserChauffeurMetadata({
          userId: data.user.id,
          chauffeurId: employeeProfile.id,
        });
      }

      const updated = await updateRequestRow(id, {
        assigned_role: assignedRole,
        assigned_permissions: assignedPermissions,
        review_note: reviewNote,
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
        invited_user_id: data.user?.id ?? requestRow.invited_user_id ?? null,
        last_error: null,
        audit_log: createDirectionAudit(requestRow, user, "invitation_resent", {
          assignedRole,
          assignedPermissions,
          reason: reviewNote,
          invitedUserId: data.user?.id ?? requestRow.invited_user_id ?? null,
          employeeProfileId: employeeProfile.id,
          company: requestRow.company,
          companyDirectoryContext: getCompanyDirectoryContext(requestRow.company),
        }),
      });

      return NextResponse.json({ success: true, status: updated.status });
    }

    if (action === "disable_access") {
      if (requestRow.status !== "active") {
        return NextResponse.json(
          { error: "Seules les demandes actives peuvent etre desactivees." },
          { status: 409 }
        );
      }

      const existingUser = await findAuthUserByEmail(normalizeEmail(requestRow.email));

      if (!existingUser) {
        return NextResponse.json(
          { error: "Aucun compte associe n a ete trouve pour cette demande." },
          { status: 404 }
        );
      }

      const { error } = await createAdminSupabaseClient().auth.admin.updateUserById(
        existingUser.id,
        {
          app_metadata: {
            ...existingUser.app_metadata,
            role: null,
            permissions: [],
            access_disabled: true,
            access_disabled_at: reviewedAt,
            access_disabled_by: user.id,
          },
          user_metadata: {
            ...existingUser.user_metadata,
            role: null,
            permissions: [],
            access_disabled: true,
            access_disabled_at: reviewedAt,
            access_disabled_by: user.id,
          },
        }
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const updated = await updateRequestRow(id, {
        status: "refused",
        review_note: reviewNote,
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
        last_error: null,
        audit_log: createDirectionAudit(requestRow, user, "access_disabled", {
          previousStatus: requestRow.status,
          disabledUserId: existingUser.id,
          reason: reviewNote,
          company: requestRow.company,
          companyDirectoryContext: getCompanyDirectoryContext(requestRow.company),
        }),
      });

      return NextResponse.json({ success: true, status: updated.status });
    }

    if (action === "retry") {
      if (requestRow.status !== "error") {
        return NextResponse.json(
          { error: "Seules les demandes en erreur peuvent etre relancees." },
          { status: 409 }
        );
      }

      const employeeProfile = await upsertEmployeeProfile({
        input: employeeProfileInput,
        requestRow,
      });

      const result = await upsertAccountAccess({
        requestRow,
        actorUserId: user.id,
        assignedRole,
        assignedPermissions,
        confirmOverwriteExistingAccount,
        chauffeurId: employeeProfile.id,
      });

      if (!result.ok) {
        return NextResponse.json(
          {
            error: result.error,
            existingAccount: result.existingAccount,
          },
          { status: 409 }
        );
      }

      if (result.invitedUserId && employeeProfile.id) {
        await syncUserChauffeurMetadata({
          userId: result.invitedUserId,
          chauffeurId: employeeProfile.id,
        });
      }

      const updated = await updateRequestRow(id, {
        status: result.finalStatus,
        assigned_role: assignedRole,
        assigned_permissions: assignedPermissions,
        review_note: reviewNote,
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
        invited_user_id: result.invitedUserId,
        last_error: null,
        audit_log: createDirectionAudit(
          requestRow,
          user,
          result.finalStatus === "active"
            ? "request_activated"
            : "request_invited",
          {
            previousStatus: requestRow.status,
            assignedRole,
            assignedPermissions,
            reason: reviewNote,
            invitedUserId: result.invitedUserId,
            hadExistingAccount: Boolean(result.existingUser),
            invitationResult: result.invitationResult,
            retriedFromError: true,
            employeeProfileId: employeeProfile.id,
            company: requestRow.company,
            companyDirectoryContext: getCompanyDirectoryContext(requestRow.company),
          }
        ),
      });

      return NextResponse.json({ success: true, status: updated.status });
    }

    return NextResponse.json(
      { error: "Action non prise en charge." },
      { status: 400 }
    );
  } catch (error) {
    const normalizedError = getApprovalErrorResponse(error);

    console.error("[account-requests][patch] unexpected_failure", {
      ...serializeError(error),
    });

    return NextResponse.json(
      {
        success: false,
        error: normalizedError.error,
        details: normalizedError.details,
        code: normalizedError.code,
        hint: normalizedError.hint,
      },
      { status: normalizedError.status }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requestDebug = getAccountRequestsRequestDebug(req);

    if (!requestDebug.hasClientMarker) {
      return NextResponse.json(
        {
          error:
            "Appel refuse: la route /api/account-requests/[id] n accepte que les appels marques depuis le navigateur authentifie.",
        },
        { status: 400 }
      );
    }

    const { user, role } = await getStrictDirectionRequestUser(req);

    if (!user || role !== "direction") {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const { id } = await params;
    const requestRow = await loadRequestRow(id);

    if (!requestRow) {
      return NextResponse.json(
        { error: "Demande introuvable." },
        { status: 404 }
      );
    }

    const { error } = await createAdminSupabaseClient()
      .from("account_requests")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deletedRequest: {
        id: requestRow.id,
        email: requestRow.email,
        status: requestRow.status,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur suppression demande.",
      },
      { status: 500 }
    );
  }
}

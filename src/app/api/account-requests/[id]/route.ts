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
  titan_enabled?: unknown;
  titan_mode_timeclock?: unknown;
  titan_mode_sorties?: unknown;
  titan_hourly_rate?: unknown;
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
  titan_enabled: boolean | null;
  titan_mode_timeclock: boolean | null;
  titan_mode_sorties: boolean | null;
  titan_hourly_rate: number | null;
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

const WORK_DAY_VALUES = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
] as const;

function parseNullableString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function parseNullableNumber(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function parseNullableTime(value: unknown) {
  const normalized = String(value ?? "").trim();
  return /^\d{2}:\d{2}(:\d{2})?$/.test(normalized) ? normalized : null;
}

function parseWorkDays(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim().toLowerCase())
        .filter(
          (item): item is (typeof WORK_DAY_VALUES)[number] =>
            WORK_DAY_VALUES.includes(item as (typeof WORK_DAY_VALUES)[number])
        )
    )
  );
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
}) {
  const supabase = createAdminSupabaseClient();

  if (options.profileId) {
    const { data } = await supabase
      .from("chauffeurs")
      .select("*")
      .eq("id", options.profileId)
      .maybeSingle<ChauffeurRow>();

    if (data) {
      return data;
    }
  }

  if (options.authUserId) {
    const { data } = await supabase
      .from("chauffeurs")
      .select("*")
      .eq("auth_user_id", options.authUserId)
      .maybeSingle<ChauffeurRow>();

    if (data) {
      return data;
    }
  }

  const normalizedEmail = normalizeEmail(options.email);
  const { data } = await supabase
    .from("chauffeurs")
    .select("*")
    .eq("courriel", normalizedEmail)
    .maybeSingle<ChauffeurRow>();

  return data ?? null;
}

async function upsertEmployeeProfile(options: {
  input: EmployeeProfileInput | null;
  requestRow: AccountRequestRow;
  authUserId?: string | null;
}) {
  const supabase = createAdminSupabaseClient();
  const normalizedInput = options.input ?? {};
  const linkedProfile = await loadLinkedEmployeeProfile({
    profileId: parseNullableNumber(normalizedInput.id),
    authUserId: options.authUserId ?? null,
    email: String(normalizedInput.courriel ?? options.requestRow.email),
  });

  const primaryCompany =
    normalizeCompany(normalizedInput.primary_company) ?? options.requestRow.company;
  const socialBenefitsPercent =
    parseNullableNumber(normalizedInput.social_benefits_percent) ?? 15;
  const titanEnabled =
    typeof normalizedInput.titan_enabled === "boolean"
      ? normalizedInput.titan_enabled
      : linkedProfile?.titan_enabled ??
        linkedProfile?.titan_billable ??
        false;
  const titanModeTimeclock =
    typeof normalizedInput.titan_mode_timeclock === "boolean"
      ? normalizedInput.titan_mode_timeclock
      : linkedProfile?.titan_mode_timeclock ?? titanEnabled;
  const titanModeSorties =
    typeof normalizedInput.titan_mode_sorties === "boolean"
      ? normalizedInput.titan_mode_sorties
      : linkedProfile?.titan_mode_sorties ?? titanEnabled;
  const titanHourlyRate =
    parseNullableNumber(normalizedInput.titan_hourly_rate) ??
    parseNullableNumber(normalizedInput.taux_base_titan) ??
    linkedProfile?.titan_hourly_rate ??
    linkedProfile?.taux_base_titan ??
    null;
  const breakAmEnabled =
    normalizedInput.break_am_enabled === true ||
    (normalizedInput.break_am_enabled !== false &&
      (parseNullableNumber(normalizedInput.break_am_minutes) ??
        linkedProfile?.break_am_minutes ??
        linkedProfile?.break_1_minutes ??
        0) > 0);
  const lunchEnabled =
    normalizedInput.lunch_enabled === true ||
    (normalizedInput.lunch_enabled !== false &&
      (parseNullableNumber(normalizedInput.lunch_minutes) ??
        linkedProfile?.lunch_minutes ??
        linkedProfile?.break_2_minutes ??
        0) > 0);
  const breakPmEnabled =
    normalizedInput.break_pm_enabled === true ||
    (normalizedInput.break_pm_enabled !== false &&
      (parseNullableNumber(normalizedInput.break_pm_minutes) ??
        linkedProfile?.break_pm_minutes ??
        linkedProfile?.break_3_minutes ??
        0) > 0);
  const expectedBreaksCount =
    parseNullableNumber(normalizedInput.expected_breaks_count) ??
    [breakAmEnabled, lunchEnabled, breakPmEnabled].filter(Boolean).length;
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
    taux_base_titan: titanHourlyRate,
    titan_enabled: titanEnabled,
    titan_mode_timeclock: titanModeTimeclock,
    titan_mode_sorties: titanModeSorties,
    titan_hourly_rate: titanHourlyRate,
    social_benefits_percent: socialBenefitsPercent,
    titan_billable: titanEnabled,
    schedule_start:
      parseNullableTime(normalizedInput.schedule_start) ??
      linkedProfile?.schedule_start ??
      null,
    schedule_end:
      parseNullableTime(normalizedInput.schedule_end) ??
      linkedProfile?.schedule_end ??
      null,
    scheduled_work_days:
      parseWorkDays(normalizedInput.scheduled_work_days).length > 0
        ? parseWorkDays(normalizedInput.scheduled_work_days)
        : linkedProfile?.scheduled_work_days ?? [],
    planned_daily_hours:
      parseNullableNumber(normalizedInput.planned_daily_hours) ??
      linkedProfile?.planned_daily_hours ??
      null,
    planned_weekly_hours:
      parseNullableNumber(normalizedInput.planned_weekly_hours) ??
      linkedProfile?.planned_weekly_hours ??
      null,
    pause_minutes:
      parseNullableNumber(normalizedInput.pause_minutes) ??
      linkedProfile?.pause_minutes ??
      15,
    expected_breaks_count: expectedBreaksCount,
    break_1_label: "Pause AM",
    break_1_minutes:
      parseNullableNumber(normalizedInput.break_am_minutes) ??
      parseNullableNumber(normalizedInput.break_1_minutes) ??
      linkedProfile?.break_am_minutes ??
      linkedProfile?.break_1_minutes ??
      null,
    break_1_paid:
      typeof normalizedInput.break_am_paid === "boolean"
        ? normalizedInput.break_am_paid
        : typeof normalizedInput.break_1_paid === "boolean"
          ? normalizedInput.break_1_paid
          : linkedProfile?.break_am_paid ?? linkedProfile?.break_1_paid ?? true,
    break_2_label: "Diner",
    break_2_minutes:
      parseNullableNumber(normalizedInput.lunch_minutes) ??
      parseNullableNumber(normalizedInput.break_2_minutes) ??
      linkedProfile?.lunch_minutes ??
      linkedProfile?.break_2_minutes ??
      null,
    break_2_paid:
      typeof normalizedInput.lunch_paid === "boolean"
        ? normalizedInput.lunch_paid
        : typeof normalizedInput.break_2_paid === "boolean"
          ? normalizedInput.break_2_paid
          : linkedProfile?.lunch_paid ?? linkedProfile?.break_2_paid ?? false,
    break_3_label: "Pause PM",
    break_3_minutes:
      parseNullableNumber(normalizedInput.break_pm_minutes) ??
      parseNullableNumber(normalizedInput.break_3_minutes) ??
      linkedProfile?.break_pm_minutes ??
      linkedProfile?.break_3_minutes ??
      null,
    break_3_paid:
      typeof normalizedInput.break_pm_paid === "boolean"
        ? normalizedInput.break_pm_paid
        : typeof normalizedInput.break_3_paid === "boolean"
          ? normalizedInput.break_3_paid
          : linkedProfile?.break_pm_paid ?? linkedProfile?.break_3_paid ?? true,
    break_am_enabled: breakAmEnabled,
    break_am_time:
      parseNullableTime(normalizedInput.break_am_time) ??
      linkedProfile?.break_am_time ??
      null,
    break_am_minutes:
      parseNullableNumber(normalizedInput.break_am_minutes) ??
      linkedProfile?.break_am_minutes ??
      linkedProfile?.break_1_minutes ??
      null,
    break_am_paid:
      typeof normalizedInput.break_am_paid === "boolean"
        ? normalizedInput.break_am_paid
        : linkedProfile?.break_am_paid ?? linkedProfile?.break_1_paid ?? true,
    lunch_enabled: lunchEnabled,
    lunch_time:
      parseNullableTime(normalizedInput.lunch_time) ??
      linkedProfile?.lunch_time ??
      null,
    lunch_minutes:
      parseNullableNumber(normalizedInput.lunch_minutes) ??
      linkedProfile?.lunch_minutes ??
      linkedProfile?.break_2_minutes ??
      null,
    lunch_paid:
      typeof normalizedInput.lunch_paid === "boolean"
        ? normalizedInput.lunch_paid
        : linkedProfile?.lunch_paid ?? linkedProfile?.break_2_paid ?? false,
    break_pm_enabled: breakPmEnabled,
    break_pm_time:
      parseNullableTime(normalizedInput.break_pm_time) ??
      linkedProfile?.break_pm_time ??
      null,
    break_pm_minutes:
      parseNullableNumber(normalizedInput.break_pm_minutes) ??
      linkedProfile?.break_pm_minutes ??
      linkedProfile?.break_3_minutes ??
      null,
    break_pm_paid:
      typeof normalizedInput.break_pm_paid === "boolean"
        ? normalizedInput.break_pm_paid
        : linkedProfile?.break_pm_paid ?? linkedProfile?.break_3_paid ?? true,
    sms_alert_depart_terrain:
      typeof normalizedInput.sms_alert_depart_terrain === "boolean"
        ? normalizedInput.sms_alert_depart_terrain
        : linkedProfile?.sms_alert_depart_terrain ?? true,
    sms_alert_arrivee_terrain:
      typeof normalizedInput.sms_alert_arrivee_terrain === "boolean"
        ? normalizedInput.sms_alert_arrivee_terrain
        : linkedProfile?.sms_alert_arrivee_terrain ?? true,
    sms_alert_sortie:
      typeof normalizedInput.sms_alert_sortie === "boolean"
        ? normalizedInput.sms_alert_sortie
        : linkedProfile?.sms_alert_sortie ?? true,
    sms_alert_retour:
      typeof normalizedInput.sms_alert_retour === "boolean"
        ? normalizedInput.sms_alert_retour
        : linkedProfile?.sms_alert_retour ?? true,
    sms_alert_pause_debut:
      typeof normalizedInput.sms_alert_pause_debut === "boolean"
        ? normalizedInput.sms_alert_pause_debut
        : linkedProfile?.sms_alert_pause_debut ?? true,
    sms_alert_pause_fin:
      typeof normalizedInput.sms_alert_pause_fin === "boolean"
        ? normalizedInput.sms_alert_pause_fin
        : linkedProfile?.sms_alert_pause_fin ?? true,
    sms_alert_dinner_debut:
      typeof normalizedInput.sms_alert_dinner_debut === "boolean"
        ? normalizedInput.sms_alert_dinner_debut
        : linkedProfile?.sms_alert_dinner_debut ?? true,
    sms_alert_dinner_fin:
      typeof normalizedInput.sms_alert_dinner_fin === "boolean"
        ? normalizedInput.sms_alert_dinner_fin
        : linkedProfile?.sms_alert_dinner_fin ?? true,
    sms_alert_quart_debut:
      typeof normalizedInput.sms_alert_quart_debut === "boolean"
        ? normalizedInput.sms_alert_quart_debut
        : linkedProfile?.sms_alert_quart_debut ?? true,
    sms_alert_quart_fin:
      typeof normalizedInput.sms_alert_quart_fin === "boolean"
        ? normalizedInput.sms_alert_quart_fin
        : linkedProfile?.sms_alert_quart_fin ?? true,
    can_work_for_oliem_solutions:
      linkedProfile?.can_work_for_oliem_solutions ??
      primaryCompany === "oliem_solutions",
    can_work_for_titan_produits_industriels: titanEnabled,
  };

  console.info("[account-requests][chauffeurs] upsert payload", {
    requestId: options.requestRow.id,
    linkedProfileId: linkedProfile?.id ?? null,
    authUserId: options.authUserId ?? linkedProfile?.auth_user_id ?? null,
    payload,
  });

  const persistPayload = async (
    currentPayload: Record<string, unknown>,
    existingProfileId: number | null
  ) => {
    if (existingProfileId) {
      return await supabase
        .from("chauffeurs")
        .update(currentPayload)
        .eq("id", existingProfileId)
        .select("*")
        .single<ChauffeurRow>();
    }

    return await supabase
      .from("chauffeurs")
      .insert([currentPayload])
      .select("*")
      .single<ChauffeurRow>();
  };

  let currentPayload: Record<string, unknown> = { ...payload };
  let currentProfileId = linkedProfile?.id ?? null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await persistPayload(currentPayload, currentProfileId);

    if (!error) {
      return data;
    }

    lastError = error;

    console.error("[account-requests][chauffeurs] upsert failed", {
      requestId: options.requestRow.id,
      linkedProfileId: currentProfileId,
      attempt: attempt + 1,
      payload: currentPayload,
      error: {
        message: isSupabaseLikeError(error) ? error.message : String(error),
        code: isSupabaseLikeError(error) ? error.code ?? null : null,
        details: isSupabaseLikeError(error) ? error.details ?? null : null,
        hint: isSupabaseLikeError(error) ? error.hint ?? null : null,
      },
    });

    if (isMissingColumnError(error)) {
      const missingColumn = getMissingColumnName(error);
      if (missingColumn && missingColumn in currentPayload) {
        const rest = { ...currentPayload };
        delete rest[missingColumn];
        currentPayload = rest;
        console.warn("[account-requests][chauffeurs] retrying without missing column", {
          requestId: options.requestRow.id,
          missingColumn,
        });
        continue;
      }
    }

    if (!currentProfileId && isUniqueViolationError(error)) {
      const conflictTarget = getUniqueViolationTarget(error);
      if (conflictTarget === "auth_user_id" || conflictTarget === "courriel") {
        const conflictingProfile = await loadLinkedEmployeeProfile({
          profileId: null,
          authUserId:
            conflictTarget === "auth_user_id"
              ? String(currentPayload.auth_user_id ?? options.authUserId ?? "")
              : null,
          email: String(currentPayload.courriel ?? options.requestRow.email),
        });

        if (conflictingProfile?.id) {
          currentProfileId = conflictingProfile.id;
          console.warn("[account-requests][chauffeurs] retrying as update after unique conflict", {
            requestId: options.requestRow.id,
            conflictTarget,
            conflictingProfileId: conflictingProfile.id,
          });
          continue;
        }
      }
    }

    throw new Error(formatSupabaseError(error));
  }

  throw new Error(formatSupabaseError(lastError));
}

async function syncUserChauffeurMetadata(options: {
  userId: string;
  chauffeurId: number;
}) {
  const supabase = createAdminSupabaseClient();
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
  const existingAccessIsMeaningful = Boolean(
    existingUser &&
      (existingRole || existingPermissions.length > 0 || hasUserActivatedAccess(existingUser))
  );

  if (existingUser && existingAccessIsMeaningful && !options.confirmOverwriteExistingAccount) {
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

    return {
      requestRow: null,
      reviewLockToken: null,
      reviewedAt: null,
      lock: getReviewLockMetadata(lockedRow?.review_started_at ?? null),
    };
  }

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

function isSupabaseLikeError(
  error: unknown
): error is { code?: string; message?: string; details?: string; hint?: string } {
  return typeof error === "object" && error !== null && "message" in error;
}

function formatSupabaseError(error: unknown) {
  if (!isSupabaseLikeError(error)) {
    return "Erreur creation ou mise a jour chauffeur.";
  }

  const message = String(error.message ?? "Erreur creation ou mise a jour chauffeur.");
  const code = error.code ? `code=${error.code}` : null;
  const details = error.details ? `details=${error.details}` : null;
  const hint = error.hint ? `hint=${error.hint}` : null;

  return [message, code, details, hint].filter(Boolean).join(" | ");
}

function isMissingColumnError(error: unknown) {
  return isSupabaseLikeError(error) && error.code === "42703";
}

function getMissingColumnName(error: unknown) {
  if (!isSupabaseLikeError(error)) return null;
  const combined = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const match = combined.match(
    /column\s+"?([a-zA-Z0-9_]+)"?\s+(?:of relation\s+"?chauffeurs"?\s+)?does not exist/i
  );
  return match?.[1] ?? null;
}

function isUniqueViolationError(error: unknown) {
  return isSupabaseLikeError(error) && error.code === "23505";
}

function getUniqueViolationTarget(error: unknown) {
  if (!isSupabaseLikeError(error)) return null;
  const combined = [error.message, error.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  if (/auth_user_id/i.test(combined)) return "auth_user_id";
  if (/courriel|email/i.test(combined)) return "courriel";
  return null;
}

function errorJson(
  status: number,
  error: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(extra ?? {}),
    },
    { status }
  );
}

function successJson(extra?: Record<string, unknown>) {
  return NextResponse.json({
    success: true,
    ...(extra ?? {}),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requestDebug = getAccountRequestsRequestDebug(req);

    if (!requestDebug.hasClientMarker) {
      console.warn("[account-requests][PATCH] missing client marker", {
        path: req.nextUrl.pathname,
        method: req.method,
        ...requestDebug,
      });
      return errorJson(
        400,
        "Appel refuse: la route /api/account-requests/[id] n accepte que les appels marques depuis le navigateur authentifie."
      );
    }

    const { user, role } = await getStrictDirectionRequestUser(req);

    if (!user || role !== "direction") {
      console.warn("[account-requests][PATCH] authorization failed", {
        path: req.nextUrl.pathname,
        method: req.method,
        role,
        hasUser: Boolean(user),
      });
      return errorJson(403, "Acces refuse.");
    }

    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const action = parseAction(body.action);
    const employeeProfileInput = (body.employeeProfile ?? null) as EmployeeProfileInput | null;

    console.info("[account-requests][PATCH] incoming", {
      id,
      action: body.action,
      parsedAction: action,
      assignedRole: body.assignedRole,
      assignedPermissions: body.assignedPermissions,
      confirmOverwriteExistingAccount: body.confirmOverwriteExistingAccount === true,
      employeeProfileId:
        employeeProfileInput && "id" in employeeProfileInput
          ? employeeProfileInput.id
          : null,
      employeeProfileEmail:
        employeeProfileInput && "courriel" in employeeProfileInput
          ? employeeProfileInput.courriel
          : null,
      actorUserId: user.id,
    });

    if (!action) {
      console.warn("[account-requests][PATCH] invalid action", {
        id,
        rawAction: body.action,
      });
      return errorJson(400, "Action invalide.");
    }

    if (action === "approve" || action === "refuse") {
      const locked = await acquirePendingReviewLock(id);

      console.info("[account-requests][PATCH] lock result", {
        id,
        action,
        hasRequestRow: Boolean(locked.requestRow),
        hasReviewLockToken: Boolean(locked.reviewLockToken),
        lock: locked.lock,
      });

      if (!locked.requestRow || !locked.reviewLockToken || !locked.reviewedAt) {
        console.warn("[account-requests][PATCH] unable to acquire pending lock", {
          id,
          action,
          lock: locked.lock,
        });
        return errorJson(
          409,
          locked.lock?.isLocked
            ? "Cette demande est deja en cours de traitement par un autre membre de la direction."
            : "La demande est introuvable, deja traitee ou indisponible.",
          { lock: locked.lock, requestId: id, step: "acquire_pending_lock" }
        );
      }

      const requestRow = locked.requestRow;
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
          return errorJson(500, error.message, {
            requestId: id,
            step: "refuse_request_update",
          });
        }

        return successJson({ status: "refused" });
      }

      let employeeProfile;
      try {
        employeeProfile = await upsertEmployeeProfile({
          input: employeeProfileInput,
          requestRow,
        });
      } catch (profileError) {
        console.error("[account-requests][PATCH] employee profile upsert failed", {
          id,
          action,
          message:
            profileError instanceof Error
              ? profileError.message
              : "Erreur creation ou mise a jour chauffeur.",
        });
        return errorJson(
          500,
          profileError instanceof Error
            ? profileError.message
            : "Erreur creation ou mise a jour chauffeur.",
          {
            requestId: id,
            step: "approve_upsert_employee_profile",
          }
        );
      }

      console.info("[account-requests][PATCH] employee profile upserted", {
        id,
        action,
        employeeProfileId: employeeProfile.id,
        employeeProfileEmail: employeeProfile.courriel,
        authUserId: employeeProfile.auth_user_id,
      });

      let approvalResult;
      try {
        approvalResult = await upsertAccountAccess({
          requestRow,
          actorUserId: user.id,
          assignedRole,
          assignedPermissions,
          confirmOverwriteExistingAccount,
          chauffeurId: employeeProfile.id,
        });
      } catch (approvalError) {
        console.error("[account-requests][PATCH] upsert account access failed", {
          id,
          action,
          message:
            approvalError instanceof Error
              ? approvalError.message
              : "Erreur creation ou liaison auth.users.",
        });
        await createAdminSupabaseClient()
          .from("account_requests")
          .update({
            review_lock_token: null,
            review_started_at: null,
            last_error:
              approvalError instanceof Error
                ? approvalError.message
                : "Erreur creation ou liaison auth.users.",
          })
          .eq("id", id)
          .eq("review_lock_token", locked.reviewLockToken);
        return errorJson(
          500,
          approvalError instanceof Error
            ? approvalError.message
            : "Erreur creation ou liaison auth.users.",
          {
            requestId: id,
            step: "approve_upsert_account_access",
          }
        );
      }

      console.info("[account-requests][PATCH] approval result", {
        id,
        action,
        ok: approvalResult.ok,
        finalStatus: approvalResult.ok ? approvalResult.finalStatus : null,
        invitedUserId: approvalResult.ok ? approvalResult.invitedUserId : null,
        existingUserId: approvalResult.ok
          ? approvalResult.existingUser?.id ?? null
          : approvalResult.existingAccount?.userId ?? null,
        error: approvalResult.ok ? null : approvalResult.error,
      });

      if (!approvalResult.ok) {
        await createAdminSupabaseClient()
          .from("account_requests")
          .update({
            review_lock_token: null,
            review_started_at: null,
          })
          .eq("id", id)
          .eq("review_lock_token", locked.reviewLockToken);

        console.warn("[account-requests][PATCH] approval blocked", {
          id,
          action,
          error: approvalResult.error,
          existingAccount: approvalResult.existingAccount,
        });
        return errorJson(409, approvalResult.error, {
          requestId: id,
          step: "upsert_account_access",
          existingAccount: approvalResult.existingAccount,
        });
      }

      if (approvalResult.invitedUserId && employeeProfile.id) {
        try {
          await syncUserChauffeurMetadata({
            userId: approvalResult.invitedUserId,
            chauffeurId: employeeProfile.id,
          });
        } catch (syncError) {
          console.error("[account-requests][PATCH] chauffeur metadata sync failed", {
            id,
            action,
            invitedUserId: approvalResult.invitedUserId,
            chauffeurId: employeeProfile.id,
            message:
              syncError instanceof Error
                ? syncError.message
                : "Erreur liaison auth user / chauffeur.",
          });
          return errorJson(
            500,
            syncError instanceof Error
              ? syncError.message
              : "Erreur liaison auth user / chauffeur.",
            {
              requestId: id,
              step: "approve_sync_chauffeur_metadata",
            }
          );
        }

        console.info("[account-requests][PATCH] chauffeur metadata synced", {
          id,
          action,
          invitedUserId: approvalResult.invitedUserId,
          chauffeurId: employeeProfile.id,
        });
      }

      const eventName =
        approvalResult.finalStatus === "active"
          ? "request_activated"
          : "request_invited";

      const { error } = await createAdminSupabaseClient()
        .from("account_requests")
        .update({
          status: approvalResult.finalStatus,
          assigned_role: assignedRole,
          assigned_permissions: assignedPermissions,
          review_note: reviewNote,
          reviewed_by: user.id,
          reviewed_at: locked.reviewedAt,
          invited_user_id: approvalResult.invitedUserId,
          review_lock_token: null,
          review_started_at: null,
          last_error: null,
          audit_log: appendAuditEntry(
            baseLockAudit,
            createAuditEntry(eventName, "direction", {
              actorUserId: user.id,
              details: {
                previousAssignedRole: requestRow.assigned_role ?? null,
                previousAssignedPermissions:
                  requestRow.assigned_permissions ?? [],
                previousAuthRole: approvalResult.existingRole,
                previousAuthPermissions: approvalResult.existingPermissions,
                assignedRole,
                assignedPermissions,
                newRole: assignedRole,
                newPermissions: assignedPermissions,
                reason: reviewNote,
                decisionMaker: user.email ?? user.id,
                invitedUserId: approvalResult.invitedUserId,
                hadExistingAccount: Boolean(approvalResult.existingUser),
                invitationResult: approvalResult.invitationResult,
                company: requestRow.company,
                companyDirectoryContext: getCompanyDirectoryContext(
                  requestRow.company
                ),
              },
            })
          ),
        })
        .eq("id", id)
        .eq("review_lock_token", locked.reviewLockToken);

      if (error) {
        console.error("[account-requests][PATCH] final request update failed", {
          id,
          action,
          message: error.message,
        });
        return errorJson(500, error.message, {
          requestId: id,
          step: "approve_request_update",
        });
      }

      console.info("[account-requests][PATCH] success", {
        id,
        action,
        status: approvalResult.finalStatus,
      });
      return successJson({ status: approvalResult.finalStatus });
    }

    const requestRow = await loadRequestRow(id);

    if (!requestRow) {
      return errorJson(404, "Demande introuvable.", {
        requestId: id,
        step: "load_request_row",
      });
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
      let employeeProfile;
      try {
        employeeProfile = await upsertEmployeeProfile({
          input: employeeProfileInput,
          requestRow,
          authUserId: authUser?.id ?? null,
        });
      } catch (profileError) {
        return errorJson(
          500,
          profileError instanceof Error
            ? profileError.message
            : "Erreur creation ou mise a jour chauffeur.",
          {
            requestId: id,
            step: "save_profile_upsert_employee_profile",
          }
        );
      }

      if (authUser?.id && employeeProfile.id) {
        try {
          await syncUserChauffeurMetadata({
            userId: authUser.id,
            chauffeurId: employeeProfile.id,
          });
        } catch (syncError) {
          return errorJson(
            500,
            syncError instanceof Error
              ? syncError.message
              : "Erreur liaison auth user / chauffeur.",
            {
              requestId: id,
              step: "save_profile_sync_chauffeur_metadata",
            }
          );
        }
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

      return successJson({
        status: updated.status,
        requestId: id,
        step: "save_employee_profile",
      });
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

      return successJson({
        status: updated.status,
        requestId: id,
        step: "reset_pending",
      });
    }

    if (action === "update_access") {
      if (requestRow.status !== "invited" && requestRow.status !== "active") {
        return errorJson(
          409,
          "Cette action est reservee aux demandes invited ou active.",
          {
            requestId: id,
            step: "validate_update_access_status",
            currentStatus: requestRow.status,
          }
        );
      }

      let employeeProfile;
      try {
        employeeProfile = await upsertEmployeeProfile({
          input: employeeProfileInput,
          requestRow,
        });
      } catch (profileError) {
        return errorJson(
          500,
          profileError instanceof Error
            ? profileError.message
            : "Erreur creation ou mise a jour chauffeur.",
          {
            requestId: id,
            step: "update_access_upsert_employee_profile",
          }
        );
      }

      let result;
      try {
        result = await upsertAccountAccess({
          requestRow,
          actorUserId: user.id,
          assignedRole,
          assignedPermissions,
          confirmOverwriteExistingAccount,
          chauffeurId: employeeProfile.id,
        });
      } catch (accessError) {
        return errorJson(
          500,
          accessError instanceof Error
            ? accessError.message
            : "Erreur creation ou liaison auth.users.",
          {
            requestId: id,
            step: "update_access_upsert_account",
          }
        );
      }

      if (!result.ok) {
        return errorJson(409, result.error, {
          requestId: id,
          step: "update_access_upsert_account",
          existingAccount: result.existingAccount,
        });
      }

      if (result.invitedUserId && employeeProfile.id) {
        try {
          await syncUserChauffeurMetadata({
            userId: result.invitedUserId,
            chauffeurId: employeeProfile.id,
          });
        } catch (syncError) {
          return errorJson(
            500,
            syncError instanceof Error
              ? syncError.message
              : "Erreur liaison auth user / chauffeur.",
            {
              requestId: id,
              step: "update_access_sync_chauffeur_metadata",
            }
          );
        }
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

      return successJson({
        status: updated.status,
        requestId: id,
        step: "update_access",
      });
    }

    if (action === "resend_invitation") {
      if (requestRow.status !== "invited") {
        return errorJson(
          409,
          "Seules les demandes invited peuvent recevoir une nouvelle invitation.",
          {
            requestId: id,
            step: "validate_resend_invitation_status",
            currentStatus: requestRow.status,
          }
        );
      }

      let employeeProfile;
      try {
        employeeProfile = await upsertEmployeeProfile({
          input: employeeProfileInput,
          requestRow,
        });
      } catch (profileError) {
        return errorJson(
          500,
          profileError instanceof Error
            ? profileError.message
            : "Erreur creation ou mise a jour chauffeur.",
          {
            requestId: id,
            step: "resend_invitation_upsert_employee_profile",
          }
        );
      }

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
        return errorJson(500, error.message, {
          requestId: id,
          step: "resend_invitation_auth_invite",
        });
      }

      if (data.user?.id && employeeProfile.id) {
        try {
          await syncUserChauffeurMetadata({
            userId: data.user.id,
            chauffeurId: employeeProfile.id,
          });
        } catch (syncError) {
          return errorJson(
            500,
            syncError instanceof Error
              ? syncError.message
              : "Erreur liaison auth user / chauffeur.",
            {
              requestId: id,
              step: "resend_invitation_sync_chauffeur_metadata",
            }
          );
        }
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

      return successJson({
        status: updated.status,
        requestId: id,
        step: "resend_invitation",
      });
    }

    if (action === "disable_access") {
      if (requestRow.status !== "active") {
        return errorJson(
          409,
          "Seules les demandes actives peuvent etre desactivees.",
          {
            requestId: id,
            step: "validate_disable_access_status",
            currentStatus: requestRow.status,
          }
        );
      }

      const existingUser = await findAuthUserByEmail(normalizeEmail(requestRow.email));

      if (!existingUser) {
        return errorJson(
          404,
          "Aucun compte associe n a ete trouve pour cette demande.",
          {
            requestId: id,
            step: "disable_access_find_existing_user",
          }
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
        return errorJson(500, error.message, {
          requestId: id,
          step: "disable_access_update_auth_user",
          authUserId: existingUser.id,
        });
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

      return successJson({
        status: updated.status,
        requestId: id,
        step: "disable_access",
      });
    }

    if (action === "retry") {
      if (requestRow.status !== "error") {
        return errorJson(
          409,
          "Seules les demandes en erreur peuvent etre relancees.",
          {
            requestId: id,
            step: "validate_retry_status",
            currentStatus: requestRow.status,
          }
        );
      }

      let employeeProfile;
      try {
        employeeProfile = await upsertEmployeeProfile({
          input: employeeProfileInput,
          requestRow,
        });
      } catch (profileError) {
        return errorJson(
          500,
          profileError instanceof Error
            ? profileError.message
            : "Erreur creation ou mise a jour chauffeur.",
          {
            requestId: id,
            step: "retry_upsert_employee_profile",
          }
        );
      }

      let result;
      try {
        result = await upsertAccountAccess({
          requestRow,
          actorUserId: user.id,
          assignedRole,
          assignedPermissions,
          confirmOverwriteExistingAccount,
          chauffeurId: employeeProfile.id,
        });
      } catch (accessError) {
        return errorJson(
          500,
          accessError instanceof Error
            ? accessError.message
            : "Erreur creation ou liaison auth.users.",
          {
            requestId: id,
            step: "retry_upsert_account",
          }
        );
      }

      if (!result.ok) {
        return errorJson(409, result.error, {
          requestId: id,
          step: "retry_upsert_account",
          existingAccount: result.existingAccount,
        });
      }

      if (result.invitedUserId && employeeProfile.id) {
        try {
          await syncUserChauffeurMetadata({
            userId: result.invitedUserId,
            chauffeurId: employeeProfile.id,
          });
        } catch (syncError) {
          return errorJson(
            500,
            syncError instanceof Error
              ? syncError.message
              : "Erreur liaison auth user / chauffeur.",
            {
              requestId: id,
              step: "retry_sync_chauffeur_metadata",
            }
          );
        }
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

      return successJson({
        status: updated.status,
        requestId: id,
        step: "retry",
      });
    }

    return errorJson(400, "Action non prise en charge.", {
      requestId: id,
      step: "unsupported_action",
      action,
    });
  } catch (error) {
    console.error("[account-requests][PATCH] unhandled error", {
      message: error instanceof Error ? error.message : "Erreur traitement demande.",
      stack: error instanceof Error ? error.stack : null,
    });
    return errorJson(
      500,
      error instanceof Error ? error.message : "Erreur traitement demande.",
      {
        step: "patch_unhandled_error",
      }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requestDebug = getAccountRequestsRequestDebug(req);
    console.info("[account-requests][DELETE] incoming request", {
      path: req.nextUrl.pathname,
      method: req.method,
      ...requestDebug,
    });

    if (!requestDebug.hasClientMarker) {
      return errorJson(
        400,
        "Appel refuse: la route /api/account-requests/[id] n accepte que les appels marques depuis le navigateur authentifie.",
        {
          step: "validate_client_marker_delete",
        }
      );
    }

    const { user, role } = await getStrictDirectionRequestUser(req);

    if (!user || role !== "direction") {
      return errorJson(403, "Acces refuse.", {
        step: "authorize_delete",
      });
    }

    const { id } = await params;
    console.info("[account-requests][DELETE] resolved request id", {
      requestId: id,
      actorUserId: user.id,
    });
    const requestRow = await loadRequestRow(id);

    if (!requestRow) {
      return errorJson(404, "Demande introuvable.", {
        requestId: id,
        step: "load_request_row_delete",
      });
    }

    const { error } = await createAdminSupabaseClient()
      .from("account_requests")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[account-requests][DELETE] delete failed", {
        requestId: id,
        error: error.message,
      });
      return errorJson(500, error.message, {
        requestId: id,
        step: "delete_account_request",
      });
    }

    return successJson({
      success: true,
      requestId: id,
      step: "delete_account_request",
      deletedRequest: {
        id: requestRow.id,
        email: requestRow.email,
        status: requestRow.status,
      },
    });
  } catch (error) {
    console.error("[account-requests][DELETE] unhandled error", {
      message: error instanceof Error ? error.message : "Erreur suppression demande.",
      stack: error instanceof Error ? error.stack : null,
    });
    return errorJson(
      500,
      error instanceof Error ? error.message : "Erreur suppression demande.",
      {
        step: "delete_unhandled_error",
      }
    );
  }
}

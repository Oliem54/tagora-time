import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  appendAuditEntry,
  createAuditEntry,
  normalizeEmail,
  readAccessDisabledFromAuthUser,
  type AccountRequestRow,
} from "@/app/lib/account-requests.shared";
import { getUserPermissions } from "@/app/lib/auth/permissions";
import { getUserRole } from "@/app/lib/auth/roles";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type ChauffeurReconcileRow = {
  id: number;
  auth_user_id: string | null;
  courriel: string | null;
  telephone: string | null;
  actif: boolean | null;
};

export class AccountReconcileError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code?: string | null) {
    super(message);
    this.status = status;
    this.code = code ?? null;
  }
}

async function findAuthUserByEmail(email: string) {
  const supabase = createAdminSupabaseClient();
  let page = 1;
  const perPage = 200;
  const normalized = normalizeEmail(email);

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const matchedUser = data.users.find((item) => normalizeEmail(item.email ?? "") === normalized);
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

async function loadChauffeurForReconcile(options: {
  employeeId?: number | null;
  email: string;
}): Promise<ChauffeurReconcileRow | null> {
  const supabase = createAdminSupabaseClient();
  const normalizedEmail = normalizeEmail(options.email);

  if (options.employeeId != null && Number.isFinite(options.employeeId) && options.employeeId > 0) {
    const { data, error } = await supabase
      .from("chauffeurs")
      .select("id, auth_user_id, courriel, telephone, actif")
      .eq("id", Math.trunc(options.employeeId))
      .maybeSingle<ChauffeurReconcileRow>();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  const { data, error } = await supabase
    .from("chauffeurs")
    .select("id, auth_user_id, courriel, telephone, actif")
    .eq("courriel", normalizedEmail)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle<ChauffeurReconcileRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

function assertAuthEmailCompatible(requestEmail: string, authUser: User) {
  const requestNormalized = normalizeEmail(requestEmail);
  const authNormalized = normalizeEmail(authUser.email ?? "");

  if (!authNormalized || requestNormalized !== authNormalized) {
    throw new AccountReconcileError(
      "Le courriel du compte auth ne correspond pas à la demande.",
      409,
      "auth_email_mismatch"
    );
  }
}

export async function reconcileExistingAccountRequest(options: {
  requestId: string;
  actorUserId: string;
  actorEmail?: string | null;
  reviewNote?: string | null;
  employeeId?: number | null;
}) {
  const requestRow = await loadRequestRow(options.requestId);

  if (!requestRow) {
    throw new AccountReconcileError("Demande introuvable.", 404, "request_not_found");
  }

  if (requestRow.status !== "pending" && requestRow.status !== "error") {
    throw new AccountReconcileError(
      "Seules les demandes en attente ou en erreur peuvent être réconciliées.",
      409,
      "invalid_request_status"
    );
  }

  const chauffeur = await loadChauffeurForReconcile({
    employeeId: options.employeeId ?? null,
    email: requestRow.email,
  });

  if (!chauffeur?.id) {
    throw new AccountReconcileError(
      "Aucune fiche employé correspondante n'a été trouvée.",
      404,
      "employee_profile_missing"
    );
  }

  const authUserId = typeof chauffeur.auth_user_id === "string" ? chauffeur.auth_user_id.trim() : "";
  if (!authUserId) {
    throw new AccountReconcileError(
      "La fiche employé n'est pas liée à un compte portail (auth_user_id manquant).",
      409,
      "auth_user_id_missing"
    );
  }

  const supabase = createAdminSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(authUserId);

  if (authError || !authData.user) {
    throw new AccountReconcileError(
      "Compte portail introuvable pour auth_user_id de la fiche employé.",
      404,
      "auth_user_not_found"
    );
  }

  const authUser = authData.user;
  assertAuthEmailCompatible(requestRow.email, authUser);

  const authByEmail = await findAuthUserByEmail(requestRow.email);
  if (authByEmail && authByEmail.id !== authUserId) {
    throw new AccountReconcileError(
      "Conflit: un autre compte auth existe pour ce courriel.",
      409,
      "auth_user_email_conflict"
    );
  }

  const assignedRole = getUserRole(authUser);
  const assignedPermissions = getUserPermissions(authUser);

  if (!assignedRole) {
    throw new AccountReconcileError(
      "Le compte portail n'a pas de rôle actif récupérable.",
      409,
      "auth_role_missing"
    );
  }

  const reviewedAt = new Date().toISOString();
  const defaultReviewNote =
    "Réconciliation automatique: demande clôturée sur compte portail et fiche employé déjà existants.";
  const reviewNote = String(options.reviewNote ?? "").trim() || defaultReviewNote;
  const previousStatus = requestRow.status;

  const auditEntry = createAuditEntry("request_reconciled_existing_account", "direction", {
    actorUserId: options.actorUserId,
    details: {
      employee_id: chauffeur.id,
      auth_user_id: authUserId,
      previous_status: previousStatus,
      reconciled_by: options.actorUserId,
      reconciled_by_email: options.actorEmail ?? null,
      reconciled_at: reviewedAt,
      assigned_role: assignedRole,
      assigned_permissions: assignedPermissions,
      access_disabled: readAccessDisabledFromAuthUser(authUser),
      employee_actif: chauffeur.actif ?? null,
    },
  });

  const { data: updatedRequest, error: updateRequestError } = await supabase
    .from("account_requests")
    .update({
      status: "active",
      invited_user_id: authUserId,
      assigned_role: assignedRole,
      assigned_permissions: assignedPermissions,
      reviewed_by: options.actorUserId,
      reviewed_at: reviewedAt,
      review_note: reviewNote,
      last_error: null,
      review_lock_token: null,
      review_started_at: null,
      audit_log: appendAuditEntry(requestRow.audit_log, auditEntry),
    })
    .eq("id", requestRow.id)
    .select("*")
    .single<AccountRequestRow>();

  if (updateRequestError) {
    throw updateRequestError;
  }

  const invitationStatus =
    chauffeur.actif === false ? "linked" : authUser.last_sign_in_at ? "active" : "linked";

  const { error: chauffeurUpdateError } = await supabase
    .from("chauffeurs")
    .update({
      account_invitation_status: invitationStatus,
      account_invitation_error: null,
    })
    .eq("id", chauffeur.id);

  if (chauffeurUpdateError) {
    console.error("[account-reconcile] chauffeur_audit_update_failed", {
      employeeId: chauffeur.id,
      message: chauffeurUpdateError.message,
    });
  }

  return {
    request: updatedRequest,
    employeeId: chauffeur.id,
    authUserId,
    assignedRole,
    assignedPermissions,
    previousStatus,
  };
}

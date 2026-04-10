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
  normalizeEmail,
  normalizePermissions,
  type AccountRequestRow,
} from "@/app/lib/account-requests.shared";
import { getStrictDirectionRequestUser } from "@/app/lib/account-requests.server";
import { getUserPermissions } from "@/app/lib/auth/permissions";
import { getUserRole, type AppRole } from "@/app/lib/auth/roles";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type AccountRequestAction =
  | "approve"
  | "refuse"
  | "update_access"
  | "reset_pending"
  | "resend_invitation"
  | "disable_access"
  | "retry";

function parseAction(value: unknown): AccountRequestAction | null {
  if (
    value === "approve" ||
    value === "refuse" ||
    value === "update_access" ||
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
  assignedPermissions: string[]
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
        full_name: requestRow.full_name,
        company: requestRow.company,
        ...companyAccessFlags,
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
    company: options.requestRow.company,
    ...buildCompanyAccessFlags(options.requestRow.company, existingAllowedCompanies),
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
          existingMetadata: existingUser.app_metadata,
        }),
        user_metadata: buildManagedUserMetadata({
          requestRow: options.requestRow,
          assignedRole: options.assignedRole,
          assignedPermissions: options.assignedPermissions,
          actorUserId: options.actorUserId,
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
      options.assignedPermissions
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getStrictDirectionRequestUser(req);

    if (!user || role !== "direction") {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const action = parseAction(body.action);

    if (!action) {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }

    if (action === "approve" || action === "refuse") {
      const locked = await acquirePendingReviewLock(id);

      if (!locked.requestRow || !locked.reviewLockToken || !locked.reviewedAt) {
        return NextResponse.json(
          {
            error: locked.lock?.isLocked
              ? "Cette demande est deja en cours de traitement par un autre membre de la direction."
              : "La demande est introuvable, deja traitee ou indisponible.",
            lock: locked.lock,
          },
          { status: 409 }
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
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, status: "refused" });
      }

      const approvalResult = await upsertAccountAccess({
        requestRow,
        actorUserId: user.id,
        assignedRole,
        assignedPermissions,
        confirmOverwriteExistingAccount,
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

        return NextResponse.json(
          {
            error: approvalResult.error,
            existingAccount: approvalResult.existingAccount,
          },
          { status: 409 }
        );
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
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        status: approvalResult.finalStatus,
      });
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

      const result = await upsertAccountAccess({
        requestRow,
        actorUserId: user.id,
        assignedRole,
        assignedPermissions,
        confirmOverwriteExistingAccount,
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

      const invitation = buildInvitationPayload(
        requestRow,
        assignedRole,
        assignedPermissions
      );
      const { data, error } = await createAdminSupabaseClient().auth.admin.inviteUserByEmail(
        invitation.email,
        invitation.options
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
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

      const result = await upsertAccountAccess({
        requestRow,
        actorUserId: user.id,
        assignedRole,
        assignedPermissions,
        confirmOverwriteExistingAccount,
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur traitement demande.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

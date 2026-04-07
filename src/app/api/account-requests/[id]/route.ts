import { NextRequest, NextResponse } from "next/server";
import {
  ACCOUNT_REVIEW_LOCK_WINDOW_MS,
  appendAuditEntry,
  buildExistingAccountSnapshot,
  createAuditEntry,
  getReviewLockMetadata,
  getStrictDirectionRequestUser,
  hasUserActivatedAccess,
  normalizeEmail,
  normalizePermissions,
} from "@/app/lib/account-requests";
import { getUserPermissions } from "@/app/lib/auth/permissions";
import { getUserRole } from "@/app/lib/auth/roles";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

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
    const body = await req.json();
    const action = body.action === "approve" ? "approve" : "refuse";
    const assignedRole =
      body.assignedRole === "employe" || body.assignedRole === "direction"
        ? body.assignedRole
        : null;
    const assignedPermissions = normalizePermissions(body.assignedPermissions);
    const reviewNote = String(body.reviewNote ?? "").trim() || null;
    const confirmOverwriteExistingAccount =
      body.confirmOverwriteExistingAccount === true;

    const supabase = createAdminSupabaseClient();
    const reviewLockToken = crypto.randomUUID();
    const reviewedAt = new Date().toISOString();
    const lockExpiryCutoff = new Date(
      Date.now() - ACCOUNT_REVIEW_LOCK_WINDOW_MS
    ).toISOString();

    const { data: requestRow, error: requestError } = await supabase
      .from("account_requests")
      .update({
        review_lock_token: reviewLockToken,
        review_started_at: reviewedAt,
      })
      .eq("id", id)
      .eq("status", "pending")
      .or(
        `review_lock_token.is.null,review_started_at.lt.${lockExpiryCutoff}`
      )
      .select("*")
      .single();

    if (requestError || !requestRow) {
      const { data: lockedRow } = await supabase
        .from("account_requests")
        .select("status, review_started_at")
        .eq("id", id)
        .maybeSingle();

      const lockMetadata = getReviewLockMetadata(
        lockedRow?.review_started_at ?? null
      );

      return NextResponse.json(
        {
          error: lockMetadata.isLocked
            ? "Cette demande est deja en cours de traitement par un autre membre de la direction."
            : "La demande est introuvable, deja traitee ou indisponible.",
          lock: lockMetadata,
        },
        { status: 409 }
      );
    }

    const previousAssignedRole = requestRow.assigned_role ?? null;
    const previousAssignedPermissions = requestRow.assigned_permissions ?? [];

    if (action === "refuse") {
      const { error } = await supabase
        .from("account_requests")
        .update({
          status: "refused",
          assigned_role: assignedRole,
          assigned_permissions: assignedPermissions,
          review_note: reviewNote,
          reviewed_by: user.id,
          reviewed_at: reviewedAt,
          review_lock_token: null,
          review_started_at: null,
          last_error: null,
          audit_log: appendAuditEntry(
            appendAuditEntry(
              requestRow.audit_log,
              createAuditEntry("review_locked", "direction", {
                actorUserId: user.id,
                details: {
                  action,
                },
              })
            ),
            createAuditEntry("request_refused", "direction", {
              actorUserId: user.id,
              details: {
                previousAssignedRole,
                previousAssignedPermissions,
                assignedRole,
                assignedPermissions,
                reason: reviewNote,
                decisionMaker: user.email ?? user.id,
              },
            })
          ),
        })
        .eq("id", id)
        .eq("review_lock_token", reviewLockToken);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    if (!assignedRole) {
      return NextResponse.json(
        { error: "Le role attribue est obligatoire pour approuver." },
        { status: 400 }
      );
    }

    try {
      const normalizedEmail = normalizeEmail(requestRow.email);
      const existingUser = await findAuthUserByEmail(normalizedEmail);
      const existingRole = getUserRole(existingUser);
      const existingPermissions = getUserPermissions(existingUser);

      if (existingUser && !confirmOverwriteExistingAccount) {
        await supabase
          .from("account_requests")
          .update({
            review_lock_token: null,
            review_started_at: null,
          })
          .eq("id", id)
          .eq("review_lock_token", reviewLockToken);

        return NextResponse.json(
          {
            error:
              "Un compte existe deja pour ce courriel. Confirmez explicitement l ecrasement du role et des permissions pour continuer.",
            existingAccount: buildExistingAccountSnapshot(existingUser),
          },
          { status: 409 }
        );
      }

      let finalStatus: "invited" | "active" = "invited";
      let invitedUserId: string | null = null;
      let invitationResult = "not_required";

      if (existingUser) {
        const { error: updateUserError } = await supabase.auth.admin.updateUserById(
          existingUser.id,
          {
            app_metadata: {
              ...existingUser.app_metadata,
              role: assignedRole,
              permissions: assignedPermissions,
            },
            user_metadata: {
              ...existingUser.user_metadata,
              role: assignedRole,
              permissions: assignedPermissions,
              approved_from_request: true,
              approved_at: reviewedAt,
              approved_by: user.id,
            },
          }
        );

        if (updateUserError) {
          throw updateUserError;
        }

        invitedUserId = existingUser.id;
        finalStatus = hasUserActivatedAccess(existingUser) ? "active" : "invited";
        invitationResult = "existing_account_updated";
      } else {
        const redirectBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
        const redirectTo = redirectBase
          ? `${redirectBase}/${assignedRole}/login`
          : undefined;

        const { data: invitedUserData, error: inviteUserError } =
          await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
            data: {
              role: assignedRole,
              permissions: assignedPermissions,
              full_name: requestRow.full_name,
              company: requestRow.company,
              requested_from: requestRow.portal_source,
            },
            redirectTo,
          });

        if (inviteUserError) {
          throw inviteUserError;
        }

        invitedUserId = invitedUserData.user?.id ?? null;
        finalStatus = "invited";
        invitationResult = invitedUserId ? "invite_sent" : "invite_created_without_user_id";
      }

      const eventName =
        finalStatus === "active" ? "request_activated" : "request_invited";

      const { error: updateError } = await supabase
        .from("account_requests")
        .update({
          status: finalStatus,
          assigned_role: assignedRole,
          assigned_permissions: assignedPermissions,
          review_note: reviewNote,
          reviewed_by: user.id,
          reviewed_at: reviewedAt,
          invited_user_id: invitedUserId,
          review_lock_token: null,
          review_started_at: null,
          last_error: null,
          audit_log: appendAuditEntry(
            appendAuditEntry(
              requestRow.audit_log,
              createAuditEntry("review_locked", "direction", {
                actorUserId: user.id,
                details: {
                  action,
                },
              })
            ),
            createAuditEntry(eventName, "direction", {
              actorUserId: user.id,
              details: {
                previousAssignedRole,
                previousAssignedPermissions,
                previousAuthRole: existingRole,
                previousAuthPermissions: existingPermissions,
                assignedRole,
                assignedPermissions,
                newRole: assignedRole,
                newPermissions: assignedPermissions,
                reason: reviewNote,
                decisionMaker: user.email ?? user.id,
                invitedUserId,
                hadExistingAccount: Boolean(existingUser),
                invitationResult,
              },
            })
          ),
        })
        .eq("id", id)
        .eq("review_lock_token", reviewLockToken);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, status: finalStatus });
    } catch (approvalError) {
      const errorMessage =
        approvalError instanceof Error
          ? approvalError.message
          : "Erreur approbation demande.";

      await supabase
        .from("account_requests")
        .update({
          status: "error",
          assigned_role: assignedRole,
          assigned_permissions: assignedPermissions,
          review_note: reviewNote,
          reviewed_by: user.id,
          reviewed_at: reviewedAt,
          review_lock_token: null,
          review_started_at: null,
          last_error: errorMessage,
          audit_log: appendAuditEntry(
            appendAuditEntry(
              requestRow.audit_log,
              createAuditEntry("review_locked", "direction", {
                actorUserId: user.id,
                details: {
                  action,
                },
              })
            ),
            createAuditEntry("request_error", "direction", {
              actorUserId: user.id,
              details: {
                previousAssignedRole,
                previousAssignedPermissions,
                assignedRole,
                assignedPermissions,
                newRole: assignedRole,
                newPermissions: assignedPermissions,
                reason: reviewNote,
                decisionMaker: user.email ?? user.id,
                errorMessage,
              },
            })
          ),
        })
        .eq("id", id)
        .eq("review_lock_token", reviewLockToken);

      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
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

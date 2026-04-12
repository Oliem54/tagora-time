import { NextRequest, NextResponse } from "next/server";
import {
  appendAuditEntry,
  buildCompanyAccessFlags,
  createAuditEntry,
  hasUserActivatedAccess,
  normalizeEmail,
  type AccountRequestRow,
} from "@/app/lib/account-requests.shared";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { getUserPermissions } from "@/app/lib/auth/permissions";
import { getUserRole } from "@/app/lib/auth/roles";

async function loadMatchingRequest(userId: string, email: string) {
  const supabase = createAdminSupabaseClient();

  const byUserId = await supabase
    .from("account_requests")
    .select("*")
    .eq("invited_user_id", userId)
    .in("status", ["invited", "active"])
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AccountRequestRow>();

  if (byUserId.error) {
    throw byUserId.error;
  }

  if (byUserId.data) {
    return byUserId.data;
  }

  const byEmail = await supabase
    .from("account_requests")
    .select("*")
    .eq("email", normalizeEmail(email))
    .in("status", ["invited", "active"])
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AccountRequestRow>();

  if (byEmail.error) {
    throw byEmail.error;
  }

  return byEmail.data;
}

function buildSynchronizedMetadata(options: {
  requestRow: AccountRequestRow;
  status: "invited" | "active";
  role: ReturnType<typeof getUserRole>;
  permissions: ReturnType<typeof getUserPermissions>;
  existingMetadata?: Record<string, unknown> | null;
}) {
  const existingAllowedCompanies = Array.isArray(
    options.existingMetadata?.allowed_companies
  )
    ? options.existingMetadata.allowed_companies
    : [options.requestRow.company];

  return {
    ...options.existingMetadata,
    role: options.role ?? options.requestRow.assigned_role ?? options.requestRow.requested_role,
    permissions:
      options.permissions.length > 0
        ? options.permissions
        : (options.requestRow.assigned_permissions ??
            options.requestRow.requested_permissions ??
            []),
    company: options.requestRow.company,
    ...buildCompanyAccessFlags(options.requestRow.company, existingAllowedCompanies),
    access_disabled: false,
    account_request_status_sync: options.status,
    account_request_synced_at: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedRequestUser(req);

    if (!user?.id || !user.email) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: adminUserData, error: adminUserError } =
      await supabase.auth.admin.getUserById(user.id);

    if (adminUserError || !adminUserData.user) {
      return NextResponse.json(
        { error: adminUserError?.message ?? "Utilisateur introuvable." },
        { status: 404 }
      );
    }

    const adminUser = adminUserData.user;
    const requestRow = await loadMatchingRequest(adminUser.id, adminUser.email ?? user.email);

    if (!requestRow) {
      return NextResponse.json({ success: true, synchronized: false });
    }

    const role = getUserRole(adminUser);
    const permissions = getUserPermissions(adminUser);
    const activationDetected = hasUserActivatedAccess(adminUser);
    const nextStatus =
      activationDetected && requestRow.status === "invited"
        ? "active"
        : requestRow.status;
    const metadataStatus: "invited" | "active" =
      nextStatus === "active" ? "active" : "invited";

    const nowIso = new Date().toISOString();

    const { error: userUpdateError } = await supabase.auth.admin.updateUserById(
      adminUser.id,
      {
        app_metadata: buildSynchronizedMetadata({
          requestRow,
          status: metadataStatus,
          role,
          permissions,
          existingMetadata: adminUser.app_metadata,
        }),
        user_metadata: buildSynchronizedMetadata({
          requestRow,
          status: metadataStatus,
          role,
          permissions,
          existingMetadata: adminUser.user_metadata,
        }),
      }
    );

    if (userUpdateError) {
      throw userUpdateError;
    }

    if (nextStatus !== requestRow.status) {
      const { error: requestUpdateError } = await supabase
        .from("account_requests")
        .update({
          status: nextStatus,
          reviewed_at: requestRow.reviewed_at ?? nowIso,
          invited_user_id: requestRow.invited_user_id ?? adminUser.id,
          last_error: null,
          audit_log: appendAuditEntry(
            requestRow.audit_log,
            createAuditEntry("request_activated", "system", {
              actorUserId: adminUser.id,
              details: {
                automaticActivation: true,
                lastSignInAt: adminUser.last_sign_in_at ?? null,
                emailConfirmedAt:
                  adminUser.email_confirmed_at ?? adminUser.confirmed_at ?? null,
              },
            })
          ),
        })
        .eq("id", requestRow.id);

      if (requestUpdateError) {
        throw requestUpdateError;
      }
    }

    return NextResponse.json({
      success: true,
      synchronized: true,
      requestId: requestRow.id,
      status: nextStatus,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur synchronisation activation.",
      },
      { status: 500 }
    );
  }
}

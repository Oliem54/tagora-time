import "server-only";

import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { HORORA_MEMBERSHIP_STATUS_AUDIT_RPC } from "@/app/lib/auth/horora-premium-user-central.shared";

export type MembershipStatusCommitResult =
  | { ok: true; status: "active" | "suspended"; audited: boolean; unchanged: boolean }
  | { ok: false; statusCode: number; error: string; code: string };

function failure(code: string): MembershipStatusCommitResult {
  if (/schema cache|could not find the function/i.test(code)) {
    return {
      ok: false,
      statusCode: 503,
      code: "status_writer_unavailable",
      error: "La suspension auditée n'est pas installée. Rien n'a été modifié.",
    };
  }
  if (code.includes("actor_forbidden") || code.includes("protected_account_forbidden")) {
    return {
      ok: false,
      statusCode: 403,
      code: "actor_forbidden",
      error: "Cette appartenance ne peut pas être suspendue.",
    };
  }
  if (code.includes("cross_tenant_conflict")) {
    return {
      ok: false,
      statusCode: 403,
      code: "cross_organization_forbidden",
      error: "Le compte appartient à une autre organisation.",
    };
  }
  if (code.includes("self_role_change_forbidden")) {
    return {
      ok: false,
      statusCode: 403,
      code: "self_change_forbidden",
      error: "Vous ne pouvez pas modifier votre propre accès.",
    };
  }
  return {
    ok: false,
    statusCode: 409,
    code: "status_write_failed",
    error: "Le statut n'a pas été modifié.",
  };
}

export async function commitAuditedMembershipStatus(input: {
  actorUserId: string;
  organizationId: string;
  targetUserId: string;
  nextStatus: "active" | "suspended";
  reason: string;
}): Promise<MembershipStatusCommitResult> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc(HORORA_MEMBERSHIP_STATUS_AUDIT_RPC, {
    p_actor_user_id: input.actorUserId,
    p_organization_id: input.organizationId,
    p_target_user_id: input.targetUserId,
    p_next_status: input.nextStatus,
    p_reason: input.reason,
  });
  if (error) return failure(error.message ?? "status_write_failed");
  const payload = (data ?? null) as {
    ok?: boolean;
    status?: string;
    audited?: boolean;
    action?: string;
  } | null;
  if (!payload || payload.ok !== true || payload.status !== input.nextStatus) {
    return failure("status_write_failed");
  }
  return {
    ok: true,
    status: input.nextStatus,
    audited: payload.action === "noop" ? false : payload.audited === true,
    unchanged: payload.action === "noop",
  };
}

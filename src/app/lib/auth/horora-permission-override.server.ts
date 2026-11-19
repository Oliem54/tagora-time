import "server-only";

import type { HororaAccessCapability } from "@/app/lib/auth/horora-role-model.shared";
import { HORORA_PERMISSION_OVERRIDE_AUDIT_RPC } from "@/app/lib/auth/horora-premium-user-central.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export async function readExplicitCapabilityOverride(input: {
  organizationId: string;
  userId: string;
  capability: HororaAccessCapability;
}): Promise<"allow" | "deny" | null> {
  try {
    const supabase = createAdminSupabaseClient();
    const result = await supabase
      .from("horora_permission_overrides")
      .select("effect")
      .eq("organization_id", input.organizationId)
      .eq("user_id", input.userId)
      .eq("capability", input.capability)
      .maybeSingle();
    if (result.error) return null;
    if (result.data?.effect === "deny" || result.data?.effect === "allow") {
      return result.data.effect;
    }
    return null;
  } catch {
    return null;
  }
}

export type PermissionOverrideCommitResult =
  | { ok: true; audited: boolean }
  | { ok: false; statusCode: number; error: string; code: string };

export async function commitAuditedPermissionOverride(input: {
  actorUserId: string;
  organizationId: string;
  targetUserId: string;
  capability: HororaAccessCapability;
  effect: "allow" | "deny";
  reason: string;
}): Promise<PermissionOverrideCommitResult> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc(HORORA_PERMISSION_OVERRIDE_AUDIT_RPC, {
    p_actor_user_id: input.actorUserId,
    p_organization_id: input.organizationId,
    p_target_user_id: input.targetUserId,
    p_capability: input.capability,
    p_effect: input.effect,
    p_reason: input.reason,
  });
  if (error) {
    const message = error.message ?? "";
    if (/schema cache|could not find the function/i.test(message)) {
      return {
        ok: false,
        statusCode: 503,
        code: "permission_writer_unavailable",
        error: "L'enregistrement des permissions n'est pas installé. Rien n'a été modifié.",
      };
    }
    if (message.includes("privilege_escalation_forbidden")) {
      return {
        ok: false,
        statusCode: 403,
        code: "privilege_escalation_forbidden",
        error: "Cette case ne peut pas accorder un droit refusé par le rôle.",
      };
    }
    return {
      ok: false,
      statusCode: 409,
      code: "permission_write_failed",
      error: "La permission n'a pas été modifiée.",
    };
  }
  const payload = (data ?? null) as { ok?: boolean; audited?: boolean } | null;
  if (!payload || payload.ok !== true || payload.audited !== true) {
    return {
      ok: false,
      statusCode: 409,
      code: "permission_write_failed",
      error: "La permission n'a pas été auditée. Rien n'est confirmé.",
    };
  }
  return { ok: true, audited: true };
}

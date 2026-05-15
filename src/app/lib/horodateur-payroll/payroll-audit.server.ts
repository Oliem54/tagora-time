import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getUserDisplayName } from "@/app/lib/livraisons/audit-stamp.server";
import type {
  PayrollAuditActorRole,
  PayrollPermissionScope,
} from "@/app/lib/horodateur-payroll/types";

export type WritePayrollAuditLogInput = {
  supabase: SupabaseClient;
  employeeId: number;
  entityType: string;
  entityId: string;
  action: string;
  permissionScope: PayrollPermissionScope;
  actorRole: PayrollAuditActorRole;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
  user: User;
  userDisplayName?: string | null;
};

export async function writePayrollAuditLog(input: WritePayrollAuditLogInput) {
  const createdByName = input.userDisplayName?.trim() || getUserDisplayName(input.user);

  const { error } = await input.supabase.from("horodateur_payroll_audit_logs").insert({
    employee_id: input.employeeId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    permission_scope: input.permissionScope,
    actor_role: input.actorRole,
    old_value: input.oldValue ?? null,
    new_value: input.newValue ?? null,
    reason: input.reason?.trim() || null,
    created_by_user_id: input.user.id,
    created_by_name: createdByName,
  });

  if (error) {
    console.error("[horodateur-payroll] audit insert failed:", error.message);
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}

export function snapshotPayrollSettings(
  row: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!row) return null;
  return {
    payroll_hourly_rate: row.payroll_hourly_rate ?? null,
    vacation_rate_percent: row.vacation_rate_percent ?? 4,
    vacation_rate_is_custom: row.vacation_rate_is_custom ?? false,
    vacation_opening_balance_amount: row.vacation_opening_balance_amount ?? 0,
    vacation_opening_balance_date: row.vacation_opening_balance_date ?? null,
    vacation_adjustment_note: row.vacation_adjustment_note ?? null,
    holiday_opening_balance_amount: row.holiday_opening_balance_amount ?? 0,
    opening_balance_note: row.opening_balance_note ?? null,
  };
}

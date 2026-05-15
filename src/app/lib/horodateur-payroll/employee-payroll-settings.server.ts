import "server-only";

import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildUpdateStamp } from "@/app/lib/livraisons/audit-stamp.server";
import type { FinancialPayrollSettingField } from "@/app/lib/horodateur-payroll/types";
import type {
  EmployeePayrollSettingsDto,
  EmployeePayrollSettingsRow,
  PayrollAuditActorRole,
} from "@/app/lib/horodateur-payroll/types";
import {
  snapshotPayrollSettings,
  writePayrollAuditLog,
} from "@/app/lib/horodateur-payroll/payroll-audit.server";

const SETTINGS_SELECT =
  "employee_id, payroll_hourly_rate, vacation_rate_percent, vacation_rate_is_custom, vacation_opening_balance_amount, vacation_opening_balance_date, vacation_adjustment_note, holiday_opening_balance_amount, opening_balance_note, updated_by_user_id, updated_by_name, updated_at, created_at";

function defaultSettingsDto(employeeId: number, readOnly: boolean): EmployeePayrollSettingsDto {
  return {
    employee_id: employeeId,
    payroll_hourly_rate: null,
    vacation_rate_percent: 4,
    vacation_rate_is_custom: false,
    vacation_opening_balance_amount: 0,
    vacation_opening_balance_date: null,
    vacation_adjustment_note: null,
    holiday_opening_balance_amount: 0,
    opening_balance_note: null,
    updated_by_user_id: null,
    updated_by_name: null,
    updated_at: null,
    created_at: null,
    read_only: readOnly,
  };
}

function rowToDto(row: EmployeePayrollSettingsRow, readOnly: boolean): EmployeePayrollSettingsDto {
  return {
    employee_id: row.employee_id,
    payroll_hourly_rate: row.payroll_hourly_rate,
    vacation_rate_percent: Number(row.vacation_rate_percent),
    vacation_rate_is_custom: row.vacation_rate_is_custom,
    vacation_opening_balance_amount: Number(row.vacation_opening_balance_amount),
    vacation_opening_balance_date: row.vacation_opening_balance_date,
    vacation_adjustment_note: row.vacation_adjustment_note,
    holiday_opening_balance_amount: Number(row.holiday_opening_balance_amount),
    opening_balance_note: row.opening_balance_note,
    updated_by_user_id: row.updated_by_user_id,
    updated_by_name: row.updated_by_name,
    updated_at: row.updated_at,
    created_at: row.created_at,
    read_only: readOnly,
  };
}

export async function assertEmployeeExists(supabase: SupabaseClient, employeeId: number) {
  const { data, error } = await supabase
    .from("chauffeurs")
    .select("id")
    .eq("id", employeeId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, message: error.message, status: 400 };
  }
  if (!data) {
    return { ok: false as const, message: "Employe introuvable.", status: 404 };
  }
  return { ok: true as const };
}

export async function getEmployeePayrollSettings(
  supabase: SupabaseClient,
  employeeId: number,
  options: { readOnly: boolean }
): Promise<{ ok: true; settings: EmployeePayrollSettingsDto } | { ok: false; message: string; status: number }> {
  const exists = await assertEmployeeExists(supabase, employeeId);
  if (!exists.ok) {
    return { ok: false, message: exists.message, status: exists.status };
  }

  const { data, error } = await supabase
    .from("employee_payroll_settings")
    .select(SETTINGS_SELECT)
    .eq("employee_id", employeeId)
    .maybeSingle<EmployeePayrollSettingsRow>();

  if (error) {
    return { ok: false, message: error.message, status: 400 };
  }

  if (!data) {
    return { ok: true, settings: defaultSettingsDto(employeeId, options.readOnly) };
  }

  return { ok: true, settings: rowToDto(data, options.readOnly) };
}

export async function updateEmployeePayrollSettings(
  supabase: SupabaseClient,
  employeeId: number,
  payload: Partial<Record<FinancialPayrollSettingField, unknown>>,
  options: {
    user: User;
    actorRole: PayrollAuditActorRole;
    reason?: string | null;
  }
): Promise<
  | { ok: true; settings: EmployeePayrollSettingsDto }
  | { ok: false; message: string; status: number; code?: string }
> {
  const exists = await assertEmployeeExists(supabase, employeeId);
  if (!exists.ok) {
    return { ok: false, message: exists.message, status: exists.status };
  }

  const { data: existing, error: fetchError } = await supabase
    .from("employee_payroll_settings")
    .select(SETTINGS_SELECT)
    .eq("employee_id", employeeId)
    .maybeSingle<EmployeePayrollSettingsRow>();

  if (fetchError) {
    return { ok: false, message: fetchError.message, status: 400 };
  }

  const oldSnapshot = snapshotPayrollSettings(
    existing ? (existing as unknown as Record<string, unknown>) : null
  );

  const stamp = buildUpdateStamp(options.user);
  const upsertBody: Record<string, unknown> = {
    employee_id: employeeId,
    ...payload,
    updated_by_user_id: stamp.updated_by_user_id,
    updated_by_name: stamp.updated_by_name,
    updated_at: stamp.updated_at,
  };

  if (!existing) {
    upsertBody.created_at = stamp.updated_at;
  }

  const { data: saved, error: saveError } = await supabase
    .from("employee_payroll_settings")
    .upsert(upsertBody, { onConflict: "employee_id" })
    .select(SETTINGS_SELECT)
    .single<EmployeePayrollSettingsRow>();

  if (saveError) {
    return { ok: false, message: saveError.message, status: 400 };
  }

  const newSnapshot = snapshotPayrollSettings(saved as unknown as Record<string, unknown>);
  await writePayrollAuditLog({
    supabase,
    employeeId,
    entityType: "employee_payroll_settings",
    entityId: String(employeeId),
    action: existing ? "update" : "create",
    permissionScope: "financial",
    actorRole: options.actorRole,
    oldValue: oldSnapshot,
    newValue: newSnapshot,
    reason: options.reason,
    user: options.user,
  });

  return { ok: true, settings: rowToDto(saved, false) };
}

export function parseEmployeeIdParam(raw: string | undefined): number | null {
  const id = Number(String(raw ?? "").trim());
  if (!Number.isFinite(id) || id < 1) {
    return null;
  }
  return id;
}

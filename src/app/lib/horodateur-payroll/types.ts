import "server-only";

export const PAYROLL_AUDIT_ACTOR_ROLES = ["direction", "admin", "employe", "system"] as const;
export type PayrollAuditActorRole = (typeof PAYROLL_AUDIT_ACTOR_ROLES)[number];

export const PAYROLL_PERMISSION_SCOPES = ["operational", "financial"] as const;
export type PayrollPermissionScope = (typeof PAYROLL_PERMISSION_SCOPES)[number];

export const STANDARD_VACATION_RATES = [4, 6, 8] as const;

/** Champs modifiables uniquement par administrateur (API /api/admin/horodateur-payroll/). */
export const FINANCIAL_PAYROLL_SETTING_FIELDS = [
  "payroll_hourly_rate",
  "vacation_rate_percent",
  "vacation_rate_is_custom",
  "vacation_opening_balance_amount",
  "vacation_opening_balance_date",
  "vacation_adjustment_note",
  "holiday_opening_balance_amount",
  "opening_balance_note",
] as const;

export type FinancialPayrollSettingField = (typeof FINANCIAL_PAYROLL_SETTING_FIELDS)[number];

export type EmployeePayrollSettingsRow = {
  employee_id: number;
  payroll_hourly_rate: number | null;
  vacation_rate_percent: number;
  vacation_rate_is_custom: boolean;
  vacation_opening_balance_amount: number;
  vacation_opening_balance_date: string | null;
  vacation_adjustment_note: string | null;
  holiday_opening_balance_amount: number;
  opening_balance_note: string | null;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  updated_at: string;
  created_at: string;
};

export type EmployeePayrollSettingsDto = {
  employee_id: number;
  payroll_hourly_rate: number | null;
  vacation_rate_percent: number;
  vacation_rate_is_custom: boolean;
  vacation_opening_balance_amount: number;
  vacation_opening_balance_date: string | null;
  vacation_adjustment_note: string | null;
  holiday_opening_balance_amount: number;
  opening_balance_note: string | null;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  updated_at: string | null;
  created_at: string | null;
  read_only: boolean;
};

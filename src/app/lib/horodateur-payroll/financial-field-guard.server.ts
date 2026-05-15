import "server-only";

import {
  FINANCIAL_PAYROLL_SETTING_FIELDS,
  STANDARD_VACATION_RATES,
  type FinancialPayrollSettingField,
} from "@/app/lib/horodateur-payroll/types";

export type FinancialFieldGuardResult =
  | { ok: true; payload: Partial<Record<FinancialPayrollSettingField, unknown>> }
  | { ok: false; message: string; code: string; rejectedFields?: string[] };

const FINANCIAL_FIELD_SET = new Set<string>(FINANCIAL_PAYROLL_SETTING_FIELDS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rejette toute tentative de modification de champs financiers hors rôle admin.
 * À appeler sur le corps PATCH avant persistance.
 */
export function assertFinancialFieldsAllowedForRole(
  body: unknown,
  role: "admin" | "direction" | "employe" | null
): FinancialFieldGuardResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: "Corps JSON invalide.", code: "INVALID_BODY" };
  }

  const keys = Object.keys(body);
  const financialKeys = keys.filter((k) => FINANCIAL_FIELD_SET.has(k));

  if (financialKeys.length === 0) {
    return { ok: false, message: "Aucun champ financier a modifier.", code: "EMPTY_PATCH" };
  }

  if (role !== "admin") {
    return {
      ok: false,
      message:
        "Modification financiere reservee aux administrateurs. La direction ne peut pas modifier ces champs.",
      code: "HORODATEUR_FINANCIAL_ADMIN_ONLY",
      rejectedFields: financialKeys,
    };
  }

  const payload: Partial<Record<FinancialPayrollSettingField, unknown>> = {};
  for (const key of financialKeys) {
    payload[key as FinancialPayrollSettingField] = body[key];
  }

  const validation = validateFinancialPayload(payload);
  if (!validation.ok) {
    return validation;
  }

  return { ok: true, payload: validation.payload };
}

/**
 * Détecte des champs financiers dans un corps générique (ex. route partagée).
 * Retourne les clés rejetées si le rôle n'est pas admin.
 */
export function rejectFinancialKeysInBody(
  body: unknown,
  role: "admin" | "direction" | "employe" | null
): { allowed: true } | { allowed: false; rejectedFields: string[]; code: string } {
  if (!isPlainObject(body)) {
    return { allowed: true };
  }
  const rejected = Object.keys(body).filter((k) => FINANCIAL_FIELD_SET.has(k));
  if (rejected.length === 0) {
    return { allowed: true };
  }
  if (role === "admin") {
    return { allowed: true };
  }
  return {
    allowed: false,
    rejectedFields: rejected,
    code: "HORODATEUR_FINANCIAL_ADMIN_ONLY",
  };
}

function parseOptionalNumber(
  value: unknown,
  field: string,
  options?: { min?: number; max?: number; allowNull?: boolean }
): { ok: true; value: number | null } | { ok: false; message: string; code: string } {
  if (value === null || value === undefined) {
    if (options?.allowNull) {
      return { ok: true, value: null };
    }
    return { ok: false, message: `${field} est requis.`, code: "INVALID_FIELD" };
  }
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return { ok: false, message: `${field} doit etre un nombre.`, code: "INVALID_FIELD" };
  }
  if (options?.min != null && num < options.min) {
    return { ok: false, message: `${field} doit etre >= ${options.min}.`, code: "INVALID_FIELD" };
  }
  if (options?.max != null && num > options.max) {
    return { ok: false, message: `${field} doit etre <= ${options.max}.`, code: "INVALID_FIELD" };
  }
  return { ok: true, value: num };
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseOptionalDateString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return undefined;
  }
  return value.trim();
}

function parseOptionalText(value: unknown, maxLen: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > maxLen) return undefined;
  return trimmed.length ? trimmed : null;
}

export function validateFinancialPayload(
  payload: Partial<Record<FinancialPayrollSettingField, unknown>>
): FinancialFieldGuardResult {
  const out: Partial<Record<FinancialPayrollSettingField, unknown>> = {};

  if ("payroll_hourly_rate" in payload) {
    const parsed = parseOptionalNumber(payload.payroll_hourly_rate, "payroll_hourly_rate", {
      min: 0,
      allowNull: true,
    });
    if (!parsed.ok) return parsed;
    out.payroll_hourly_rate = parsed.value;
  }

  if ("vacation_rate_percent" in payload) {
    const parsed = parseOptionalNumber(payload.vacation_rate_percent, "vacation_rate_percent", {
      min: 0,
      max: 100,
    });
    if (!parsed.ok) return parsed;
    out.vacation_rate_percent = parsed.value;
  }

  if ("vacation_rate_is_custom" in payload) {
    const b = parseOptionalBoolean(payload.vacation_rate_is_custom);
    if (b === undefined) {
      return {
        ok: false,
        message: "vacation_rate_is_custom doit etre un booleen.",
        code: "INVALID_FIELD",
      };
    }
    out.vacation_rate_is_custom = b;
  }

  if ("vacation_opening_balance_amount" in payload) {
    const parsed = parseOptionalNumber(
      payload.vacation_opening_balance_amount,
      "vacation_opening_balance_amount",
      { min: 0 }
    );
    if (!parsed.ok) return parsed;
    out.vacation_opening_balance_amount = parsed.value;
  }

  if ("vacation_opening_balance_date" in payload) {
    const d = parseOptionalDateString(payload.vacation_opening_balance_date);
    if (d === undefined && payload.vacation_opening_balance_date !== undefined) {
      return {
        ok: false,
        message: "vacation_opening_balance_date doit etre YYYY-MM-DD ou null.",
        code: "INVALID_FIELD",
      };
    }
    if (d !== undefined) out.vacation_opening_balance_date = d;
  }

  if ("vacation_adjustment_note" in payload) {
    const t = parseOptionalText(payload.vacation_adjustment_note, 2000);
    if (t === undefined && payload.vacation_adjustment_note !== undefined) {
      return { ok: false, message: "vacation_adjustment_note invalide.", code: "INVALID_FIELD" };
    }
    if (t !== undefined) out.vacation_adjustment_note = t;
  }

  if ("holiday_opening_balance_amount" in payload) {
    const parsed = parseOptionalNumber(
      payload.holiday_opening_balance_amount,
      "holiday_opening_balance_amount",
      { min: 0 }
    );
    if (!parsed.ok) return parsed;
    out.holiday_opening_balance_amount = parsed.value;
  }

  if ("opening_balance_note" in payload) {
    const t = parseOptionalText(payload.opening_balance_note, 2000);
    if (t === undefined && payload.opening_balance_note !== undefined) {
      return { ok: false, message: "opening_balance_note invalide.", code: "INVALID_FIELD" };
    }
    if (t !== undefined) out.opening_balance_note = t;
  }

  const isCustom =
    (out.vacation_rate_is_custom as boolean | undefined) ??
    (payload.vacation_rate_is_custom as boolean | undefined);
  const rate =
    (out.vacation_rate_percent as number | undefined) ??
    (payload.vacation_rate_percent as number | undefined);

  if (rate != null && isCustom === false) {
    const standard = STANDARD_VACATION_RATES as readonly number[];
    if (!standard.includes(rate)) {
      return {
        ok: false,
        message: `vacation_rate_percent doit etre 4, 6 ou 8 lorsque vacation_rate_is_custom est false.`,
        code: "INVALID_VACATION_RATE",
      };
    }
  }

  return { ok: true, payload: out };
}

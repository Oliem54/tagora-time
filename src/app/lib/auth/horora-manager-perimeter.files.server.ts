import "server-only";

import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

/**
 * Read-only employee-file facts for the manager perimeter.
 * Department and organization come from `chauffeurs`, never from the request.
 */

export type HororaEmployeePerimeterFile = {
  organizationId: string | null;
  departmentKey: string | null;
};

type LookupFailure = { ok: false; reason: "lookup_failed" };

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function keysFromEmployeeFile(row: {
  effectifs_department_key?: unknown;
  effectifs_secondary_department_keys?: unknown;
}): string[] {
  const keys: string[] = [];
  const primary = clean(row.effectifs_department_key);
  if (primary) keys.push(primary);
  const secondary = row.effectifs_secondary_department_keys;
  if (!Array.isArray(secondary)) return keys;
  for (const item of secondary) {
    const key = clean(item);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function asEmployeeId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

export async function readHororaExceptionEmployeeId(
  exceptionId: string
): Promise<{ ok: true; employeeId: number | null } | LookupFailure> {
  const id = clean(exceptionId);
  if (!id) return { ok: true, employeeId: null };
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("horodateur_exceptions")
      .select("employee_id")
      .eq("id", id)
      .maybeSingle<{ employee_id: unknown }>();
    if (error) return { ok: false, reason: "lookup_failed" };
    return { ok: true, employeeId: data ? asEmployeeId(data.employee_id) : null };
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}

export async function readHororaEmployeePerimeterFile(
  employeeId: number
): Promise<{ ok: true; file: HororaEmployeePerimeterFile | null } | LookupFailure> {
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return { ok: true, file: null };
  }
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("chauffeurs")
      .select("organization_id, effectifs_department_key")
      .eq("id", employeeId)
      .maybeSingle<{
        organization_id: unknown;
        effectifs_department_key: unknown;
      }>();
    if (error) return { ok: false, reason: "lookup_failed" };
    if (!data) return { ok: true, file: null };
    return {
      ok: true,
      file: {
        organizationId: clean(data.organization_id),
        departmentKey: clean(data.effectifs_department_key),
      },
    };
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}

export async function readHororaActorDepartmentKeys(input: {
  authUserId: string;
  organizationId: string;
}): Promise<{ ok: true; departmentKeys: string[] } | LookupFailure> {
  const authUserId = clean(input.authUserId);
  const organizationId = clean(input.organizationId);
  if (!authUserId || !organizationId) return { ok: true, departmentKeys: [] };
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("chauffeurs")
      .select("organization_id, effectifs_department_key, effectifs_secondary_department_keys")
      .eq("auth_user_id", authUserId);
    if (error) return { ok: false, reason: "lookup_failed" };
    const keys: string[] = [];
    for (const row of data ?? []) {
      if (clean(row.organization_id) !== organizationId) continue;
      for (const key of keysFromEmployeeFile(row)) {
        if (!keys.includes(key)) keys.push(key);
      }
    }
    return { ok: true, departmentKeys: keys };
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const LOG = "[employee-account-history]";

type CountCheck = {
  table: string;
  column: string;
  value: number;
};

/**
 * Compte les enregistrements liés à un chauffeur (employé).
 * Les tables absentes ou erreurs de colonne retournent 0 pour ne pas bloquer indûment.
 */
export async function countEmployeeLinkedHistory(
  supabase: SupabaseClient,
  employeeId: number
): Promise<{ total: number; checks: CountCheck[] }> {
  const checks: CountCheck[] = [];

  async function addCount(table: string, column: string): Promise<void> {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, employeeId);

    if (error) {
      console.warn(LOG, "count_skipped", { table, column, message: error.message });
      return;
    }
    const n = count ?? 0;
    if (n > 0) {
      checks.push({ table, column, value: n });
    }
  }

  await addCount("horodateur_events", "employee_id");
  await addCount("horodateur_shifts", "employee_id");
  await addCount("horodateur_exceptions", "employee_id");
  await addCount("horodateur_lateness_notifications", "employee_id");
  await addCount("horodateur_current_state", "employee_id");
  await addCount("effectifs_employee_schedule_requests", "employee_id");
  await addCount("effectifs_calendar_exceptions", "employee_id");
  await addCount("livraisons_planifiees", "chauffeur_id");
  await addCount("sorties_terrain", "chauffeur_id");
  await addCount("temps_titan", "employe_id");
  await addCount("gps_positions", "chauffeur_id");

  const total = checks.reduce((s, c) => s + c.value, 0);
  return { total, checks };
}

export function employeeHasHistory(total: number): boolean {
  return total > 0;
}

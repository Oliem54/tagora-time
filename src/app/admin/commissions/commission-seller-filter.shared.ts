/**
 * Filtre / regroupement UI des commissions par vendeur.
 * Aucune I/O. Aucun impact calcul.
 */

export type CommissionSellerSource = {
  chauffeur_id?: number | null;
  team_name?: string | null;
  assignee_label?: string | null;
  label?: string | null;
};

export type PlanBeneficiarySellerSource = {
  employeeId: number;
  primary: string;
  secondary?: string | null;
};

export type CommissionSellerOption = {
  key: string;
  label: string;
};

export const ALL_SELLERS_KEY = "all";

export function resolveCommissionSellerKey(
  entry: CommissionSellerSource
): string {
  const chauffeurId = Number(entry.chauffeur_id);
  if (Number.isInteger(chauffeurId) && chauffeurId > 0) {
    return `employee:${chauffeurId}`;
  }
  const team = String(entry.team_name || "").trim();
  if (team) return `team:${team.toLowerCase()}`;
  return "unassigned";
}

export function resolveCommissionSellerLabel(
  entry: CommissionSellerSource
): string {
  const assignee = String(entry.assignee_label || "").trim();
  if (assignee) return assignee;
  const team = String(entry.team_name || "").trim();
  if (team) return team;
  return "Vendeur non assigné";
}

export function formatPlanBeneficiarySellerLabel(
  primary: string,
  secondary: string | null | undefined,
  employeeId: number
): string {
  const id = Math.trunc(Number(employeeId));
  const technical =
    Number.isInteger(id) && id > 0 ? `Employé #${id}` : "Employé inconnu";
  const name = String(primary || "").trim() || technical;
  const ref = String(secondary || "").trim() || technical;
  if (name === ref || name.includes(ref)) return name;
  return `${name} — ${ref}`;
}

export function planBeneficiaryToSellerSource(
  beneficiary: PlanBeneficiarySellerSource
): CommissionSellerSource | null {
  const employeeId = Math.trunc(Number(beneficiary.employeeId));
  if (!Number.isInteger(employeeId) || employeeId <= 0) return null;
  return {
    chauffeur_id: employeeId,
    assignee_label: formatPlanBeneficiarySellerLabel(
      beneficiary.primary,
      beneficiary.secondary ?? null,
      employeeId
    ),
  };
}

function preferSellerLabel(current: string, next: string): string {
  const a = String(current || "").trim();
  const b = String(next || "").trim();
  if (!a) return b;
  if (!b) return a;
  // Prefer the richer "Name — Employé #N" form when merging plan beneficiaries.
  if (b.includes(" — ") && !a.includes(" — ")) return b;
  if (b.length > a.length && b.includes(a)) return b;
  return a;
}

export function buildCommissionSellerOptions(
  entries: CommissionSellerSource[],
  planBeneficiaries: PlanBeneficiarySellerSource[] = []
): CommissionSellerOption[] {
  const byKey = new Map<string, string>();
  for (const entry of entries) {
    const key = resolveCommissionSellerKey(entry);
    const label = resolveCommissionSellerLabel(entry);
    byKey.set(key, preferSellerLabel(byKey.get(key) || "", label));
  }
  for (const beneficiary of planBeneficiaries) {
    const asSource = planBeneficiaryToSellerSource(beneficiary);
    if (!asSource) continue;
    const key = resolveCommissionSellerKey(asSource);
    const label = resolveCommissionSellerLabel(asSource);
    byKey.set(key, preferSellerLabel(byKey.get(key) || "", label));
  }
  return Array.from(byKey.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr-CA"));
}

export function filterCommissionsBySeller<T extends CommissionSellerSource>(
  entries: T[],
  sellerKey: string
): T[] {
  const key = String(sellerKey || ALL_SELLERS_KEY);
  if (!key || key === ALL_SELLERS_KEY) return entries;
  return entries.filter((entry) => resolveCommissionSellerKey(entry) === key);
}

export function groupCommissionsBySeller<T extends CommissionSellerSource>(
  entries: T[]
): Array<{ key: string; label: string; entries: T[] }> {
  const groups = new Map<string, { label: string; entries: T[] }>();
  for (const entry of entries) {
    const key = resolveCommissionSellerKey(entry);
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(key, {
        label: resolveCommissionSellerLabel(entry),
        entries: [entry],
      });
    }
  }
  return Array.from(groups.entries())
    .map(([key, value]) => ({
      key,
      label: value.label,
      entries: value.entries,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr-CA"));
}

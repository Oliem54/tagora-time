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

export function buildCommissionSellerOptions(
  entries: CommissionSellerSource[]
): CommissionSellerOption[] {
  const byKey = new Map<string, string>();
  for (const entry of entries) {
    const key = resolveCommissionSellerKey(entry);
    if (!byKey.has(key)) {
      byKey.set(key, resolveCommissionSellerLabel(entry));
    }
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

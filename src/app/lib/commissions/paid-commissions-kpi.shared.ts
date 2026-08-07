/**
 * KPI « Commissions payées » : total combiné objectifs + résultats de plans.
 * Lecture seule / agrégation — aucun impact sur le moteur de calcul.
 */

export type PaidCommissionsKpiLine = {
  organizationId?: string | null;
  status: unknown;
  amount: unknown;
};

export type PaidCommissionsKpiTotals = {
  paidObjectiveTotal: number;
  paidPlanTotal: number;
  paidCombinedTotal: number;
};

function normalizeOrganizationId(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizePaidStatus(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function toFiniteAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function sumPaidForOrganization(
  lines: PaidCommissionsKpiLine[],
  organizationId: string
): number {
  const org = normalizeOrganizationId(organizationId);
  if (!org) return 0;
  let total = 0;
  for (const line of lines) {
    if (normalizePaidStatus(line.status) !== "paid") continue;
    if (normalizeOrganizationId(line.organizationId) !== org) continue;
    total += toFiniteAmount(line.amount);
  }
  return total;
}

/**
 * Agrège les commissions payées de l’organisation active uniquement.
 * Exclut tout statut non paid et toute autre organisation.
 */
export function computePaidCommissionsKpiTotals(input: {
  organizationId: unknown;
  objectiveEntries: PaidCommissionsKpiLine[];
  planAccruals: PaidCommissionsKpiLine[];
}): PaidCommissionsKpiTotals {
  const organizationId = normalizeOrganizationId(input.organizationId);
  if (!organizationId) {
    return {
      paidObjectiveTotal: 0,
      paidPlanTotal: 0,
      paidCombinedTotal: 0,
    };
  }

  const paidObjectiveTotal = sumPaidForOrganization(
    input.objectiveEntries,
    organizationId
  );
  const paidPlanTotal = sumPaidForOrganization(
    input.planAccruals,
    organizationId
  );

  return {
    paidObjectiveTotal,
    paidPlanTotal,
    paidCombinedTotal: paidObjectiveTotal + paidPlanTotal,
  };
}

/** Libellé officiel du KPI — ne pas renommer. */
export const PAID_COMMISSIONS_KPI_LABEL = "Commissions payées";

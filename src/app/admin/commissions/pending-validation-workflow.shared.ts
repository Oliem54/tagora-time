/**
 * Libellés et filtres UX du parcours « À valider ».
 * Aucun impact calcul / montant / persistance.
 */

import type { RecentPayPlanResultItem } from "@/app/admin/commissions/recent-pay-plan-results.shared";

export const PENDING_VALIDATION_ZONE_TITLE = "Éléments à valider";
export const PENDING_PLAN_RESULTS_SECTION_TITLE =
  "Résultats de plans à valider";
export const PENDING_OBJECTIVE_COMMISSIONS_SECTION_TITLE =
  "Commissions liées aux objectifs à valider";
export const PENDING_PLAN_RESULT_CTA_LABEL = "Voir et valider la commission";
export const PENDING_OBJECTIVE_COMMISSIONS_EMPTY =
  "Aucune commission liée aux objectifs à valider.";
export const PENDING_PLAN_RESULTS_EMPTY = "Aucun résultat de plan à valider.";

export function isPayPlanResultPendingValidation(
  result: Pick<RecentPayPlanResultItem, "status">
): boolean {
  const status = String(result.status || "")
    .trim()
    .toLowerCase();
  return status === "under_review" || status === "pending_validation";
}

export function filterPayPlanResultsPendingValidation(
  results: RecentPayPlanResultItem[]
): RecentPayPlanResultItem[] {
  return results.filter(isPayPlanResultPendingValidation);
}

export function formatPendingValidationCategoryCounts(
  planCount: number,
  objectiveCount: number
): {
  plansLabel: string;
  objectivesLabel: string;
} {
  const plans = Math.max(0, Math.trunc(Number(planCount) || 0));
  const objectives = Math.max(0, Math.trunc(Number(objectiveCount) || 0));
  return {
    plansLabel: `Résultats de plans à valider : ${plans}`,
    objectivesLabel: `Commissions d’objectifs à valider : ${objectives}`,
  };
}

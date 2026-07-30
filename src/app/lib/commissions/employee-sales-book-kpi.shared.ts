export type EmployeeSalesBookKpiObjective = {
  status: string;
  target_type: string;
  target_amount: number | null;
  target_sales_count: number | null;
  achieved_amount: number;
  achieved_sales_count: number;
  total_calculated_amount?: number;
  entries_pending_validation?: number;
  entries_paid?: number;
  entries_count?: number;
};

export type EmployeeSalesBookKpiSummary = {
  totalObjectives: number;
  activeObjectives: number;
  averageProgress: number;
  totalCalculated: number;
  entriesPending: number;
  entriesPaid: number;
  entriesTotal: number;
};

function isActiveObjectiveStatus(status: string) {
  return status === "active" || status === "partially_achieved";
}

export function getEmployeeSalesBookObjectiveProgress(
  objective: Pick<
    EmployeeSalesBookKpiObjective,
    "target_type" | "target_amount" | "target_sales_count" | "achieved_amount" | "achieved_sales_count"
  >
) {
  if (objective.target_type === "amount") {
    const target = objective.target_amount ?? 0;
    if (target <= 0) return 0;
    return Math.min(100, Math.round((objective.achieved_amount / target) * 100));
  }
  const target = objective.target_sales_count ?? 0;
  if (target <= 0) return 0;
  return Math.min(100, Math.round((objective.achieved_sales_count / target) * 100));
}

export function summarizeEmployeeSalesBookKpis(
  objectives: EmployeeSalesBookKpiObjective[]
): EmployeeSalesBookKpiSummary {
  const progressValues = objectives
    .filter((row) => row.status !== "cancelled" && row.status !== "draft")
    .map(getEmployeeSalesBookObjectiveProgress);
  const averageProgress =
    progressValues.length > 0
      ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
      : 0;

  return objectives.reduce(
    (acc, row) => {
      acc.totalObjectives += 1;
      if (isActiveObjectiveStatus(row.status)) {
        acc.activeObjectives += 1;
      }
      acc.totalCalculated += row.total_calculated_amount ?? 0;
      acc.entriesPending += row.entries_pending_validation ?? 0;
      acc.entriesPaid += row.entries_paid ?? 0;
      acc.entriesTotal += row.entries_count ?? 0;
      return acc;
    },
    {
      totalObjectives: 0,
      activeObjectives: 0,
      averageProgress,
      totalCalculated: 0,
      entriesPending: 0,
      entriesPaid: 0,
      entriesTotal: 0,
    } satisfies EmployeeSalesBookKpiSummary
  );
}

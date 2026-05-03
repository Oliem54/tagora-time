/**
 * Congés prolongés / absences longue durée (distinct du statut portail actif/inactif).
 */

export const EMPLOYEE_LEAVE_TYPES = [
  "sick_leave",
  "injury",
  "personal_leave",
  "vacation_extended",
  "administrative_leave",
  "other",
] as const;
export type EmployeeLeaveType = (typeof EMPLOYEE_LEAVE_TYPES)[number];

export const EMPLOYEE_LEAVE_STATUS = {
  active: "active",
  ended: "ended",
  cancelled: "cancelled",
} as const;
export type EmployeeLeaveStatus = (typeof EMPLOYEE_LEAVE_STATUS)[keyof typeof EMPLOYEE_LEAVE_STATUS];

/** Libellé public (sans détail médical) pour direction / listes. */
export function publicLeaveTypeLabelFr(type: string): string {
  switch (type) {
    case "sick_leave":
      return "Maladie";
    case "injury":
      return "Blessure";
    case "personal_leave":
      return "Congé personnel";
    case "vacation_extended":
      return "Congé prolongé";
    case "administrative_leave":
      return "Suspension administrative";
    case "other":
      return "Autre";
    default:
      return "Congé prolongé";
  }
}

export type EmployeeLeavePeriodPublic = {
  id: string;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string | null;
  expected_return_date: string | null;
  is_indefinite: boolean;
  status: string;
  reason_public: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeLeavePeriodRow = EmployeeLeavePeriodPublic & {
  private_note: string | null;
  created_by: string | null;
  updated_by: string | null;
  ended_at: string | null;
  ended_by: string | null;
};

/**
 * L’employé est-il considéré absent pour la date calendaire (congé prolongé actif) ?
 * `expected_return_date` = premier jour de retour au travail (absent avant cette date).
 */
export function isEmployeeAbsentOnCalendarDate(
  p: Pick<
    EmployeeLeavePeriodRow,
    "status" | "start_date" | "end_date" | "expected_return_date" | "is_indefinite"
  >,
  isoDate: string
): boolean {
  if (p.status !== "active") return false;
  if (isoDate < p.start_date) return false;
  if (p.end_date) {
    if (isoDate > p.end_date) return false;
    return isoDate >= p.start_date && isoDate <= p.end_date;
  }
  if (p.expected_return_date && isoDate >= p.expected_return_date) return false;
  if (p.is_indefinite) return isoDate >= p.start_date;
  if (p.expected_return_date) {
    return isoDate >= p.start_date && isoDate < p.expected_return_date;
  }
  return isoDate >= p.start_date;
}

/** Résumé affichage employé / listes (sans note privée). */
export function formatLongLeaveReturnSummaryFr(input: {
  is_indefinite: boolean;
  expected_return_date: string | null;
}): string {
  if (input.is_indefinite || !input.expected_return_date) {
    return "indéterminé";
  }
  return input.expected_return_date;
}

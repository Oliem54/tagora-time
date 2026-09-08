/**
 * Employee dashboard punch presentation.
 * Maps verified horodateur states only. Does not invent schedule or punch data.
 */

export const EMPLOYEE_PUNCH_STATUS = {
  nonPointe: "non_pointe",
  enService: "en_service",
  enPause: "en_pause",
  quartTermine: "quart_termine",
  indisponible: "indisponible",
} as const;

export type EmployeePunchStatusId =
  (typeof EMPLOYEE_PUNCH_STATUS)[keyof typeof EMPLOYEE_PUNCH_STATUS];

const STATUS_LABEL: Record<EmployeePunchStatusId, string> = {
  non_pointe: "Non pointé",
  en_service: "En service",
  en_pause: "En pause",
  quart_termine: "Quart terminé",
  indisponible: "Statut indisponible",
};

const NEXT_ACTION_LABEL: Record<EmployeePunchStatusId, string> = {
  non_pointe: "Pointer",
  en_service: "Continuer le quart",
  en_pause: "Reprendre le service",
  quart_termine: "Consulter le pointage",
  indisponible: "Pointage indisponible",
};

export function mapEmployeePunchStatus(
  state: string | null | undefined,
  options?: { available?: boolean }
): EmployeePunchStatusId {
  if (options?.available === false) {
    return EMPLOYEE_PUNCH_STATUS.indisponible;
  }

  switch (state) {
    case "en_quart":
      return EMPLOYEE_PUNCH_STATUS.enService;
    case "en_pause":
    case "en_diner":
      return EMPLOYEE_PUNCH_STATUS.enPause;
    case "termine":
      return EMPLOYEE_PUNCH_STATUS.quartTermine;
    case "hors_quart":
      return EMPLOYEE_PUNCH_STATUS.nonPointe;
    default:
      return state == null || state.trim() === ""
        ? EMPLOYEE_PUNCH_STATUS.nonPointe
        : EMPLOYEE_PUNCH_STATUS.indisponible;
  }
}

export function employeePunchStatusLabel(status: EmployeePunchStatusId): string {
  return STATUS_LABEL[status];
}

export function employeePunchNextActionLabel(status: EmployeePunchStatusId): string {
  return NEXT_ACTION_LABEL[status];
}

export function employeePunchStatusTone(
  status: EmployeePunchStatusId
): "default" | "info" | "success" | "warning" {
  switch (status) {
    case EMPLOYEE_PUNCH_STATUS.enService:
      return "success";
    case EMPLOYEE_PUNCH_STATUS.enPause:
      return "warning";
    case EMPLOYEE_PUNCH_STATUS.quartTermine:
      return "info";
    default:
      return "default";
  }
}

export function resolveEmployeeGivenName(options: {
  employeeFullName?: string | null;
  metadataFullName?: string | null;
}): string | null {
  const source =
    options.employeeFullName?.trim() || options.metadataFullName?.trim() || "";
  if (!source) return null;
  const given = source.split(/\s+/)[0]?.trim() ?? "";
  return given.length > 0 ? given : null;
}

export function readSessionFullName(user: {
  user_metadata?: Record<string, unknown> | null;
} | null | undefined): string | null {
  const fullName = user?.user_metadata?.full_name;
  return typeof fullName === "string" && fullName.trim() ? fullName.trim() : null;
}

export function formatEmployeeDashboardDate(date: Date): string {
  const formatted = date.toLocaleDateString("fr-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (!formatted) return "";
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatEmployeeWelcome(givenName: string | null): string {
  return givenName ? `Bonjour, ${givenName}` : "Bonjour";
}

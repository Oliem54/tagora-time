import { HORODATEUR_PHASE1_TIMEZONE } from "@/app/lib/horodateur-v1/rules";
import {
  accrueOpenShiftDisplayMinutes,
  resolveEmployeePunchGuidance,
  resolveOpenShiftSafetyCapAlert,
} from "@/app/lib/employee-punch-guidance.shared";

export const EMPLOYEE_CLOCK_NOT_A_PUNCH_NOTE =
  "Cette horloge indique l'heure actuelle. Elle n'est pas un pointage.";

export type EmployeeHorodateurClockView = {
  timezone: typeof HORODATEUR_PHASE1_TIMEZONE;
  currentTimeLabel: string;
  currentTimeNote: typeof EMPLOYEE_CLOCK_NOT_A_PUNCH_NOTE;
  lastPunchLabel: string;
  lastPunchNote: string;
  statusLabel: string;
  guidance: string;
  primaryLabel: string | null;
  secondaryLabels: string[];
  cumulativeLabel: string;
  cumulativeMinutes: number;
  cumulativeNote: string;
  safetyAlert: string | null;
  asksForPunchOut: boolean;
};

function formatHorodateurInstant(
  value: number | string,
  includeDate: boolean
): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: HORODATEUR_PHASE1_TIMEZONE,
    year: includeDate ? "numeric" : undefined,
    month: includeDate ? "2-digit" : undefined,
    day: includeDate ? "2-digit" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const hour = read("hour");
  const minute = read("minute");
  const second = read("second");
  if (!hour || !minute || !second) return null;
  const clock = `${hour} h ${minute} min ${second} s`;
  if (!includeDate) return clock;
  const year = read("year");
  const month = read("month");
  const day = read("day");
  if (!year || !month || !day) return clock;
  return `${year}-${month}-${day}, ${clock}`;
}

function cumulativeCopy(state: string): { label: string; note: string } {
  if (state === "en_quart") {
    return {
      label: "Temps payé en cours",
      note: "Ce cumulatif avance seulement pendant le service, à partir du calcul serveur. L'horloge affichée ne le fait pas progresser.",
    };
  }
  if (state === "en_pause") {
    return {
      label: "Temps payé aujourd'hui",
      note: "Le temps payé ne progresse pas pendant la pause.",
    };
  }
  if (state === "en_diner") {
    return {
      label: "Temps payé aujourd'hui",
      note: "Le temps payé ne progresse pas pendant le dîner.",
    };
  }
  if (state === "termine") {
    return {
      label: "Temps payé du quart",
      note: "Le quart est terminé. Le cumulatif ne progresse plus.",
    };
  }
  return {
    label: "Temps payé aujourd'hui",
    note: "Vous n'êtes pas en service. Le cumulatif reste celui confirmé par le serveur.",
  };
}

export function resolveEmployeeHorodateurClockView(input: {
  nowMs: number;
  currentState: string | null | undefined;
  lastEventAt?: string | null;
  payableMinutes: number;
  computedAt?: string | null;
  hasOpenShiftAccrual?: boolean;
  pendingPunchBlocksAccrual?: boolean;
  openShiftSafetyCapReached?: boolean;
  pausePaid?: boolean;
  lunchPaid?: boolean;
}): EmployeeHorodateurClockView {
  const state = input.currentState ?? "hors_quart";
  const guidance = resolveEmployeePunchGuidance({
    currentState: state,
    pausePaid: input.pausePaid,
    lunchPaid: input.lunchPaid,
  });
  const safetyAlert = resolveOpenShiftSafetyCapAlert({
    currentState: state,
    openShiftSafetyCapReached: input.openShiftSafetyCapReached === true,
  });
  const accrues =
    state === "en_quart" &&
    input.hasOpenShiftAccrual === true &&
    input.pendingPunchBlocksAccrual !== true &&
    input.openShiftSafetyCapReached !== true;
  const cumulativeMinutes = accrueOpenShiftDisplayMinutes({
    baseMinutes: input.payableMinutes,
    computedAt: input.computedAt,
    nowMs: input.nowMs,
    accrues,
  });
  const copy = cumulativeCopy(state);
  const cumulativeNote =
    state === "en_quart" && input.pendingPunchBlocksAccrual
      ? "Le temps payé est figé tant qu'un pointage attend une validation."
      : state === "en_quart" && input.openShiftSafetyCapReached
        ? "Le temps affiché ne progresse plus au-delà de la limite de sécurité."
        : copy.note;
  const lastPunch = input.lastEventAt
    ? formatHorodateurInstant(input.lastEventAt, true)
    : null;
  const actions = [guidance.primary, ...guidance.secondary];
  const asksForPunchOut =
    safetyAlert != null ||
    actions.some((action) => action?.eventType === "punch_out") ||
    /pointez votre sortie/i.test(guidance.guidance);

  return {
    timezone: HORODATEUR_PHASE1_TIMEZONE,
    currentTimeLabel: formatHorodateurInstant(input.nowMs, false) ?? "—",
    currentTimeNote: EMPLOYEE_CLOCK_NOT_A_PUNCH_NOTE,
    lastPunchLabel: lastPunch ?? "Aucun pointage confirmé",
    lastPunchNote: lastPunch
      ? "Heure exacte du dernier pointage confirmé par le serveur."
      : "Aucun pointage confirmé par le serveur pour ce quart.",
    statusLabel: guidance.statusLabel,
    guidance: guidance.guidance,
    primaryLabel: guidance.primary?.label ?? null,
    secondaryLabels: guidance.secondary.map((action) => action.label),
    cumulativeLabel: copy.label,
    cumulativeMinutes,
    cumulativeNote,
    safetyAlert,
    asksForPunchOut,
  };
}

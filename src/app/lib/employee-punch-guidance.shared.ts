/**
 * Employee punch guidance.
 * Presentation only: labels, elapsed time, and the forgotten-arrival request.
 * Does not write punches or payroll minutes.
 */

import { validateStaffRetroCorrectionInput } from "@/app/lib/horodateur-retro-correction.shared";

export const FORGOTTEN_ARRIVAL_NOTE_PREFIX = "Demande employé — arrivée oubliée";

export const FORGOTTEN_ARRIVAL_REASON_LABEL = "Arrivée oubliée à valider";

export type EmployeePunchPhase =
  | "avant_quart"
  | "quart_actif"
  | "quart_en_attente"
  | "pause"
  | "diner"
  | "quart_termine"
  | "indisponible";

export type EmployeePunchAction = {
  eventType: "punch_in" | "punch_out" | "break_start" | "break_end" | "meal_start" | "meal_end" | null;
  label: string;
};

export type ShiftTimeKind = "approved" | "live" | "provisional";

export type EmployeePunchGuidance = {
  phase: EmployeePunchPhase;
  statusLabel: string;
  serviceSinceLabel: string | null;
  guidance: string;
  primary: EmployeePunchAction | null;
  secondary: EmployeePunchAction[];
  arrivalBlocked: boolean;
  arrivalBlockedMessage: string | null;
};

const ARRIVAL_BLOCKED_MESSAGE =
  "Un quart est déjà ouvert. Pointez votre sortie, ou ajoutez une heure d'arrivée oubliée si l'heure est inexacte.";

export function isOpenShiftState(state: string | null | undefined): boolean {
  return state === "en_quart" || state === "en_pause" || state === "en_diner";
}

export function shouldRejectSecondArrivalPunch(input: {
  currentState: string | null | undefined;
  openShiftContinuable: boolean;
  pendingArrivalToday: boolean;
}): boolean {
  if (!isOpenShiftState(input.currentState)) {
    return false;
  }
  return input.openShiftContinuable || input.pendingArrivalToday;
}

export function elapsedMinutesBetween(startIso: string, nowIso: string): number {
  const start = new Date(startIso).getTime();
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(now) || now <= start) {
    return 0;
  }
  return Math.floor((now - start) / 60000);
}

export function formatElapsedHours(totalMinutes: number): string {
  const safe = Math.max(0, Math.floor(totalMinutes || 0));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours} h ${String(minutes).padStart(2, "0")}`;
}

export function formatTorontoClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  if (!hour || !minute) return null;
  return `${Number(hour)} h ${minute.padStart(2, "0")}`;
}

export function formatEnServiceDepuis(iso: string | null | undefined): string | null {
  const clock = formatTorontoClock(iso);
  return clock ? `En service depuis ${clock}` : null;
}

export function employeeLocalWorkDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function resolveRecordedArrivalAt(input: {
  currentState: string | null | undefined;
  approvedArrivalAt?: string | null;
  pendingArrivalAt?: string | null;
  lastEventAt?: string | null;
  lastEventType?: string | null;
}): string | null {
  if (input.approvedArrivalAt) return input.approvedArrivalAt;
  if (input.pendingArrivalAt) return input.pendingArrivalAt;
  const eventType = input.lastEventType ?? "";
  if (
    (eventType === "punch_in" || eventType === "quart_debut") &&
    input.lastEventAt
  ) {
    return input.lastEventAt;
  }
  if (isOpenShiftState(input.currentState) && input.lastEventAt && eventType === "punch_in") {
    return input.lastEventAt;
  }
  return null;
}

export function resolveShiftTimePresentation(input: {
  currentState: string | null | undefined;
  officialPayableMinutes: number;
  livePayableMinutes: number;
  hasOpenShiftAccrual: boolean;
  pendingValidation: boolean;
  arrivalAt: string | null;
  nowIso: string;
  computedAt?: string | null;
}): {
  displayedMinutes: number;
  provisionalElapsedMinutes: number;
  timeDisplayKind: ShiftTimeKind;
  payrollMinutes: number;
  headlineLabel: string;
  payrollLabel: string;
  showPayrollApart: boolean;
} {
  const payrollMinutes = Math.max(0, Math.floor(input.officialPayableMinutes || 0));
  const onDuty = isOpenShiftState(input.currentState);
  const fromArrival = input.arrivalAt
    ? elapsedMinutesBetween(input.arrivalAt, input.nowIso)
    : 0;
  const sinceCompute = input.computedAt
    ? elapsedMinutesBetween(input.computedAt, input.nowIso)
    : 0;
  const liveMinutes = Math.max(0, Math.floor(input.livePayableMinutes || 0)) + sinceCompute;

  if (!onDuty) {
    return {
      displayedMinutes: payrollMinutes,
      provisionalElapsedMinutes: 0,
      timeDisplayKind: "approved",
      payrollMinutes,
      headlineLabel: "Temps approuvé pour la paie",
      payrollLabel: "Temps approuvé pour la paie",
      showPayrollApart: false,
    };
  }

  const awaitingValidation = input.pendingValidation || !input.hasOpenShiftAccrual;
  if (awaitingValidation && (input.arrivalAt || fromArrival > 0 || liveMinutes > 0)) {
    const shown = Math.max(fromArrival, input.hasOpenShiftAccrual ? liveMinutes : 0);
    return {
      displayedMinutes: shown,
      provisionalElapsedMinutes: shown,
      timeDisplayKind: "provisional",
      payrollMinutes,
      headlineLabel: "Temps provisoire, en attente de validation",
      payrollLabel: "Temps approuvé pour la paie",
      showPayrollApart: true,
    };
  }

  if (input.hasOpenShiftAccrual) {
    return {
      displayedMinutes: liveMinutes,
      provisionalElapsedMinutes: 0,
      timeDisplayKind: "live",
      payrollMinutes,
      headlineLabel: "Temps en cours",
      payrollLabel: "Temps approuvé pour la paie",
      showPayrollApart: true,
    };
  }

  return {
    displayedMinutes: payrollMinutes,
    provisionalElapsedMinutes: 0,
    timeDisplayKind: "approved",
    payrollMinutes,
    headlineLabel: "Temps approuvé pour la paie",
    payrollLabel: "Temps approuvé pour la paie",
    showPayrollApart: false,
  };
}

export function resolveEmployeePunchGuidance(input: {
  currentState: string | null | undefined;
  available?: boolean;
  shiftStatus?: string | null;
  pendingValidation?: boolean;
  pausePaid?: boolean;
  arrivalAt?: string | null;
}): EmployeePunchGuidance {
  if (input.available === false) {
    return {
      phase: "indisponible",
      statusLabel: "Statut indisponible",
      serviceSinceLabel: null,
      guidance: "Le pointage n'est pas disponible pour ce compte.",
      primary: null,
      secondary: [],
      arrivalBlocked: false,
      arrivalBlockedMessage: null,
    };
  }

  const state = input.currentState ?? "hors_quart";
  const pending =
    input.pendingValidation === true || input.shiftStatus === "en_attente";
  const serviceSinceLabel = isOpenShiftState(state)
    ? formatEnServiceDepuis(input.arrivalAt)
    : null;

  if (state === "en_pause") {
    return {
      phase: "pause",
      statusLabel: "En pause",
      serviceSinceLabel,
      guidance: "Vous êtes en pause. Reprenez le service quand vous êtes prêt, ou pointez votre sortie.",
      primary: { eventType: "break_end", label: "Reprendre le service" },
      secondary: [{ eventType: "punch_out", label: "Pointer ma sortie" }],
      arrivalBlocked: true,
      arrivalBlockedMessage: ARRIVAL_BLOCKED_MESSAGE,
    };
  }

  if (state === "en_diner") {
    return {
      phase: "diner",
      statusLabel: "Au dîner",
      serviceSinceLabel,
      guidance: "Vous êtes au dîner. Terminez le dîner pour reprendre le quart, ou pointez votre sortie.",
      primary: { eventType: "meal_end", label: "Terminer le dîner" },
      secondary: [{ eventType: "punch_out", label: "Pointer ma sortie" }],
      arrivalBlocked: true,
      arrivalBlockedMessage: ARRIVAL_BLOCKED_MESSAGE,
    };
  }

  if (state === "en_quart") {
    const secondary: EmployeePunchAction[] = [];
    if (input.pausePaid === false) {
      secondary.push({ eventType: "break_start", label: "Commencer ma pause" });
    }
    secondary.push({ eventType: "meal_start", label: "Commencer mon dîner" });
    if (pending) {
      return {
        phase: "quart_en_attente",
        statusLabel: "En service",
        serviceSinceLabel,
        guidance:
          "Votre quart est en cours, mais une validation est encore requise. Le temps affiché est provisoire. Pointez votre sortie à la fin du quart.",
        primary: { eventType: "punch_out", label: "Pointer ma sortie" },
        secondary,
        arrivalBlocked: true,
        arrivalBlockedMessage: ARRIVAL_BLOCKED_MESSAGE,
      };
    }
    return {
      phase: "quart_actif",
      statusLabel: "En service",
      serviceSinceLabel,
      guidance: "Vous êtes en service. À la fin du quart, pointez votre sortie.",
      primary: { eventType: "punch_out", label: "Pointer ma sortie" },
      secondary,
      arrivalBlocked: true,
      arrivalBlockedMessage: ARRIVAL_BLOCKED_MESSAGE,
    };
  }

  if (state === "termine") {
    return {
      phase: "quart_termine",
      statusLabel: "Quart terminé",
      serviceSinceLabel: null,
      guidance: "Votre quart est terminé. Consultez le pointage. Une nouvelle arrivée n'est pas proposée ici.",
      primary: { eventType: null, label: "Consulter le pointage" },
      secondary: [],
      arrivalBlocked: false,
      arrivalBlockedMessage: null,
    };
  }

  return {
    phase: "avant_quart",
    statusLabel: "Non pointé",
    serviceSinceLabel: null,
    guidance: "Vous n'êtes pas encore en service. Pointez votre arrivée pour commencer le quart.",
    primary: { eventType: "punch_in", label: "Pointer mon arrivée" },
    secondary: [],
    arrivalBlocked: false,
    arrivalBlockedMessage: null,
  };
}

const EXCEPTION_COPY: Record<string, { title: string; explanation: string; expectedAction: string }> = {
  missing_punch_adjustment: {
    title: "Heure de pointage à confirmer",
    explanation: "Une heure manque ou doit être corrigée avant de compter pour la paie.",
    expectedAction: "Attendez la décision de la direction, ou ajoutez l'heure oubliée si ce n'est pas déjà demandé.",
  },
  outside_schedule: {
    title: "Pointage hors horaire",
    explanation: "Ce pointage est en dehors de l'horaire prévu.",
    expectedAction: "Attendez l'approbation de la direction. Il ne compte pas encore pour la paie.",
  },
  shift_too_long: {
    title: "Quart très long",
    explanation: "Le quart dépasse la durée habituelle et doit être vérifié.",
    expectedAction: "Pointez votre sortie si vous avez terminé, puis attendez la validation.",
  },
  incoherent_pause: {
    title: "Pause à vérifier",
    explanation: "La pause ne correspond pas à la séquence attendue.",
    expectedAction: "Vérifiez que la pause est bien commencée ou terminée, puis attendez la direction si une demande est ouverte.",
  },
  incoherent_dinner: {
    title: "Dîner à vérifier",
    explanation: "Le dîner ne correspond pas à la séquence attendue.",
    expectedAction: "Terminez le dîner si vous êtes de retour, ou attendez la validation de la direction.",
  },
  invalid_sequence: {
    title: "Ordre de pointage inhabituel",
    explanation: "Les pointages ne se suivent pas dans l'ordre habituel.",
    expectedAction: "Ne pointez pas une deuxième arrivée. Utilisez l'action proposée pour l'état actuel.",
  },
  direction_manual_correction: {
    title: "Correction à valider",
    explanation: "Une correction a été demandée et n'est pas encore approuvée.",
    expectedAction: "Attendez la décision de la direction. Le temps reste provisoire jusque-là.",
  },
};

export function describeEmployeeException(input: {
  exceptionType: string;
  reasonLabel?: string | null;
  status?: string | null;
  scope: "current_shift" | "history";
}): {
  title: string;
  explanation: string;
  expectedAction: string;
  statusLabel: string;
  scopeLabel: string;
} {
  const known = EXCEPTION_COPY[input.exceptionType];
  const reason = input.reasonLabel?.trim();
  const status = input.status ?? "en_attente";
  return {
    title: known?.title ?? (reason || "Exception à examiner"),
    explanation:
      known?.explanation ??
      (reason
        ? `${reason}. Cette exception doit être lue avant de compter le temps pour la paie.`
        : "Cette exception doit être examinée avant de compter le temps pour la paie."),
    expectedAction:
      known?.expectedAction ??
      "Attendez la décision de la direction. N'ajoutez pas un deuxième pointage d'arrivée.",
    statusLabel: exceptionStatusLabel(status),
    scopeLabel:
      input.scope === "current_shift"
        ? "Exception du quart en cours"
        : "Historique des exceptions",
  };
}

export function exceptionStatusLabel(status: string): string {
  switch (status) {
    case "en_attente":
      return "En attente d'approbation";
    case "approuve":
      return "Approuvée pour la paie";
    case "refuse":
      return "Refusée";
    case "modifie":
      return "Ajustée";
    default:
      return status;
  }
}

export function buildForgottenArrivalRequest(input: {
  date: string;
  time: string;
  reason: string;
  shiftOpen: boolean;
  initialEventId?: string | null;
}) {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    return {
      ok: false as const,
      error: "Indiquez un motif d'au moins quelques mots.",
      code: "forgotten_arrival_reason_required",
    };
  }
  if (reason.length > 500) {
    return {
      ok: false as const,
      error: "Le motif est trop long.",
      code: "forgotten_arrival_reason_too_long",
    };
  }

  const validated = validateStaffRetroCorrectionInput({
    date: input.date,
    time: input.time,
  });
  if (!validated.ok) {
    return validated;
  }

  const initialEventId = input.initialEventId ?? null;
  const note = [
    FORGOTTEN_ARRIVAL_NOTE_PREFIX,
    `Date : ${input.date}`,
    `Heure réelle : ${input.time}`,
    `Motif : ${reason}`,
    initialEventId
      ? `Événement initial conservé : ${initialEventId}`
      : "Aucun pointage d'arrivée préalable.",
    "Aucun deuxième pointage d'arrivée n'est créé.",
    input.shiftOpen
      ? "Le quart reste en cours."
      : "Aucun quart n'est ouvert par cette demande.",
    "Approbation direction requise.",
  ].join("\n");

  const summary = input.shiftOpen
    ? `Arrivée demandée le ${input.date} à ${input.time}. Motif : ${reason}. Une approbation est requise. Votre quart reste en cours. Le pointage initial n'est pas effacé et aucun deuxième pointage d'arrivée n'est créé.`
    : `Arrivée demandée le ${input.date} à ${input.time}. Motif : ${reason}. Une approbation est requise avant que cette heure compte. Cette demande n'ouvre pas un quart et ne crée pas un pointage d'arrivée immédiat.`;

  return {
    ok: true as const,
    occurredAt: validated.occurredAt,
    note,
    summary,
    approvalRequired: true as const,
    status: "en_attente" as const,
    shiftRemainsOpen: input.shiftOpen,
    eventType: "retroactive_entry" as const,
    createsPunchIn: false as const,
    preservesInitialEvent: true as const,
    initialEventId,
    reason,
  };
}

export function buildForgottenArrivalAudit(input: {
  shiftRemainsOpen: boolean;
  initialEventId: string | null;
  adjustmentEventId: string | null;
  exceptionId: string | null;
}) {
  return {
    kind: "forgotten_arrival_adjustment" as const,
    approvalRequired: true as const,
    status: "en_attente" as const,
    shiftRemainsOpen: input.shiftRemainsOpen,
    createdSecondPunchIn: false as const,
    initialEventPreserved: true as const,
    erasedInitialEvent: false as const,
    eventType: "retroactive_entry" as const,
    initialEventId: input.initialEventId,
    adjustmentEventId: input.adjustmentEventId,
    exceptionId: input.exceptionId,
  };
}

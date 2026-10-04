/**
 * Minimal punch guidance required by the HORORA recompute fix on main.
 * Maps the live operational state to the primary punch action, and decides
 * whether an employee punch-out is already submitted.
 * Does not write punches or payroll minutes.
 */

export type EmployeePunchPhase =
  | "avant_quart"
  | "quart_actif"
  | "quart_en_attente"
  | "pause"
  | "diner"
  | "quart_termine"
  | "indisponible";

export type EmployeePunchAction = {
  eventType:
    | "punch_in"
    | "punch_out"
    | "break_start"
    | "break_end"
    | "meal_start"
    | "meal_end"
    | null;
  label: string;
};

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

export function formatPendingEmployeePunchOutBanner(occurredAt: string) {
  const label = new Date(occurredAt).toLocaleTimeString("fr-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `Votre sortie a deja ete soumise a ${label} et attend la validation de la direction. Votre quart est ferme; la paie reste a valider.`;
}

/**
 * L'écran employé ne bloque la sortie que lorsqu'une sortie a vraiment été
 * soumise. Une fin automatique en attente n'arrive pas dans ce snapshot.
 */
export function resolveEmployeHorodateurPunchOutControl(input: {
  currentState: string | null | undefined;
  pendingPunchOut: { occurredAt: string } | null;
}) {
  const state = input.currentState ?? "hors_quart";
  const blockedReason = input.pendingPunchOut
    ? formatPendingEmployeePunchOutBanner(input.pendingPunchOut.occurredAt)
    : null;
  const shiftOpen = state !== "hors_quart" && state !== "termine";
  return {
    blockedReason,
    canPunchOut: blockedReason == null && shiftOpen,
    primaryDisabled: blockedReason != null,
    primaryLabel: blockedReason == null ? "Pointer ma sortie" : "Sortie soumise",
  };
}

const ARRIVAL_BLOCKED_MESSAGE =
  "Un quart est déjà ouvert. Pointez votre sortie, ou ajoutez une heure d'arrivée oubliée si l'heure est inexacte.";

export function isOpenShiftState(state: string | null | undefined): boolean {
  return state === "en_quart" || state === "en_pause" || state === "en_diner";
}

function formatTorontoClock(iso: string | null | undefined): string | null {
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

function formatEnServiceDepuis(iso: string | null | undefined): string | null {
  const clock = formatTorontoClock(iso);
  return clock ? `En service depuis ${clock}` : null;
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
      guidance:
        "Vous êtes en pause. Reprenez le service quand vous êtes prêt, ou pointez votre sortie.",
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
      guidance:
        "Vous êtes au dîner. Terminez le dîner pour reprendre le quart, ou pointez votre sortie.",
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
      guidance:
        "Votre quart est terminé. Consultez le pointage. Une nouvelle arrivée n'est pas proposée ici.",
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
    guidance:
      "Vous n'êtes pas encore en service. Pointez votre arrivée pour commencer le quart.",
    primary: { eventType: "punch_in", label: "Pointer mon arrivée" },
    secondary: [],
    arrivalBlocked: false,
    arrivalBlockedMessage: null,
  };
}

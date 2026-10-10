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
  return `Votre sortie a déjà été soumise à ${label} et attend la validation de la direction. Votre quart est fermé. La paie reste à valider.`;
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

export function accrueOpenShiftDisplayMinutes(input: {
  baseMinutes: number;
  computedAt?: string | null;
  nowMs: number;
  accrues: boolean;
}): number {
  const base = Math.max(0, input.baseMinutes || 0);
  if (!input.accrues) return base;
  const computed = input.computedAt ? Date.parse(input.computedAt) : Number.NaN;
  if (!Number.isFinite(computed)) return base;
  const extra = Math.floor((input.nowMs - computed) / 60_000);
  if (extra <= 0) return base;
  return base + Math.min(extra, 5);
}

/**
 * Traduit les refus techniques de pointage en une phrase qu'un employé peut suivre.
 * Laisse intact un message déjà lisible.
 */
export function explainEmployeePunchError(message: string): string {
  const raw = message.trim();
  if (!raw) {
    return "Le pointage n'a pas pu être enregistré. Réessayez.";
  }

  const lower = raw.toLowerCase();
  if (
    /horodateur_|pgrst|violates|syntax error|\bsql\b|duplicate key/i.test(raw)
  ) {
    return "Le pointage n'a pas pu être enregistré. Réessayez. Si cela continue, contactez la direction.";
  }
  if (
    lower.includes("etat courant:") ||
    lower.includes("transition d etat") ||
    lower.includes("sequence de pointage invalide") ||
    lower.includes("séquence de pointage invalide")
  ) {
    return "Cette action ne correspond pas à votre situation actuelle. Utilisez le bouton principal : arrivée, reprise, fin de dîner ou sortie.";
  }
  if (lower.includes("pause payee") || lower.includes("pause payée")) {
    return "Votre pause est payée. Vous n'avez pas à pointer le début ni la fin de pause.";
  }
  if (lower.includes("repas paye") || lower.includes("repas payé")) {
    return "Votre dîner est payé. Vous n'avez pas à pointer le début ni la fin du dîner.";
  }
  if (lower.includes("chevauchement")) {
    return "Cette heure est avant votre dernier pointage. Demandez une correction si l'heure est inexacte.";
  }
  if (lower.includes("type d evenement invalide") || lower.includes("type d'événement invalide")) {
    return "Cette action de pointage n'est pas reconnue. Rechargez la page et utilisez le bouton principal.";
  }
  if (lower.includes("employe introuvable") || lower.includes("employé introuvable")) {
    return "Votre fiche employé est introuvable. Contactez la direction avant de pointer.";
  }
  return raw;
}

export function resolveEmployeePunchGuidance(input: {
  currentState: string | null | undefined;
  available?: boolean;
  shiftStatus?: string | null;
  pendingValidation?: boolean;
  pausePaid?: boolean;
  lunchPaid?: boolean;
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
    if (input.lunchPaid !== true) {
      secondary.push({ eventType: "meal_start", label: "Commencer mon dîner" });
    }
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

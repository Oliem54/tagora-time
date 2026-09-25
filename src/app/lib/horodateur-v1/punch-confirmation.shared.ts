import { isCurrentlyWorkingState } from "@/app/lib/employee-punch-status.shared";

export const HORODATEUR_PUNCH_IDEMPOTENCY_WINDOW_MS = 90_000;

export function isDuplicatePunchWithinWindow(input: {
  existingOccurredAt: string | null | undefined;
  candidateOccurredAt: string;
  windowMs?: number;
}): boolean {
  if (!input.existingOccurredAt) {
    return false;
  }
  const existing = new Date(input.existingOccurredAt).getTime();
  const candidate = new Date(input.candidateOccurredAt).getTime();
  if (!Number.isFinite(existing) || !Number.isFinite(candidate)) {
    return false;
  }
  const windowMs = input.windowMs ?? HORODATEUR_PUNCH_IDEMPOTENCY_WINDOW_MS;
  return Math.abs(candidate - existing) <= windowMs;
}

export function isPunchConfirmedByServerReread(input: {
  insertedEventId: string | null | undefined;
  lastEventId: string | null | undefined;
  currentState?: string | null;
  requireCurrentlyWorking?: boolean;
}): boolean {
  const inserted = input.insertedEventId?.trim() || null;
  const last = input.lastEventId?.trim() || null;
  if (!inserted || !last || inserted !== last) {
    return false;
  }
  if (input.requireCurrentlyWorking === true) {
    return isCurrentlyWorkingState(input.currentState);
  }
  return true;
}

export function employeePunchSuccessMessage(input: {
  confirmed: boolean;
  alreadySubmitted?: boolean;
  alreadySubmittedMessage?: string | null;
  exception?: unknown;
  retroactive?: boolean;
  punchOut?: boolean;
}): string | null {
  if (!input.confirmed) {
    return null;
  }
  if (input.alreadySubmitted) {
    return (
      input.alreadySubmittedMessage?.trim() ||
      "Ce pointage a déjà été enregistré."
    );
  }
  if (input.retroactive) {
    return "Demande envoyée à la direction pour approbation.";
  }
  if (input.punchOut && input.exception) {
    return "Sortie soumise à validation. Vous pouvez continuer à utiliser l'horodateur.";
  }
  if (input.punchOut) {
    return "Sortie enregistrée. Votre temps a été recalculé.";
  }
  if (input.exception) {
    return "Pointage enregistré avec exception en attente.";
  }
  return "Pointage enregistré.";
}

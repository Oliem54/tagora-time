export type OperationProofModuleSource = "livraison" | "ramassage";

export type ReceptionProofTypeRow = {
  type_preuve: string | null;
};

export type ReceptionProofAssessment = {
  hasSignature: boolean;
  hasVoiceConfirmation: boolean;
  isComplete: boolean;
};

const COMPLETION_STATUSES = new Set(["livree", "ramassee", "ramasse"]);

export function moduleSourceFromTypeOperation(
  typeOperation: string | null | undefined
): OperationProofModuleSource {
  return String(typeOperation || "").toLowerCase() === "ramassage_client"
    ? "ramassage"
    : "livraison";
}

export function moduleSourceFromStopType(
  stopType: "livraison" | "ramassage"
): OperationProofModuleSource {
  return stopType === "ramassage" ? "ramassage" : "livraison";
}

export function isCompletionStatus(statut: string | null | undefined): boolean {
  return COMPLETION_STATUSES.has(String(statut || "").trim().toLowerCase());
}

export function isTransitionToCompletion(
  currentStatut: string | null | undefined,
  nextStatut: string | null | undefined
): boolean {
  if (nextStatut == null || !isCompletionStatus(nextStatut)) return false;
  return !isCompletionStatus(currentStatut);
}

export function assessReceptionProofs(
  proofs: ReceptionProofTypeRow[]
): ReceptionProofAssessment {
  const hasSignature = proofs.some((row) => row.type_preuve === "signature");
  const hasVoiceConfirmation = proofs.some((row) => row.type_preuve === "voice");
  return {
    hasSignature,
    hasVoiceConfirmation,
    isComplete: hasSignature && hasVoiceConfirmation,
  };
}

export function getReceptionProofMissingSummary(
  assessment: ReceptionProofAssessment
): string | null {
  if (assessment.isComplete) return null;
  const parts: string[] = [];
  if (!assessment.hasSignature) parts.push("Signature manuscrite requise.");
  if (!assessment.hasVoiceConfirmation) parts.push("Confirmation vocale requise.");
  return parts.join(" ");
}

export function getReceptionProofBlockMessage(
  moduleSource: OperationProofModuleSource
): string {
  const missing = "Signature manuscrite requise. Confirmation vocale requise.";
  if (moduleSource === "ramassage") {
    return `${missing} Ajoutez les deux preuves avant de fermer le ramassage.`;
  }
  return `${missing} Ajoutez les deux preuves avant de marquer la livraison comme livrée.`;
}

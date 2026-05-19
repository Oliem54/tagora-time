export type MobileFieldCaptureTarget = "signature" | "voice" | "photo" | "note" | "problem";

export type MobileFieldOperationType = "livraison" | "ramassage";

export function moduleSourceForOperationType(
  type: MobileFieldOperationType
): "livraison" | "ramassage" {
  return type === "ramassage" ? "ramassage" : "livraison";
}

export function operationTypeLabel(type: MobileFieldOperationType): string {
  return type === "ramassage" ? "ramassage" : "livraison";
}

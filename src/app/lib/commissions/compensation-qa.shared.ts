import {
  STAGING_QA_SUPABASE_PROJECT_REF,
  isProductionTagoraHostname,
  isStagingPreviewHostname,
} from "@/app/lib/auth/mfa.shared";

/** Projet Supabase production — le simulateur QA ne doit jamais cibler ce ref. */
export const PRODUCTION_SUPABASE_PROJECT_REF = "qcgvzdlfsxybrmloijpt";

export const COMPENSATION_QA_DEFAULTS = {
  chauffeur_id: 1,
  chauffeur_label: "QA-PR45-Employe Test",
  amount: 10,
  status: "active" as const,
  sale_state: "delivered" as const,
  external_reference: "QA-S9-TEST",
  label: "QA-S9-TEST",
  company_context: "QA-STAGING",
  notes:
    "DONNÉE QA STAGING — ne pas traiter comme une vente réelle. Simulation de réception d'événement externe.",
} as const;

export function isCompensationQaSimulatorAllowed(options: {
  hostname: string | null | undefined;
  supabaseUrl: string | null | undefined;
}): boolean {
  const supabaseUrl = String(options.supabaseUrl ?? "")
    .trim()
    .toLowerCase();

  if (!supabaseUrl) {
    return false;
  }

  if (supabaseUrl.includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
    return false;
  }

  if (!supabaseUrl.includes(STAGING_QA_SUPABASE_PROJECT_REF)) {
    return false;
  }

  if (isProductionTagoraHostname(options.hostname)) {
    return false;
  }

  return isStagingPreviewHostname(options.hostname);
}

export function isCompensationQaEventMarker(options: {
  external_reference?: string | null;
  label?: string | null;
  notes?: string | null;
}): boolean {
  const haystack = [
    options.external_reference,
    options.label,
    options.notes,
  ]
    .map((value) => String(value ?? "").toUpperCase())
    .join(" ");

  return haystack.includes("QA-S9-TEST") || haystack.includes("DONNÉE QA STAGING");
}

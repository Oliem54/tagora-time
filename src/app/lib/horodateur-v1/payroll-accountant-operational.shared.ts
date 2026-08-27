export const PAYROLL_OPERATIONAL_ERROR_MESSAGES: Record<string, string> = {
  confirm_required: "Confirmez l'emission avant de continuer.",
  blocked_incomplete:
    "Le rapport est incomplet. Corrigez les pointages ou forcez l'emission avec un motif.",
  forced_reason_required: "Un motif est obligatoire pour une emission forcee.",
  cycle_tenant_mismatch: "Le cycle n'appartient pas a cette organisation et entreprise.",
  cycle_period_mismatch:
    "Les dates doivent correspondre exactement au cycle pour enregistrer ou emettre.",
  company_tenant_mismatch: "L'entreprise operante n'appartient pas a l'organisation active.",
  browser_organization_rejected: "L'organisation fournie par le navigateur a ete refusee.",
  browser_company_rejected: "L'entreprise fournie par le navigateur a ete refusee.",
  payload_tenant_mismatch: "Le rapport ne correspond pas au tenant serveur.",
  source_hash_mismatch: "Le hash source a ete refuse.",
  period_invalid: "Date invalide.",
  period_order_invalid: "La date de debut doit preceder la date de fin.",
  period_required: "Les dates de debut et de fin sont obligatoires.",
  period_too_long: "La periode depasse la duree maximale autorisee.",
  organization_company_id_required: "Entreprise operante obligatoire.",
  timezone_required: "Fuseau horaire obligatoire.",
  payroll_permission_missing: "Permission horodateur_payroll_read requise.",
  payroll_manage_permission_missing: "Permission horodateur_payroll_manage requise.",
  membership_absent: "Membership organisation active requise.",
  membership_ambiguous: "Membership organisation ambigu. Acces refuse.",
  membership_inactive: "Membership organisation inactive.",
  issued_immutable: "Un rapport emis ne peut pas etre modifie.",
  id_only_read_forbidden: "La lecture d'un rapport exige organisation, entreprise et cycle.",
  tenant_required: "Organisation, entreprise et cycle sont obligatoires.",
};

export function payrollOperationalErrorMessage(code: string) {
  return PAYROLL_OPERATIONAL_ERROR_MESSAGES[code] ?? "Parametres invalides.";
}

export function isInclusiveFourteenDayPeriod(
  periodStart: string,
  periodEnd: string
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)
  ) {
    return false;
  }
  const start = new Date(`${periodStart}T12:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + 13);
  return periodEnd === start.toISOString().slice(0, 10);
}

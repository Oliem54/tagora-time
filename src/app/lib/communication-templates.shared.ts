/**
 * Module Communications — clés, variables et libellés partagés (client + serveur).
 */

export const COMMUNICATION_CHANNELS = ["email", "sms"] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const COMMUNICATION_AUDIENCES = [
  "employee",
  "direction_admin",
  "direction",
  "admin",
] as const;
export type CommunicationAudience = (typeof COMMUNICATION_AUDIENCES)[number];

/** Statuts stockés en base (implementation_status). */
export const COMMUNICATION_IMPL_STATUS = {
  connected: "connected",
  planned: "planned",
  inactive: "inactive",
  to_configure: "to_configure",
} as const;
export type CommunicationImplStatus =
  (typeof COMMUNICATION_IMPL_STATUS)[keyof typeof COMMUNICATION_IMPL_STATUS];

export const COMMUNICATION_CATEGORIES = [
  "Horodateur",
  "Effectifs",
  "Horaire employé",
  "Demandes d'horaire",
  "Dépenses employé",
  "Incidents / dommages",
  "Notes internes",
  "Comptes",
  "Employés",
  "Améliorations",
  "Livraisons / ramassages",
  "Refacturation Titan",
  "Système",
] as const;
export type CommunicationCategory = (typeof COMMUNICATION_CATEGORIES)[number];

/** Variables documentées pour l’UI (copier-coller). */
export const COMMUNICATION_TEMPLATE_VARIABLES = [
  "employee_name",
  "employee_email",
  "employee_phone",
  "manager_name",
  "company_name",
  "department_name",
  "location_name",
  "request_type",
  "request_date",
  "request_period",
  "exception_type",
  "system_reason",
  "employee_note",
  "decision_note",
  "amount",
  "client_name",
  "mission_name",
  "delivery_id",
  "intervention_id",
  "expense_status",
  "app_url",
  "action_url",
  "approve_url",
  "reject_url",
  "dashboard_url",
  "is_reminder",
] as const;

/** Données factices pour prévisualisation / tests. */
export const COMMUNICATION_PREVIEW_SAMPLE: Record<string, string> = {
  employee_name: "Yves Laroche",
  employee_email: "yves.laroche@example.com",
  employee_phone: "+1 514 555 0100",
  manager_name: "Direction TAGORA",
  company_name: "Oliem Solutions",
  department_name: "Livraison",
  location_name: "Montréal",
  request_type: "Congé",
  request_date: "2026-05-15",
  request_period: "2026-05-15 → 2026-05-20",
  exception_type: "Pointage hors horaire",
  system_reason: "Pointage hors horaire prévu",
  employee_note: "Je suis arrivé plus tôt pour préparer le camion.",
  decision_note: "Validé selon politique interne.",
  amount: "42,50 $",
  client_name: "Client ABC",
  mission_name: "LIV-2026-041",
  delivery_id: "1289",
  intervention_id: "4521",
  expense_status: "Soumis",
  app_url: "http://localhost:3000",
  action_url: "http://localhost:3000/employe/horodateur",
  approve_url: "http://localhost:3000/api/direction/horodateur/exceptions/quick-action?approve=1",
  reject_url: "http://localhost:3000/api/direction/horodateur/exceptions/quick-action?reject=1",
  dashboard_url: "http://localhost:3000/direction/dashboard",
  is_reminder: "non",
};

export function communicationImplStatusLabelFr(status: string): string {
  switch (status) {
    case COMMUNICATION_IMPL_STATUS.connected:
      return "Branché";
    case COMMUNICATION_IMPL_STATUS.planned:
      return "Prévu phase 2";
    case COMMUNICATION_IMPL_STATUS.inactive:
      return "Inactif";
    case COMMUNICATION_IMPL_STATUS.to_configure:
      return "À configurer";
    default:
      return status;
  }
}

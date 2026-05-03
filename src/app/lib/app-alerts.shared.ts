/**
 * Catégories du journal app_alerts (alignement Centre d'alertes phase 2).
 * Valeurs stables pour filtres et agrégations.
 */
export const APP_ALERT_CATEGORY = {
  employee_expense: "employee_expense",
  delivery_incident: "delivery_incident",
  mission_internal_note: "mission_internal_note",
  notification_failure: "notification_failure",
  horodateur_exception: "horodateur_exception",
  livraison_ramassage: "livraison_ramassage",
  titan_refacturation: "titan_refacturation",
  communication_template: "communication_template",
  /** Congés prolongés, pointages inhabituels liés aux employés. */
  employees: "employees",
  system: "system",
} as const;

export type AppAlertCategory = (typeof APP_ALERT_CATEGORY)[keyof typeof APP_ALERT_CATEGORY];

export const APP_ALERT_PRIORITY = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
} as const;

export const APP_ALERT_STATUS = {
  open: "open",
  handled: "handled",
  archived: "archived",
  cancelled: "cancelled",
  snoozed: "snoozed",
} as const;

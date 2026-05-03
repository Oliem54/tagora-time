import type {
  EffectifsCompanyKey,
  EffectifsDepartmentKey,
} from "./effectifs-departments.shared";
import type { EffectifsCalendarException } from "./effectifs-calendar-exception.shared";
import type { EffectifsScheduleRequest } from "./effectifs-schedule-request.shared";
import type { AccountRequestCompany } from "./account-requests.shared";

export type { EffectifsCompanyKey, EffectifsDepartmentKey };

export type EffectifsDepartment = {
  key: EffectifsDepartmentKey;
  label: string;
  sortOrder: number;
  companyKey: EffectifsCompanyKey;
  locationKey: string | null;
  active: boolean;
};

export type EffectifsLocation = {
  key: string;
  label: string;
};

export type EffectifsRegularClosedDay = {
  companyKey: "all" | "oliem_solutions" | "titan_produits_industriels";
  dayOfWeek: number;
  active: boolean;
  scope: "company" | "department" | "location";
  departmentKey: EffectifsDepartmentKey | null;
  locationKey: string | null;
};

export type EffectifsCoverageWindow = {
  id: string;
  companyKey: "all" | "oliem_solutions" | "titan_produits_industriels";
  departmentKey: EffectifsDepartmentKey;
  locationKey: string;
  locationLabel: string;
  weekday: number;
  weekdayLabel: string;
  weekdayLabelLong: string;
  startLocal: string;
  endLocal: string;
  minEmployees: number;
  active: boolean;
};

export type EffectifsEmployee = {
  id: number;
  nom: string | null;
  departmentKey: EffectifsDepartmentKey | null;
  secondaryDepartmentKeys: EffectifsDepartmentKey[];
  primaryLocationKey: string | null;
  secondaryLocationKeys: string[];
  canDeliver: boolean;
  defaultWeeklyHours: number | null;
  scheduleActive: boolean;
  actif: boolean;
  /** Horaire qui chevauche une plage de couverture hors départements affectés. */
  planningMismatchDepartments: EffectifsDepartmentKey[];
  /** Compagnie principale (horodateur / fiche employé) — phase 1. */
  primaryCompany: AccountRequestCompany | null;
  /** Peut travailler pour Oliem (flag chauffeur). */
  canWorkForOliem: boolean;
  /** Peut travailler pour Titan (flag chauffeur). */
  canWorkForTitan: boolean;
  /** Raccourci UI : travaille pour les deux compagnies. */
  isMultiCompany: boolean;
};

export type EffectifsScheduleDay = {
  weekday: number;
  weekdayLabel: string;
  active: boolean;
  startLocal: string | null;
  endLocal: string | null;
  /** Heures prévues (grille habituelle), si disponible. */
  plannedHours: number | null;
};

export type EffectifsEmployeeSchedule = {
  employeeId: number;
  days: EffectifsScheduleDay[];
};

export type EffectifsCoverageCategory =
  | "inactive"
  | "aucune_requise"
  | "couvert"
  | "manque"
  | "surplus"
  | "partielle";

export type EffectifsCoverageRow = {
  windowId: string;
  departmentKey: EffectifsDepartmentKey;
  departmentLabel: string;
  locationKey: string;
  locationLabel: string;
  weekday: number;
  weekdayLabel: string;
  referenceDate: string;
  startLocal: string;
  endLocal: string;
  required: number;
  /** Employés dont le quart chevauche la plage (au moins une minute). */
  staffed: number;
  minSegmentStaff: number;
  coveragePrimary: string;
  coverageSecondary: string | null;
  surplus: number;
  coverageCategory: EffectifsCoverageCategory;
  scheduledEmployees: { id: number; nom: string | null }[];
  /** Plage de couverture qui dépasse le début ou la fin de l'horaire habituel. */
  habitualScheduleWarnings: string[];
};

export type EffectifsAlert = {
  level: "warning" | "critical";
  message: string;
  departmentKey: EffectifsDepartmentKey;
  windowId: string;
  weekday: number;
};

export type EffectifsDeliveryNeed = {
  date: string;
  count: number;
};

/** Variante visuelle calendrier (journées spéciales). */
export type DeptDayCellDisplayVariant =
  | "default"
  | "company_closed"
  | "holiday"
  | "reduced"
  | "special";

export type DeptDayCellModel = {
  departmentKey: EffectifsDepartmentKey;
  date: string;
  rows: EffectifsCoverageRow[];
  aggregateCategory: EffectifsCoverageCategory;
  primaryLabel: string;
  secondaryLabel: string | null;
  displayVariant?: DeptDayCellDisplayVariant;
  calendarCaption?: string | null;
};

export type DirectionEffectifsSummary = {
  closedDaysThisMonth: number;
  pendingScheduleRequests: number;
  criticalPendingRequests: number;
  uncoveredWindowSlotsMonth: number;
  deliveryWithoutDriverEstimate: number;
  approvedChangesThisWeek: number;
};

/** Absence longue durée active (affichage direction, sans note privée). */
export type EffectifsLongTermAbsence = {
  employeeId: number;
  employeeName: string | null;
  publicLeaveLabel: string;
  startDate: string;
  /** Texte « indéterminé » ou date ISO */
  expectedReturnSummary: string;
  isIndefinite: boolean;
};

export type DirectionEffectifsPayload = {
  departments: EffectifsDepartment[];
  locations: EffectifsLocation[];
  coverageWindows: EffectifsCoverageWindow[];
  coverage: EffectifsCoverageRow[];
  alerts: EffectifsAlert[];
  employees: EffectifsEmployee[];
  schedules: EffectifsEmployeeSchedule[];
  deliveryNeeds: EffectifsDeliveryNeed[];
  /** Journées spéciales (prévu officiel). */
  calendarExceptions: EffectifsCalendarException[];
  /** Demandes d’horaire (filtrées selon le rôle). */
  scheduleRequests: EffectifsScheduleRequest[];
  /** Jours fermés réguliers (phase 1: scope company). */
  regularClosedDays: EffectifsRegularClosedDay[];
  effectifsSummary: DirectionEffectifsSummary | null;
  /** Congés prolongés actifs (vue direction). */
  longTermAbsences: EffectifsLongTermAbsence[];
  meta: {
    coverageWindowsConfigured: boolean;
    referenceWeekStart: string;
    windowsLoadError: string | null;
    canEditCoverageWindows: boolean;
    /** Profil chauffeur lié (demandes d’horaire côté employé). */
    linkedChauffeurId: number | null;
    /** Prévu (effectifs) vs réel (horodateur) — rappel UX. */
    plannedTimeReferenceNote: string;
  };
};

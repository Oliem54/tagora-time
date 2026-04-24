import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";

export const HORODATEUR_PHASE1_EVENT_TYPES = [
  "quart_debut",
  "quart_fin",
  "pause_debut",
  "pause_fin",
  "dinner_debut",
  "dinner_fin",
  "sortie_depart",
  "sortie_retour",
  "correction",
  "exception",
  "anomalie",
] as const;

export type HorodateurPhase1EventType =
  (typeof HORODATEUR_PHASE1_EVENT_TYPES)[number];

export const HORODATEUR_CANONICAL_EVENT_TYPES = [
  "punch_in",
  "break_start",
  "break_end",
  "meal_start",
  "meal_end",
  "terrain_start",
  "terrain_end",
  "punch_out",
  "manual_correction",
  "retroactive_entry",
] as const;

export type HorodateurCanonicalEventType =
  (typeof HORODATEUR_CANONICAL_EVENT_TYPES)[number];

export const HORODATEUR_CANONICAL_TO_LEGACY_EVENT_TYPE: Record<
  HorodateurCanonicalEventType,
  HorodateurPhase1EventType
> = {
  punch_in: "quart_debut",
  break_start: "pause_debut",
  break_end: "pause_fin",
  meal_start: "dinner_debut",
  meal_end: "dinner_fin",
  terrain_start: "sortie_depart",
  terrain_end: "sortie_retour",
  punch_out: "quart_fin",
  manual_correction: "correction",
  retroactive_entry: "exception",
};

export const HORODATEUR_PHASE1_ACTOR_ROLES = [
  "employe",
  "direction",
  "systeme",
] as const;

export type HorodateurPhase1ActorRole =
  (typeof HORODATEUR_PHASE1_ACTOR_ROLES)[number];

export const HORODATEUR_PHASE1_SOURCE_KINDS = [
  "employe",
  "direction",
  "automatique",
] as const;

export type HorodateurPhase1SourceKind =
  (typeof HORODATEUR_PHASE1_SOURCE_KINDS)[number];

export const HORODATEUR_PHASE1_EVENT_STATUSES = [
  "normal",
  "en_attente",
  "approuve",
  "refuse",
] as const;

export type HorodateurPhase1EventStatus =
  (typeof HORODATEUR_PHASE1_EVENT_STATUSES)[number];

export const HORODATEUR_PHASE1_STATE_KINDS = [
  "hors_quart",
  "en_quart",
  "en_pause",
  "en_diner",
  "termine",
] as const;

export type HorodateurPhase1StateKind =
  (typeof HORODATEUR_PHASE1_STATE_KINDS)[number];

export const HORODATEUR_PHASE1_SHIFT_STATUSES = [
  "ouvert",
  "ferme",
  "en_attente",
  "valide",
] as const;

export type HorodateurPhase1ShiftStatus =
  (typeof HORODATEUR_PHASE1_SHIFT_STATUSES)[number];

export const HORODATEUR_PHASE1_EXCEPTION_TYPES = [
  "outside_schedule",
  "direction_manual_correction",
  "shift_too_long",
  "incoherent_pause",
  "incoherent_dinner",
  "invalid_sequence",
  "missing_punch_adjustment",
] as const;

export type HorodateurPhase1ExceptionType =
  (typeof HORODATEUR_PHASE1_EXCEPTION_TYPES)[number];

export const HORODATEUR_PHASE1_EXCEPTION_STATUSES = [
  "en_attente",
  "approuve",
  "refuse",
  "modifie",
] as const;

export type HorodateurPhase1ExceptionStatus =
  (typeof HORODATEUR_PHASE1_EXCEPTION_STATUSES)[number];

export type HorodateurPhase1EmployeeProfile = {
  employeeId: number;
  authUserId: string | null;
  fullName: string | null;
  email: string | null;
  phoneNumber: string | null;
  active: boolean;
  primaryCompany: AccountRequestCompany | null;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  scheduledWorkDays: string[] | null;
  plannedWeeklyHours: number | null;
  pausePaid: boolean;
  pauseMinutes: number;
  lunchPaid: boolean;
  lunchMinutes: number;
  expectedBreaksCount: number | null;
  toleranceBeforeStartMinutes: number;
  toleranceAfterEndMinutes: number;
  maxShiftMinutes: number;
  smsAlertQuartDebut: boolean;
};

export type HorodateurPhase1EventRecord = {
  id: string;
  user_id?: string | null;
  employee_id: number;
  event_type: HorodateurPhase1EventType;
  // Canonical DB column.
  occurred_at: string | null;
  // Legacy compatibility alias kept during transition.
  event_time?: string | null;
  actor_user_id?: string | null;
  actor_role?: HorodateurPhase1ActorRole;
  source_kind?: HorodateurPhase1SourceKind;
  status: HorodateurPhase1EventStatus;
  requires_approval?: boolean;
  exception_code?: HorodateurPhase1ExceptionType | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  approval_note?: string | null;
  related_event_id?: string | null;
  work_date: string | null;
  week_start_date: string | null;
  is_manual_correction?: boolean;
  // Canonical DB column.
  notes?: string | null;
  // Legacy compatibility alias kept during transition.
  note?: string | null;
  created_at?: string;
};

export type HorodateurPhase1CurrentStateRecord = {
  employee_id: number;
  current_state: HorodateurPhase1StateKind;
  active_shift_id?: string | null;
  active_shift_start_event_id?: string | null;
  active_pause_start_event_id?: string | null;
  active_dinner_start_event_id?: string | null;
  last_event_id?: string | null;
  last_event_type?: HorodateurPhase1EventType | null;
  last_event_at?: string | null;
  company_context: AccountRequestCompany | null;
  has_open_exception: boolean;
  created_at?: string;
  updated_at?: string;
};

export type HorodateurPhase1ShiftRecord = {
  id: string;
  employee_id: number;
  work_date: string;
  week_start_date: string;
  company_context: AccountRequestCompany | null;
  shift_start_at: string | null;
  shift_end_at: string | null;
  gross_minutes: number;
  paid_break_minutes: number;
  unpaid_break_minutes: number;
  unpaid_lunch_minutes: number;
  worked_minutes: number;
  payable_minutes: number;
  approved_exception_minutes?: number;
  pending_exception_minutes?: number;
  anomalies_count: number;
  status: HorodateurPhase1ShiftStatus;
  last_recomputed_at: string;
  created_at?: string;
  updated_at?: string;
};

export type HorodateurPhase1ExceptionRecord = {
  id: string;
  employee_id: number;
  shift_id: string | null;
  source_event_id: string;
  exception_type: HorodateurPhase1ExceptionType;
  reason_label: string;
  details: string | null;
  impact_minutes: number;
  status: HorodateurPhase1ExceptionStatus;
  requested_at: string;
  requested_by_user_id: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  review_note: string | null;
  approved_minutes: number | null;
  direction_email_notified_at?: string | null;
  direction_sms_notified_at?: string | null;
  direction_reminder_email_notified_at?: string | null;
  direction_reminder_sms_notified_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HorodateurDirectionAlertConfigRecord = {
  config_key: "default";
  email_enabled: boolean;
  sms_enabled: boolean;
  reminder_delay_minutes: number;
  direction_emails: string[];
  direction_sms_numbers: string[];
  created_at?: string;
  updated_at?: string;
};

export type HorodateurLatenessNotificationRecord = {
  id: string;
  employee_id: number;
  work_date: string;
  scheduled_start_at: string;
  detected_at: string;
  late_detected_at: string;
  late_direction_email_notified_at: string | null;
  late_direction_sms_notified_at: string | null;
  late_employee_sms_notified_at: string | null;
  resolution_reason?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HorodateurPhase1DirectionPendingExceptionAlert = {
  id: string;
  employeeId: number;
  employeeName: string | null;
  employeeEmail: string | null;
  exceptionType: HorodateurPhase1ExceptionType;
  reasonLabel: string;
  occurredAt: string | null;
  requestedAt: string;
};

export type HorodateurPhase1DirectionLiveRow = {
  employeeId: number;
  fullName: string | null;
  email: string | null;
  primaryCompany: AccountRequestCompany | null;
  currentState: HorodateurPhase1StateKind;
  lastEventAt: string | null;
  lastEventType: HorodateurPhase1EventType | null;
  todayShift: HorodateurPhase1ShiftRecord | null;
  weekWorkedMinutes: number;
  weekTargetMinutes: number;
  weekRemainingMinutes: number;
  projectedOverflowMinutes: number;
  hasOpenException: boolean;
};

export type HorodateurPhase1EmployeeDashboardSnapshot = {
  employee: HorodateurPhase1EmployeeProfile;
  currentState: HorodateurPhase1CurrentStateRecord;
  todayShift: HorodateurPhase1ShiftRecord;
  weeklyProjection: {
    employeeId: number;
    weekStartDate: string;
    workedMinutes: number;
    targetMinutes: number;
    remainingMinutes: number;
    projectedOverflowMinutes: number;
    shiftCount: number;
    primaryCompanyLabel: string;
  };
  pendingExceptions: HorodateurPhase1ExceptionRecord[];
};

export type HorodateurPhase1Classification = {
  status: HorodateurPhase1EventStatus;
  requiresApproval: boolean;
  exceptionType: HorodateurPhase1ExceptionType | null;
  reasonLabel: string | null;
  details: string | null;
};

export type HorodateurPhase1ClassifyInput = {
  employee: HorodateurPhase1EmployeeProfile;
  currentState: HorodateurPhase1CurrentStateRecord | null;
  latestApprovedEvents: HorodateurPhase1EventRecord[];
  eventType: HorodateurPhase1EventType | HorodateurCanonicalEventType;
  occurredAt: string;
  actorRole: HorodateurPhase1ActorRole;
  note?: string | null;
  forcedExceptionType?: HorodateurPhase1ExceptionType | null;
};

export type HorodateurPhase1InsertEventInput = {
  userId: string;
  employeeId: number;
  occurredAt: string;
  workDate: string;
  weekStartDate: string;
  eventType: HorodateurPhase1EventType | HorodateurCanonicalEventType;
  actorUserId: string | null;
  actorRole: HorodateurPhase1ActorRole;
  sourceKind: HorodateurPhase1SourceKind;
  companyContext: AccountRequestCompany;
  note?: string | null;
  relatedEventId?: string | null;
  isManualCorrection?: boolean;
  status: HorodateurPhase1EventStatus;
  requiresApproval: boolean;
  exceptionCode?: HorodateurPhase1ExceptionType | null;
  approvalNote?: string | null;
};

export type HorodateurPhase1CreatePunchResult = {
  event: HorodateurPhase1EventRecord;
  exception: HorodateurPhase1ExceptionRecord | null;
  currentState: HorodateurPhase1CurrentStateRecord;
  shift: HorodateurPhase1ShiftRecord;
};

export class HorodateurPhase1Error extends Error {
  code: string;
  status: number;

  constructor(message: string, options?: { code?: string; status?: number }) {
    super(message);
    this.name = "HorodateurPhase1Error";
    this.code = options?.code ?? "horodateur_phase1_error";
    this.status = options?.status ?? 400;
  }
}
